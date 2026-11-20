/** The manager's worker strip: one line per worker, plus the followed worker's live text. */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FOLLOW_LINES, STATUS_KEY, WIDGET_KEY } from "./config.ts";
import { tail, workerLine } from "./format.ts";
import { focusedWorker, workers } from "./state.ts";

export function renderWidget(ctx: ExtensionContext | undefined): void {
	if (!ctx || ctx.mode !== "tui") return;
	const list = Array.from(workers.values());
	if (list.length === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const active = list.filter((worker) => worker.state === "working" || worker.state === "starting").length;
	ctx.ui.setStatus(STATUS_KEY, `${active}/${list.length} workers busy`);
	const lines = list.map((worker) => `  ${workerLine(worker)}`);
	const followed = focusedWorker();
	if (followed) {
		lines.push(`  ── ${followed.name} ──`);
		for (const textLine of tail(followed.streamingText || followed.lastText, FOLLOW_LINES).split("\n")) {
			lines.push(`  ${textLine}`);
		}
	}
	ctx.ui.setWidget(WIDGET_KEY, lines);
}
