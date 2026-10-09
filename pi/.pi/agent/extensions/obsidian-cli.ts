/**
 * Obsidian CLI tool — op-based wrapper around the `obsidian` CLI binary.
 *
 * Inspired by oh-my-pi's vault:// integration, but implemented as a plain
 * tool for stock pi: no MCP server or Obsidian plugin required. Reads and
 * metadata queries go through the CLI; the vault itself is a plain folder
 * on disk.
 */

import { execFile } from "node:child_process";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OPS = [
	// read / query
	"read", "files", "folders", "file", "folder", "vault",
	"search", "search:context",
	"outline", "links", "backlinks", "tags", "tag", "tasks", "task",
	"properties", "property:read", "aliases", "bookmarks", "recents",
	"orphans", "unresolved", "deadends", "templates",
	"daily:read", "daily:path",
	// write
	"create", "append", "prepend", "move", "rename", "delete",
	"property:set", "property:remove",
	"daily:append", "daily:prepend", "bookmark",
	// obsidian UI
	"open", "daily", "command", "commands", "reload",
] as const;

const FLAGS = [
	"total", "counts", "verbose", "all", "done", "todo", "permanent",
	"overwrite", "open", "newtab", "inline", "resolve", "versions", "ids",
	"active", "daily", "changed", "new", "deleted", "case",
] as const;

const MAX_OUTPUT = 40_000;

function runCli(vault: string | undefined, op: string, args: string[]): Promise<string> {
	const argv: string[] = [];
	if (vault) argv.push(`vault=${vault}`);
	argv.push(op, ...args);
	return new Promise((resolve, reject) => {
		execFile(
			"obsidian",
			argv,
			{ timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					const detail = (stderr || stdout || error.message).trim();
					reject(new Error(`obsidian ${op} failed: ${detail}`));
					return;
				}
				resolve(stdout);
			},
		);
	});
}

const ObsidianParams = Type.Object({
	op: StringEnum(OPS, { description: "Operation to perform" }),
	vault: Type.Optional(Type.String({ description: "Vault name (omit for the active vault)" })),
	file: Type.Optional(Type.String({ description: "File name, resolved like a wikilink (most ops)" })),
	path: Type.Optional(Type.String({ description: "Exact vault-relative path of a file, or folder filter (search/files/folders)" })),
	query: Type.Optional(Type.String({ description: "Search query (search, search:context)" })),
	folder: Type.Optional(Type.String({ description: "Folder filter (files, random) or bookmark folder (bookmark)" })),
	name: Type.Optional(Type.String({ description: "Name argument: property name, tag name (tag), new file name (rename), template name" })),
	value: Type.Optional(Type.String({ description: "Property value (property:set)" })),
	content: Type.Optional(Type.String({ description: "Content to write (create, append, prepend, daily:append, daily:prepend)" })),
	to: Type.Optional(Type.String({ description: "Destination folder or path (move)" })),
	title: Type.Optional(Type.String({ description: "Bookmark title (bookmark)" })),
	url: Type.Optional(Type.String({ description: "URL to bookmark (bookmark)" })),
	line: Type.Optional(Type.Number({ description: "Line number (task)" })),
	version: Type.Optional(Type.Number({ description: "History version number" })),
	limit: Type.Optional(Type.Number({ description: "Max results (search)" })),
	format: Type.Optional(StringEnum(["json", "text", "tsv", "csv", "yaml", "md", "paths", "tree"], { description: "Output format where supported" })),
	id: Type.Optional(Type.String({ description: "Command or plugin id (command, commands filter, plugin ops)" })),
	flags: Type.Optional(Type.Array(StringEnum(FLAGS), { description: "Boolean modifiers for the op, e.g. [\"counts\",\"verbose\"]" })),
});

