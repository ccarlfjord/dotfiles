/**
 * DuckDuckGo search provider (no API key required).
 *
 * Faithful port of oh-my-pi `providers/duckduckgo.ts`.
 *
 * DuckDuckGo's no-JS HTML search frontend. POST `q=…` to receive a static
 * results page we can parse without a real browser. The Instant Answer API
 * (`api.duckduckgo.com`) was tried first but it only returns content for
 * Wikipedia/Wolfram-Alpha-style topics — empty for the vast majority of
 * agent queries (see oh-my-pi #3799).
 */
import type { Recency, SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, dateToAgeSeconds, withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";
import { buildBrowserNavigationHeaders } from "./browser-headers";

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_NUM_RESULTS = 10;
const MAX_NUM_RESULTS = 20;

/**
 * Minimum spacing between consecutive DDG requests. DDG throttles bursts of
 * automated HTML searches (its challenge persisted well past 60s in live
 * testing), so pace requests like oh-my-pi paces Exa.
 */
const MIN_REQUEST_INTERVAL_MS = 3_000;
let nextRequestAllowedAt = 0;
let throttleQueue: Promise<void> = Promise.resolve();

async function pacedDelay(signal: AbortSignal | undefined): Promise<void> {
	const prior = throttleQueue.catch(() => {});
	const queued = prior.then(async () => {
		const waitMs = Math.max(0, nextRequestAllowedAt - Date.now());
		if (waitMs > 0) await new Promise<void>(resolve => setTimeout(resolve, waitMs));
		nextRequestAllowedAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
	});
	throttleQueue = queued.catch(() => {});
	if (!signal) return queued;
	return Promise.race([queued, new Promise<never>((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
		if (signal.aborted) reject(signal.reason);
	})]);
}

/** Recency → DDG `df` form param; queries without `df` return the unfiltered default. */
const RECENCY_TO_DDG_DF: Record<NonNullable<Recency>, string> = {
	day: "d",
	week: "w",
	month: "m",
	year: "y",
};

interface ParsedResult {
	title: string;
	url: string;
	snippet?: string;
	/** ISO timestamp lifted from the result row, when DDG emits one. */
	publishedDate?: string;
}

/** Decode an HTML-encoded fragment lifted from DDG markup. */
function decodeHtmlText(value: string): string {
	return value
		.replace(/<[^>]*>/g, " ")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Resolve a DDG result href back to the underlying target URL.
 *
 * DDG routes outbound clicks through `//duckduckgo.com/l/?uddg=<encoded>` so
 * it can record analytics; we want the unwrapped URL. Handles three shapes
 * the page mixes in practice: redirect wrappers, protocol-relative links,
 * and (rarely) absolute URLs on sponsored or instant answer rows.
 */
function unwrapResultUrl(href: string): string | undefined {
	if (!href) return undefined;
	const decoded = href.replace(/&amp;/gi, "&");
	const wrapMatch = decoded.match(/[?&]uddg=([^&]+)/);
	if (wrapMatch) {
		try {
			return decodeURIComponent(wrapMatch[1]);
		} catch {
			return undefined;
		}
	}
	if (decoded.startsWith("//")) return `https:${decoded}`;
	if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
	return undefined;
}

/**
 * Lift a result row's publication timestamp from DDG markup. Recent DDG HTML
 * renders it as a bare `<span>&nbsp; &nbsp; 2026-07-30T20:19:00.0000000</span>`
 * inside `result__extras__url`. Restrict the scan to that container so a
 * date-shaped value in a `<span class="result__snippet">` is not attributed
 * as publication metadata.
 */
function extractPublishedDate(block: string): string | undefined {
	const extrasUrl = /<div\b[^>]*\bclass="[^"]*\bresult__extras__url\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1];
	if (!extrasUrl) return undefined;
	for (const match of extrasUrl.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)) {
		const text = decodeHtmlText(match[1]);
		if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/.test(text)) return text;
	}
	return undefined;
}

/**
 * Walk the HTML page and pull out result blocks in document order.
 *
 * DDG renders each result inside a `<div class="result …">` container with
 * `<a class="result__a" …>` for the title link and an optional sibling
 * `<a class="result__snippet">` (or `<div class="result__snippet">` in some
 * variants) for the preview text. Sponsored placements, missing snippets,
 * and the trailing pagination row are tolerated.
 */
