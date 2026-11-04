/**
 * Obsidian CLI tool — op-based wrapper around the `obsidian` CLI binary.
 *
 * Inspired by oh-my-pi's vault:// integration, but implemented as a plain
 * tool for stock pi: no MCP server or Obsidian plugin required. Reads and
 * metadata queries go through the CLI; the vault itself is a plain folder
 * on disk.
 */

import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
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
	// escape hatch
	"eval",
	// obsidian UI
	"open", "daily", "command", "commands", "reload",
] as const;

const FLAGS = [
	"total", "counts", "verbose", "all", "done", "todo", "permanent",
	"overwrite", "open", "newtab", "inline", "resolve", "versions", "ids",
	"active", "daily", "changed", "new", "deleted", "case",
] as const;

const MAX_OUTPUT = 40_000;

// Obsidian's main process JSON.parses each IPC read chunk as a whole message.
// Measured on Windows: ~4 KB per chunk (a 3983-byte request parses, 4283 does
// not), so anything past it is dropped with no error, only a GUI dialog. Budget
// in JSON-encoded bytes, since newlines and quotes inflate the request.
const IPC_BUDGET = 3_600;
const CHUNK_TARGET = 2_400;
const IPC_ENVELOPE = 128;
const CONTENT_OPS = new Set(["create", "append", "prepend", "daily:append", "daily:prepend"]);

/** Encoded size of the request as the IPC layer sees it. */
function requestSize(vault: string | undefined, op: string, args: string[]): number {
	return JSON.stringify({ vault: vault ?? null, op, args }).length + IPC_ENVELOPE;
}

/**
 * Split a content payload into pieces that fit the frame, measured after JSON
 * escaping. A piece must never end on half of a `\n` / `\t` pair: the CLI
 * expands escapes per call, so the split would write a literal backslash.
 */
function splitPayload(text: string, limit: number): string[] {
	const chunks: string[] = [];
	let current = "";
	let used = 0;
	for (const char of text) {
		const cost = JSON.stringify(char).length - 2;
		if (used + cost > limit) {
			let carry = "";
			if (current.endsWith("\\")) {
				current = current.slice(0, -1);
				carry = "\\";
			}
			if (current) chunks.push(current);
			current = carry;
			used = carry ? 2 : 0;
		}
		current += char;
		used += cost;
	}
	if (current) chunks.push(current);
	return chunks;
}

function assertApplied(op: string, out: string): void {
	const text = out.trim();
	if (!text) {
		throw new Error(
			`obsidian ${op} produced no output, so the write was dropped: Obsidian's IPC reader cannot parse a message larger than one 4 KB chunk`,
		);
	}
}

function runCli(vault: string | undefined, op: string, args: string[]): Promise<string> {
	const size = requestSize(vault, op, args);
	if (size > IPC_BUDGET) {
		return Promise.reject(
			new Error(
				`obsidian ${op}: request is ${size} bytes, over the ${IPC_BUDGET}-byte IPC budget; Obsidian would drop it silently`,
			),
		);
	}
	const argv: string[] = [];
	if (vault) argv.push(`vault=${vault}`);
	argv.push(op, ...args);
	return new Promise((resolve, reject) => {
		execFile(
			"obsidian",
			argv,
			{ timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const detail = (stderr || stdout).trim();
				if (error) {
					reject(new Error(`obsidian ${op} failed: ${detail || error.message}`));
					return;
				}
				if (/JavaScript error occurred in the main process/.test(detail)) {
					reject(new Error(`obsidian ${op} crashed the main process: ${detail.split("\n")[0]}`));
					return;
				}
				// The CLI prints errors on stdout and usually still exits 0.
				if (/^Error:/i.test(stdout.trim())) {
					reject(new Error(`obsidian ${op} failed: ${stdout.trim().split("\n")[0]}`));
					return;
				}
				resolve(stdout);
			},
		);
	});
}

