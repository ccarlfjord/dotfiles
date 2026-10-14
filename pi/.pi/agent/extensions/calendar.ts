/**
 * GNOME Calendar extension
 *
 * Exposes the user's calendars (GNOME Calendar / Google via evolution-data-server)
 * to the agent as a `calendar` tool, plus a `/calendar` command for direct use.
 *
 * Reads live data over D-Bus (gdbus) from org.gnome.evolution.dataserver.Calendar8:
 *   1. OpenCalendar <uid>  -> object path
 *   2. GetObjectList with an EDS s-expression time-range query -> raw ICS VEVENTs
 *      (recurrences already expanded)
 *
 * Read-only by design.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const TZ = "Europe/Stockholm";
const CACHE_DIR = join(process.env.HOME ?? "", ".cache/evolution/calendar");

interface CalEvent {
	uid?: string;
	start: string; // display string
	end: string;
	sortKey: string; // epoch ms or comparable string
	allDay: boolean;
	summary: string;
	location?: string;
	meet?: string;
	calendar: string;
}

// ---------- GVariant / gdbus helpers ----------

/** Parse gdbus output of type (as) -> string[] (single-quoted GVariant strings). */
function parseGVariantStringList(out: string): string[] {
	const result: string[] = [];
	let i = 0;
	while (i < out.length) {
		if (out[i] === "'") {
			let s = "";
			i++;
			while (i < out.length && out[i] !== "'") {
				if (out[i] === "\\" && i + 1 < out.length) {
					const c = out[i + 1];
					if (c === "u" && i + 5 < out.length) {
						s += String.fromCharCode(parseInt(out.slice(i + 2, i + 6), 16));
						i += 6;
					} else if (c === "x" && i + 3 < out.length) {
						s += String.fromCharCode(parseInt(out.slice(i + 2, i + 4), 16));
						i += 4;
					} else {
						s += c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c;
						i += 2;
					}
				} else {
					s += out[i];
					i++;
				}
			}
			i++;
			result.push(s);
		} else {
			i++;
		}
	}
	return result;
}