export function parseHtmlResults(html: string): ParsedResult[] {
	const results: ParsedResult[] = [];
	const blockRe =
		/<div\b[^>]*\bclass="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass="[^"]*\bresult\b|<div\b[^>]*\bclass="[^"]*\bnav-link\b|$)/g;
	const titleRe = /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
	const snippetRe = /<(?:a|div|span)\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/;
	for (const match of html.matchAll(blockRe)) {
		const block = match[1];
		const title = titleRe.exec(block);
		if (!title) continue;
		const url = unwrapResultUrl(title[1]);
		if (!url) continue;
		const titleText = decodeHtmlText(title[2]);
		if (!titleText) continue;
		const snippet = snippetRe.exec(block);
		const snippetText = snippet ? decodeHtmlText(snippet[1]) : undefined;
		results.push({
			title: titleText,
			url,
			snippet: snippetText || undefined,
			publishedDate: extractPublishedDate(block),
		});
	}
	return results;
}

/**
 * Extract the hidden fields from DDG's next-page form.
 *
 * Attribute order varies across responses, so each input tag is parsed
 * independently instead of matching one fixed HTML layout.
 */
export function parseContinuationForm(html: string): URLSearchParams | undefined {
	for (const formMatch of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)) {
		const form = new URLSearchParams();
		for (const inputMatch of formMatch[1].matchAll(/<input\b[^>]*>/gi)) {
			const input = inputMatch[0];
			const name = /\bname\s*=\s*(["'])(.*?)\1/i.exec(input)?.[2];
			const value = /\bvalue\s*=\s*(["'])(.*?)\1/i.exec(input)?.[2];
			if (name && value !== undefined) form.append(decodeHtmlText(name), decodeHtmlText(value));
		}
		if (form.has("s") && form.has("vqd")) return form;
	}
	return undefined;
}

/**
 * `true` when the page DDG returned is the bot-challenge modal instead of
 * real results. DDG mixes status codes (200 vs 202) on these so the body
 * check is the reliable signal.
 */
export function isAnomalyResponse(html: string): boolean {
	return html.includes("anomaly-modal") || html.includes("anomaly.js");
}

/**
 * Query syntax the DDG HTML frontend parses: quotes, `-`, OR, site:,
 * filetype:, intitle:, inurl:, intext:. Date bounds (`before:`/`after:`) are
 * deliberately off — DDG does not parse them, so the caller should strip
 * them and enforce a lenient post-filter instead (not implemented here).
 */
function createDuckDuckGoForm(params: SearchParams): URLSearchParams {
	const form = new URLSearchParams({
		q: params.query,
		kl: "us-en",
	});
	const df = params.recency ? RECENCY_TO_DDG_DF[params.recency] : undefined;
	if (df) form.set("df", df);
	// Add b: "" parameter as specified in the browser fetch template to match real browser form submission
	form.set("b", "");
	return form;
}

async function callDuckDuckGoHtml(params: SearchParams, form: URLSearchParams, signal: AbortSignal): Promise<string> {
	await pacedDelay(signal);
	const response = await fetch(DUCKDUCKGO_HTML_URL, {
		method: "POST",
		body: form.toString(),
		headers: {
			...buildBrowserNavigationHeaders(),
			"Content-Type": "application/x-www-form-urlencoded",
			Referer: "https://html.duckduckgo.com/",
			"Sec-Fetch-Site": "same-origin",
		},
		signal,
	});

	const body = await response.text();
	if (response.status < 200 || response.status >= 300) {
		throw new SearchProviderError("duckduckgo", `DuckDuckGo HTML error (${response.status})`, response.status);
	}

	if (isAnomalyResponse(body)) {
		throw new SearchProviderError(
			"duckduckgo",
			"DuckDuckGo blocked the request with a bot-detection challenge. DuckDuckGo throttles automated HTML searches from datacenter/shared-egress IPs; configure a credentialed provider such as Tavily, Exa, or Jina for reliable web search.",
			429,
		);
	}

	return body;
}

/** Execute a DuckDuckGo web search via the no-JS HTML frontend. */
export async function searchDuckDuckGo(params: SearchParams): Promise<SearchResponse> {
	const numResults = clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);
	const signal = withHardTimeout(params.signal, params.timeoutMs);
	const sources: SearchSource[] = [];
	const seen = new Set<string>();
	let form: URLSearchParams | undefined = createDuckDuckGoForm(params);

	while (form && sources.length < numResults) {
		const html = await callDuckDuckGoHtml(params, form, signal);
		const sourceCount = sources.length;
		for (const result of parseHtmlResults(html)) {
			if (seen.has(result.url)) continue;
			seen.add(result.url);
			sources.push({
				title: result.title,
				url: result.url,
				snippet: result.snippet,
				publishedDate: result.publishedDate,
				ageSeconds: dateToAgeSeconds(result.publishedDate),
			});
			if (sources.length >= numResults) break;
		}

		if (sources.length === sourceCount) break;
		form = parseContinuationForm(html);
	}

	return { provider: "duckduckgo" as SearchProviderId, sources };
}

/** Search provider for DuckDuckGo (no API key required). */
export class DuckDuckGoProvider implements SearchProvider {
	readonly id = "duckduckgo" as const;
	readonly label = "DuckDuckGo";
	readonly parsesOperators = true;

	isAvailable(): boolean {
		return true;
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchDuckDuckGo(params);
	}
}
