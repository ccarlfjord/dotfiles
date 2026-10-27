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
 * Reading is the default. Creating events goes through CreateObjects on the same
 * per-calendar object; EDS fills in the VCALENDAR wrapper, CREATED, SEQUENCE and
 * the account's default reminder. Attendees are deliberately unsupported: adding
 * them makes EDS send invitations, which is not a thing an agent should do.
 * Modifying and deleting existing events is not implemented.
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

/**
 * Convert a "YYYY-MM-DD" + "HH:MM" in TZ to UTC epoch ms.
 * Iterates because the zone offset at the guessed instant is not the offset at the answer;
 * a wall time inside a spring-forward gap resolves forward, as RFC 5545 expects.
 */
function zonedToUtc(date: string, time: string, tz: string): number {
	const want = new Date(`${date}T${time}:00Z`).getTime();
	let utcGuess = want;
	for (let i = 0; i < 4; i++) {
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
		const delta = want - asUtc;
		if (delta === 0) break;
		utcGuess += delta;
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

// ---------- event creation ----------

const CALENDAR_DEST = "org.gnome.evolution.dataserver.Calendar8";
const CALENDAR_IFACE = "org.gnome.evolution.dataserver.Calendar";
const FACTORY_PATH = "/org/gnome/evolution/dataserver/CalendarFactory";
const FACTORY_IFACE = "org.gnome.evolution.dataserver.CalendarFactory";
const OPFLAGS_NONE = 0;

interface WritableCalendar {
	uid: string;
	objectPath: string;
	label: string;
}

/** Escape a text value per RFC 5545 3.3.11. */
function icsEscapeText(v: string): string {
	return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold one content line at 75 octets, continuation lines prefixed with a space. */
function foldIcsLine(line: string): string {
	const parts: string[] = [];
	let cur = "";
	for (const ch of line) {
		const max = parts.length === 0 ? 75 : 74; // the continuation space counts toward the 75
		if (Buffer.byteLength(cur + ch, "utf8") > max) {
			parts.push(cur);
			cur = ch;
		} else {
			cur += ch;
		}
	}
	parts.push(cur);
	return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
}

/** GVariant double-quoted string literal: escapes \\, " and newlines. */
function gvariantString(s: string): string {
	const esc = s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n");
	return `"${esc}"`;
}

function utcCompact(ms: number): string {
	const d = new Date(ms);
	const p = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function compactDate(d: string): string {
	return d.replace(/-/g, "");
}

function addDays(d: string, days: number): string {
	const ms = Date.parse(`${d}T12:00:00Z`) + days * 86_400_000;
	return new Date(ms).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (also accepts a space separator). */
function parseLocalDateTime(v: string): { date: string; time?: string } {
	const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
	if (!m) throw new Error(`expected YYYY-MM-DD or YYYY-MM-DDTHH:MM, got "${v}"`);
	return { date: m[1], time: m[2] !== undefined ? `${m[2]}:${m[3]}` : undefined };
}

function displayRange(ms0: number, ms1: number): string {
	const f = (ms: number) =>
		new Intl.DateTimeFormat("sv-SE", {
			timeZone: TZ,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(ms));
	return `${f(ms0)} – ${f(ms1).slice(11)}`;
}

async function openCalendar(uid: string): Promise<{ objectPath: string; props: string }> {
	const opened = await gdbus(CALENDAR_DEST, FACTORY_PATH, `${FACTORY_IFACE}.OpenCalendar`, uid);
	const m = opened.match(/\('(\/[^']+)',\s*'([^']+)'\)/);
	if (!m) throw new Error(`could not open calendar ${uid}`);
	const objectPath = m[1];
	const props = await gdbus(CALENDAR_DEST, objectPath, "org.freedesktop.DBus.Properties.GetAll", CALENDAR_IFACE);
	return { objectPath, props };
}

async function writableCalendars(filter?: string): Promise<WritableCalendar[]> {
	const out: WritableCalendar[] = [];
	for (const uid of calendarUids()) {
		try {
			const { objectPath, props } = await openCalendar(uid);
			if (!/'Writable':\s*<true>/.test(props)) continue;
			const email = props.match(/'CalEmailAddress':\s*<'([^']*)'>/)?.[1] ?? "";
			const label = email || uid.slice(0, 8);
			const hay = `${label} ${uid}`.toLowerCase();
			if (filter && !hay.includes(filter.toLowerCase())) continue;
			out.push({ uid, objectPath, label });
		} catch {
			// task lists and read-only sources drop out here
		}
	}
	return out;
}

async function createEvent(opts: {
	summary: string;
	start: string;
	end?: string;
	location?: string;
	description?: string;
	calendarFilter?: string;
}): Promise<{ uid: string; label: string; allDay: boolean; when: string }> {
	const summary = opts.summary.trim();
	if (!summary) throw new Error("summary must not be empty");

	const start = parseLocalDateTime(opts.start);
	const allDay = start.time === undefined;
	const end = opts.end ? parseLocalDateTime(opts.end) : undefined;

	let lines: string[];
	let when: string;
	if (allDay) {
		if (end?.time) throw new Error("an all-day event needs a date-only end, or none");
		const lastDay = end?.date ?? start.date;
		if (lastDay < start.date) throw new Error("end is before start");
		// DTEND is exclusive for all-day events
		lines = [
			`DTSTART;VALUE=DATE:${compactDate(start.date)}`,
			`DTEND;VALUE=DATE:${compactDate(addDays(lastDay, 1))}`,
		];
		when = lastDay === start.date ? `${start.date} (all-day)` : `${start.date} → ${lastDay} (all-day)`;
	} else {
		if (end?.time === undefined && end) throw new Error("a timed event needs a timed end, or none (defaults to +30 min)");
		const startMs = zonedToUtc(start.date, start.time as string, TZ);
		const endMs = end ? zonedToUtc(end.date, end.time as string, TZ) : startMs + 30 * 60_000;
		if (endMs <= startMs) throw new Error("end must be after start");
		lines = [`DTSTART:${utcCompact(startMs)}`, `DTEND:${utcCompact(endMs)}`];
		when = displayRange(startMs, endMs);
	}

	const calendars = await writableCalendars(opts.calendarFilter);
	if (calendars.length === 0) {
		throw new Error(
			opts.calendarFilter
				? `no writable calendar matches "${opts.calendarFilter}"`
				: "no writable calendar found in evolution-data-server",
		);
	}
	if (calendars.length > 1 && !opts.calendarFilter) {
		throw new Error(`several writable calendars, pass calendar=<filter>: ${calendars.map((c) => c.label).join(", ")}`);
	}
	const target = calendars[0];

	const body = [
		"BEGIN:VEVENT",
		`UID:pi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@local`,
		`DTSTAMP:${utcCompact(Date.now())}`,
		...lines,
		`SUMMARY:${icsEscapeText(summary)}`,
		...(opts.location ? [`LOCATION:${icsEscapeText(opts.location)}`] : []),
		...(opts.description ? [`DESCRIPTION:${icsEscapeText(opts.description)}`] : []),
		"END:VEVENT",
	]
		.map(foldIcsLine)
		.join("\r\n");

	const ics = `${body}\r\n`;
	const out = await gdbus(
		CALENDAR_DEST,
		target.objectPath,
		`${CALENDAR_IFACE}.CreateObjects`,
		`[${gvariantString(ics)}]`,
		String(OPFLAGS_NONE),
	);
	const uid = parseGVariantStringList(out)[0] ?? "";
	return { uid, label: target.label, allDay, when };
}

// ---------- registration ----------

// Named exports kept for testability/debugging outside the extension runtime.
export { listEvents, formatEvents, createEvent };

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

	pi.registerTool(
		defineTool({
			name: "calendar_add",
			label: "Calendar add",
			description:
				"Create one event in the user's calendar (GNOME Calendar / Google via evolution-data-server). " +
				"Times are local Europe/Stockholm wall time, not UTC. Only create an event when the user asked for it. " +
				"Invites and reminders cannot be set here, and the event goes to the single writable calendar.",
			parameters: Type.Object({
				summary: Type.String({ description: "Event title" }),
				start: Type.String({ description: "Start: YYYY-MM-DDTHH:MM, or YYYY-MM-DD for an all-day event" }),
				end: Type.Optional(
					Type.String({
						description:
							"End in the same format. Defaults to start + 30 minutes for timed events, and to the start date (inclusive) for all-day ones",
					}),
				),
				location: Type.Optional(Type.String({ description: "Where it happens" })),
				description: Type.Optional(Type.String({ description: "Agenda or notes" })),
				calendar: Type.Optional(
					Type.String({ description: "Only needed when more than one writable calendar exists; matches a UID/email" }),
				),
			}),
			async execute(_id, params) {
				const created = await createEvent({
					summary: params.summary,
					start: params.start,
					end: params.end,
					location: params.location,
					description: params.description,
					calendarFilter: params.calendar,
				});
				return {
					content: [
						{
							type: "text",
							text: `Created "${params.summary}" ${created.when} [${created.label}]${created.uid ? ` uid=${created.uid}` : ""}`,
						},
					],
					details: created,
				};
			},
		}),
	);

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
