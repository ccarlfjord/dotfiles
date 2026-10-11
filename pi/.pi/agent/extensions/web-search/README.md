# web_search extension (for upstream pi)

Ported from [oh-my-pi](https://github.com/can1357/oh-my-pi)'s web-search stack
(MIT): a single `web_search` tool over an **ordered provider chain** with
failover. Only `index.ts` imports pi APIs (`defineTool` / `pi-ai Type`);
everything else is standalone and unit-testable.

## Providers

| id | Key | Default? | Notes |
| --- | --- | --- | --- |
| `duckduckgo` | none | yes (first) | HTML frontend, browser-fingerprint headers; DDG throttles datacenter IPs → anomaly page handled as a clean error |
| `tavily` | `TAVILY_API_KEY` | fallback | agent-shaped results + synthesized answer |
| `exa` | `EXA_API_KEY` | fallback | neural search, summaries synthesized into `answer` |
| `jina` | `JINA_API_KEY` | fallback | reader-style cleaned results |
| `google` | `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | fallback | official Custom Search JSON API (100 free/day); scraping google.com needs a headless browser, which is not ported |

The chain tries providers in order and returns the **first success**;
failures are collected and surfaced. Set `WEB_SEARCH_CHAIN` (comma-separated
ids, e.g. `WEB_SEARCH_CHAIN=searxng,tavily`) to reorder/limit — note
`searxng` is not ported yet; add it in `providers/` if needed.

## Credentials

Provider keys come from the environment, but nothing has to source them:
on the first search the tool looks up each still-missing key in `pass` (the
unix password manager) as `pi/web-search/<KEY>` and fills it in — lazily,
once per session (`pass.ts`). Real environment variables take precedence.
Missing entries are not errors; that provider just reports "not configured"
and the chain moves on.

```sh
pass insert pi/web-search/EXA_API_KEY   # one entry per key
```

## Parameters

- `query` (string, required) — supports `site:`, `-site:`, `"phrases"`,
  `-term`, `OR`, `intitle:`, `inurl:`, `filetype:`
- `recency` — `day | week | month | year` (DDG → `df`; Tavily → `time_range`;
  Exa/Jina ignore it)
- `limit` — result count (defaults 10 DDG/Exa, 5 Tavily/Jina; max 20)

## Install

Nothing to install: it lives in the user extensions dir
(`~/.pi/agent/extensions/web-search/`, symlinked here) and pi picks it up at
startup. `/reload` after editing. No npm dependencies.

## Testing

Standalone (no pi needed — file imports avoid `@earendil-works/*`):

```bash
bun run /tmp/websearch-test.ts            # live DDG search
bun run /tmp/websearch-parse-test.ts      # parse the saved HTML fixture
```

## Not ported (kept from oh-my-pi, left out here)

- scrape-based Google (needs their headless-Chrome fallback; Google serves
  a JS shell to fetch-only clients — use the CSE `google` provider above instead)
- ~15 further engines (SearXNG, Brave, Kagi, Perplexity, …)
- grounded providers (Anthropic/Gemini/OpenAI/xAI/OpenRouter native search)
- headless-browser fallback for challenged fetches (puppeteer-core)
- dynamic header randomization (`HeaderGenerator`), query pipeline
  (`site:`/`before:`/`after:` structured parsing + post-filtering)
