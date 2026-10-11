/**
 * Jina Reader search provider — uses the `s.jina.ai` endpoint to fetch
 * search results with cleaned content.
 *
 * Ported from oh-my-pi `providers/jina.ts`; credentials via JINA_API_KEY.
 */
import type { SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";

const JINA_SEARCH_URL = "https://s.jina.ai";
const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 20;

interface JinaSearchResult {
	title?: string | null;
	url?: string | null;
	description?: string | null;
	content?: string | null;
}

interface JinaSearchEnvelope {
	code?: unknown;
	data?: unknown;
}

/** Call Jina Reader search API. */
async function callJinaSearch(apiKey: string, query: string, numResults: number, signal?: AbortSignal): Promise<JinaSearchResult[]> {
	const requestUrl = new URL(`${JINA_SEARCH_URL}/${encodeURIComponent(query)}`);
	requestUrl.searchParams.set("count", String(numResults));

	const headers: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Bearer ${apiKey}`,
	};
	headers["X-Respond-With"] = "no-content";
	headers["X-Retain-Images"] = "none";
	const response = await fetch(requestUrl, {
		headers,
		signal: withHardTimeout(signal, undefined),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new SearchProviderError("jina", `Jina API error (${response.status}): ${errorText}`, response.status);
	}

	const payload = (await response.json()) as JinaSearchEnvelope | JinaSearchResult[] | null;
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== "object") {
		throw new SearchProviderError("jina", "Jina API returned invalid response: expected an object or array");
	}
	if (typeof payload.code === "number" && payload.code !== 200) {
		throw new SearchProviderError("jina", `Jina API response reported failure (${payload.code})`, payload.code);
	}
	if (!Array.isArray(payload.data)) {
		throw new SearchProviderError("jina", "Jina API returned invalid response: expected data array");
	}
	return payload.data as JinaSearchResult[];
}

/** Execute a Jina web search. */
export async function searchJina(params: SearchParams & { apiKey: string }): Promise<SearchResponse> {
	const numResults = clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);
	const response = await callJinaSearch(params.apiKey, params.query, numResults, params.signal);

	const sources: SearchSource[] = [];
	for (const result of response) {
		if (!result?.url) continue;
		sources.push({
			title: result.title ?? result.url,
			url: result.url,
			snippet: result.description?.trim() || result.content?.trim() || undefined,
		});
	}

	return { provider: "jina" as SearchProviderId, sources: sources.slice(0, numResults) };
}

export class JinaProvider implements SearchProvider {
	readonly id = "jina" as const;
	readonly label = "Jina";

	isAvailable(): boolean {
		return Boolean(process.env.JINA_API_KEY);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchJina({ ...params, apiKey: process.env.JINA_API_KEY! });
	}
}