const obsidianTool = defineTool({
	name: "obsidian",
	label: "Obsidian",
	description: `Interact with Obsidian vaults through the \`obsidian\` CLI. One op-based tool: pick \`op\` and supply the matching params. The vault is also a plain folder on disk (\`obsidian vault\` shows its root path), so for bulk reading prefer the normal read/grep tools on that path.

Ops:
- read: file contents — needs \`file\` or \`path\`
- files / folders: list vault files/folders — optional \`path\`/\`folder\` filter, flag \`total\`
- file / folder: info about one file/folder — \`file\`/\`path\`
- vault: vault info (name, root path, counts, size)
- search: text search — \`query\` required, optional \`path\` folder filter, \`limit\`, flag \`case\`; use format json for structure
- search:context: same but with matching line context
- outline: headings of a file — \`file\`/\`path\`, format tree|md|json
- links: outgoing links of a file; backlinks: inbound links
- tags: tags in vault or one file — flags \`counts\`, \`verbose\`, \`active\`; tag: notes for one tag — \`name\`
- tasks: list tasks — filter by \`file\`/\`path\`, flags \`todo\`, \`done\`, \`verbose\`, \`daily\`; task: view/update one task — \`path\` + \`line\` + \`toggle\`/\`done\`/\`todo\` flag or \`status\`
- properties: frontmatter of a file or vault-wide — \`file\`/\`path\`, flags \`counts\`, \`active\`; property:read — \`name\` + \`file\`/\`path\`
- aliases, bookmarks, recents, orphans, unresolved, deadends, templates: vault-wide listings — flags \`total\`, \`verbose\`, \`counts\`, \`all\`
- daily:read / daily:path: today's daily note
- create: new file — \`path\` or \`name\`, optional \`content\`, flag \`overwrite\`
- append / prepend: add content to a file — \`content\` + \`file\`/\`path\`
- daily:append / daily:prepend: add content to today's daily note — \`content\`
- move: relocate/rename with link updates — \`file\`/\`path\` + \`to\`; rename: change file name — \`name\`
- delete: trash a file — \`file\`/\`path\`, flag \`permanent\` to skip trash (destructive)
- property:set / property:remove: frontmatter editing — \`name\` (+ \`value\`) + \`file\`/\`path\`
- bookmark: add bookmark — \`file\`/\`folder\`/\`search\`/\`url\` + optional \`title\`, \`subpath\`
- open: open a file in the Obsidian app — \`file\`/\`path\`, flag \`newtab\`
- daily: open today's daily note; command: run an Obsidian command — \`id\`; commands: list command ids; reload: reload the vault`,
	parameters: ObsidianParams,

	async execute(_toolCallId, params) {
		const args: string[] = [];
		const kv: Array<[string, string | number]> = [];
		if (params.file !== undefined) kv.push(["file", params.file]);
		if (params.path !== undefined && params.op !== "folder") kv.push(["path", params.path]);
		if (params.query !== undefined) kv.push(["query", params.query]);
		if (params.folder !== undefined) kv.push(["folder", params.folder]);
		if (params.name !== undefined) kv.push(["name", params.name]);
		if (params.value !== undefined) kv.push(["value", params.value]);
		if (params.content !== undefined) kv.push(["content", params.content]);
		if (params.to !== undefined) kv.push(["to", params.to]);
		if (params.title !== undefined) kv.push(["title", params.title]);
		if (params.url !== undefined) kv.push(["url", params.url]);
		if (params.line !== undefined) kv.push(["line", params.line]);
		if (params.version !== undefined) kv.push(["version", params.version]);
		if (params.limit !== undefined) kv.push(["limit", params.limit]);
		if (params.format !== undefined) kv.push(["format", params.format]);
		if (params.id !== undefined) kv.push(["id", params.id]);
		for (const [key, value] of kv) args.push(`${key}=${value}`);
		if (params.flags) for (const flag of params.flags) args.push(flag);

		// folder op takes path=<folder> as its required argument
		if (params.op === "folder" && params.path !== undefined) args.push(`path=${params.path}`);

		let out = await runCli(params.vault, params.op, args);
		let truncated = false;
		if (out.length > MAX_OUTPUT) {
			out = out.slice(0, MAX_OUTPUT);
			truncated = true;
		}
		const text = out.trimEnd() || "(empty output)";
		return {
			content: [{
				type: "text",
				text: truncated ? `${text}\n\n[output truncated at ${MAX_OUTPUT} chars]` : text,
			}],
			details: { op: params.op, vault: params.vault ?? "(active)", truncated },
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(obsidianTool);
}
