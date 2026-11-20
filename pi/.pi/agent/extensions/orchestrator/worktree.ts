/** Git plumbing: resolve the repo behind a path and carve out a per-worker worktree. */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd, timeout: 30000 });
	return stdout.trim();
}

export async function resolveRepo(candidate: string | undefined, cwd: string): Promise<string> {
	const start = candidate ? path.resolve(cwd, candidate) : cwd;
	return git(["rev-parse", "--show-toplevel"], start);
}

export interface Worktree {
	worktree: string;
	branch: string;
	head: string;
}

export async function createWorktree(
	repo: string,
	slug: string,
	base: string | undefined,
	branchOverride: string | undefined,
): Promise<Worktree> {
	const worktree = path.join(repo, ".worktrees", slug);
	if (existsSync(worktree)) throw new Error(`worktree already exists: ${worktree}`);
	const branch = branchOverride ?? slug;
	const start = base ?? "HEAD";
	try {
		await git(["worktree", "add", worktree, "-b", branch, start], repo);
	} catch {
		// Branch already exists: attach the worktree to it instead of failing the spawn.
		await git(["worktree", "add", worktree, branch], repo);
	}
	const head = await git(["rev-parse", "--short", "HEAD"], worktree);
	return { worktree, branch, head };
}
