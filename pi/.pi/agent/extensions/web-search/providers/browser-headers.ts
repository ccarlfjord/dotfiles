/**
 * Browser navigation headers, ported from oh-my-pi `providers/browser-headers.ts`.
 *
 * Their dynamic `HeaderGenerator` randomized across Chrome/Firefox/Safari
 * profiles; we keep the deterministic Mac-Chrome fallback fingerprint (the
 * same set their code falls back to), which is what our live test got
 * through DDG's bot check with.
 */

const CHROME_FALLBACK_HEADERS: Record<string, string> = {
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Accept-Language": "en-US,en;q=0.9",
	"Cache-Control": "max-age=0",
	Priority: "u=0, i",
	"Sec-Ch-Ua": '"Google Chrome";v="149", "Chromium";v="149", ";Not A Brand";v="99"',
	"Sec-Ch-Ua-Mobile": "?0",
	"Sec-Ch-Ua-Platform": '"macOS"',
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-User": "?1",
	"Upgrade-Insecure-Requests": "1",
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
};

export function buildBrowserNavigationHeaders(): Record<string, string> {
	return { ...CHROME_FALLBACK_HEADERS };
}
