/**
 * Shared types for the web_search extension.
 *
 * Ported from oh-my-pi (`packages/coding-agent/src/web/search/types.ts`),
 * trimmed to what a standalone extension needs.
 */

export type SearchProviderId = "duckduckgo" | "tavily" | "exa" | "jina" | "google";

export type Recency = "day" | "week" | "month" | "year";

/** Error thrown by a search provider; `status` is the upstream HTTP status when known. */
export class SearchProviderError extends Error {
	constructor(
		public readonly provider: SearchProviderId,
		message: string,
		public readonly status?: number,
	) {
		super(message);
		this.name = "SearchProviderError";
	}
}

export interface SearchSource {
	title: string;
	url: string;
	snippet?: string;
	/** ISO timestamp lifted from the result row, when the engine emits one. */
	publishedDate?: string;
	/** Age in seconds derived from `publishedDate`. */
	ageSeconds?: number;
}

export interface SearchResponse {
	provider: SearchProviderId;
	sources: SearchSource[];
	/** Synthesized answer (Exa summaries), when available. */
	answer?: string;
}

export interface SearchParams {
	query: string;
	limit?: number;
	/**
	 * Pure temporal filter. Providers that do not support it MUST ignore it
	 * silently, never approximate by rewriting the query.
	 */
	recency?: Recency;
	signal?: AbortSignal;
	/** Hard timeout for this provider's search transport, in milliseconds. */
	timeoutMs?: number;
}

/** One provider's failure while walking the chain. */
export interface ChainFailure {
	provider: SearchProviderId;
	label: string;
	error: unknown;
}
