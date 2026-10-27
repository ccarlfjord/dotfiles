---
name: promotion-leverage
description: Decide what work is worth taking, how to attach business value to it, and how to record it, against Charles's promotion ladder at Voi (Senior I → Senior II → Staff). Use when planning or reprioritising work, when asked whether something "counts", when scoping a new initiative or pilot, when writing a check-in, weekly review, self-assessment or promotion evidence, or when an initiative risks landing after a review instead of before it.
---

# Promotion leverage

Promotion at Voi is scored on **delivered, measurable impact inside the review window**, not on effort, not on in-flight work, not on how hard the problem was. Two multi-team migrations were deprioritised by R&D in H1 2026 and therefore did not count in the September cycle, despite being the largest things in progress. That is the failure mode this skill exists to prevent.

## The ladder, and which bullets actually gate

Voi Job Levels: Engineer → Senior I → Senior II (**both level G**) → Staff / Senior Staff (**H–I**). Ladder split announced Dec 2025.

Senior II is the current target. Five bullets decide it; the rest are supporting cast:

1. **Impact-1** — leads and consistently *delivers* large, ambiguous-scope work, with external stakeholder management.
2. **Impact-2** — matches engineering solutions and architecture to **product strategy**; broad product and business awareness outside the immediate domain.
3. **Impact-3** — sought out for the domain's most pressing business challenges because they are known to be effective.
4. **Tech Mastery-6** — fosters quality culture **across R&D**, with significant measurable improvement in quality, performance, stability, observability or scalability.
5. **Behaviour-2** — the domain stays on company priorities at high velocity while balancing technical investment. This one needs the manager's words, not mine.

Explicitly **not** Senior II requirements: mentoring/onboarding and team vision (Senior I bullets), external ambassadorship and R&D-level OKR authorship and company-boundary scope (Staff). Citing them at Senior II argues the wrong axis.

## The three rules

**1. Landed beats planned.** Every initiative gets a landing date that is public and hard. If a date slips, the initiative does not count for the review — and a second silent slip is a pattern a reviewer will name.

**2. No metric, no initiative.** Before taking work, answer four things: which business metric it moves, the baseline value today, the date the change lands, and who else adopts it. If the answer is "it's hygiene", do it fast, delegate it, or refuse it. Hygiene is never the case.

**3. Two flagships maximum.** At most two initiatives are promotion-bearing at any time; everything else is hygiene, unblocking, or someone else's work. Adding a third dilutes all three. Declining is on-strategy when it protects a flagship — say so in the check-in.

## Tying a platform change to business value

Platform work reads as cost unless it is framed in one of five currencies. Pick the one that is true and get a number for it:

- **Cost retired** — instances, licences, toil hours. Before → after, per month.
- **Risk closed** — unsupported software, single points of failure, compliance gaps. State what could have happened and what now cannot.
- **Speed of others** — lead time for a team to do a thing they previously needed you for.
- **Correctness** — misrouted pages, wrong alerts, stale data, tickets that stop arriving.
- **Adoption** — how many teams, services or dashboards are on the new thing, with the old thing measurably abandoned (deleted, not just deprecated).

A change with no number in one of these is not evidence, however gnarly it was.

## The value ledger

Keep one page, updated monthly, in the vault: [[2027 Promotion Case - Senior I to Senior II]] holds it.

| Initiative | Business metric | Baseline | Current | Landed | Who adopted it |
|---|---|---|---|---|---|

Rules: only landed rows count; a row with a blank metric is a to-do, not an achievement; the April package is this table plus two pages of narrative. Monthly, ask: which rows moved, which ones are still blank, and what date does each blank one need.

## When someone asks "does this count?"

Answer with the four questions from rule 2. If the work cannot be tied to a currency above, the honest answer is no — take it because it is worth doing, not because it is evidence.

## What to ask the manager for

- The metric he would accept as proof of value, per flagship, before building the dashboard.
- Written criteria: "what would have to be true for you to rank me higher next cycle?"
- The nomination route and deadline for the next cycle.
- One paragraph in his words on Behaviour-2 (priority discipline and velocity for the domain).
- For Staff later: he already has the three gaps — being in the room where R&D strategy and OKRs are set, owning one initiative whose boundary is the company, and publishing externally.

## Anti-patterns

- **Volume as evidence.** PR count, ticket count, review count are context, never the argument. 179 merged PRs did not move a decision that was waiting on delivery.
- **The solo hero.** Breadth of one pair of hands reads as risk. Hand off part of a flagship and record the adoption.
- **Refighting a deprioritisation.** State the constraint once, factually, then show delivery. Never lead with the obstacle.
- **Promising a "tracked value" track without tracked data.** Instrumentation shipped is not value; a before/after delta on a named metric is.
- **Late starts.** Work that produces tracked value needs roughly three months of measurements before it can be cited. Something unstarted in March cannot count in April.
