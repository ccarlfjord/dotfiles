/**
 * Small helpers shared by search providers.
 * Ported from oh-my-pi `src/web/search/utils.ts` and `providers/utils.ts`.
 */

import type { Recency } from "./types";

/** Calculate age in seconds from an ISO date string. Returns undefined on invalid input. */
export function dateToAgeSeconds(dateStr: string | null | undefined): number | undefined {
	if (!dateStr) return undefined;
	try {
		const date = new Date(dateStr);
		if (Number.isNaN(date.getTime())) return undefined;
		return Math.floor((Date.now() - date.getTime()) / 1000);
	} catch {
		return undefined;
	}
}

/** Clamp a result count to [1, maxVal], returning defaultVal when value is absent or NaN. */
export function clampNumResults(value: number | undefined, defaultVal: number, maxVal: number): number {
	if (!value || Number.isNaN(value)) return defaultVal;
	return Math.min(maxVal, Math.max(1, value));
}

/** Combine an outer signal with a hard timeout; the returned signal aborts on either. */
export function withHardTimeout(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal {
	const timeout = timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
	if (signal) {
		return AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
	}
	return AbortSignal.timeout(timeout);
}

export const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;

/** `Recency` → lookback window, for backends that want a date bound rather than a shorthand. */
const RECENCY_LOOKBACK_DAYS: Record<Recency, number> = { day: 1, week: 7, month: 31, year: 365 };

/** ISO start date for a recency window, or undefined when no window was requested. */
export function recencyStartDate(recency: Recency | undefined, nowMs = Date.now()): string | undefined {
	if (!recency) return undefined;
	return new Date(nowMs - RECENCY_LOOKBACK_DAYS[recency] * 86_400_000).toISOString();
}

/** Format age in seconds as a compact human string ("3d", "2mo", "1y"). */
export function formatAge(seconds: number | undefined): string | undefined {
	if (seconds === undefined || Number.isNaN(seconds)) return undefined;
	const s = Math.max(0, seconds);
	if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
	if (s < 86_400) return `${Math.floor(s / 3600)}h`;
	const days = Math.floor(s / 86_400);
	if (days < 31) return `${days}d`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${(days / 365).toFixed(1)}y`;
}

/** Truncate a string to `max` chars, appending an ellipsis when cut. */
export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}
