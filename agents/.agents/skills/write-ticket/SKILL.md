---
name: write-ticket
version: 1.0.0
description: |
  Write well-structured Jira tickets for the Data & Infra Platform (DIP) project,
  following the team's Jira guidelines for hierarchy, labels, and conventions.
  Use when the user wants to create a Jira ticket, capture work in DIP, draft a
  KR, log a goalie/maintenance item, or break a Task into subtasks.
allowed-tools:
  - Read
  - mcp__jira__searchJiraIssuesUsingJql
  - mcp__jira__getJiraIssue
  - mcp__jira__getJiraProjectIssueTypesMetadata
  - mcp__jira__getJiraIssueTypeMetaWithFields
  - mcp__jira__getVisibleJiraProjects
  - mcp__jira__createJiraIssue
  - mcp__jira__editJiraIssue
  - mcp__jira__lookupJiraAccountId
  - mcp__jira__getConfluencePage
  - mcp__jira__getAccessibleAtlassianResources
---

# Write DIP Jira Ticket

You help teammates capture work as well-structured Jira tickets in the **DIP** (Data & Infra Platform) project. The authoritative reference is the team's Jira guidelines page; a working summary is baked into this skill below. If you ever encounter a case the summary doesn't cover, fetch the live page (Confluence page id `82045861890`, space `RND`) and update your reasoning accordingly.

**Source of truth:** https://voidev.atlassian.net/wiki/spaces/RND/pages/82045861890/Jira+guidelines

## Core behaviors

1. **Understand the work first.** Before drafting anything, make sure you understand *what* needs to happen and *why*. Ask clarifying questions when the request is vague. Do **not** assume.
2. **Never propose technical implementations.** This skill captures work; it does not design solutions. The description should describe the problem, the desired outcome, and acceptance criteria — never "how to build it" (no architecture, code structure, library choices, query plans, refactor strategies, etc.). If the user volunteers implementation details, you may include them as-is in an "Implementation notes (from requester)" section, but do not generate your own.
3. **Default project is `DIP`.** Never auto-assign. If the user hasn't named an assignee, **ask** before drafting: "Assign this to you, or leave unassigned?" Do not silently default to either. Same rule for sprint placement: ask whether to add to the current sprint or leave in the backlog (skip for Epics).
4. **Draft → confirm → create.** Always show the full draft (title, type, labels, parent, assignee, sprint, description) and wait for explicit user approval before calling `mcp__jira__createJiraIssue`.

## Workflow

### Step 1 — Gather context

Get a plain-English understanding of the work. Ask the user (only the questions you actually need answered):

- What is the problem or goal? Who is affected, what is the desired outcome?
- Is this part of an OKR (a Key Result), or is it goalie/maintenance/ad-hoc?
- Is there a parent ticket, a related incident, a Slack thread, or a Confluence page?
- Are there time constraints, dependencies, or stakeholders to flag?
- Is this a single piece of work or several? (Multiple distinct outcomes → multiple tickets, possibly with subtasks.)

Ask the user directly in conversation. For forks between 2–4 well-scoped options, lay them out as a short lettered/bulleted list and ask them to pick (or answer free-form for open context).

If the user dumps a long description, *read it carefully* and only ask about the genuine gaps. Don't re-ask things they already covered.

### Step 2 — Classify the ticket

Based on what you learned, decide which of the six categories from the guidelines applies. Use this table:

| Category | Type | When to use |
| --- | --- | --- |
| **Objective** | Epic | Quarter-level Objective. Rare; usually created by team lead. |
| **Key Result** | Epic | Quarter-level KR under an Objective. Created during planning. |
| **KR-related ticket** | Task | Work that delivers progress toward a specific KR Epic. |
| **Goalie ticket** | Task | On-call / firefighting work. |
| **Other non-KR ticket** | Task | Ad-hoc work that isn't OKR, goalie, or maintenance-pure. |
| **Subtask** | Subtask | A piece of a single Task — only when the parent Task is genuinely too big as one unit. |

If you're not certain whether it's OKR work or ad-hoc, **ask**. Don't guess — the parent linkage decides whether it appears in OKR reporting.

For maintenance work (dep upgrades, small cleanups), treat it as an **Other non-KR ticket** and apply both `src:maintenance` and the relevant `type:*` label.

### Step 3 — Resolve the parent (if applicable)

- **KR-related Task**: parent = the KR Epic. If the user told you which KR, find the Epic with JQL (via `mcp__jira__searchJiraIssuesUsingJql`): `project = DIP AND issuetype = Epic AND labels = "type:key-result" AND text ~ "<keyword>"`. Confirm the match (key + title) with the user before locking it in.
- **Key Result**: link "Action item of" the parent Objective. Find the Objective Epic the same way (`labels = "type:objective"`).
- **Subtask**: parent = a Task. The user must tell you the Task key, or you find it via JQL.
- **Goalie / Other non-KR**: no parent.

If you can't find a unique match, list the candidates and ask which one.

### Step 4 — Determine fields

Apply the conventions from the guidelines summary below. For each ticket, you must produce:

