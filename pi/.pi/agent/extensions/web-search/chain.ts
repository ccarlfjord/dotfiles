/**
 * Provider chain — ported from oh-my-pi `providers/provider.ts` +
 * `web/search/index.ts`, trimmed to lazy instances + ordered fallback.
 */
import type { ChainFailure, SearchParams, SearchProviderId, SearchResponse } from "./types";
import { SearchProviderError } from "./types";
import { DuckDuckGoProvider } from "./providers/duckduckgo";
import { ExaProvider } from "./providers/exa";
import { GoogleProvider } from "./providers/google";
import { JinaProvider } from "./providers/jina";
import { TavilyProvider } from "./providers/tavily";
import type { SearchProvider } from "./providers/base";

/** Default chain order: free engine first, credentialed providers as fallback. */
const DEFAULT_CHAIN: readonly SearchProviderId[] = ["duckduckgo", "tavily", "exa", "jina", "google"];

const FACTORIES: Record<SearchProviderId, () => SearchProvider> = {
	duckduckgo: () => new DuckDuckGoProvider(),
	tavily: () => new TavilyProvider(),
	exa: () => new ExaProvider(),
	jina: () => new JinaProvider(),
	google: () => new GoogleProvider(),
};

/** Memoized per id, matching oh-my-pi's singleton-per-provider behavior. */
const providerInstances = new Map<SearchProviderId, SearchProvider>();

function getProvider(id: SearchProviderId): SearchProvider {
	let instance = providerInstances.get(id);
	if (!instance) {
		instance = FACTORIES[id]();
		providerInstances.set(id, instance);
	}
	return instance;
}

/** Resolve the chain: `WEB_SEARCH_CHAIN=a,b,c` overrides, validated and deduped. */
export function resolveChain(): { chain: SearchProviderId[]; invalid: string[] } {
	const raw = process.env.WEB_SEARCH_CHAIN?.trim();
	if (!raw) return { chain: [...DEFAULT_CHAIN], invalid: [] };

	const ids = raw
		.split(",")
		.map(part => part.trim().toLowerCase())
		.filter(part => part.length > 0);
	const known = new Set(Object.keys(FACTORIES));
	const chain: SearchProviderId[] = [];
	const invalid: string[] = [];
	for (const id of ids) {
		if (known.has(id as SearchProviderId) && !chain.includes(id as SearchProviderId)) {
			chain.push(id as SearchProviderId);
		} else {
			invalid.push(id);
		}
	}
	return { chain, invalid };
}

/** Format one provider failure for the user-facing fallback summary. */
export function formatSearchProviderFailure(error: unknown): string {
	if (error instanceof SearchProviderError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}

/** Format the ordered provider fallback failures for terminal/tool output. */
export function formatSearchProviderFailures(failures: readonly ChainFailure[]): string {
	return failures.map(f => `${f.provider}: ${formatSearchProviderFailure(f.error)}`).join("; ");
}

export interface ChainResult {
	response: SearchResponse | undefined;
	failures: ChainFailure[];
	/** Entries of WEB_SEARCH_CHAIN that named an unknown provider. */
	invalidIds: string[];
}

/**
 * Walk the chain in order and return the first successful response.
 * Every failure is collected so callers can explain a total outage.
 */
export async function runSearchChain(params: SearchParams): Promise<ChainResult> {
	const { chain, invalid } = resolveChain();
	const failures: ChainFailure[] = [];

	for (const id of chain) {
		const provider = getProvider(id);
		if (!provider.isAvailable()) {
			failures.push({ provider: id, label: provider.label, error: new SearchProviderError(id, "not configured (missing credentials)") });
			continue;
		}
		try {
			const response = await provider.search(params);
			return { response, failures, invalidIds: invalid };
		} catch (error) {
			failures.push({ provider: id, label: provider.label, error });
		}
	}

	return { response: undefined, failures, invalidIds: invalid };
}