const ObsidianParams = Type.Object({
	op: StringEnum(OPS, { description: "Operation to perform" }),
	code: Type.Optional(Type.String({ description: "JavaScript to run (eval); large code is handed off through a temp file" })),
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

let tempDir: { win: string; wsl: string } | undefined;

async function appTempDir(vault: string | undefined) {
	if (tempDir) return tempDir;
	const out = (await runCli(vault, "eval", ['code=require("os").tmpdir()'])).trim().replace(/^=>\s*/, "");
	// Ask the app for its own temp dir, then map a Windows path onto the mount
	// we can write through (native Linux needs no translation).
	tempDir = /^[A-Za-z]:/.test(out)
		? { win: out.replace(/\//g, "\\"), wsl: out.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`) }
		: { win: out, wsl: out };
	return tempDir;
}

/** Large code goes to disk and gets read back by a one-line eval, because the
 * code itself cannot cross the IPC frame. */
async function runEval(vault: string | undefined, code: string): Promise<string> {
	if (requestSize(vault, "eval", [`code=${code}`]) <= IPC_BUDGET) return runCli(vault, "eval", [`code=${code}`]);

	const dir = await appTempDir(vault);
	const name = `pi-obsidian-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.js`;
	// Write through whichever view of the app's temp dir this host can reach.
	const localPath = process.platform === "win32" ? `${dir.win}/${name}` : `${dir.wsl}/${name}`;
	const appPath = `${dir.win}/${name}`;
	await writeFile(localPath, code, "utf8");
	const loader = `(async()=>{const c=require("fs").readFileSync(${JSON.stringify(appPath)},"utf8");return await eval(c)})()`;
	try {
		return await runCli(vault, "eval", [`code=${loader}`]);
	} finally {
		await unlink(localPath).catch(() => {});
	}
}

/** Replays one oversized content payload as several CLI calls, so the write
 * keeps the CLI's own semantics (separator handling, unique create names). */
async function runContentOp(
	vault: string | undefined,
	op: string,
	baseArgs: string[],
	content: string,
	inline: boolean,
): Promise<string> {
	const overhead = requestSize(vault, op, [...baseArgs, "content="]) + 64;
	const limit = Math.min(CHUNK_TARGET, IPC_BUDGET - overhead);
	if (limit < 256) {
		throw new Error(`obsidian ${op}: the non-content arguments leave no room for content in one IPC message`);
	}

	const chunks = splitPayload(content, limit);
	if (chunks.length === 1) {
		const args = [...baseArgs, `content=${chunks[0]}`];
		if (inline) args.push("inline");
		const out = await runCli(vault, op, args);
		assertApplied(op, out);
		return out;
	}

	// A chunked write is not atomic; say so when one drops, since the note keeps
	// whatever the earlier chunks already applied.
	const write = async (targetOp: string, args: string[], index: number): Promise<string> => {
		try {
			const out = await runCli(vault, targetOp, args);
			assertApplied(targetOp, out);
			return out;
		} catch (error) {
			throw new Error(`${(error as Error).message}; chunk ${index + 1}/${chunks.length} failed, so the note is now partial`);
		}
	};

	if (op === "create") {
		const out = await write(op, [...baseArgs, `content=${chunks[0]}`], 0);
		// A create that collides lands on a suffixed name, so follow the path the
		// CLI reports rather than the one we asked for.
		const created = /^(?:Created|Overwrote):\s*(.+)$/m.exec(out.trim())?.[1]?.trim();
		if (!created) throw new Error(`obsidian create: no created path in ${JSON.stringify(out.trim())}`);
		const rest = chunks.slice(1);
		for (const [i, chunk] of rest.entries()) {
			await write("append", [`path=${created}`, `content=${chunk}`, "inline"], i + 1);
		}
		return out;
	}

	// The separator belongs against the existing body: the first append chunk and
	// the last prepend chunk carry it, everything else is inline. Prepending has
	// to run back to front for the chunks to read in order afterwards.
	const isPrepend = op === "prepend" || op === "daily:prepend";
	const order = isPrepend ? chunks.slice().reverse() : chunks;
	let out = "";
	for (const [index, chunk] of order.entries()) {
		const args = [...baseArgs, `content=${chunk}`];
		if (inline || index > 0) args.push("inline");
		out = await write(op, args, index);
	}
	return out;
}

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
- daily: open today's daily note; command: run an Obsidian command — \`id\`; commands: list command ids; reload: reload the vault
- eval: run JavaScript inside the app — \`code\` (required); payloads that do not fit one IPC frame are handed off through a temp file automatically. Wrap top-level \`await\`/\`return\` in an async IIFE.`,
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

		let out: string;
		if (params.op === "eval") {
			out = await runEval(params.vault, params.code ?? "");
		} else if (params.content !== undefined && CONTENT_OPS.has(params.op)) {
			const inline = params.flags?.includes("inline") ?? false;
			const baseArgs = inline ? args.filter((arg) => arg !== "inline") : args;
			out = await runContentOp(params.vault, params.op, baseArgs, params.content, inline);
		} else {
			out = await runCli(params.vault, params.op, args);
		}
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
