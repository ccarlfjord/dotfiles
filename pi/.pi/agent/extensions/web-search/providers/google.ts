/**
 * Google search provider — official Custom Search JSON API.
 *
 * Upstream pi port note: oh-my-pi's Google provider scrapes
 * google.com/search with a headless-Chrome fallback, because Google serves
 * an empty JS shell to fetch-only clients (verified live: HTTP 200, zero
 * result markup on both the classic and `udm=14` endpoints). We don't port
 * the browser, so this provider uses the official Custom Search JSON API:
 * stable results, real Google index, needs GOOGLE_API_KEY + GOOGLE_CSE_ID
 * (Programmable Search Engine id; 100 free queries/day, then $5/1000).
 */
import type { Recency, SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";

const CSE_API_URL = "https://www.googleapis.com/customsearch/v1";
/** The API caps `num` at 10 per request. */
const MAX_NUM_RESULTS = 10;

/** Recency → CSE `dateRestrict` value. */
const RECENCY_TO_CSE_DR: Record<NonNullable<Recency>, string> = {
	day: "d1",
	week: "w1",
	month: "m1",
	year: "y1",
};

interface CseItem {
	title?: unknown;
	link?: unknown;
	snippet?: unknown;
	pagemap?: Record<string, unknown>;
}

interface CseResponse {
	items?: CseItem[];
	error?: { message?: unknown; code?: unknown };
}

/** Pull an ISO publication date out of page metadata, when present. */
function extractPublishedDate(item: CseItem): string | undefined {
	const metatags = (item.pagemap?.metatags as Array<Record<string, unknown>> | undefined)?.[0];
	if (!metatags) return undefined;
	for (const key of ["article:published_time", "og:updated_time", "datepublished", "date", "pubdate"]) {
		const value = metatags[key];
		if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value;
	}
	return undefined;
}

export function buildCseUrl(params: SearchParams & { apiKey: string; cx: string }, numResults: number): URL {
	const url = new URL(CSE_API_URL);
	url.searchParams.set("key", params.apiKey);
	url.searchParams.set("cx", params.cx);
	url.searchParams.set("q", params.query);
	// `num` must be 1–10; results beyond that need `start` pagination, which
	// we skip — a fallback provider should be fast and cheap, not exhaustive.
	url.searchParams.set("num", String(Math.min(numResults, MAX_NUM_RESULTS)));
	if (params.recency) url.searchParams.set("dateRestrict", RECENCY_TO_CSE_DR[params.recency]);
	return url;
}

/** Execute a Google web search via the Custom Search JSON API. */
export async function searchGoogle(params: SearchParams & { apiKey: string; cx: string }): Promise<SearchResponse> {
	const response = await fetch(buildCseUrl(params, params.limit ?? 10), {
		headers: { Accept: "application/json" },
		signal: withHardTimeout(params.signal, params.timeoutMs),
	});

	const payload = (await response.json().catch(() => null)) as CseResponse | null;

	if (!response.ok || payload?.error) {
		const message = typeof payload?.error?.message === "string" ? payload.error.message : response.statusText;
		throw new SearchProviderError("google", `Google CSE API error (${response.status}): ${message}`, response.status);
	}

	const sources: SearchSource[] = [];
	for (const item of payload?.items ?? []) {
		if (typeof item.link !== "string" || !item.link) continue;
		sources.push({
			title: typeof item.title === "string" && item.title ? item.title : item.link,
			url: item.link,
			snippet: typeof item.snippet === "string" ? item.snippet : undefined,
			publishedDate: extractPublishedDate(item),
		});
	}

	return { provider: "google" as SearchProviderId, sources };
}

export class GoogleProvider implements SearchProvider {
	readonly id = "google" as const;
	readonly label = "Google";

	isAvailable(): boolean {
		return Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchGoogle({ ...params, apiKey: process.env.GOOGLE_API_KEY!, cx: process.env.GOOGLE_CSE_ID! });
	}
}
