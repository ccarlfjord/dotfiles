---
name: obsidian-kanban
description: Read and edit Obsidian Kanban boards (the kanban-plugin markdown format) through the obsidian CLI. Use when asked to add, move, rename, complete, or remove cards on a kanban board, list a board's lanes and cards, or find which boards exist; covers Board.md-style files in the Windows vault reached over the CLI.
---

# Obsidian Kanban boards

Boards are ordinary markdown files the Kanban plugin renders. The obsidian CLI
has no card or lane commands, so combine its native read/task commands with
`obsidian eval` running `board.js` (in this skill dir) against Obsidian's vault API.

Obsidian must be running, and all edits go through the CLI. Never edit the WSL
clone (`~/src/ccarlfjord/obsidian`) directly; it is pull-only and would drift.

## Board format

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] a card
- [x] a finished card

## Done

**Complete**

%% kanban:settings
```
{...}
```
%%
```

- Lanes are `## Heading` lines; cards are `- [ ]` / `- [x]` list items under a lane.
- `**Complete**` marks the Done split, `***` separates Archive. Leave them alone.
- Cards may carry indented sub-items; treat those as part of the card.

## Read

```sh
obsidian read path="Board.md"              # raw board
obsidian search query="kanban-plugin:"     # every board file
obsidian tasks path="Board.md" verbose     # cards with line numbers
```

`board.js` with `action: "list"` returns lanes and card texts as JSON.

## Edit

Define `op`, then append `board.js`; `eval` awaits the returned promise.

```sh
SKILL=~/.pi/agent/skills/obsidian-kanban
op='{"action":"move","path":"Board.md","match":"deploy staging","to":"In progress"}'
obsidian eval code="const op = $op;
$(cat $SKILL/board.js)"
```

Actions (all take `path`):

| action | extra fields | effect |
| --- | --- | --- |
| `list` | | lanes + card texts (JSON) |
| `add` | `lane`, `text`, `position?` | new unchecked card |
| `move` | `match`, `to`, `position?` | move a matching card into a lane |
| `remove` | `match` | delete a card |
| `toggle` | `match`, `state` (`done`/`todo`) | check or uncheck |
| `rename` | `match`, `text` | replace the card text |
| `addLane` | `lane` | append a lane |

- `match` is a case-insensitive substring of the card text and must be unique;
  the script throws on zero or multiple hits, so make it specific.
- `position` defaults to the bottom of the lane; pass `"top"` for the top.
- Verify with `obsidian read path="Board.md"`. For one check/uncheck,
  `obsidian task path="Board.md" line=N toggle` also works (get `N` from
  `tasks verbose`).

## Cautions

- Do not `append`/`prepend` to a board: they write at the file's end or top,
  after the settings block or before the lanes, and the plugin drops the card.
- Keep payloads small; `board.js` edits in place and never rewrites unrelated content.
- Do not hand-edit `.obsidian/`; lanes and settings live in the markdown only.
