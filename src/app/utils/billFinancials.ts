/**
 * Bill financial engine — single source of truth for the money math that
 * both the billing write path (`Bill.model.recalculateTotal`) and every
 * Reports v2 aggregation depend on.
 *
 * Ported verbatim from `Bill.model.recalculateTotal` (which in turn mirrors
 * the renderer's `patients.ts` / `printBillManager.ts` calculators). The
 * semantics are subtle enough that a second copy would drift, so the model
 * now calls this helper instead of keeping its own inline copy.
 *
 * ## Semantics (per bill)
 *
 *   subtotal        = services + drugs + supplies + medical tests
 *   discount        = `percentage` ? scopedBase * pct/100 : fixed amount,
 *                     where `scopedBase` is the sum of the categories listed
 *                     in `discountScope` (empty/unknown categories ignored)
 *   afterDiscount   = subtotal - discount
 *   vatBase         = sum of categories in `vatScope` minus the share of the
 *                     discount that falls on the overlap between the two
 *                     scopes (proportional split by category value)
 *   vat             = (vatBase + administrativeExpenses) * vatPct/100
 *   finalTotal      = afterDiscount + vat + administrativeExpenses
 *
 * Two legacy behaviours are intentional and preserved:
 *   - A `null` scope means "every category" (backward compatibility with
 *     bills created before the scope columns existed).
 *   - `administrativeExpenses` are charged VAT regardless of the VAT scope
 *     and are added to the total on top of `afterDiscount`.
 *
 * The result is **not rounded** — Postgres `DECIMAL(15,2)` rounds on write.
 * Callers that need display values must round explicitly (`roundMoney`).
 */

export type BillDiscountType = "fixed" | "percentage" | null | undefined;

export interface BillFinancialInput {
	/** Sum of `BillDetail` rows with `service_id` set. */
	services: number;
	/** Sum of `BillDetail` rows with `drug_shipment_id` set. */
	drugs: number;
	/** Sum of `BillDetail` rows with `medical_supply_shipment_id` set. */
	supplies: number;
	/** `Bill.medical_tests_amount` (not itemised in `BillDetail`). */
	tests: number;
	/** Raw `Bill.discount` value (percentage points or absolute money). */
	discount: number;
	discountType: BillDiscountType;
	/** `Bill.discount_scope`; `null`/empty means all categories. */
	discountScope: string[] | null | undefined;
	/** Raw `Bill.vat_percentage`. */
	vatPercentage: number;
	/** `Bill.vat_scope_custom`; `null`/empty means all categories. */
	vatScope: string[] | null | undefined;
	/** `Bill.administrative_expenses`. */
	administrativeExpenses: number;
}

export interface BillFinancialResult {
	/** Echo of the category inputs after number coercion (never NaN). */
	services: number;
	drugs: number;
	supplies: number;
	tests: number;
	/** services + drugs + supplies + tests */
	subtotal: number;
	/** Sum of the categories the discount applies to. */
	discountableAmount: number;
	/** Money value of the discount. */
	discountAmount: number;
	/** subtotal - discountAmount */
	totalAfterDiscount: number;
	/** Scoped category total used as the VAT base (before discount share). */
	vattableAmount: number;
	/** Money value of the VAT. */
	vatAmount: number;
	/** Echoed administrative expenses (always VAT'd, always added). */
	administrativeExpenses: number;
	/** totalAfterDiscount + vatAmount + administrativeExpenses */
	finalTotal: number;
}

/** All known bill categories, in the order the schema documents them. */
export const BILL_CATEGORIES = ["services", "drugs", "supplies", "tests"] as const;

export type BillCategory = (typeof BILL_CATEGORIES)[number];

/** Coerces any Postgres `NUMERIC` (string) / number / null to a finite number. */
export function toMoneyNumber(value: unknown): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (value === null || value === undefined || value === "") return 0;
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes a scope array. `null`, `undefined` and an empty array all mean
 * "every category" — matching the legacy `bill.discount_scope || [...]`
 * default. Unknown category names are dropped so a typo cannot silently
 * change the total.
 */
export function normalizeScope(scope: string[] | null | undefined): BillCategory[] {
	if (!scope || scope.length === 0) return [...BILL_CATEGORIES];
	const allowed = new Set<string>(BILL_CATEGORIES);
	const normalized = scope.filter((category): category is BillCategory =>
		allowed.has(category)
	);
	return normalized.length > 0 ? normalized : [...BILL_CATEGORIES];
}

/**
 * Computes the full financial breakdown for one bill.
 *
 * Pure and side-effect free; safe to call from models, controllers, tests
 * and (via a port) the renderer.
 */
export function calculateBillFinancials(
	input: BillFinancialInput
): BillFinancialResult {
	const services = toMoneyNumber(input.services);
	const drugs = toMoneyNumber(input.drugs);
	const supplies = toMoneyNumber(input.supplies);
	const tests = toMoneyNumber(input.tests);

	const categoryTotals: Record<BillCategory, number> = {
		services,
		drugs,
		supplies,
		tests,
	};

	const subtotal = services + drugs + supplies + tests;

	const discountValue = toMoneyNumber(input.discount);
	const vatPercentage = toMoneyNumber(input.vatPercentage);
	const administrativeExpenses = toMoneyNumber(input.administrativeExpenses);

	const discountScope = normalizeScope(input.discountScope);
	const vatScope = normalizeScope(input.vatScope);

	// --- Discount: only on the selected categories -------------------------
	let discountableAmount = 0;
	for (const category of discountScope) {
		discountableAmount += categoryTotals[category];
	}

	let discountAmount = 0;
	if (discountableAmount > 0) {
		if (input.discountType === "percentage") {
			discountAmount = (discountableAmount * discountValue) / 100;
		} else {
			discountAmount = discountValue;
		}
	}

	const totalAfterDiscount = subtotal - discountAmount;

	// --- VAT: on the selected categories after their share of the discount --
	let vattableAmount = 0;
	for (const category of vatScope) {
		vattableAmount += categoryTotals[category];
	}

	let vattableAfterDiscount = 0;
	if (vattableAmount > 0) {
		if (discountableAmount > 0 && discountAmount > 0) {
			let vattableAndDiscountableTotal = 0;
			for (const category of vatScope) {
				if (discountScope.includes(category)) {
					vattableAndDiscountableTotal += categoryTotals[category];
				}
			}
			const vattableDiscount =
				(vattableAndDiscountableTotal / discountableAmount) * discountAmount;
			vattableAfterDiscount = vattableAmount - vattableDiscount;
		} else {
			vattableAfterDiscount = vattableAmount;
		}
	}

	const vatAmount =
		((vattableAfterDiscount + administrativeExpenses) * vatPercentage) / 100;

	const finalTotal = totalAfterDiscount + vatAmount + administrativeExpenses;

	return {
		services,
		drugs,
		supplies,
		tests,
		subtotal,
		discountableAmount,
		discountAmount,
		totalAfterDiscount,
		vattableAmount,
		vatAmount,
		administrativeExpenses,
		finalTotal,
	};
}

/** Rounds a money value to 2 decimals (matches `DECIMAL(15,2)` storage). */
export function roundMoney(value: unknown): number {
	const amount = toMoneyNumber(value);
	return Math.round(amount * 100) / 100;
}