- **Title** — follows the format for the issue category (see summary).
- **Issue type** — Epic / Task / Subtask.
- **Labels** — chosen from the `src:`, `type:`, `state:` namespaces. All lowercase. Never invent labels.
- **Parent** — issue key, or none.
- **Assignee** — if the user named one, resolve to account id via `mcp__jira__lookupJiraAccountId`. If they didn't, ask them: "Assign this to you, or leave unassigned?" Resolve the current user's account id with `mcp__jira__lookupJiraAccountId` (or `mcp__jira__atlassianUserInfo` for the current user) when they pick themselves. Never auto-assign without asking.
- **Sprint** — ask the user: "Add to the current sprint, or leave in the backlog?" Do not silently default. If yes, set the Sprint custom field at create time via `additional_fields` (or follow up with `mcp__jira__editJiraIssue` if the field can't be set on create). Skip this question for Epics (Objectives and Key Results), which don't belong to a sprint.
- **Description** — see Step 5.

`type:*` labels are nearly always required on Tasks. `src:goalie` and `src:maintenance` mark origin for non-OKR work. `src:okr` does **not** exist — OKR membership is signaled by parent linkage, not a label.

### Step 5 — Write the description

Use this structure (skip sections that don't apply, but do not invent content to fill them):

```
**Context**
1–3 sentences: what's happening today, why this matters, who is affected.

**Outcome / Definition of done**
What does success look like? State it as observable outcomes, not steps.
- Bullet 1
- Bullet 2

**Acceptance criteria**
Concrete, checkable conditions for closing the ticket.
- [ ] Criterion 1
- [ ] Criterion 2

**Links**
- Related: DIP-XXXX, Slack thread, Confluence page, dashboard, etc.

**Implementation notes (from requester)**   ← only if the user provided them
Verbatim notes from the requester. Not your design.
```

Rules:
- Be terse. A good DIP description fits in a screen.
- Outcome statements are *outcomes*, not tasks. ("Group-based access works for the SRE group" — not "modify provisioner to call GoogleGroupAPI").
- If acceptance criteria are unclear, apply `state:needs-refinement` and note what's missing in the description.
- If the work is blocked on something external, apply `state:blocked-external` and name the blocker.

### Step 6 — Draft, confirm, create

Show the full draft as a code block:

```
Project:    DIP
Type:       Task
Title:      <title>
Labels:     type:implementation, src:maintenance
Parent:     DIP-1431 ("[2026-Q2] O1/KR2: Set up foundational Google Groups")
Assignee:   (unassigned)
Sprint:     (backlog)

Description:
<full description>
```

Ask: "Create this ticket as-is, or do you want to adjust anything first?"

After explicit approval:

1. Call `mcp__jira__createJiraIssue` with the chosen fields.
2. If labels or parent linkage couldn't be set in the create call, follow up with `mcp__jira__editJiraIssue`.
3. Return the issue key and URL.

If the user wants multiple tickets in one go, draft them all together first, get a single approval, then create them sequentially. Stop on the first failure and surface the error.

## Guidelines summary (baked-in)

The full guidelines page is the source of truth. The summary below is good enough for common cases — if a question falls outside it, fetch the live page.

### Hierarchy

```
Objective (Epic)
  └── Key Result (Epic)        ← "Action item of" the Objective
        └── Task                ← Parent = KR Epic. Parent linkage = OKR membership.
              └── Subtask
```

Non-OKR work (goalie, maintenance, ad-hoc) is a Task with no parent.

### Labels

All lowercase. Three namespaces:

**`src:` — origin of the work** (only for non-OKR sources)

| Label | Meaning |
| --- | --- |
| `src:goalie` | On-call / firefighting |
| `src:maintenance` | Routine hygiene (dep updates, small cleanups) |

**`type:` — nature of the work**

| Label | Meaning |
| --- | --- |
| `type:objective` | Epic that is an Objective |
| `type:key-result` | Epic that is a Key Result |
| `type:implementation` | Building something new |
| `type:cleanup` | Removing or simplifying |
| `type:investigation` | Research, RFC, ADR |
| `type:refactor` | Restructuring without behavior change |

**`state:` — transient (optional)**

| Label | Meaning |
| --- | --- |
| `state:needs-refinement` | Not ready for work (unclear scope, missing AC, blocked on decision) |
| `state:blocked-external` | Waiting on something outside the team |

### Title formats

| Issue category | Title convention |
| --- | --- |
| Objective | `[year-Qx] Ox: description` — e.g. `[2026-Q2] O1: Build group-based provisioning` |
| Key Result | `[year-Qx] Ox/KRx: description` — e.g. `[2026-Q2] O1/KR2: Set up foundational Google Groups` |
| KR-related Task | No specific format |
| Goalie / Other / Subtask | No specific format |

### Per-issue-type conventions

| Category | Type | Labels | Parent | Assignee |
| --- | --- | --- | --- | --- |
| Objective | Epic | `type:objective` | — | Team lead |
| Key Result | Epic | `type:key-result` | "Action item of" Objective | KR lead |
| KR-related ticket | Task | `type:<implementation\|cleanup\|investigation\|refactor>` | KR Epic | Person working on it |
| Goalie | Task | `src:goalie` + optional `type:*` | None | Goalie |
| Other non-KR | Task | `type:*` if applicable | None | Optional |
| Subtask | Subtask | None required | A Task | — |

## Uncertainty fallback

If any of the following is true, fetch the live guidelines page before deciding:

- The user mentions a label, status, or convention you can't find in the summary above.
- The user is creating an issue type the summary doesn't describe.
- The user says "the guidelines say X" and X contradicts your understanding.

Fetch with:

```
mcp__jira__getConfluencePage
  cloudId: voidev.atlassian.net
  pageId: 82045861890
  contentFormat: markdown
```

Read the page, then continue. If you find the summary is out of date, mention it to the user at the end so they can refresh the skill.

## Anti-patterns to avoid

- ❌ Suggesting how to implement the work (architecture, code, queries, migration steps).
- ❌ Assuming OKR membership — always confirm the parent KR.
- ❌ Inventing labels outside the three namespaces.
- ❌ Auto-assigning the ticket — or silently leaving it unassigned when the user didn't say. Ask.
- ❌ Creating before showing the draft for approval.
- ❌ Padding the description with filler to make it "look complete." Empty sections should be omitted.
- ❌ Creating one giant ticket for several distinct outcomes — split them.
