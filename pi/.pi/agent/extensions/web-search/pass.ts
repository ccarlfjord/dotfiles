/**
 * Lazy credential loader backed by `pass` (the standard unix password manager).
 *
 * Convention: each provider credential lives in its own pass entry named
 * `pi/web-search/<KEY>`, e.g. `pi/web-search/EXA_API_KEY`. On the first
 * search, every still-missing key is looked up via `pass show` (in parallel)
 * and filled into the environment — so providers work no matter how pi was
 * launched, and credentials never sit in a plaintext dotfile.
 *
 * A missing pass entry is not an error: that provider simply reports
 * "not configured" and the chain moves on. Results are memoized for the
 * session; add a pass entry → restart pi (or reload extensions) to pick it up.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Prefix of the pass entries holding search-provider credentials. */
const PASS_PREFIX = "pi/web-search";

/** Provider credentials that may live in pass (WEB_SEARCH_CHAIN is config, stays env-only). */
const CREDENTIAL_KEYS = [
	"BRAVE_API_KEY",
	"EXA_API_KEY",
	"GOOGLE_API_KEY",
	"GOOGLE_CSE_ID",
	"JINA_API_KEY",
	"TAVILY_API_KEY",
] as const;

/** In-flight/completed load; concurrent searches share one pass round. */
let loadPromise: Promise<void> | undefined;

/**
 * Load provider credentials from pass at most once per session.
 * Real environment variables always win — pass only fills gaps.
 */
export function loadCredentials(): Promise<void> {
	loadPromise ??= (async () => {
		const missing = CREDENTIAL_KEYS.filter(key => process.env[key] === undefined);
		// A failed lookup (entry absent, gpg prompt cancelled, …) just means the
		// provider stays unconfigured; the chain reports that per provider.
		await Promise.allSettled(
			missing.map(async key => {
				const { stdout } = await execFileAsync("pass", ["show", `${PASS_PREFIX}/${key}`], {
					timeout: 15_000,
				});
				const value = stdout.trim();
				if (value !== "") process.env[key] = value;
			}),
		);
	})();
	return loadPromise;
}