async function gdbus(dest: string, path: string, method: string, ...args: string[]): Promise<string> {
	const argv = ["call", "--session", "--dest", dest, "--object-path", path, "--method", method, ...args];
	const { stdout } = await execFileAsync("gdbus", argv, { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
	return stdout;
}

// ---------- ICS parsing ----------

function unfoldIcs(ics: string): string {
	return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** Unescape ICS text values: \, \; \n \N \\ */
function icsUnescape(v: string): string {
	return v.replace(/\\([,;\\nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function icsField(unfolded: string, name: string): { value: string; tzid?: string; dateOnly?: boolean } | undefined {
	const re = new RegExp(`^${name}([^:\\r\\n]*):([^\\r\\n]*)`, "mi");
	const m = unfolded.match(re);
	if (!m) return undefined;
	const params = m[1];
	const value = m[2].trim();
	const tzid = params.match(/TZID=([^;:]+)/)?.[1];
	const dateOnly = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(value);
	return { value, tzid, dateOnly };
}

function datePartOf(v: string): string {
	return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** Convert a UTC "YYYYMMDDTHHMMSSZ" value to a local display string. */
function utcToLocalDisplay(v: string): string {
	const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}Z`;
	const d = new Date(iso);
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(d);
}

/** Convert a "YYYY-MM-DD" + "HH:MM" in TZ to UTC epoch ms (DST-safe, 2 passes). */
function zonedToUtc(date: string, time: string, tz: string): number {
	let utcGuess = new Date(`${date}T${time}:00Z`).getTime();
	for (let i = 0; i < 2; i++) {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hour12: false,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).formatToParts(new Date(utcGuess));
		const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
		const asUtc = Date.UTC(
			Number(get("year")),
			Number(get("month")) - 1,
			Number(get("day")),
			get("hour") === "24" ? 0 : Number(get("hour")),
			Number(get("minute")),
			Number(get("second")),
		);
		utcGuess = utcGuess - (asUtc - utcGuess);
	}
	return utcGuess;
}

function parseIcs(ics: string, calendarLabel: string): CalEvent | undefined {
	const u = unfoldIcs(ics);
	if (!/^BEGIN:VEVENT/m.test(u)) return undefined;
	const summary = icsUnescape(icsField(u, "SUMMARY")?.value ?? "(untitled)");
	const ds = icsField(u, "DTSTART");
	const de = icsField(u, "DTEND");
	if (!ds) return undefined;
	const meet = u.match(/^X-GOOGLE-CONFERENCE:(.+)$/mi)?.[1]?.trim();
	const location = icsUnescape(icsField(u, "LOCATION")?.value || "") || undefined;
	// Recurrence instances get UID like <base>_R20260630T074500; normalize to dedupe against masters.
	const uid = (icsField(u, "UID")?.value ?? "").replace(/_R\d{8}T\d{6}[^@]*@/, "@");

	let start: string;
	let end: string;
	let sortKey: string;
	let allDay = false;

	if (ds.dateOnly) {
		allDay = true;
		start = `${ds.value.slice(0, 4)}-${ds.value.slice(4, 6)}-${ds.value.slice(6, 8)} (all-day)`;
		const de2 = de && de.dateOnly ? de.value : ds.value;
		end = `${de2.slice(0, 4)}-${de2.slice(4, 6)}-${de2.slice(6, 8)}`;
		sortKey = ds.value;
	} else if (ds.value.endsWith("Z")) {
		start = utcToLocalDisplay(ds.value);
		end = de ? utcToLocalDisplay(de.value) : start;
		sortKey = ds.value;
	} else {
		// TZID or floating — treat as local wall time
		const datePart = `${ds.value.slice(0, 4)}-${ds.value.slice(4, 6)}-${ds.value.slice(6, 8)}`;
		const timePart = `${ds.value.slice(9, 11)}:${ds.value.slice(11, 13)}`;
		start = `${datePart} ${timePart}`;
		const e = de?.value ?? ds.value;
		end = `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)} ${e.slice(9, 11)}:${e.slice(11, 13)}`;
		sortKey = ds.value;
	}

	return { start, end, sortKey, allDay, summary, location, meet, calendar: calendarLabel, uid };
}

// ---------- calendar access ----------

function calendarUids(filter?: string): string[] {
	try {
		const uids = readdirSync(CACHE_DIR).filter((n) => /^[0-9a-f]{32,}$/.test(n));
		return filter ? uids.filter((u) => u.includes(filter.toLowerCase())) : uids;
	} catch {
		return [];
	}
}

function ymdInTz(d: Date, tz: string): string {
	return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function listEvents(opts: {
	from: string; // YYYY-MM-DD inclusive, local
	to: string; // YYYY-MM-DD inclusive, local
	contains?: string;
	calendarFilter?: string;
}): Promise<CalEvent[]> {
	const t0 = zonedToUtc(opts.from, "00:00", TZ);
	const t1 = zonedToUtc(opts.to, "23:59", TZ) + 60_000;
	const compact = (ms: number) => {
		const d = new Date(ms);
		const p = (n: number, w = 2) => String(n).padStart(w, "0");
		return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
	};

	const sexp = opts.contains
		? `(and (occur-in-time-range? (make-time "${compact(t0)}") (make-time "${compact(t1)}")) (contains? "summary" "${opts.contains.replace(/["\\]/g, "")}"))`
		: `(occur-in-time-range? (make-time "${compact(t0)}") (make-time "${compact(t1)}"))`;

	const events: CalEvent[] = [];
	for (const uid of calendarUids(opts.calendarFilter)) {
		try {
			const opened = await gdbus(
				"org.gnome.evolution.dataserver.Calendar8",
				"/org/gnome/evolution/dataserver/CalendarFactory",
				"org.gnome.evolution.dataserver.CalendarFactory.OpenCalendar",
				uid,
			);
			const m = opened.match(/\('(\/[^']+)',\s*'([^']+)'\)/);
			if (!m) continue;
			const [, objPath] = m;
			const props = await gdbus(
				"org.gnome.evolution.dataserver.Calendar8",
				objPath,
				"org.freedesktop.DBus.Properties.GetAll",
				"org.gnome.evolution.dataserver.Calendar",
			);
			const email = props.match(/'CalEmailAddress':\s*<'([^']+)'>/)?.[1];
			const label = email ?? uid.slice(0, 8);
			const out = await gdbus(
				"org.gnome.evolution.dataserver.Calendar8",
				objPath,
				"org.gnome.evolution.dataserver.Calendar.GetObjectList",
				sexp,
			);
			const seen = new Set<string>();
			for (const ics of parseGVariantStringList(out)) {
				const ev = parseIcs(ics, label);
				if (!ev) continue;
				// Keep only occurrences overlapping the requested range (masters of
				// recurring series carry their original series-start DTSTART).
				const startDate = ev.sortKey.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
				const endDate = datePartOf(deOrStart(ev));
				if (startDate > opts.to || endDate < opts.from) continue;
				if (ev.uid) {
					if (seen.has(ev.uid)) continue;
					seen.add(ev.uid);
				}
				events.push(ev);
			}
		} catch {
			// skip calendars that can't be opened (tasks lists, birthdays, etc.)
		}
	}
	events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
	return events;
}

/** End date of an event as YYYY-MM-DD (for range-overlap checks). */
function deOrStart(ev: CalEvent): string {
	const m = ev.end.match(/^\d{4}-\d{2}-\d{2}/);
	return m ? m[0].replace(/-/g, "") : ev.sortKey.slice(0, 8);
}

function formatEvents(events: CalEvent[]): string {
	if (events.length === 0) return "No events found.";
	return events
		.map((e) => {
			const time = e.allDay ? `${e.start}` : `${e.start} – ${e.end.slice(11).trim() || e.end}`;
			const extra = [e.location ? ` @ ${e.location}` : "", e.meet ? ` (${e.meet})` : ""].join("");
			return `${time}  ${e.summary}${extra}  [${e.calendar}]`;
		})
		.join("\n");
}

// ---------- registration ----------

// Named exports kept for testability/debugging outside the extension runtime.
export { listEvents, formatEvents };

export default function (pi: ExtensionAPI) {
	const calendarTool = defineTool({
		name: "calendar",
		label: "Calendar",
		description:
			"Check the user's GNOME Calendar (Google calendars synced via evolution-data-server, live over D-Bus). " +
			"Returns events for a date range, sorted, with times in Europe/Stockholm. Read-only.",
		parameters: Type.Object({
			from: Type.Optional(Type.String({ description: "Start date YYYY-MM-DD (inclusive, defaults to today)" })),
			to: Type.Optional(Type.String({ description: "End date YYYY-MM-DD (inclusive, defaults to from + 7 days)" })),
			contains: Type.Optional(Type.String({ description: "Only events whose summary contains this text" })),
			calendar: Type.Optional(
				Type.String({ description: "Only calendars whose UID/email contains this string (e.g. an email address)" }),
			),
		}),
		async execute(_id, params) {
			const today = ymdInTz(new Date(), TZ);
			const from = params.from ?? today;
			const to =
				params.to ??
				ymdInTz(new Date(new Date(`${from}T12:00:00Z`).getTime() + 6 * 86_400_000), TZ);
			try {
				const events = await listEvents({ from, to, contains: params.contains, calendarFilter: params.calendar });
				return {
					content: [{ type: "text", text: `Events ${from} → ${to}:\n${formatEvents(events)}` }],
					details: { from, to, count: events.length, events },
				};
			} catch (err) {
				throw new Error(`calendar: failed to query evolution-data-server: ${err instanceof Error ? err.message : String(err)}`);
			}
		},
	});

	pi.registerTool(calendarTool);

	pi.registerCommand("calendar", {
		description: "Show upcoming calendar events (default: 7 days)",
		handler: async (args, ctx) => {
			const days = Math.max(1, Number(args?.trim() || "7") || 7);
			const today = ymdInTz(new Date(), TZ);
			const to = ymdInTz(new Date(Date.now() + days * 86_400_000), TZ);
			try {
				const events = await listEvents({ from: today, to });
				ctx.ui.notify(`Calendar ${today} → ${to}:\n${formatEvents(events)}`, "info");
			} catch (err) {
				ctx.ui.notify(`calendar: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});
}
