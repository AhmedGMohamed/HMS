/**
 * Shared helpers for the Reports v2 models (Phase 6.11).
 *
 * Everything here is deliberately dependency-free and synchronous so the
 * models, controllers and specs can share exactly one implementation of the
 * conventions documented in `phase_6.11_plan.md` §3.2:
 *
 *   - strict `YYYY-MM-DD` parsing with real-calendar validation,
 *   - half-open timestamp bounds `[start, end + 1 day)` so the end date is
 *     inclusive without relying on `BETWEEN` (a timestamp on the end date at
 *     13:00 was silently excluded by the legacy queries),
 *   - pagination parsing with a fixed page-size whitelist,
 *   - sort whitelisting (never interpolate user input into SQL),
 *   - money / number coercion (Postgres `NUMERIC` arrives as a string),
 *   - `COUNT(*) OVER()` row parsing for paginated queries.
 */

import { toMoneyNumber } from "../../utils/billFinancials.js";

export { toMoneyNumber, roundMoney } from "../../utils/billFinancials.js";

/* ------------------------------------------------------------------ */
/* Validation error                                                    */
/* ------------------------------------------------------------------ */

/**
 * Error type the controllers translate into a `400 { error }` response.
 * Anything else that escapes a model becomes a 500.
 */
export class ReportValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReportValidationError";
	}
}

/**
 * Thrown by models when a requested id does not exist (the controller maps it
 * to `404`). Declared here rather than in the controller so a model never has
 * to import the module that imports it.
 */
