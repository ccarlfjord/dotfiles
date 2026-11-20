/** Worker lifecycle: spawn the child, feed it its first prompt, digest it, stop it, wait on it. */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import { PI_BIN, TRANSCRIPT_DIR } from "./config.ts";
import { elapsed, fmtState, tail } from "./format.ts";
import { addLog } from "./log.ts";
import { handleRecord, readLines, request, send, settleWaiters } from "./protocol.ts";
import { clearFocus, notifyManager, workers, type Worker } from "./state.ts";
import { git } from "./worktree.ts";

function initialPrompt(worker: Worker, task: string): string {
	return [
		`You are a worker agent in an isolated git worktree.`,
		`Repo: ${worker.repo}`,
		`Worktree: ${worker.worktree}`,
		`Branch: ${worker.branch}`,
		``,
		`Other agents may be working in sibling worktrees: stay inside this worktree, never touch ${worker.repo} itself, and do not push.`,
		``,
		`Task:`,
		task,
		``,
		`Commit on this branch when the work is done (one logical change per commit, no push).`,
		`If you are blocked or need a decision, say exactly what you need in your final message and stop.`,
	].join("\n");
}

export function spawnWorker(name: string, repo: string, worktree: string, branch: string, tools: string): Worker {
	const args = [
		"--mode",
		"rpc",
		"--name",
		name,
		"--tools",
		tools,
		// Workers get no extensions or MCP servers: the toolset stays predictable and
		// the manager's own tools cannot recurse into a grandchild worker.
		"--no-extensions",
		"--approve",
	];

	const proc = spawn(PI_BIN, args, {
		cwd: worktree,
		env: { ...process.env, PI_WORKER: "1" },
		stdio: ["pipe", "pipe", "pipe"],
	}) as ChildProcessWithoutNullStreams;

	const worker: Worker = {
		name,
		repo,
		worktree,
		branch,
		proc,
		state: "starting",
		lastText: "",
		streamingText: "",
		log: [],
		stderr: [],
		transcript: path.join(TRANSCRIPT_DIR, `${path.basename(repo)}-${name}.log`),
		cost: 0,
		tokensIn: 0,
		tokensOut: 0,
		turns: 0,
		startedAt: Date.now(),
		lastEventAt: Date.now(),
		autoApprovals: 0,
		pending: new Map(),
		waiters: new Set(),
	};

	readLines(proc.stdout, (line) => {
		try {
			handleRecord(worker, JSON.parse(line) as Record<string, unknown>);
		} catch {
			addLog(worker, `unparsable record: ${line.slice(0, 80)}`);
		}
	});
	readLines(proc.stderr, (line) => {
		worker.stderr.push(line);
		if (worker.stderr.length > 100) worker.stderr.shift();
	});

	proc.once("error", (error) => {
		worker.state = "error";
		worker.error = error.message;
		addLog(worker, `spawn error: ${error.message}`);
	});
	proc.once("exit", (code, signal) => {
		if (worker.state === "error") return;
		worker.state = code === 0 || signal === "SIGTERM" ? "stopped" : "error";
		worker.currentTool = undefined;
		if (worker.state === "error") {
			worker.error = `exited code=${code} signal=${signal}`;
			notifyManager(`worker ${name} failed: ${worker.error}`);
		}
		settleWaiters(worker);
		for (const [id, pending] of worker.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(`worker ${name} exited`));
			worker.pending.delete(id);
		}
		addLog(worker, `process exited code=${code} signal=${signal}`);
	});

	return worker;
}

export async function startWorker(worker: Worker, task: string): Promise<void> {
	workers.set(worker.name, worker);
	try {
		const state = await request(worker, { type: "get_state" });
		const data = state.data as { sessionId?: string; sessionFile?: string } | undefined;
		worker.sessionId = data?.sessionId;
		worker.sessionFile = data?.sessionFile;
		const response = await request(worker, { type: "prompt", message: initialPrompt(worker, task) }, 60000);
		if (response.success !== true) throw new Error(String(response.error ?? "prompt rejected"));
		worker.state = "working";
		addLog(worker, "spawned");
	} catch (error) {
		worker.state = "error";
		worker.error = error instanceof Error ? error.message : String(error);
		addLog(worker, `start failed: ${worker.error}`);
	}
}

