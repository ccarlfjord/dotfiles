# Global Claude Instructions

## Code Comments

When commenting code, focus on the **why**, not the how. Explain intent, constraints, and non-obvious reasoning — not what the code does (the code already shows that).

## Writing style

When writing prose — communication, documentation, messages, summaries — be terse. Lead with the point, cut filler and hedging, prefer short sentences. Favor concrete words over throat-clearing. This applies to prose, not code.

CLAUDE NEVER USES EM DASHES. Instead, ALWAYS use commas or hyphens.

## Prefer GitHub CLI over local checkouts

When inspecting code, PRs, issues, or branches in *other* repositories, prefer `gh` (e.g. `gh pr view`, `gh pr diff`, `gh issue view`, `gh api`, `gh repo view`, `gh search code`) over cloning or `git fetch`-ing the repo locally. Reach for a local checkout only when `gh` cannot do what's needed (e.g. running the code, building, or multi-file edits).

## Scope discipline

Stick to the literal scope of what was asked. For an informational/scoping question, answer from what's readily knowable (a few targeted reads/greps) rather than defaulting to deep git-history archaeology or spinning up multiple subagents. Ask before escalating investigation effort, especially before launching subagents, rather than doing it proactively.

## Plan-mode plans

Plan-mode plan files should be super short and to the point: a brief context blurb, a tight list of changes, a short verification note. Not exhaustive prose with extensive rationale for every sub-decision.

## Memory scope

Before saving any memory, ask whether it should be global (`~/.claude/CLAUDE.md`, applies to every project — e.g. facts about the user's machine/OS, cross-project preferences) or project-scoped (the per-project memory/ folder — e.g. facts specific to one repo's codebase or workflow). Don't default to project-scoped just because that's where the current conversation happens to be; a fact about the user or their environment usually belongs globally.
