/**
 * Search provider base class, ported from oh-my-pi `providers/base.ts`.
 * Trimmed: no AuthStorage/model plumbing — credentials come from env vars.
 */
import type { SearchParams, SearchProviderId, SearchResponse } from "../types";

export type { SearchParams, SearchResponse };

export abstract class SearchProvider {
	abstract readonly id: SearchProviderId;
	abstract readonly label: string;

	/** Whether the backend parses keyword operators (`intitle:`, quotes, `OR`) instead of embedding the query as prose. */
	abstract readonly parsesOperators: boolean;

	/** Whether this provider can run right now (credentials present, endpoint configured). */
	abstract isAvailable(): boolean;

	abstract search(params: SearchParams): Promise<SearchResponse>;
}