/** Compact digest for the manager's context: state plus recent activity, never the full transcript. */
export async function digest(worker: Worker, lines: number): Promise<string> {
	let gitInfo = "";
	try {
		const status = await git(["status", "--porcelain"], worker.worktree);
		const stat = await git(["diff", "--stat"], worker.worktree);
		const changed = status ? status.split("\n").length : 0;
		gitInfo = `worktree: ${changed} changed file(s)${stat ? `\n${tail(stat, 6)}` : ""}`;
	} catch {
		gitInfo = "worktree: (git status unavailable)";
	}
	const text = tail(worker.lastText || worker.streamingText, lines);
	return [
		`${worker.name} [${fmtState(worker)}] ${elapsed(worker.startedAt)} ${worker.turns} turns $${worker.cost.toFixed(3)}`,
		`branch ${worker.branch} @ ${worker.worktree}`,
		`tokens: ${worker.tokensIn} in / ${worker.tokensOut} out · auto-approved ${worker.autoApprovals} prompt(s)`,
		`transcript ${worker.transcript}`,
		worker.error ? `error: ${worker.error}` : "",
		gitInfo,
		text ? `\nlast message:\n${text}` : "",
		`\nactivity:\n${tail(worker.log.join("\n"), Math.max(6, lines))}`,
	]
		.filter(Boolean)
		.join("\n");
}

/** Abort first so the worker can finish persisting its session, then close stdin and escalate. */
export async function shutdownProcess(worker: Worker): Promise<void> {
	if (worker.state === "stopped" || worker.state === "error") return;
	send(worker, { type: "abort" });
	await new Promise((resolve) => setTimeout(resolve, 300));
	worker.proc.stdin.end();
	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			worker.proc.kill("SIGKILL");
			resolve(undefined);
		}, 3000);
		worker.proc.once("exit", () => {
			clearTimeout(timer);
			resolve(undefined);
		});
	});
}

export async function stopWorker(worker: Worker, removeWorktree: boolean): Promise<string> {
	await shutdownProcess(worker);
	let removed = "";
	if (removeWorktree) {
		try {
			await git(["worktree", "remove", worker.worktree], worker.repo);
			removed = "\nworktree removed";
		} catch (error) {
			removed = `\nworktree removal failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	workers.delete(worker.name);
	clearFocus(worker.name);
	return `worker ${worker.name} stopped${removed}`;
}

export interface WaitResult {
	outcome: "settled" | "timeout" | "aborted";
	finished: number;
	reports: Array<{ worker: Worker; digest: string }>;
}

/**
 * Resolve as soon as every candidate has settled, or when the timeout/abort wins.
 * Waiters are removed either way so a later settle cannot resolve a dead wait.
 */
export async function waitForWorkers(
	candidates: Worker[],
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<WaitResult> {
	let resolveSettled = (): void => {};
	const settled = new Promise<void>((resolve) => {
		resolveSettled = resolve;
	});
	let outstanding = candidates.length;
	const waiter = (): void => {
		outstanding -= 1;
		if (outstanding === 0) resolveSettled();
	};
	for (const worker of candidates) worker.waiters.add(waiter);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), timeoutMs);
	});
	const aborted = new Promise<"aborted">((resolve) => {
		signal?.addEventListener("abort", () => resolve("aborted"), { once: true });
	});

	const outcome = await Promise.race([settled.then(() => "settled" as const), timedOut, aborted]);
	if (timer) clearTimeout(timer);
	for (const worker of candidates) worker.waiters.delete(waiter);

	const done = candidates.filter((worker) => worker.state !== "working" && worker.state !== "starting");
	const digestible = done.length > 0 ? done : candidates;
	const reports: WaitResult["reports"] = [];
	for (const worker of digestible) reports.push({ worker, digest: await digest(worker, 8) });
	return { outcome, finished: done.length, reports };
}
