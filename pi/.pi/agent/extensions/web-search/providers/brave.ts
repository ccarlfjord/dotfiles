/**
 * Brave search provider — the official Brave Search API
 * (api.search.brave.com/res/v1/web/search). Credentials via BRAVE_API_KEY.
 *
 * Recency maps directly onto Brave's `freshness` parameter (pd/pw/pm/py).
 * Result descriptions may carry <strong>/<b> highlight markup, which is
 * stripped so LLM-formatted output stays clean.
 */
import type { Recency, SearchParams, SearchProviderId, SearchResponse, SearchSource } from "../types";
import { SearchProviderError } from "../types";
import { clampNumResults, withHardTimeout } from "../utils";
import type { SearchProvider } from "./base";

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_NUM_RESULTS = 10;
const MAX_NUM_RESULTS = 20;

/** `Recency` → Brave `freshness` values. */
const FRESHNESS: Record<Recency, string> = {
	day: "pd",
	week: "pw",
	month: "pm",
	year: "py",
};

interface BraveSearchResult {
	title?: unknown;
	url?: unknown;
	description?: unknown;
	age?: unknown;
	page_age?: unknown;
	meta_url?: unknown;
}

interface BraveSearchResponse {
	web?: { results?: BraveSearchResult[] };
}

/** Strip Brave's highlight markup (`<strong>`, `<b>`) from descriptions. */
function cleanDescription(value: string): string {
	return value
		.replace(/<\/?(?:strong|b)>/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Execute a Brave web search. */
export async function searchBrave(params: SearchParams & { apiKey: string }): Promise<SearchResponse> {
	const url = new URL(BRAVE_API_URL);
	url.searchParams.set("q", params.query);
	url.searchParams.set("count", String(clampNumResults(params.limit, DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS)));
	if (params.recency) {
		url.searchParams.set("freshness", FRESHNESS[params.recency]);
	}

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"Accept-Encoding": "gzip",
			"X-Subscription-Token": params.apiKey,
		},
		signal: withHardTimeout(params.signal, params.timeoutMs),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new SearchProviderError("brave", `Brave API error (${response.status}): ${errorText}`, response.status);
	}

	const payload = (await response.json()) as BraveSearchResponse;

	const sources: SearchSource[] = [];
	for (const raw of payload.web?.results ?? []) {
		if (!raw || typeof raw.url !== "string" || raw.url === "") continue;
		sources.push({
			title: typeof raw.title === "string" && raw.title !== "" ? raw.title : raw.url,
			url: raw.url,
			snippet: typeof raw.description === "string" ? cleanDescription(raw.description) : undefined,
			publishedDate: typeof raw.page_age === "string" ? raw.page_age : undefined,
			ageSeconds: undefined,
		});
	}

	return { provider: "brave" as SearchProviderId, sources };
}

export class BraveProvider implements SearchProvider {
	readonly id = "brave" as const;
	readonly label = "Brave";

	isAvailable(): boolean {
		return Boolean(process.env.BRAVE_API_KEY);
	}

	search(params: SearchParams): Promise<SearchResponse> {
		return searchBrave({ ...params, apiKey: process.env.BRAVE_API_KEY! });
	}
}
