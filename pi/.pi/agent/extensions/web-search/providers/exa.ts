/**
 * Exa search provider — high-quality neural search via the Exa Search API.
 *
 * Ported from oh-my-pi `providers/exa.ts` (direct API path only — their MCP
 * fallback and cross-request throttle are omitted); credentials via EXA_API_KEY.
 * Request shape follows Exa's integration skill: recommended request is
 * `query + type: "auto" + contents: { highlights: true }`, nothing else.
 */
import type { SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, withHardTimeout } from "../utils";
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
	summary?: string | null;
}

interface ExaSearchResponse {
	results?: ExaSearchResult[];
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
	const body: Record<string, unknown> = {
		query: params.query,
		type: "auto",
		contents: {
			highlights: true,
		},
	};
	if (params.limit !== undefined && !Number.isNaN(params.limit)) {
		body.numResults = clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);
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
		sources.push({
			title: result.title ?? result.url,
			url: result.url,
			snippet: result.highlights?.find(h => h?.trim()) || result.text?.trim() || undefined,
			publishedDate: result.publishedDate ?? undefined,
		});
	}

	return { provider: "exa" as SearchProviderId, sources };
}

export class ExaProvider implements SearchProvider {
	readonly id = "exa" as const;
	readonly label = "Exa";

	isAvailable(): boolean {
		return Boolean(process.env.EXA_API_KEY);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchExa({ ...params, apiKey: process.env.EXA_API_KEY! });
	}
}
