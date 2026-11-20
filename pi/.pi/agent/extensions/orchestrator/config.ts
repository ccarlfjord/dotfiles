import { homedir } from "node:os";
import * as path from "node:path";

export const MAX_WORKERS = 4;
export const DEFAULT_TOOLS = "read,bash,edit,write,grep,find,ls";
export const LOG_LIMIT = 400;
export const TEXT_LIMIT = 8000;
export const PI_BIN = process.env.PI_BIN ?? "pi";
export const STATUS_KEY = "orchestrator";
export const WIDGET_KEY = "orchestrator-workers";
export const TRANSCRIPT_DIR = path.join(homedir(), ".cache", "pi-workers");
export const FOLLOW_LINES = 8;
/** Widget repaint coalescing window; text deltas arrive far faster than the TUI redraws. */
export const REPAINT_MS = 200;
export const TICK_MS = 2000;
