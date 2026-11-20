/**
 * Orchestrator: makes this session a manager for worker sessions.
 *
 * Each worker is a separate `pi --mode rpc` child in its own git worktree, driven
 * over the RPC JSONL protocol. The manager spawns, steers, waits on and reports on
 * workers; it never proxies their transcripts into its own context.
 *
 * Workers get no extensions or MCP servers, a fixed builtin toolset and project
 * trust, with the worktree as the safety boundary. Dialogs a worker raises are
 * answered automatically because no human is attached to its stdin.
 *
 * Module map: state (registry + hooks) · protocol (RPC framing, event handling,
 * dialog auto-answer) · worker (spawn/start/digest/stop/wait) · delegate (spawn and
 * follow, shared by tools and commands) · worktree (git) · render (widget) ·
 * log/format (text) · config (constants). This file only registers surface area.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isToolCallEventType, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DEFAULT_TOOLS, MAX_WORKERS, REPAINT_MS, TICK_MS } from "./config.ts";
import { followWorker, spawnDelegated } from "./delegate.ts";
import { fmtState, workerLine } from "./format.ts";
import { addLog } from "./log.ts";
import { request } from "./protocol.ts";
import { renderWidget } from "./render.ts";
import {
	busyWorkers,
	clearFocus,
	requireWorker,
	setNotifyHook,
	setRepaintHook,
	workers,
} from "./state.ts";
import { digest, shutdownProcess, stopWorker, waitForWorkers } from "./worker.ts";

const execFileAsync = promisify(execFile);

export default function orchestratorExtension(pi: ExtensionAPI) {
	let activeCtx: ExtensionContext | undefined;
	let notifyOn = true;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let ticker: ReturnType<typeof setInterval> | undefined;

	const refresh = (): void => {
		if (refreshTimer) return;
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			renderWidget(activeCtx);
		}, REPAINT_MS);
	};

	pi.on("session_start", (_event, ctx) => {
		activeCtx = ctx;
		setRepaintHook(refresh);
		setNotifyHook((text) => {
			if (!notifyOn || (ctx.mode !== "tui" && ctx.mode !== "rpc")) return;
			try {
				pi.sendUserMessage(`[orchestrator] ${text}`, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
			} catch {
				// A wake-up is best effort: a manager mid-turn with a full queue must not fail a worker.
			}
		});
		if (ctx.mode === "tui" && !ticker) {
			// Elapsed time only advances with the wall clock, so redraw on a timer too.
			ticker = setInterval(() => {
				if (busyWorkers().length > 0) renderWidget(activeCtx);
			}, TICK_MS);
		}
		renderWidget(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (ticker) clearInterval(ticker);
		ticker = undefined;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = undefined;
		// A worker outliving its manager is an orphan: nothing can steer it and its RPC
		// pipes are gone. Worktrees and session files survive for a manual `pi --resume`.
		await Promise.allSettled(Array.from(workers.values()).map((worker) => shutdownProcess(worker)));
	});

	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const busy = busyWorkers();
		// Sleeping to wait for a worker always either overshoots or burns a turn; the
		// worker pushes its result into worker_wait the moment it settles.
		if (busy.length === 0 || !/\bsleep\s+\d{2,}/.test(event.input.command)) return;
		return {
			block: true,
			reason: [
				`Blocked: worker(s) ${busy.map((worker) => worker.name).join(", ")} are still running.`,
				"Call worker_wait with their name (and timeout_s) instead of sleeping; it returns as soon as one settles.",
			].join(" "),
		};
	});

	pi.registerCommand("worker-notify", {
		description: "Toggle worker settle/error notifications in this session",
		handler: async (_args, ctx) => {
			notifyOn = !notifyOn;
			ctx.ui.notify(`worker notifications ${notifyOn ? "on" : "off"}`, "info");
		},
	});

	pi.registerCommand("delegate", {
		description: "Spawn a worker with an explicit instruction: /delegate <slug>: <task>",
		handler: async (args, ctx) => {
			const match = /^\s*(\S+?)\s*:\s*([\s\S]+)$/.exec(args);
			if (!match) {
				ctx.ui.notify("Usage: /delegate <slug>: <task>", "warning");
				return;
			}
			try {
				const text = await spawnDelegated(ctx, { slug: match[1], task: match[2] });
				refresh();
				ctx.ui.notify(text.split("\n")[0], "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerCommand("follow", {
		description: "Follow a worker's live output: /follow [name] [pane]",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const wantPane = parts.includes("pane");
			let name = parts.find((part) => part !== "pane");
			if (!name) {
				const names = Array.from(workers.keys());
				if (names.length === 0) {
					ctx.ui.notify("no workers", "warning");
					return;
				}
				name = await ctx.ui.select("Follow which worker?", names);
				if (!name) return;
			}
			try {
				const text = await followWorker(name, wantPane);
				refresh();
				ctx.ui.notify(text, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "worker_spawn",
		label: "Spawn worker",
		description: [
			"Create a git worktree and start a worker agent in it (separate `pi` process, its own session and context).",
			"The worker runs on the default model with the builtin tools only, commits on its own branch and never pushes.",
			"Returns immediately; follow up with worker_wait.",
		].join(" "),
		promptSnippet: "Start a worker agent in its own git worktree",
		promptGuidelines: [
			"Use worker_spawn (or /delegate) only when the user asks to hand work off, target another repo, or run work in parallel; otherwise do the work inline.",
		],
		parameters: Type.Object({
			slug: Type.String({ description: "Short name for the worker; also the branch name and worktree dir" }),
			task: Type.String({ description: "The instruction, handoff text or plan the worker should carry out" }),
			repo: Type.Optional(Type.String({ description: "Repo path; defaults to the current directory" })),
			base: Type.Optional(Type.String({ description: "Base ref for the new branch (default HEAD)" })),
			branch: Type.Optional(Type.String({ description: "Branch name if it should differ from the slug" })),
			tools: Type.Optional(
				Type.String({ description: `Comma-separated tool allowlist for the worker (default "${DEFAULT_TOOLS}")` }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const text = await spawnDelegated(ctx, params);
			refresh();
			return {
				content: [{ type: "text", text }],
				details: { worker: params.slug, state: workers.get(params.slug)?.state },
			};
		},
	});

	pi.registerTool({
		name: "worker_status",
		label: "Worker status",
		description:
			"Digest of one worker (state, tokens, cost, git diff, recent activity) or of every worker when no name is given.",
		promptSnippet: "Follow one worker or every worker",
		promptGuidelines: ["Use worker_status to follow workers before reporting progress to the user."],
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Worker name; omit for a one-line summary of all workers" })),
			lines: Type.Optional(Type.Number({ description: "Activity and message lines to include (default 12)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			refresh();
			if (!params.name) {
				if (workers.size === 0) return { content: [{ type: "text", text: "no workers" }], details: {} };
				const rows = Array.from(workers.values()).map((worker) => workerLine(worker));
				return { content: [{ type: "text", text: rows.join("\n") }], details: { workers: workers.size } };
			}
			const worker = requireWorker(params.name);
			return {
				content: [{ type: "text", text: await digest(worker, params.lines ?? 12) }],
				details: { worker: worker.name, state: worker.state },
			};
		},
	});

	pi.registerTool({
		name: "worker_send",
		label: "Send to worker",
		description: [
			"Send a message to a running worker.",
			"mode=steer interrupts after the current tool call; mode=follow_up queues it until the worker finishes its current task.",
		].join(" "),
		promptSnippet: "Steer or queue a message for a worker",
		parameters: Type.Object({
			name: Type.String({ description: "Worker name" }),
			message: Type.String({ description: "Instruction or answer for the worker" }),
			mode: Type.Optional(Type.Union([Type.Literal("steer"), Type.Literal("follow_up")])),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const worker = requireWorker(params.name);
			const mode = params.mode ?? "follow_up";
			const command =
				worker.state === "working"
					? { type: "prompt", message: params.message, streamingBehavior: mode === "steer" ? "steer" : "followUp" }
					: { type: "prompt", message: params.message };
			const response = await request(worker, command, 30000);
			if (response.success !== true) throw new Error(`worker ${worker.name} rejected message: ${String(response.error)}`);
			addLog(worker, `manager → ${mode}`);
			refresh();
			return {
				content: [{ type: "text", text: `delivered (${mode}) to ${worker.name}; ${fmtState(worker)}` }],
				details: { worker: worker.name, mode },
			};
		},
	});

	pi.registerTool({
		name: "worker_wait",
		label: "Wait for worker",
		description: [
			"Block until a worker settles (idle, failed or exited) and return its digest, so the manager needs no polling loop or sleep.",
			"Omit name to wait for whichever busy worker finishes first.",
		].join(" "),
		promptSnippet: "Block until a worker finishes, then return its digest",
		promptGuidelines: [
			"Use worker_wait rather than repeated worker_status calls or sleeping to wait for a worker to finish.",
		],
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Worker name; omit to wait for any busy worker" })),
			timeout_s: Type.Optional(Type.Number({ description: "Give up after this many seconds (default 600)" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const timeoutMs = Math.min(Math.max(params.timeout_s ?? 600, 5), 3600) * 1000;
			const candidates = params.name ? [requireWorker(params.name)] : busyWorkers();
			if (candidates.length === 0) {
				const text = params.name ? `${params.name} is not running` : "no busy workers";
				return { content: [{ type: "text", text }], details: { waited: 0 } };
			}

			const result = await waitForWorkers(candidates, timeoutMs, signal);
			refresh();
			const header =
				result.outcome === "settled"
					? `${result.finished} worker(s) settled`
					: result.outcome === "timeout"
						? `still running after ${Math.round(timeoutMs / 1000)}s`
						: "interrupted; workers keep running";
			return {
				content: [
					{ type: "text", text: `${header}\n\n${result.reports.map((report) => report.digest).join("\n\n")}` },
				],
				details: {
					outcome: result.outcome,
					workers: result.reports.map((report) => report.worker.name),
				},
			};
		},
	});

	pi.registerTool({
		name: "worker_follow",
		label: "Follow worker",
		description: [
			"Mirror a worker's live output. The widget above the manager's editor shows the followed worker's streaming text;",
			"with pane=true the same stream opens in a tmux split running `tail -f` on the worker's transcript.",
			"Read-only: following never interrupts the worker and does not take the session over (that is worker_attach).",
		].join(" "),
		promptSnippet: "Mirror a worker's live output in the widget or a tmux pane",
		parameters: Type.Object({
			name: Type.String({ description: "Worker name" }),
			pane: Type.Optional(Type.Boolean({ description: "Also open a tmux split tailing the transcript" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const text = await followWorker(params.name, params.pane ?? false);
			refresh();
			return {
				content: [{ type: "text", text }],
				details: { worker: params.name, transcript: workers.get(params.name)?.transcript },
			};
		},
	});

	pi.registerTool({
		name: "worker_stop",
		label: "Stop worker",
		description:
			"Abort and stop a worker. Its branch and commits stay; the worktree is only removed when remove_worktree is true.",
		promptSnippet: "Abort and stop a worker",
		parameters: Type.Object({
			name: Type.String({ description: "Worker name" }),
			remove_worktree: Type.Optional(Type.Boolean({ description: "Also remove the git worktree (default false)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const worker = requireWorker(params.name);
			const result = await stopWorker(worker, params.remove_worktree ?? false);
			refresh();
			return { content: [{ type: "text", text: result }], details: { worker: params.name } };
		},
	});

	pi.registerTool({
		name: "worker_attach",
		label: "Attach to worker",
		description: [
			"Hand a worker session over to a human: stops the worker process and opens its own session in a tmux window inside the worktree,",
			"so the same conversation can be continued interactively.",
		].join(" "),
		promptSnippet: "Hand a worker session over to a human in a tmux window",
		parameters: Type.Object({
			name: Type.String({ description: "Worker name" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			activeCtx = ctx;
			const worker = requireWorker(params.name);
			const sessionArg = worker.sessionId ?? worker.sessionFile;
			if (!sessionArg) throw new Error(`worker ${worker.name} has no session yet`);
			const command = `pi --session ${sessionArg}`;

			if (!process.env.TMUX) {
				return {
					content: [
						{
							type: "text",
							text: `not inside tmux. The worker keeps running; take over manually with:\n  cd ${worker.worktree} && ${command}`,
						},
					],
					details: { worker: worker.name },
				};
			}

			// Two processes on one session file would fork the transcript, so attach means takeover.
			await shutdownProcess(worker);
			await execFileAsync("tmux", ["new-window", "-n", worker.name, "-c", worker.worktree, command], { timeout: 10000 });
			workers.delete(worker.name);
			clearFocus(worker.name);
			refresh();
			return {
				content: [
					{
						type: "text",
						text: `worker ${worker.name} handed over: tmux window "${worker.name}" in ${worker.worktree} (${command}). It is no longer managed here.`,
					},
				],
				details: { worker: worker.name, worktree: worker.worktree },
			};
		},
	});
}
