/** The in-memory activity ring and the on-disk transcript a human can tail. */

import { appendFileSync, mkdirSync } from "node:fs";
import { LOG_LIMIT, TRANSCRIPT_DIR } from "./config.ts";
import type { Worker } from "./state.ts";

export function addLog(worker: Worker, line: string): void {
	const stamped = `${new Date().toISOString().slice(11, 19)} ${line}`;
	worker.log.push(stamped);
	if (worker.log.length > LOG_LIMIT) worker.log.splice(0, worker.log.length - LOG_LIMIT);
	appendTranscript(worker, stamped);
}

/** A broken write must never break a turn. */
export function appendTranscript(worker: Worker, text: string): void {
	try {
		mkdirSync(TRANSCRIPT_DIR, { recursive: true });
		appendFileSync(worker.transcript, `${text}\n`);
	} catch {
		return;
	}
}
