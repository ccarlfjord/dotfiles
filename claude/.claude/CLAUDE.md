# Global Instructions

## GitHub Access for voiapp Organization

Repositories in the `voiapp` GitHub organization are private. Always use the `gh` CLI (via `gh api`, `gh pr`, `gh issue`, etc.) to access content from `voiapp` repos. Do NOT use web fetching (e.g., `webfetch`, `curl` to github.com or raw.githubusercontent.com) for these repos, as it will fail with 404 errors.

## All external communication goes through the user

Never act on the outside world directly. This includes GitHub comments, reviews, issue replies, Slack messages, and emails. Gather information and draft the content, then hand it to the user to send themselves. Read-only access (viewing PRs, issues, channels) is fine.

**Jira comments are the exception.** Posting or updating a comment on an Atlassian issue directly is fine: it records work on an internal ticket rather than communicating outward, so no hand-off is needed. Everything else on a ticket stays with the user: transitions, assignments, field edits, and @-mentions that notify a person.

## Jira site

Call `getAccessibleAtlassianResources` before Jira MCP calls; it lists every granted site with its cloud ID.

## Never reference vault notes externally

Anything read by other people (Jira, Slack, commits, PRs, issues, emails, docs) must stand alone. Do not link to or name Obsidian vault notes (or other local-only paths like handoff files): nobody else can reach them. Copy the needed context inline instead.

Vault notes and handoffs stay a private channel between me and my agent sessions. Keeping them there is correct; the rule only bans pointing external readers at them.

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

## Slack message style (my voice)

When drafting a Slack message for me to send, write it as I would:

- Lead with the ask or the fact; rationale in one short sentence after ("But it will trigger restarts so rather ask first.").
- Lowercase sentence starts are fine ("need to route this to the correct team"). "Hej <team>!" suits team channels.
- Plain words and shorthands: ptal, fyi, tbh, atm, my 2 cents. Backticks only for real names (`team` label, `Rollout`).
- At most one emoji, at the end (:pray:, :sweat_smile:).
- Bare links or `<url>`, never descriptive link text.
- Multi-question replies become `1.` `2.` `3.` one-liners, not paragraphs.
- No bold, bullets, headings or sign-off.

## Cross-repo and cross-session work requires a handoff

One session per repo: changes land in the repo's own tmux session, never across repos. A session may read other repos freely but must not change them: no file edits/creation/deletion, no git state changes (branch, stash, commit, checkout; the clean-checkout refresh below is the only exception), no generators or dependency installs. Running another repo's build or tests is fine when it only writes gitignored output. A session is rooted in the checkout it was started in, and a worktree is a session of its own, not an extension of the one that created it. Subagents and scripts count as the session; never delegate a change to another repo.

Reading another repo's checkout: check its checked-out branch and `git status` first. If the tree is dirty, read the code from the source (GitHub, via `gh`) at the default branch instead of trusting disk. If the tree is clean and no stash applies to it, it is OK to switch it to main/the default branch and pull to refresh it for reading.

When work turns out to belong in a session other than this one:
- Do not absorb it here through copies, shims, or duplicate logic.
- Complete this repo's share, if any, then write a self-contained handoff to `<obsidian-vault>/Handoffs/<target-repo>-<slug>-<YYYYMMDD>.md` covering: goal, why it belongs there, files/symbols with absolute paths, relevant branches/SHAs, findings so far, suggested approach, verification steps. The slug is 2-4 lowercase-hyphenated words naming the feature (source it from the goal; never vague filler like `fix`/`update`). The vault is at `~/src/voi/obsidian-voi`; the `Handoffs/` folder keeps them out of `Notes/` while staying searchable/linkable in Obsidian. Plain files, no frontmatter or special formatting required. If no Obsidian vault exists at that path (or it's not a vault), fall back to `~/handoffs/<target-repo>-<slug>-<YYYYMMDD>.md` (create the dir).
- Report the handoff path and a one-line summary so I can start the receiving session in its own tmux window. A session told to pick up a handoff reads the reported path, or the newest `Handoffs/<its-repo>-*.md` (vault `Handoffs/` if present, else `~/handoffs/`) when only the repo name is known. The handoff is an internal note to the next session and to me: never point a PR, ticket, or Slack thread at it, and never paste its path there.
- Same repo, different session (a worktree, see Git worktrees): create the worktree and write the handoff under the same name, target `<repo>` and slug the worktree slug, so the `<repo>_<slug>` session finds the newest `Handoffs/<repo>-<slug>-*.md` without being told.
- Do not link handoffs into `Board.md` or daily notes unless asked - handoffs are transient working state, not durable notes.

## Prefer GitHub CLI over local checkouts

When inspecting code, PRs, issues, or branches in *other* repositories, prefer `gh` (e.g. `gh pr view`, `gh pr diff`, `gh issue view`, `gh api`, `gh repo view`, `gh search code`) over cloning or `git fetch`-ing the repo locally. Reach for a local checkout only when `gh` cannot do what's needed (e.g. running the code, building, or multi-file edits).

## Career leverage (Voi ladder)

Promotion is scored on delivered, measurable impact inside the review window. In-flight work, effort and technical difficulty do not count: two multi-team migrations deprioritised in H1 2026 counted for nothing in September.

