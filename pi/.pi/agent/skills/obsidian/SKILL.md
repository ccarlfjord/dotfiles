---
name: obsidian
description: Read and edit the user's Obsidian vault (via the obsidian CLI on WSL, directly on native Linux). Use for any note, daily note, task, tag, frontmatter, search, or vault-structure request, and before touching any file under an Obsidian vault path.
---

# Obsidian

## Where the vault lives

Check the environment before anything else: a non-empty `$WSL_DISTRO_NAME`
(`$WSL_INTEROP` or `$WSLENV` work too) means WSL; none of them exist on native
Linux. Fallback: `uname -r` containing `microsoft`.

**WSL** (Obsidian runs on Windows):

- Real vault: `C:\Users\gauz\obsidian`, mounted at `/mnt/c/Users/gauz/obsidian`.
- The `obsidian` command shims onto the running Windows app; the pi `obsidian`
  tool wraps the same CLI. Do all writes through it: `create`, `append`,
  `prepend`, `property:set`, `move`, `rename`, `delete`, task updates.
- The checkout at `~/src/ccarlfjord/obsidian` is a pull-only mirror. Never edit
  it, and never use `write`/`edit`/`rm`/`mv` on vault files. It lags the real
  vault and editing it leaves the app stale; that drift has already happened.
  The app, not the filesystem, owns the vault.

**Native Linux** (Obsidian runs on the same machine):

- `~/src/ccarlfjord/obsidian` is the real vault. Edit it directly with the usual
  file tools; the `/mnt/c` path and the Windows bridge do not exist.
- If an `obsidian` CLI is installed and talking to a running app, prefer it and
  the ops below apply. If not, ignore the CLI-specific sections.

## Reading

- `obsidian read path="Notes/foo.md"`: exact vault-relative path.
- `obsidian file file="Foo"`: info; `obsidian files folder="Dailies"`.
- Bulk reading: on WSL, `rg`/`read` directly on `/mnt/c/Users/gauz/obsidian`
  (read-only, always current); on native Linux, the checkout itself. Never grep
  the WSL clone.
- `obsidian search query="..." path="Notes" limit=20` searches content;
  `search:context` adds matching lines; `format=json` for structure.
- A bare colon makes Obsidian parse an operator (`Error: Operator "x" not
  recognized`); wrap the phrase, e.g. `query='"kanban-plugin:"'`.
- `tasks path="Board.md" verbose` lists tasks with line numbers; `tags counts`,
  `outline`, `links`, `backlinks`, `properties`, `orphans`, `unresolved` for the
  rest.

Always pass `path=` (exact) or `file=` (wikilink-style name). Omitting both
targets whatever tab is active in the app, which is not predictable.

## Writing

- `create path="Notes/Foo.md" content="..."`; parent folders are created.
- `create` never replaces: an existing path yields a second file named
  `Foo 1.md`. Pass `overwrite` only when replacing is intended.
- `append`/`prepend` add a newline separator by default; `inline` appends or
  prepends exactly, with no separator. Use `inline` when building content in
  chunks.
- `content=` supports `\n` and `\t`; quote it with single quotes so the shell
  does not expand `$` or backticks. Obsidian's main process JSON.parses each
  4 KB IPC read chunk as one message, so a request past that is dropped: the
  CLI still exits 0 with no output and the app shows a JS-error dialog. The pi
  tool chunks large `content=` for you; raw CLI calls need the file handoff
  described under `eval`.
- Frontmatter: `property:set path=... name=status value=active`, not hand edits.
- `move`/`rename` rewrite wikilinks across the vault; `delete` goes to trash
  unless `permanent`.
- Whole-note rewrites go through `eval` (read, splice, write; there is no
  text-replace op). The pi tool's `eval` hands large code off automatically; on
  native Linux just edit the file.

## Tasks and dailies

- Update one task: `tasks path="X.md" verbose` for the line, then
  `task path="X.md" line=12 done|todo|toggle` (`ref=X.md:12` also works).
- `daily:path`, `daily:read`, `daily:append content="..."`,
  `daily:prepend`, `task daily line=N ...`, `tasks daily`.

## eval (escape hatch, WSL/CLI)

Some CLI commands are missing from the pi tool (`history`, `sync`, `plugin*`,
`theme*`, `random`, `wordcount`, `tabs`, `dev*`); run them with bash. `eval`
itself is a pi op, and code too large for one IPC frame is written to a temp
file and read back by a one-line loader, so size does not matter. `eval`
executes JS inside the app, where `require` and `process` exist:

```sh
obsidian eval code='(async () => {
  const f = app.vault.getAbstractFileByPath("Notes/Foo.md");
  await app.vault.modify(f, "full new body");
  return await app.vault.read(f);
})()'
```

The returned promise is awaited, but top-level `await` and `return` are illegal,
so wrap code in an async IIFE. Use it only for what native ops cannot express.

Through raw bash, oversized code needs the handoff done by hand: put the script
in `/mnt/c/Users/$USER/AppData/Local/Temp/x.js`, then

```sh
obsidian eval code='(async()=>{const c=require("fs").readFileSync("C:/Users/gauz/AppData/Local/Temp/x.js","utf8");return await eval(c)})()'
```

## Quirks

- Errors print `Error: ...` on stdout and often still exit 0; check the output,
  not the status code. An empty output from `create`/`append`/`prepend` means the
  write was dropped, not that it succeeded quietly.
- `files` and `folders` filter with `folder=`, not `path=`; `path=` is silently
  ignored and you get the whole vault.
- With one vault, `vault=` is unnecessary; on native Linux with several vaults,
  pass it.
- If the CLI cannot reach the app, Obsidian is not running: stop and tell the
  user. Do not fall back to editing files (on WSL; on native Linux the files are
  the real vault).
- Never edit or generate anything under `.obsidian/`.

## Vault conventions

- `Notes/` for technical/project notes, `Dailies/YYYY/MM-MMMM/YYYY-MM-DD.md`,
  `Archived/`, `Templates/`, `Assets/`, `Board.md` (kanban).
- Never create notes in the vault root; no non-markdown files outside `Assets/`
  and `Excalidraw/`.
- After creating a note, link it from today's daily under `# 🗒️ Notes`
  (`daily:append content="- [[Foo]]"`).
- Preserve frontmatter, links, tags, and checkbox state when editing; archive
  instead of deleting.
- Kanban boards: use the `obsidian-kanban` skill.
- Vault-specific rules: `/mnt/c/Users/gauz/obsidian/AGENTS.md` on WSL, the same
  path under `~/src/ccarlfjord/obsidian` on native Linux.
