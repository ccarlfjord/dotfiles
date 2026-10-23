/**
 * web_search extension for upstream pi.
 *
 * A port of oh-my-pi's web-search stack: one `web_search` tool over an
 * ordered provider chain (Exa first, Brave and free engines as fallback).
 * See ./README.md.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSearchProviderFailures, resolveChain, runSearchChain } from "./chain";
import type { ChainFailure, SearchResponse } from "./types";
import { formatAge, truncate } from "./utils";

const DESCRIPTION = `Search the web for current information. Supports query operators: site: or -site:, "phrases", -term, OR, intitle:, inurl:, filetype:. The recency parameter filters by publication window. Returns ranked results with titles, URLs, snippets, and dates. Prefer primary sources and cite the URLs you use.`;

/** Format response for LLM consumption. Ported from oh-my-pi `formatForLLM`. */
function formatForLLM(response: SearchResponse): string {
	const parts: string[] = [];

	if (response.answer) {
		parts.push(response.answer);
	}

	for (const [i, src] of response.sources.entries()) {
		const age = formatAge(src.ageSeconds) || src.publishedDate;
		const agePart = age ? ` (${age})` : "";
		parts.push(`[${i + 1}] ${src.title}${agePart}\n    ${src.url}`);
		if (src.snippet) {
			parts.push(`    ${truncate(src.snippet.replace(/\s+/g, " "), 240)}`);
		}
	}

	return parts.join("\n");
}

const webSearchTool = defineTool({
	name: "web_search",
	label: "Web Search",
	description: DESCRIPTION,
	parameters: Type.Object({
		query: Type.String({ description: "Search query. Supports site:, -site:, \"phrases\", -term, OR, intitle:, inurl:, filetype:." }),
		recency: Type.Optional(
			Type.Union(
				[
					Type.Literal("day"),
					Type.Literal("week"),
					Type.Literal("month"),
					Type.Literal("year"),
				],
				{ description: "Temporal filter narrowing results to this window" },
			),
		),
		limit: Type.Optional(
			Type.Number({ description: "Number of results to return (provider-dependent default, max 20)" }),
		),
	}),

	async execute(_toolCallId, params, signal) {
		const { response, failures, invalidIds } = await runSearchChain({
			query: params.query,
			limit: params.limit,
			recency: params.recency,
			signal,
			timeoutMs: 30_000,
		});

		if (!response) {
			const invalidNote = invalidIds.length > 0 ? ` (invalid WEB_SEARCH_CHAIN entries: ${invalidIds.join(", ")})` : "";
			throw new Error(
				`All web search providers failed${invalidNote}: ${formatSearchProviderFailures(failures) || "no providers configured"}`,
			);
		}

		const chainSummary = summarizeChain(failures);
		const text = chainSummary ? `${formatForLLM(response)}\n\n(${chainSummary})` : formatForLLM(response);

		return {
			content: [{ type: "text", text }],
			details: {
				provider: response.provider,
				sources: response.sources,
				failures: chainSummary,
			},
		};
	},
});

/** Human-readable note about providers that were tried and skipped before success. */
function summarizeChain(failures: readonly ChainFailure[]): string {
	const failed = failures.filter(failure => {
		const message = failure.error instanceof Error ? failure.error.message : "";
		return !message.includes("not configured");
	});
	if (failed.length === 0) return "";
	const { chain } = resolveChain();
	return chain.length > 1 ? `failed before success: ${formatSearchProviderFailures(failed)}` : "";
}

export default function (pi: ExtensionAPI) {
	pi.registerTool(webSearchTool);
}
