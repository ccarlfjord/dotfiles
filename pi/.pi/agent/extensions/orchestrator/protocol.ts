/**
 * The worker side of the RPC JSONL protocol: framing, command/response correlation,
 * the event stream that becomes worker state, and automatic answers to the dialogs
 * an unattended worker cannot be asked about.
 */

import { TEXT_LIMIT } from "./config.ts";
import { elapsed, oneLine, summarizeArgs } from "./format.ts";
import { addLog, appendTranscript } from "./log.ts";
import { isFocused, notifyManager, requestRepaint, type Worker } from "./state.ts";

/** Split a stream into LF-terminated records, tolerating CRLF. Not readline: it splits on U+2028 too. */
export function readLines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
	let buffer = "";
	stream.setEncoding("utf8");
	stream.on("data", (chunk: string) => {
		buffer += chunk;
		let index = buffer.indexOf("\n");
		while (index >= 0) {
			let line = buffer.slice(0, index);
			buffer = buffer.slice(index + 1);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			if (line.trim()) onLine(line);
			index = buffer.indexOf("\n");
		}
	});
}

export function send(worker: Worker, command: Record<string, unknown>): void {
	if (worker.proc.stdin.writable && worker.state !== "stopped" && worker.state !== "error") {
		worker.proc.stdin.write(`${JSON.stringify(command)}\n`);
	}
}

export function request(
	worker: Worker,
	command: Record<string, unknown>,
	timeoutMs = 15000,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const timer = setTimeout(() => {
			worker.pending.delete(id);
			reject(new Error(`worker ${worker.name}: no response to ${String(command.type)}`));
		}, timeoutMs);
		worker.pending.set(id, { resolve, reject, timer });
		send(worker, { ...command, id });
	});
}

/** Notify everyone blocked in worker_wait, so a waiter never outlives its worker. */
export function settleWaiters(worker: Worker): void {
	for (const waiter of worker.waiters) waiter();
	worker.waiters.clear();
}

/**
 * Answer a worker's extension UI dialog. Nobody is attached to the worker's stdin, so
 * an unanswered confirm would hang the run forever; every decision is logged so the
 * manager can see what was auto-approved.
 */
function autoAnswer(worker: Worker, ui: Record<string, unknown>): void {
	const id = ui.id as string;
	const method = ui.method as string;
	if (!id) return;
	switch (method) {
		case "confirm":
			worker.autoApprovals += 1;
			addLog(worker, `[ui] auto-allow: ${oneLine(String(ui.title ?? ""), 100)}`);
			send(worker, { type: "extension_ui_response", id, confirmed: true });
			return;
		case "select": {
			const options = Array.isArray(ui.options) ? (ui.options as string[]) : [];
			worker.autoApprovals += 1;
			addLog(worker, `[ui] auto-select "${options[0] ?? "(none)"}": ${oneLine(String(ui.title ?? ""), 100)}`);
			if (options.length > 0) send(worker, { type: "extension_ui_response", id, value: options[0] });
			else send(worker, { type: "extension_ui_response", id, cancelled: true });
			return;
		}
		case "input":
		case "editor":
			addLog(worker, `[ui] cancelled ${method}: ${oneLine(String(ui.title ?? ""), 100)}`);
			send(worker, { type: "extension_ui_response", id, cancelled: true });
			return;
		case "notify":
			addLog(worker, `[ui] notify: ${oneLine(String(ui.message ?? ""), 100)}`);
			return;
		default:
			// setStatus/setWidget/setTitle: nothing to answer, nothing worth logging.
			return;
	}
}

export function handleRecord(worker: Worker, record: Record<string, unknown>): void {
	worker.lastEventAt = Date.now();
	const type = record.type as string;

	if (type === "response") {
		const id = record.id as string | undefined;
		const pending = id ? worker.pending.get(id) : undefined;
		if (pending && id) {
			worker.pending.delete(id);
			clearTimeout(pending.timer);
			pending.resolve(record);
			return;
		}
	}

	switch (type) {
		case "extension_ui_request":
			autoAnswer(worker, record);
			return;
		case "agent_start":
		case "turn_start":
			worker.state = "working";
			requestRepaint();
			return;
		case "turn_end":
			worker.turns += 1;
			return;
		case "message_update": {
			worker.state = "working";
			const update = record.assistantMessageEvent as { type?: string; delta?: string } | undefined;
			if (update?.type === "text_delta" && update.delta) {
				worker.streamingText = (worker.streamingText + update.delta).slice(-TEXT_LIMIT);
				if (isFocused(worker)) requestRepaint();
			}
			return;
		}
		case "message_end": {
			const message = record.message as
				| { role?: string; content?: unknown; usage?: Record<string, unknown> }
				| undefined;
			if (message?.role !== "assistant") return;
			worker.streamingText = "";
			const text = (message.content as Array<{ type?: string; text?: string }> | undefined)
				?.filter((block) => block.type === "text" && typeof block.text === "string")
				.map((block) => block.text as string)
				.join("\n");
			if (text) {
				worker.lastText = text.slice(-TEXT_LIMIT);
				appendTranscript(worker, `\n── assistant ──\n${text}\n`);
			}
			const usage = message.usage as { input?: number; output?: number; cost?: { total?: number } } | undefined;
			if (usage) {
				worker.tokensIn += usage.input ?? 0;
				worker.tokensOut += usage.output ?? 0;
				worker.cost += usage.cost?.total ?? 0;
			}
			return;
		}
		case "tool_execution_start": {
			const name = String(record.toolName ?? "?");
			worker.currentTool = {
				name,
				summary: summarizeArgs(name, record.args as Record<string, unknown> | undefined),
				startedAt: Date.now(),
			};
			addLog(worker, `→ ${name} ${worker.currentTool.summary}`);
			requestRepaint();
			return;
		}
		case "tool_execution_end": {
			const name = String(record.toolName ?? "?");
			if (record.isError === true) addLog(worker, `✗ ${name} failed`);
			worker.currentTool = undefined;
			requestRepaint();
			return;
		}
		case "compaction_start":
			addLog(worker, `compact (${String(record.reason ?? "")})`);
			worker.state = "working";
			return;
		case "compaction_end":
			return;
		case "agent_settled":
			worker.state = "idle";
			worker.currentTool = undefined;
			if (!worker.streamingText && worker.lastText) addLog(worker, oneLine(worker.lastText, 100));
			requestRepaint();
			// A manager already blocked in worker_wait gets the result there; only push a
			// wake-up when nobody is listening, or every settle would also queue a follow-up turn.
			if (worker.waiters.size > 0) {
				settleWaiters(worker);
				return;
			}
			notifyManager(
				`worker ${worker.name} settled: ${worker.turns} turns, $${worker.cost.toFixed(3)}, ${elapsed(worker.startedAt)}. ` +
					`Last: ${oneLine(worker.lastText || "(no text)", 200)}`,
			);
			return;
		default:
			return;
	}
}
