---
name: browser-cookies
description: Read the user's Firefox cookies from local browser profiles to authenticate HTTP requests (curl, API calls, scraping logged-in pages). Use when a request needs the user's logged-in session, when listing/exporting browser cookie databases, or when locating Firefox profiles on WSL (Windows Firefox) or native Linux.
---

# Browser cookies

Firefox stores cookies unencrypted in `cookies.sqlite` (`moz_cookies` table),
so they can be read with plain Python. Never print, log, or commit cookie
values; pass them straight into the request that needs them.

Chromium/Chrome/Edge cookies are encrypted (OS keyring, or DPAPI on Windows)
and are not covered here. Ask the user to export those if needed.

## Locate and read

`scripts/cookies.py` auto-detects WSL vs native Linux and finds every Firefox
profile:

- WSL: `/mnt/c/Users/*/AppData/Roaming/Mozilla/Firefox/Profiles/*`
- Linux: `~/.mozilla/firefox/*`, plus snap and flatpak locations

Start with `--list` and metadata-only output to confirm the profile and see
which hosts/names exist, then request values only when actually making the
call:

```sh
python3 scripts/cookies.py --list
python3 scripts/cookies.py --host reddit --format names
```

With multiple profiles it defaults to the most recently modified; pass
`--profile 1loratrj` (a path substring) to override.

## Use the cookies in a request

Capture a `Cookie:` header into a shell variable so the value never reaches
the transcript:

```sh
JAR="$(python3 scripts/cookies.py --host reddit --format header)"
curl -sS -A "$UA" -H "Cookie: $JAR" https://www.reddit.com/api/me.json
```

`--format jar` prints a Netscape cookie file if the target tool prefers
`-b file`; write it under `mktemp` and delete it afterward. The script snapshots
the database (including WAL/SHM) into a `0700` temp dir and removes it on exit.

## Practical notes

- Match the real browser's `User-Agent` (e.g. `Mozilla/5.0 (Windows NT 10.0;
  Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0`). Some sites reject a
  cookie presented with a mismatched UA.
- The header is a flat name=value list, not path-scoped. For multi-domain work
  prefer `--host <domain>` to keep the jar to one site.
- Expired cookies are skipped by default; `--include-expired` keeps them.
- Reading the live DB in place can race with Firefox. Always let the script
  make its snapshot; do not point sqlite at the profile directly.
- Treat a session that returns the logged-out version as an expired cookie,
  not as a script failure.
