/**
 * Pretty Footer Extension
 *
 * Replaces the built-in status bar with a prettier, themed one that shows:
 *   📁 folder   ⎇ branch [🪴worktree]   🤖 model   [████░░░░] 42% ctx   ↑in ↓out   $cost
 *
 * Auto-enables on session start. Toggle with `/pretty-footer` (on/off/restore).
 *
 * Uses ctx.ui.setFooter(). Data sources:
 *   - folder: ctx.cwd
 *   - git branch: footerData.getGitBranch()  (not otherwise accessible)
 *   - model: ctx.model
 *   - context usage: ctx.getContextUsage()
 *   - token stats / cost: ctx.sessionManager.getBranch()
 *   - extension statuses: footerData.getExtensionStatuses()
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { statSync } from "node:fs";
import { join } from "node:path";

const SEP = " │ ";

/** Blank lines rendered below the status bar (breathing room above the tmux bar). */
const BOTTOM_PAD_LINES = 1;

/**
 * Detect whether `cwd` is inside a *linked* git worktree (not the main worktree).
 * A linked worktree has a `.git` *file* (containing `gitdir: <path>`) instead of a
 * `.git` directory. The main checkout has a `.git` directory. Walks up the tree.
 * Result is cached per cwd string.
 */
const worktreeCache = new Map<string, boolean>();
function isGitWorktree(cwd: string): boolean {
	const cached = worktreeCache.get(cwd);
	if (cached !== undefined) return cached;

	let dir = cwd;
	let result = false;
	try {
		for (let i = 0; i < 64; i++) {
			const gitPath = join(dir, ".git");
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(gitPath, { throwIfNoEntry: false });
			} catch {
				st = undefined;
			}
			if (st) {
				// A regular file (not a dir/symlink-to-dir) means linked worktree.
				result = st.isFile();
				break;
			}
			const parent = join(dir, "..");
			if (parent === dir) break; // reached root
			dir = parent;
		}
	} catch {
		result = false;
	}
	worktreeCache.set(cwd, result);
	return result;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

/** A small colored progress bar for context usage. */
function contextBar(theme: Theme, percent: number | null): string {
	if (percent == null) return theme.fg("dim", "[ context ]");
	const p = Math.max(0, Math.min(100, percent));
	const width = 10;
	const filled = Math.round((p / 100) * width);
	const empty = width - filled;

	// Color by pressure: green -> yellow -> red
	let token: "success" | "warning" | "error" = "success";
	if (p >= 80) token = "error";
	else if (p >= 50) token = "warning";

	const bar = "█".repeat(filled);
	const track = "░".repeat(empty);
	const label = ` ${Math.round(p)}%`;
	return (
		theme.style("[", { fg: "dim" }) +
		theme.style(bar, { fg: token }) +
		theme.style(track, { fg: "dim" }) +
		theme.style("]", { fg: "dim" }) +
		theme.style(label, { fg: token })
	);
}

function buildFooter(
	ctx: ExtensionContext,
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
	width: number,
): string[] {
	// Folder (basename of cwd)
	const folder = ctx.cwd.split("/").filter(Boolean).pop() || ctx.cwd;

	// Git branch
	const branch = footerData.getGitBranch();

	// Model
	const modelId = ctx.model?.id || "no-model";

	// Context usage
	const usage = ctx.getContextUsage();

	// Token stats + cost from the session branch
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type === "message" && e.message?.role === "assistant") {
			const m = e.message as AssistantMessage;
			input += m.usage?.input ?? 0;
			output += m.usage?.output ?? 0;
			cost += m.usage?.cost?.total ?? 0;
		}
	}

	// Left cluster
	const leftParts: string[] = [];
	leftParts.push("📁 " + theme.fg("accent", folder));
	if (branch) {
		const branchLabel = isGitWorktree(ctx.cwd)
			? theme.fg("mdCode", `⎇ ${branch}`) + theme.style(" 🪴worktree", { fg: "warning", bold: true })
			: theme.fg("mdCode", `⎇ ${branch}`);
		leftParts.push(branchLabel);
	}
	leftParts.push(theme.fg("dim", `🤖 ${modelId}`));
	const left = leftParts.join(theme.style(SEP, { fg: "borderMuted" }));

	// Right cluster
	const rightParts: string[] = [];
	rightParts.push(contextBar(theme, usage?.percent ?? null));
	rightParts.push(
		theme.fg("success", `↑${fmtTokens(input)}`) +
			" " +
			theme.fg("mdLink", `↓${fmtTokens(output)}`),
	);
	rightParts.push(theme.fg("warning", `$${cost.toFixed(3)}`));
	const right = rightParts.join(theme.style(SEP, { fg: "borderMuted" }));

	// Extension statuses (from ctx.ui.setStatus()) appended on the far right
	const statuses = [...footerData.getExtensionStatuses().values()];
	let statusStr = "";
	if (statuses.length) {
		statusStr = theme.style(SEP, { fg: "borderMuted" }) + statuses.join(theme.style(" · ", { fg: "dim" }));
	}

	// Fit to width: prefer keeping right cluster; truncate left if needed.
	const sepWidth = visibleWidth(SEP);
	const leftW = visibleWidth(left);
	const rightW = visibleWidth(right) + visibleWidth(statusStr);

	if (leftW + sepWidth + rightW <= width) {
		const pad = " ".repeat(Math.max(1, width - leftW - sepWidth - rightW));
		return [truncateToWidth(left + theme.fg("dim", pad) + right + statusStr, width)];
	}

	// Not enough room: drop the middle separator and squeeze, then truncate.
	const minPad = " ";
	const line = left + minPad + right + statusStr;
	return [truncateToWidth(line, width)];
}

export default function (pi: ExtensionAPI) {
	let state: "on" | "off" = "on";

	const enable = (ctx: ExtensionContext) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const lines = buildFooter(ctx, theme, footerData, width);
					return [...lines, ...Array(BOTTOM_PAD_LINES).fill("")];
				},
			};
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode === "tui" && state === "on") enable(ctx);
	});

	pi.registerCommand("pretty-footer", {
		description: "Toggle the pretty status bar (on | off | restore)",
		handler: async (args, ctx) => {
			const arg = (args || "").trim().toLowerCase();
			if (arg === "restore") {
				ctx.ui.setFooter(undefined);
				state = "off";
				ctx.ui.notify("Default footer restored", "info");
				return;
			}
			if (arg === "off") {
				ctx.ui.setFooter(undefined);
				state = "off";
				ctx.ui.notify("Pretty footer off (default restored)", "info");
				return;
			}
			// "on" or no arg: enable
			state = "on";
			enable(ctx);
			ctx.ui.notify("Pretty footer enabled", "info");
		},
	});
}
