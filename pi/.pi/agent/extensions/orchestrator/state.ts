/**
 * Per-process worker registry plus the two hooks the entry point installs: a widget
 * repaint signal and a way to wake the manager when a worker settles.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type WorkerState = "starting" | "working" | "idle" | "stopped" | "error";

export interface Pending {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface Worker {
	name: string;
	repo: string;
	worktree: string;
	branch: string;
	proc: ChildProcessWithoutNullStreams;
	state: WorkerState;
	currentTool?: { name: string; summary: string; startedAt: number };
	lastText: string;
	streamingText: string;
	log: string[];
	stderr: string[];
	transcript: string;
	sessionId?: string;
	sessionFile?: string;
	cost: number;
	tokensIn: number;
	tokensOut: number;
	turns: number;
	startedAt: number;
	lastEventAt: number;
	autoApprovals: number;
	error?: string;
	pending: Map<string, Pending>;
	/** Resolved by worker_wait; fired on settle and on process exit. */
	waiters: Set<() => void>;
}

export const workers = new Map<string, Worker>();

/** Worker whose live output the widget mirrors; empty shows the one-line summary instead. */
let focused: string | undefined;

export function setFocused(name: string | undefined): void {
	focused = name;
}

export function clearFocus(name: string): void {
	if (focused === name) focused = undefined;
}

export function focusedWorker(): Worker | undefined {
	return focused ? workers.get(focused) : undefined;
}

export function isFocused(worker: Worker): boolean {
	return focused === worker.name;
}

let repaintHook: (() => void) | undefined;
let notifyHook: ((text: string) => void) | undefined;

export function setRepaintHook(hook: () => void): void {
	repaintHook = hook;
}

export function requestRepaint(): void {
	repaintHook?.();
}

export function setNotifyHook(hook: (text: string) => void): void {
	notifyHook = hook;
}

export function notifyManager(text: string): void {
	notifyHook?.(text);
}

export function requireWorker(name: string): Worker {
	const worker = workers.get(name);
	if (!worker) {
		const known = Array.from(workers.keys()).join(", ") || "none";
		throw new Error(`unknown worker "${name}". Known: ${known}`);
	}
	return worker;
}

export function busyWorkers(): Worker[] {
	return Array.from(workers.values()).filter(
		(worker) => worker.state === "working" || worker.state === "starting",
	);
}
