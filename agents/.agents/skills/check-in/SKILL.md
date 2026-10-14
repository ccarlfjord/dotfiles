---
name: check-in
description: >
  Write a "radiating programmer" style check-in (what did I work on, problems &
  resolutions, decisions) into the current daily note. Use when the user asks to
  do a check-in, write/update the check-in, or summarize work for the team.
  Based on https://dev.37signals.com/the-radiating-programmer/
  Pulls data from daily notes, Board.md, GitHub MCP, Jira MCP, and the gh CLI.
metadata:
  vault: obsidian-voi
  workflow: obsidian
---

## Why

Radiate information instead of having it pulled from you. A good check-in lets
others learn from your week (problems hit, lessons learned, scope calls) without
a standup or a 1-1. It is written on your behalf to teammates, so it should read
like a human wrote it: concrete, specific, honest about unresolved things.

## When to check in

2-3 times per week is the cadence, not daily. If the user asks for a check-in,
just do it.

## Workflow

1. **Gather material** from the time since the last filled check-in (find the
   most recent daily note with non-empty `## Worked on` under `Dailies/`).
   Use every relevant connected MCP server plus local sources - the daily notes
   are the primary source, external tools fill in what the user forgot to note:
   - Recent daily notes: `Dailies/YYYY/MM-MMMM/YYYY-MM-DD.md` (Notes and
     Learnings sections are gold: problems, links, decisions).
   - `Board.md` (In progress column) for current project context.
   - **GitHub via `gh` CLI** (preferred): PRs and commits by the user since
     the last check-in. Use `gh search prs --author @me --org voiapp
     --sort updated` for PRs, `gh pr view` / `gh api` for details, `gh api
     user` to resolve the username.
   - **GitHub MCP** (`github_*` tools, fallback): if the `gh` CLI is not
     available or fails (e.g. not authenticated), use `github_search_pull_requests`
     with `author:@me sort:updated` scoped to `org:voiapp`,
     `github_get_commit` / `github_list_commits` for commit details, and
     `github_get_me` to resolve the username. If neither is available, skip
     GitHub material and rely on the other sources.
   - **Jira MCP** (`jira_*` tools): recently updated tickets assigned to the
     user via `jira_searchJiraIssuesUsingJql` with JQL like
     `assignee = currentUser() AND updated >= -7d ORDER BY updated DESC`
     (project `DIP`). Pull ticket status/comments for context on what actually
     moved. Call `jira_getAccessibleAtlassianResources` first if the cloudId
     is unknown.
   - **Slack MCP** (`slack_*` tools): the user's recent messages and thread
     participation since the last check-in (e.g. in team/chapter channels
     like #backend or #platform-dev, DMs about decisions, threads with
     substantial replies). Good for catching announcements, decisions, and
     help given that never made it into a daily note. If the exact tool
     parameter names are unclear, check the tool's schema before calling.
   - **Other MCPs**: if any other server is connected that could show what the
     user did (e.g. Grafana, incident tools), query it too when relevant.
     Skip servers that add nothing for the period.
2. **Draft** the check-in using the format below. Only include what is
   supported by the sources; never invent work. Cross-reference: a PR merged
   without a daily-note mention still counts; a ticket that only changed
   status is usually not worth a bullet unless something was learned.
   Bullets should cover *why* things mattered, not just what was touched.
3. **Show the draft to the user** before writing. Let them edit.
4. **Write it** into today's daily note (`Dailies/YYYY/MM-MMMM/YYYY-MM-DD.md`,
   create via the daily-note flow if missing) under `# 📡 Check-in`.

## Format

The check-in lives in the daily note under `# 📡 Check-in` with three
subsections. If the section does not exist, insert it before `# 💡Learnings`
(create that too if missing). Never touch other sections or frontmatter.

```markdown
# 📡 Check-in
## Worked on
- **<Ticket or project name>** - <what was done and the outcome>
## Problems & resolutions
- **<Problem>** - <what happened> **Resolution:** <fixed how / or "unresolved">
## Decisions
- **<Decision>** - <the call made and with whom; non-blocking by design>
```

## Style rules

- One bullet per piece of work, ordered by importance, not chronologically.
- Bold the ticket ID or a short work label first, then a hyphen, then detail
  (matches existing entries). Do NOT use em dashes.
- Link related notes with wikilinks (`[[Note name]]`), tickets as `#DIP-XXX`
  or Jira URLs, PRs as GitHub URLs.
- "Problems & resolutions" should capture debugging rabbit holes, unexpected
  turns, and things still broken - teammates learn the most from these. If
  unresolved, say so explicitly.
- "Decisions" records calls made with best judgement while informing others
  (non-blocking): state the decision, who was looped in, and that it can be
  revisited.
- Skip routine ceremony (meetings with no outcome, admin) unless it blocked or
  changed something.
- Leave a subsection as `- ` (empty bullet) if there is nothing for it - the
  format is stable so it can be scanned.
