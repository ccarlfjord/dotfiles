# Global Instructions

## GitHub Access for voiapp Organization

Repositories in the `voiapp` GitHub organization are private. Always use the `gh` CLI (via `gh api`, `gh pr`, `gh issue`, etc.) to access content from `voiapp` repos. Do NOT use web fetching (e.g., `webfetch`, `curl` to github.com or raw.githubusercontent.com) for these repos, as it will fail with 404 errors.

## Code Comments

When commenting code, focus on the **why**, not the how. Explain intent, constraints, and non-obvious reasoning — not what the code does (the code already shows that).

## Shorthand vocabulary

The user often replies to a question or proposed action with a single short token instead of a full sentence. When a message consists of just one of these tokens (optionally with trailing punctuation), interpret it as a direct answer to whatever you most recently asked or proposed, not as new input to analyze on its own:

- `y` or `+` — yes: confirmed, go ahead, proceed as proposed
- `n` or `-` — no: rejected, do not proceed; wait for different instructions instead of picking an alternative yourself

Only apply this when the token stands alone as the entire message. Don't apply it if `+`/`-` appears as part of a larger message (e.g. code, math, a list bullet, a CLI flag) — there it means what it normally means in that context.

## Writing style

When writing prose — communication, documentation, messages, summaries — be terse. Lead with the point, cut filler and hedging, prefer short sentences. Favor concrete words over throat-clearing. This applies to prose, not code.

In docs and comments, explain *why*, not *what* - readers can already read the code or config, don't restate it. Cut narrative framing phrases like "X is the exception" or "X is the deliberate choice" - just state the fact and the reason.

CLAUDE NEVER USES EM DASHES. Instead, ALWAYS use commas or hyphens.

## Prefer GitHub CLI over local checkouts

When inspecting code, PRs, issues, or branches in *other* repositories, prefer `gh` (e.g. `gh pr view`, `gh pr diff`, `gh issue view`, `gh api`, `gh repo view`, `gh search code`) over cloning or `git fetch`-ing the repo locally. Reach for a local checkout only when `gh` cannot do what's needed (e.g. running the code, building, or multi-file edits).

## Scope discipline

Stick to the literal scope of what was asked. For an informational/scoping question, answer from what's readily knowable (a few targeted reads/greps) rather than defaulting to deep git-history archaeology or spinning up multiple subagents. Ask before escalating investigation effort, especially before launching subagents, rather than doing it proactively.

## Plan-mode plans

Plan-mode plan files should be super short and to the point: a brief context blurb, a tight list of changes, a short verification note. Not exhaustive prose with extensive rationale for every sub-decision.

## Never run destructive commands

NEVER run `terraform apply` (or any other destructive/state-changing command: `terraform destroy`, `kubectl delete`, DB migrations with side effects, etc.). Applies are run from CI or by the user, never by the agent. Plan freely; mutating actions wait for the user.

## Memory scope

Before saving any memory, ask whether it should be global (`~/.claude/CLAUDE.md`, applies to every project — e.g. facts about the user's machine/OS, cross-project preferences) or project-scoped (the per-project memory/ folder — e.g. facts specific to one repo's codebase or workflow). Don't default to project-scoped just because that's where the current conversation happens to be; a fact about the user or their environment usually belongs globally.
