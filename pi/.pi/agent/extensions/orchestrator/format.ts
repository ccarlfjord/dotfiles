/** Text shaping for the widget, digests and log lines. */

import type { Worker } from "./state.ts";

export function oneLine(text: string, max = 120): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function tail(text: string, count: number): string {
	const lines = text.trimEnd().split("\n");
	return lines.slice(-count).join("\n");
}

export function elapsed(since: number): string {
	const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}`;
	return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

export function summarizeArgs(toolName: string, args: Record<string, unknown> | undefined): string {
	if (!args) return "";
	if (toolName === "bash") return oneLine(String(args.command ?? ""), 80);
	const first = args.path ?? args.file_path ?? args.pattern ?? args.query ?? args.paths;
	return typeof first === "string" ? oneLine(first, 80) : "";
}

export function fmtState(worker: Worker): string {
	if (worker.state === "working" && worker.currentTool) return `working ${worker.currentTool.name}`;
	return worker.state;
}

export function workerLine(worker: Worker): string {
	const tool = worker.currentTool
		? ` ${worker.currentTool.name}${worker.currentTool.summary ? `:${worker.currentTool.summary}` : ""}`
		: "";
	const cost = worker.cost > 0 ? ` $${worker.cost.toFixed(2)}` : "";
	const last = worker.lastText ? oneLine(worker.lastText.split("\n").slice(-1)[0], 48) : "";
	return `${worker.name} · ${worker.state}${tool} · ${worker.turns}t ${elapsed(worker.startedAt)}${cost} · ${last}`;
}