- Two flagships maximum at any time. Everything else is hygiene, unblocking, or someone else's work.
- No initiative without four answers: which business metric, the baseline, the landing date, who adopts it.
- Landed beats planned. A slipped date means it does not count; a second silent slip is a pattern.
- Volume is context, never the argument.
- Load the `promotion-leverage` skill when planning, reprioritising, scoping new work, or writing check-ins and reviews. Target and criteria: vault note "2027 Promotion Case - Senior I to Senior II".

## Scope discipline

Stick to the literal scope of what was asked. For an informational/scoping question, answer from what's readily knowable (a few targeted reads/greps) rather than defaulting to deep git-history archaeology or spinning up multiple subagents. Ask before escalating investigation effort, especially before launching subagents, rather than doing it proactively.

## Plan-mode plans

Plan-mode plan files should be super short and to the point: a brief context blurb, a tight list of changes, a short verification note. Not exhaustive prose with extensive rationale for every sub-decision.

## Git worktrees

A worktree is a session, not a corner of this one: `<repo>_<slug>` owns the edits, commits and history there, so creating one means handing the work over rather than continuing in it.

Reach for one when it is the genuinely cleaner path: the checkout is dirty with work that isn't this task's, or it sits on another branch mid-work. That beats stashing, or committing around someone else's changes. Otherwise a branch in the current checkout is fine.

Per-branch checkouts go in `<repo>/.worktrees/<slug>/`, slug being the branch name made path-safe (Branch names below). `~/.gitignore` (the global excludesFile) already ignores `.worktrees`, so repos need no ignore entry. `tms.sh` scans those dirs and names their tmux session `<repo>_<slug>`.

```bash
git -C <repo> worktree add .worktrees/<slug> -b <branch>
```

To hand over: branch off the base branch, create the worktree, write the handoff, and report its path so I can open `<repo>_<slug>`. Do not edit, commit or run generators in it from here; that session does the work, commits and pushes its own branch.

The receiving session removes its own worktree once the branch is merged, with `git worktree remove .worktrees/<slug>`, not `rm -rf` (plain deletion leaves the admin files behind, `git worktree prune` only cleans those up afterwards).

## Git commits and pull requests

Commit when the task is done. Push is allowed by default on a branch the agent created for this work. Anything beyond that still needs my explicit word in this conversation ("push this", "open a PR"): pushing to a shared branch, force-pushing, opening or merging a PR. Silence and task context ("ship it") do not count, and CI being green is not permission. If I approved the change but not the publishing action, finish with a summary of the diff and stop.

- Branch names carry the Jira key when one is obvious: `dip-1234-short-slug`, lowercase key, hyphens, no slashes. Obvious means I named the ticket or the work came out of it. Never search Jira for a plausible match, and use no key when there isn't one.
- One logical change per commit. Don't bundle unrelated edits, and don't commit files the task didn't touch.
- Read `git status` first, then stage by path. Never `git add -A` or `git add .`: the tree may hold my work in progress.
- Write against the base branch, not against this branch's history. The message describes the final state vs main, so drop anything that was added and then reworked or deleted along the way. Never mention removing something main never had: "remove the foo shim" is wrong when the shim was born on this branch.
- Re-read the diff the way a reviewer will see it against main before committing, and drop iteration debris that no longer earns its place.
- Conventional commits (`feat:`, `fix(scope):`, `chore:`, `docs:`) with an imperative subject under 72 chars. Body only per Commit messages below.
- Never bypass hooks (`--no-verify`, `--no-gpg-sign`). If a hook or test fails, fix the cause or hand it back. Don't commit red.
- Amend, rebase, fixup and squash are fine on this session's own unpushed commits, to leave a clean final state. Never rewrite a pushed commit, and never rewrite anyone else's.
- Cross-repo and delegation rules still hold: never commit, push, or rewrite history in a repo the session is only reading, and never delegate a commit to a subagent or script.
- After committing, tell me the SHA and one line on what is in it.

## Commit messages

The subject states the change and is usually the whole message. A body is earned only by a breaking change, a deploy or migration step someone must run, or a fix whose cause a reviewer would misread from the diff. "It explains the why" is not a trigger: most diffs explain themselves.

- Max 3 lines, no bullets, never a list of files.
- No process narration ("first refactored the writer, then wired the flag"). It states the end state vs main, like everything else here.

## PR descriptions

Two numbered sections, one line per item, max 5 items each:

```markdown
## Changes
1. Helm chart stops writing the deprecated `scheduler` flag
2. Runner image pinned to the digest CI builds

## Verification
1. `helm template .` shows no `scheduler` key
2. Deployed to staging, pods stayed Ready for 10 min
```

- Whole body under ~15 lines. Over that, cut from the top: background, motivation, file lists, the investigation story, anything the diff or the ticket already says.
- Verification means commands, clicks or observed results. A plan is not verification.

## Never run destructive commands

NEVER run `terraform apply` (or any other destructive/state-changing command: `terraform destroy`, `kubectl delete`, DB migrations with side effects, etc.). Applies are run from CI or by the user, never by the agent. Plan freely; mutating actions wait for the user.

## Memory scope

Before saving any memory, ask whether it should be global (`~/.claude/CLAUDE.md`, applies to every project — e.g. facts about the user's machine/OS, cross-project preferences) or project-scoped (the per-project memory/ folder — e.g. facts specific to one repo's codebase or workflow). Don't default to project-scoped just because that's where the current conversation happens to be; a fact about the user or their environment usually belongs globally.
