# Global Instructions

## GitHub Access for voiapp Organization

Repositories in the `voiapp` GitHub organization are private. Always use the `gh` CLI (via `gh api`, `gh pr`, `gh issue`, etc.) to access content from `voiapp` repos. Do NOT use web fetching (e.g., `webfetch`, `curl` to github.com or raw.githubusercontent.com) for these repos, as it will fail with 404 errors.

## All external communication goes through the user

Never act on the outside world directly. This includes GitHub comments, reviews, issue replies, Slack messages, and emails. Gather information and draft the content, then hand it to the user to send themselves. Read-only access (viewing PRs, issues, channels) is fine.

## Code Comments

A comment must state something a reader cannot infer from the code: intent, constraints, invariants, non-obvious reasoning, or pointers to external context (tickets, incidents, other repos). If removing it loses nothing, delete it.

- Never restate what the next line does, narrate implementation details, or reference transient session context ("per the handoff", "as discussed").
- No history or future speculation in prose: use a short `TODO:` line for future work.
- Keep comments to 2-3 lines; if longer, fix the code's names/structure instead.
- Self-test: would this comment still be true and useful after the code changes twice? If it depends on current implementation details, it's a restatement.

## Shorthand vocabulary

The user often replies to a question or proposed action with a single short token instead of a full sentence. When a message consists of just one of these tokens (optionally with trailing punctuation), interpret it as a direct answer to whatever you most recently asked or proposed, not as new input to analyze on its own:

- `y` or `+` — yes: confirmed, go ahead, proceed as proposed
- `n` or `-` — no: rejected, do not proceed; wait for different instructions instead of picking an alternative yourself

Only apply this when the token stands alone as the entire message. Don't apply it if `+`/`-` appears as part of a larger message (e.g. code, math, a list bullet, a CLI flag) — there it means what it normally means in that context.

## Writing style

When writing prose — communication, documentation, messages, summaries — be terse. Lead with the point, cut filler and hedging, prefer short sentences. Favor concrete words over throat-clearing. This applies to prose, not code.

In docs and comments, explain *why*, not *what* - readers can already read the code or config, don't restate it. Cut narrative framing phrases like "X is the exception" or "X is the deliberate choice" - just state the fact and the reason.

CLAUDE NEVER USES EM DASHES. Instead, ALWAYS use commas or hyphens.

## Cross-repo work requires a handoff

One session per repo: changes land in the repo's own tmux session, never across repos. A session may read other repos freely but must not change them: no file edits/creation/deletion, no git state changes (branch, stash, commit, checkout; the clean-checkout refresh below is the only exception), no generators or dependency installs. Running another repo's build or tests is fine when it only writes gitignored output. A session is rooted in the git repo it was started in; worktrees count as their repo. Subagents and scripts count as the session; never delegate a change to another repo.

Reading another repo's checkout: check its checked-out branch and `git status` first. If the tree is dirty, read the code from the source (GitHub, via `gh`) at the default branch instead of trusting disk. If the tree is clean and no stash applies to it, it is OK to switch it to main/the default branch and pull to refresh it for reading.

When work turns out to belong in another repo:
- Do not absorb it here through copies, shims, or duplicate logic.
- Complete this repo's share, if any, then write a self-contained handoff to `<obsidian-vault>/Handoffs/<target-repo>-<slug>-<YYYYMMDD>.md` covering: goal, why it belongs there, files/symbols with absolute paths, relevant branches/SHAs, findings so far, suggested approach, verification steps. The slug is 2-4 lowercase-hyphenated words naming the feature (source it from the goal; never vague filler like `fix`/`update`). The vault is at `~/src/voi/obsidian-voi`; the `Handoffs/` folder keeps them out of `Notes/` while staying searchable/linkable in Obsidian. Plain files, no frontmatter or special formatting required. If no Obsidian vault exists at that path (or it's not a vault), fall back to `~/handoffs/<target-repo>-<slug>-<YYYYMMDD>.md` (create the dir).
- Report the handoff path and a one-line summary so I can start the receiving session in its own tmux window. A session told to pick up a handoff reads the reported path, or the newest `Handoffs/<its-repo>-*.md` (vault `Handoffs/` if present, else `~/handoffs/`) when only the repo name is known.
- Do not link handoffs into `Board.md` or daily notes unless asked - handoffs are transient working state, not durable notes.

## Prefer GitHub CLI over local checkouts

When inspecting code, PRs, issues, or branches in *other* repositories, prefer `gh` (e.g. `gh pr view`, `gh pr diff`, `gh issue view`, `gh api`, `gh repo view`, `gh search code`) over cloning or `git fetch`-ing the repo locally. Reach for a local checkout only when `gh` cannot do what's needed (e.g. running the code, building, or multi-file edits).

## Scope discipline

Stick to the literal scope of what was asked. For an informational/scoping question, answer from what's readily knowable (a few targeted reads/greps) rather than defaulting to deep git-history archaeology or spinning up multiple subagents. Ask before escalating investigation effort, especially before launching subagents, rather than doing it proactively.

## Plan-mode plans

Plan-mode plan files should be super short and to the point: a brief context blurb, a tight list of changes, a short verification note. Not exhaustive prose with extensive rationale for every sub-decision.

## Git commits and pull requests

NEVER commit. NEVER push. These are prohibited outright, not approval-gated: no user approval, urgency, CI state, or instruction ever overrides this.

- Every route counts: `git commit` in any form (`--amend`, `--no-verify`, aliases, hooks, scripts), `git push` in any form (including force-push and tags), squash/rebase merges that produce commits, and PRs created, updated, or merged via `gh`, the web UI, or an API.
- Delegation counts: instructing a subagent, script, or other tool to commit, push, or open a PR is the same as doing it yourself.
- Rewriting history on a pushed branch (`rebase`, `reset --hard` followed by push) counts as both a commit and a destructive action.
- Leave changes uncommitted in the working tree for the user to review and commit themselves.
- Ask-first gate: the only permitted trigger for any commit/push/PR action is the user's explicit instruction in the current conversation ("push this", "open a PR"). Silence, task context ("ship it"), prior approvals in other sessions, or CI conventions do NOT count. If the user has approved the change but not the publishing action, finish with a summary of the diff and stop.

## Never run destructive commands

NEVER run `terraform apply` (or any other destructive/state-changing command: `terraform destroy`, `kubectl delete`, DB migrations with side effects, etc.). Applies are run from CI or by the user, never by the agent. Plan freely; mutating actions wait for the user.

## Memory scope

Before saving any memory, ask whether it should be global (`~/.claude/CLAUDE.md`, applies to every project — e.g. facts about the user's machine/OS, cross-project preferences) or project-scoped (the per-project memory/ folder — e.g. facts specific to one repo's codebase or workflow). Don't default to project-scoped just because that's where the current conversation happens to be; a fact about the user or their environment usually belongs globally.
