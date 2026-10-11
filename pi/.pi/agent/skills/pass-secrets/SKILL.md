---
name: pass-secrets
description: Manage secrets, API keys, and tokens with pass (the unix password manager). Use when creating, reading, updating, listing, or deleting credentials, storing a key for a tool or extension, or when no pass store exists yet and one must be initialized.
---

# Pass secrets

All secrets for pi and its extensions live in `pass` entries. Never write
secrets to plaintext files, the transcript, or commit them anywhere.

## Conventions

- Entry names: `pi/<consumer>/<KEY>`, e.g. `pi/web-search/EXA_API_KEY`,
  `pi/jira/API_TOKEN`. One secret per entry.
- Multiline entries follow the pass convention: the first line is the secret,
  further lines are `key: value` metadata (e.g. `url: https://…`,
  `added: 2025-01-01`).
- Find existing entries before creating new ones: `pass ls pi/` and
  `pass grep <term>`.
- Random tokens that end up in environment variables must be symbol-free:
  `pass generate -n <entry> 32`.

## Read

```sh
pass show pi/web-search/EXA_API_KEY
```

A missing entry exits non-zero with `not in the password store` — treat that
as "unconfigured", not as an error. When a command needs the secret, pass it
through the shell (e.g. `curl -H "Authorization: Bearer $(pass show pi/x/KEY)" …`)
instead of printing it, and do not echo secret values into the transcript.

## Create

- Random token (preferred for API keys you mint yourself):
  `pass generate -n pi/<consumer>/<KEY> 32`
- User-provided value — pipe through stdin, never as a command argument:
  `pass insert -m -f pi/<consumer>/<KEY> <<< "$VALUE"`

## Update

`pass insert -f -m` overwrites (same stdin rules as Create). Do not use
`pass edit` — it opens an interactive editor the agent cannot drive.

## Delete

`pass rm -f pi/<consumer>/<KEY>` — confirm with the user first.

## Bootstrap a new pass store (none set up yet)

1. Check whether a store exists: `test -f ~/.password-store/.gpg-id && pass ls`
2. Find a GPG key that can encrypt: `gpg --list-secret-keys --keyid-format=long`
3. If none exists, generate one non-interactively:
   ```sh
   gpg --batch --passphrase '' --quick-generate-key \
     "Pi Secrets <pi@$(hostname)>" default default never
   ```
   then re-run step 2 and note the key fingerprint.
4. Initialize the store (repeatable; several fingerprints = several recipients):
   `pass init "<fingerprint>"`
5. Verify with a roundtrip, then clean up:
   ```sh
   pass generate -n pi/_selftest 32 && pass show pi/_selftest && pass rm -f pi/_selftest
   ```
6. Tell the user the store is ready and where new entries go
   (`pi/<consumer>/<KEY>`). Also mention updating this skill's conventions
   if a new consumer needs a documented prefix.

## Session behavior notes

- Extensions that read pass lazily (e.g. web-search) memoize per session:
  adding or rotating an entry requires a pi restart or `/reload` to take
  effect.
- `WEB_SEARCH_CHAIN` and other non-secret config stay in the environment,
  not in pass.