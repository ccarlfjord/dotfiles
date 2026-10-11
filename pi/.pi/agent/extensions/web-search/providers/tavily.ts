/**
 * Tavily search provider — agent-focused search API, structured results with
 * an optional synthesized answer.
 *
 * Ported from oh-my-pi `providers/tavily.ts`; credentials via TAVILY_API_KEY.
 */
import type { SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 20;

interface TavilySearchResponse {
	answer?: unknown;
	results?: unknown;
	request_id?: unknown;
}

/**
 * Tavily's `topic` (general/news/finance) and `time_range` are orthogonal
 * dimensions in the upstream API. Recency is a temporal filter only; it must
 * not narrow the index to news-only, which would break technical queries
 * (release notes, docs, GitHub) whenever a user sets recency. Always use
 * the default "general" topic and only send `time_range` when recency is set.
 */
export function buildRequestBody(params: SearchParams): Record<string, unknown> {
	const numResults = clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);
	const body: Record<string, unknown> = {
		query: params.query,
		search_depth: "basic",
		max_results: numResults,
		include_answer: "advanced",
		include_raw_content: false,
	};
	if (params.recency) {
		body.time_range = params.recency;
	}
	return body;
}

async function callTavilySearch(apiKey: string, params: SearchParams): Promise<TavilySearchResponse> {
	const response = await fetch(TAVILY_SEARCH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildRequestBody(params)),
		signal: withHardTimeout(params.signal, params.timeoutMs),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new SearchProviderError("tavily", `Tavily API error (${response.status}): ${errorText}`, response.status);
	}

	return (await response.json()) as TavilySearchResponse;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) return null;
	return value as Record<string, unknown>;
}

/** Execute a Tavily web search. */
export async function searchTavily(params: SearchParams & { apiKey: string }): Promise<SearchResponse> {
	const payload = await callTavilySearch(params.apiKey, params);

	const sources: SearchSource[] = [];
	if (Array.isArray(payload.results)) {
		for (const raw of payload.results) {
			const rec = asRecord(raw);
			if (!rec) continue;
			const url = typeof rec.url === "string" ? rec.url : undefined;
			if (!url) continue;
			const publishedDate = typeof rec.published_date === "string" ? rec.published_date : undefined;
			sources.push({
				title: typeof rec.title === "string" ? rec.title : url,
				url,
				snippet: typeof rec.content === "string" ? rec.content : undefined,
				publishedDate,
				ageSeconds: undefined,
			});
		}
	}

	const answer = typeof payload.answer === "string" ? payload.answer : undefined;
	return { provider: "tavily" as SearchProviderId, sources, answer };
}

export class TavilyProvider implements SearchProvider {
	readonly id = "tavily" as const;
	readonly label = "Tavily";

	isAvailable(): boolean {
		return Boolean(process.env.TAVILY_API_KEY);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchTavily({ ...params, apiKey: process.env.TAVILY_API_KEY! });
	}
}
