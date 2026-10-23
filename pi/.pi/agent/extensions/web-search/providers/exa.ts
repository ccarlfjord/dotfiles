/**
 * Exa search provider — high-quality neural search via the Exa Search API.
 *
 * Ported from oh-my-pi `providers/exa.ts` (direct API path only — their MCP
 * fallback and cross-request throttle are omitted); credentials via EXA_API_KEY.
 * Request shape follows Exa's integration skill: recommended request is
 * `query + type: "auto" + contents: { highlights: true }`, plus `recency`
 * mapped onto `startPublishedDate` (Exa has no `pd/pw` shorthand) and
 * `site:`/`-site:` lifted into Exa's domain filters.
 */
import type { SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, dateToAgeSeconds, recencyStartDate, withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";

const EXA_API_URL = "https://api.exa.ai/search";
const DEFAULT_NUM_RESULTS = 10;
const MAX_NUM_RESULTS = 20;

interface ExaSearchResult {
	title?: string | null;
	url?: string | null;
	author?: string | null;
	publishedDate?: string | null;
	text?: string | null;
	highlights?: string[] | null;
	highlightScores?: number[] | null;
	summary?: string | null;
}

interface ExaSearchResponse {
	results?: ExaSearchResult[];
}

/**
 * Domain-scope operator syntax Exa honors structurally: `site:` includes,
 * `-site:` excludes. Words like `intitle:` have no Exa equivalent and stay
 * in the query for the chain to route to a keyword engine.
 */
const SITE_OPERATOR_RE = /(^|\s)(-?)site:([^\s"']+)/gi;

export interface DomainFilters {
	query: string;
	includeDomains?: string[];
	excludeDomains?: string[];
}

/** Lift `site:`/`-site:` out of the query into Exa's structured domain filters. */
export function extractDomainFilters(query: string): DomainFilters {
	const include = new Set<string>();
	const exclude = new Set<string>();
	const stripped = query
		.replace(SITE_OPERATOR_RE, (_match, _lead: string, negated: string, value: string) => {
			(negated ? exclude : include).add(value);
			return " ";
		})
		.replace(/\s+/g, " ")
		.trim();

	return {
		// Exa rejects an empty query, so a domain-only query keeps its original text.
		query: stripped || query,
		...(include.size ? { includeDomains: [...include] } : {}),
		...(exclude.size ? { excludeDomains: [...exclude] } : {}),
	};
}

/** Highest-scoring highlight: Exa ranks excerpts against the query, and the first is not always the best. */
function bestHighlight(result: ExaSearchResult): string | undefined {
	const highlights = result.highlights ?? [];
	let best: string | undefined;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const [index, highlight] of highlights.entries()) {
		if (!highlight?.trim()) continue;
		const score = result.highlightScores?.[index] ?? 0;
		if (score > bestScore) {
			best = highlight;
			bestScore = score;
		}
	}
	return best?.trim();
}

/**
 * Build the request body for the Exa Search API.
 *
 * Per the Exa integration skill: the recommended request is `query +
 * type: "auto" + contents: { highlights: true }` and nothing else. `highlights`
 * is the recommended extraction mode (token-efficient excerpts); `summary` is
 * per-result Exa-side synthesis and needs an explicit user request. `numResults`
 * is only sent when the caller made the intentional product decision to set it.
 */
export function buildExaRequestBody(params: SearchParams): Record<string, unknown> {
	const { query, includeDomains, excludeDomains } = extractDomainFilters(params.query);
	const body: Record<string, unknown> = {
		query,
		type: "auto",
		contents: {
			highlights: true,
		},
	};
	if (includeDomains) body.includeDomains = includeDomains;
	if (excludeDomains) body.excludeDomains = excludeDomains;
	if (params.limit !== undefined && !Number.isNaN(params.limit)) {
		body.numResults = clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);
	}
	// Exa filters on indexed publication dates, so undated pages drop out; recall
	// is narrower than Brave's equivalent freshness window.
	const startPublishedDate = recencyStartDate(params.recency);
	if (startPublishedDate) {
		body.startPublishedDate = startPublishedDate;
	}
	return body;
}

async function callExaSearch(apiKey: string, params: SearchParams): Promise<ExaSearchResponse> {
	const response = await fetch(EXA_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify(buildExaRequestBody(params)),
		signal: withHardTimeout(params.signal, params.timeoutMs),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new SearchProviderError("exa", `Exa API error (${response.status}): ${errorText}`, response.status);
	}

	return (await response.json()) as ExaSearchResponse;
}

/** Execute an Exa web search. */
export async function searchExa(params: SearchParams & { apiKey: string }): Promise<SearchResponse> {
	const payload = await callExaSearch(params.apiKey, params);

	const sources: SearchSource[] = [];
	for (const result of payload.results ?? []) {
		if (!result?.url) continue;
		const snippet = bestHighlight(result) ?? result.text?.trim() ?? undefined;
		sources.push({
			title: result.title ?? result.url,
			url: result.url,
			snippet,
			publishedDate: result.publishedDate ?? undefined,
			ageSeconds: dateToAgeSeconds(result.publishedDate),
		});
	}

	return { provider: "exa" as SearchProviderId, sources };
}

export class ExaProvider implements SearchProvider {
	readonly id = "exa" as const;
	readonly label = "Exa";
	readonly parsesOperators = false;

	isAvailable(): boolean {
		return Boolean(process.env.EXA_API_KEY);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchExa({ ...params, apiKey: process.env.EXA_API_KEY! });
	}
}