export class NotFoundError extends Error {
	constructor(message = "Not found") {
		super(message);
		this.name = "NotFoundError";
	}
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a strict `YYYY-MM-DD` string into a UTC-midnight `Date`.
 *
 * Rejects `2026-02-31` (real-calendar check) and anything that is not the
 * exact shape — `new Date("...")` would happily accept both, which is how
 * the legacy code drifted a day in non-UTC environments.
 */
export function parseDateOnly(value: unknown, field: string): Date {
	if (typeof value !== "string") {
		throw new ReportValidationError(`${field} is required (YYYY-MM-DD)`);
	}
	const trimmed = value.trim();
	const match = DATE_ONLY_RE.exec(trimmed);
	if (!match) {
		throw new ReportValidationError(`${field} must be YYYY-MM-DD`);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new ReportValidationError(`${field} is not a real date`);
	}
	return date;
}

/** Normalizes any supported date input to `YYYY-MM-DD`. */
export function toDateOnlyString(value: Date | string): string {
	if (typeof value === "string" && DATE_ONLY_RE.test(value.trim())) {
		return value.trim();
	}
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "";
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayDateOnly(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Normalizes a value read from a Postgres `DATE` column to `YYYY-MM-DD`.
 *
 * Use **local** components, not UTC: `pg` builds DATE values at local
 * midnight, so `toISOString()` would report the previous day for every
 * timezone east of Greenwich (the development machine is UTC+3). The test
 * bootstrap swaps in a parser that returns the raw `YYYY-MM-DD` string, so
 * both shapes are supported.
 */
export function toDbDateOnly(value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	const raw = String(value).trim();
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
	return match ? match[1] : null;
}

/**
 * Normalizes a `TIMESTAMP` value to an ISO-8601 string.
 *
 * Postgres returns `Date` (JSON would serialize it anyway, but hidden
 * `Date` objects inside a response are a trap for tests and for any caller
 * that compares strings), and the test bootstrap may hand back the raw
 * text. Both are collapsed to one string shape here.
 */
export function toTimestampString(value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString();
	}
	const raw = String(value).trim();
	return raw.length > 0 ? raw : null;
}

export interface DateRangeQuery {
	/** `YYYY-MM-DD`, inclusive. */
	startDate: string;
	/** `YYYY-MM-DD`, inclusive. */
	endDate: string;
}

/**
 * Validates the `start_date` / `end_date` pair every v2 endpoint requires.
 * Both bounds are inclusive; `start_date > end_date` is a 400.
 */
export function parseDateRange(query: Record<string, unknown>): DateRangeQuery {
	const start = parseDateOnly(query.start_date, "start_date");
	const end = parseDateOnly(query.end_date, "end_date");
	if (start.getTime() > end.getTime()) {
		throw new ReportValidationError("start_date must be on or before end_date");
	}
	return {
		startDate: toDateOnlyString(start),
		endDate: toDateOnlyString(end),
	};
}

/**
 * SQL fragment for the exclusive upper bound of an inclusive date range.
 *
 * Usage (always with two parameters, `$n` = start, `$n+1` = end):
 *   `WHERE ph.admission_time >= $1::date AND ph.admission_time < ($2::date + INTERVAL '1 day')`
 */
export const END_EXCLUSIVE_OFFSET = "INTERVAL '1 day'";

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

/** Number of calendar days in `[start, end]` (inclusive). */
export function inclusiveDayCount(startDate: string, endDate: string): number {
	const start = parseDateOnly(startDate, "start_date");
	const end = parseDateOnly(endDate, "end_date");
	return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * The inclusive end of a report range as a **local** midnight `Date`.
 *
 * Used as the reference date for derived ages: a report over 2025 must not age
 * a patient by however long ago it was generated, and a local midnight keeps
 * the calendar day stable in the `getFullYear()/getMonth()/getDate()` math.
 */
export function rangeEndLocalDate(range: DateRangeQuery): Date {
	return new Date(`${range.endDate}T00:00:00`);
}

/** Lists every `YYYY-MM-DD` in `[start, end]` (inclusive). */
export function enumerateDates(startDate: string, endDate: string): string[] {
	const start = parseDateOnly(startDate, "start_date");
	const end = parseDateOnly(endDate, "end_date");
	const out: string[] = [];
	const cursor = new Date(start.getTime());
	while (cursor.getTime() <= end.getTime()) {
		out.push(toDateOnlyString(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}

/** `max(a, b)` for `YYYY-MM-DD` strings (lexicographic order is chronological). */
export function maxDate(a: string, b: string): string {
	return a >= b ? a : b;
}

/** `min(a, b)` for `YYYY-MM-DD` strings. */
export function minDate(a: string, b: string): string {
	return a <= b ? a : b;
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export interface PagingQuery {
	page: number;
	pageSize: number;
	offset: number;
	limit: number;
}

function parsePositiveInt(value: unknown, fallback: number): number {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Validates `page` / `page_size`.
 *
 * `page_size` must be one of `PAGE_SIZES`; anything else is a 400 so a
 * client cannot ask for 100 000 rows through the list path (exports have
 * their own endpoints).
 */
export function parsePaging(query: Record<string, unknown>): PagingQuery {
	const page = parsePositiveInt(query.page, 1);
	if (query.page !== undefined && query.page !== "" && page < 1) {
		throw new ReportValidationError("page must be a positive integer");
	}

	let pageSize = DEFAULT_PAGE_SIZE;
	if (query.page_size !== undefined && query.page_size !== "") {
		const parsed = Number.parseInt(String(query.page_size), 10);
		if (!(PAGE_SIZES as readonly number[]).includes(parsed)) {
			throw new ReportValidationError(
				`page_size must be one of ${PAGE_SIZES.join(", ")}`
			);
		}
		pageSize = parsed;
	}

	return {
		page,
		pageSize,
		offset: (page - 1) * pageSize,
		limit: pageSize,
	};
}

/**
 * Reads the `total` produced by `COUNT(*) OVER() AS total_count` off the
 * first row. Returns `0` for an empty page (the caller then knows the
 * result set is empty without a second round trip).
 */
export function readWindowTotal(rows: Array<Record<string, unknown>>): number {
	if (!rows || rows.length === 0) return 0;
	const raw = rows[0].total_count;
	const total = Number(raw);
	return Number.isFinite(total) ? total : 0;
}

/** Strips the `total_count` helper column from list rows. */
export function stripWindowTotal<T extends Record<string, unknown>>(rows: T[]): T[] {
	return rows.map((row) => {
		const copy: Record<string, unknown> = { ...row };
		delete copy.total_count;
		return copy as T;
	});
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc";

export interface SortQuery {
	column: string;
	direction: SortDirection;
}

/**
 * Validates `sort` against a per-endpoint whitelist and returns the safe
 * SQL fragment. Throws `ReportValidationError` for unknown columns so a
 * typo surfaces during development instead of silently defaulting.
 *
 * The fragment is built from developer-authored `orderBy` strings only —
 * user input can select a key but never reaches the SQL text.
 */
export function parseSort(
	query: Record<string, unknown>,
	allowed: Record<string, string>,
	defaultKey: string
): SortQuery & { sql: string } {
	const raw = query.sort === undefined || query.sort === "" ? defaultKey : String(query.sort);
	if (!(raw in allowed)) {
		throw new ReportValidationError(
			`sort must be one of ${Object.keys(allowed).join(", ")}`
		);
	}
	const rawDir = query.dir === undefined || query.dir === "" ? "asc" : String(query.dir);
	if (rawDir !== "asc" && rawDir !== "desc") {
		throw new ReportValidationError("dir must be asc or desc");
	}
	return {
		column: raw,
		direction: rawDir,
		sql: `${allowed[raw]} ${rawDir.toUpperCase()}`,
	};
}

/** Trims and caps a free-text search term (never used raw in SQL). */
export function parseSearch(query: Record<string, unknown>): string | null {
	if (query.search === undefined || query.search === null) return null;
	const value = String(query.search).trim();
	if (value.length === 0) return null;
	return value.slice(0, 255);
}

/** Builds a `ILIKE '%term%'` pattern for a parameter. */
export function likePattern(term: string): string {
	return `%${term}%`;
}

/* ------------------------------------------------------------------ */
/* Enum parsing                                                        */
/* ------------------------------------------------------------------ */

/** Parses an enum-ish query param, allowing `undefined` to mean "all". */
export function parseEnumParam<T extends string>(
	value: unknown,
	allowed: readonly T[],
	field: string,
	fallback: T | null = null
): T | null {
	if (value === undefined || value === null || value === "") return fallback;
	const raw = String(value);
	if (!(allowed as readonly string[]).includes(raw)) {
		throw new ReportValidationError(`${field} must be one of ${allowed.join(", ")}`);
	}
	return raw as T;
}

/** Parses a positive integer id query param (400 on garbage). */
export function parseOptionalId(value: unknown, field: string): number | null {
	if (value === undefined || value === null || value === "") return null;
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new ReportValidationError(`${field} must be a positive integer`);
	}
	return parsed;
}

/** Parses the `:id` route param (400 rather than a SQL type error). */
export function parseRequiredId(value: unknown, field: string): number {
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new ReportValidationError(`${field} must be a positive integer`);
	}
	return parsed;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/** Coerces a numeric aggregate to a finite number (0 when NULL/`''`). */
export function toNumber(value: unknown): number {
	return toMoneyNumber(value);
}

/** Coerces every listed key of a row to a number (in a copy). */
export function numericKeys<T extends Record<string, unknown>>(
	row: T,
	keys: string[]
): T {
	const copy: Record<string, unknown> = { ...row };
	for (const key of keys) {
		copy[key] = toMoneyNumber(copy[key]);
	}
	return copy as T;
}

/** Coerces every listed key of every row to a number. */
export function numericKeysInRows<T extends Record<string, unknown>>(
	rows: T[],
	keys: string[]
): T[] {
	return rows.map((row) => numericKeys(row, keys));
}

/**
 * Safely divides two numbers, returning `0` when the denominator is 0 or
 * the inputs are not finite (the legacy reports printed `NaN`/`Infinity`).
 */
export function safeDivide(numerator: number, denominator: number): number {
	const n = toNumber(numerator);
	const d = toNumber(denominator);
	if (d === 0) return 0;
	const result = n / d;
	return Number.isFinite(result) ? result : 0;
}

/** Rounds to `decimals` places (default 2) — for display-ready aggregates. */
export function roundTo(value: unknown, decimals = 2): number {
	const amount = toMoneyNumber(value);
	const factor = 10 ** decimals;
	return Math.round(amount * factor) / factor;
}

/** Parses a boolean query param (`true`/`false`/`1`/`0`). */
export function parseBooleanParam(value: unknown, fallback = false): boolean {
	if (value === undefined || value === null || value === "") return fallback;
	const raw = String(value).toLowerCase();
	if (raw === "true" || raw === "1") return true;
	if (raw === "false" || raw === "0") return false;
	return fallback;
}

/* ------------------------------------------------------------------ */
/* Time-of-day helpers (clock-in reports)                              */
/* ------------------------------------------------------------------ */

/**
 * Parses a Postgres `TIME` (`08:00:00`) or timestamp into minutes since
 * midnight. Returns `null` when the value is missing or invalid.
 */
export function timeToMinutes(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return value.getHours() * 60 + value.getMinutes();
	}
	const raw = String(value);
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
}

/**
 * Attendance status of one clock-in — plan §3.4, shared by the payroll detail
 * (period deductions) and the clock-in report (6.11.6) so the two can never
 * disagree about what "late" means.
 *
 * Rules, in order:
 *   - no clock-in      → `missing`
 *   - no clock-out     → `incomplete`
 *   - with a shift     → `late` when clock-in is more than 30 min after the
 *                        shift start, else `early` when clock-out is more than
 *                        30 min before the shift end, else `on_time`
 *   - without a shift  → `late` when a deduction was recorded, else `on_time`
 *
 * The 30-minute grace is a rule, not a constant to tweak per caller: the
 * legacy page used the same threshold when it recorded `pay_deduction`.
 */
export type ClockStatus = "on_time" | "late" | "early" | "incomplete" | "missing";

export const CLOCK_GRACE_MINUTES = 30;

export interface ClockStatusResult {
	status: ClockStatus;
	late_minutes: number;
	early_minutes: number;
}

export function clockStatusFor(input: {
	clockIn: unknown;
	clockOut: unknown;
	shiftStart: unknown;
	shiftEnd: unknown;
	payDeduction: unknown;
}): ClockStatusResult {
	const clockIn = timeToMinutes(input.clockIn);
	if (clockIn === null) {
		return { status: "missing", late_minutes: 0, early_minutes: 0 };
	}

	const clockOut = timeToMinutes(input.clockOut);
	if (clockOut === null) {
		return { status: "incomplete", late_minutes: 0, early_minutes: 0 };
	}

	const shiftStart = timeToMinutes(input.shiftStart);
	const shiftEnd = timeToMinutes(input.shiftEnd);

	if (shiftStart === null || shiftEnd === null) {
		const deduction = toMoneyNumber(input.payDeduction);
		return {
			status: deduction > 0 ? "late" : "on_time",
			late_minutes: 0,
			early_minutes: 0,
		};
	}

	const lateMinutes = Math.max(0, clockIn - (shiftStart + CLOCK_GRACE_MINUTES));
	if (lateMinutes > 0) {
		return { status: "late", late_minutes: lateMinutes, early_minutes: 0 };
	}

	const earlyMinutes = Math.max(0, shiftEnd - CLOCK_GRACE_MINUTES - clockOut);
	if (earlyMinutes > 0) {
		return { status: "early", late_minutes: 0, early_minutes: earlyMinutes };
	}

	return { status: "on_time", late_minutes: 0, early_minutes: 0 };
}

/** Minutes between two timestamps, rounded to 2 decimals of an hour. */
export function hoursBetween(start: unknown, end: unknown): number {
	if (!start || !end) return 0;
	const startDate = start instanceof Date ? start : new Date(String(start));
	const endDate = end instanceof Date ? end : new Date(String(end));
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
	const hours = (endDate.getTime() - startDate.getTime()) / 3_600_000;
	return hours > 0 ? roundTo(hours, 2) : 0;
}
