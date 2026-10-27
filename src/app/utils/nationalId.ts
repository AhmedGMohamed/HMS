/**
 * Egyptian national-ID derivation — Phase 6.11.1.
 *
 * `Patient` stores no birth date: the only source is the 14-digit national ID
 * (`C YY MM DD …`), where `C` is the century digit (`2` → 19xx, `3` → 20xx).
 *
 * Both the legacy patient report (`Report.model.calculateAgeFromNationalId`,
 * `views/js/reports/reports.ts:getBirthDateFromNationalId`) and the new
 * `/api/reports/v2` patient/doctor reports need the same derivation, and the
 * old code disagreed with itself (age returned `0` for "unknown", the birth
 * date returned `"N/A"`, and neither validated the calendar). This module is
 * the single implementation and reports "unknown" as `null` so the renderer
 * can decide how to print it.
 *
 * The derivation is optional by design: a patient without a national ID is a
 * normal case (`national_id` is nullable and unique), so callers must handle
 * `null` rather than falling back to `0`/`N/A` inside the model.
 */

export interface NationalIdInfo {
	/** `YYYY-MM-DD`, derived from digits 2–7. */
	birthDate: string;
	/** Completed years between `birthDate` and today (never negative). */
	age: number;
}

const NATIONAL_ID_MIN_LENGTH = 7;

/** `YYYY-MM-DD` for the local calendar date of `date`. */
function toLocalDateOnly(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Derives birth date and age from an Egyptian national ID.
 *
 * Returns `null` when the value is missing, too short, has an unknown century
 * digit, or encodes an impossible calendar date — never a misleading `0`.
 */
export function parseEgyptianNationalId(
	nationalId: unknown,
	today: Date = new Date()
): NationalIdInfo | null {
	if (typeof nationalId !== "string") return null;
	const value = nationalId.trim();
	if (value.length < NATIONAL_ID_MIN_LENGTH) return null;
	if (!/^\d+$/.test(value.slice(0, NATIONAL_ID_MIN_LENGTH))) return null;

	const centuryDigit = Number(value.charAt(0));
	const century = centuryDigit === 2 ? 1900 : centuryDigit === 3 ? 2000 : null;
	if (century === null) return null;

	const year = century + Number(value.slice(1, 3));
	const month = Number(value.slice(3, 5));
	const day = Number(value.slice(5, 7));
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	// Real-calendar check: 1985-02-30 must not silently become 1985-03-02.
	const birth = new Date(year, month - 1, day);
	if (
		birth.getFullYear() !== year ||
		birth.getMonth() !== month - 1 ||
		birth.getDate() !== day
	) {
		return null;
	}

	let age = today.getFullYear() - year;
	const monthDiff = today.getMonth() - (month - 1);
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
		age -= 1;
	}

	return {
		birthDate: toLocalDateOnly(birth),
		age: Math.max(0, age),
	};
}
