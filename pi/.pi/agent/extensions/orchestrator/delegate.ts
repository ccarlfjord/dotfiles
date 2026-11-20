/** The two high-level entry points shared by tools and slash commands. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_TOOLS, MAX_WORKERS } from "./config.ts";
import { requireWorker, setFocused, workers } from "./state.ts";
import { spawnWorker, startWorker } from "./worker.ts";
import { createWorktree, resolveRepo } from "./worktree.ts";

const execFileAsync = promisify(execFile);

export interface SpawnOptions {
	slug: string;
	task: string;
	repo?: string;
	base?: string;
	branch?: string;
	tools?: string;
}

export async function spawnDelegated(ctx: ExtensionContext, options: SpawnOptions): Promise<string> {
	const slug = options.slug
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-|-$/g, "");
	if (!slug) throw new Error("slug must contain letters or digits");
	if (workers.has(slug)) throw new Error(`worker "${slug}" already exists`);
	if (workers.size >= MAX_WORKERS) throw new Error(`worker limit reached (${MAX_WORKERS}); stop one first`);

	const repo = await resolveRepo(options.repo, ctx.cwd);
	const worktree = await createWorktree(repo, slug, options.base, options.branch);
	const worker = spawnWorker(slug, repo, worktree.worktree, worktree.branch, options.tools ?? DEFAULT_TOOLS);
	await startWorker(worker, options.task);

	return [
		`worker ${slug}: ${worker.state}${worker.error ? ` (${worker.error})` : ""}`,
		`branch ${worktree.branch} @ ${worktree.head}`,
		`worktree ${worktree.worktree}`,
		worker.sessionFile ? `session ${worker.sessionFile}` : "",
		`worker_wait "${slug}" blocks until it finishes; worker_follow "${slug}" mirrors its live output`,
	]
		.filter(Boolean)
		.join("\n");
}

/** Point the widget (and optionally a tmux pane) at one worker's live output. */
export async function followWorker(name: string, wantPane: boolean): Promise<string> {
	const worker = requireWorker(name);
	setFocused(name);
	if (wantPane && process.env.TMUX) {
		await execFileAsync(
			"tmux",
			["split-window", "-h", "-l", "50%", "-c", worker.worktree, `tail -n 200 -f '${worker.transcript}'`],
			{ timeout: 10000 },
		);
		return `following ${name} in a tmux pane; transcript ${worker.transcript}`;
	}
	return `following ${name} in the widget; transcript ${worker.transcript} (outside pi: tail -f '${worker.transcript}')`;
}
