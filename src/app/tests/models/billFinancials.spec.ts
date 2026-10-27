// src/app/tests/models/billFinancials.spec.ts
//
// Phase 6.11 §3.4: the bill math lives in `calculateBillFinancials` and is
// used by both `Bill.model.recalculateTotal` and the Reports v2 aggregation.
// These are pure unit tests — no database — covering every branch of the
// legacy algorithm so a refactor cannot silently change bill totals.

import {
	BILL_CATEGORIES,
	calculateBillFinancials,
	normalizeScope,
	roundMoney,
	toMoneyNumber,
} from "../../utils/billFinancials.js";

const ALL_CATEGORIES = ["services", "drugs", "supplies", "tests"];

/** Base fixture: 1000 services + 500 drugs + 100 supplies + 200 tests. */
function baseInput(overrides: Record<string, unknown> = {}) {
	return {
		services: 1000,
		drugs: 500,
		supplies: 100,
		tests: 200,
		discount: 0,
		discountType: null as "fixed" | "percentage" | null,
		discountScope: ALL_CATEGORIES,
		vatPercentage: 0,
		vatScope: ALL_CATEGORIES,
		administrativeExpenses: 0,
		...overrides,
	};
}

describe("billFinancials (pure)", () => {
	describe("toMoneyNumber", () => {
		it("coerces Postgres NUMERIC strings and rejects garbage", () => {
			expect(toMoneyNumber("120.50")).toBe(120.5);
			expect(toMoneyNumber(42)).toBe(42);
			expect(toMoneyNumber(null)).toBe(0);
			expect(toMoneyNumber(undefined)).toBe(0);
			expect(toMoneyNumber("")).toBe(0);
			expect(toMoneyNumber("not-a-number")).toBe(0);
			expect(toMoneyNumber(Number.NaN)).toBe(0);
			expect(toMoneyNumber(Number.POSITIVE_INFINITY)).toBe(0);
		});
	});

	describe("normalizeScope", () => {
		it("expands null/empty scopes to every category (legacy default)", () => {
			expect(normalizeScope(null)).toEqual([...BILL_CATEGORIES]);
			expect(normalizeScope(undefined)).toEqual([...BILL_CATEGORIES]);
			expect(normalizeScope([])).toEqual([...BILL_CATEGORIES]);
		});

		it("drops unknown category names", () => {
			expect(normalizeScope(["services", "nonsense"])).toEqual(["services"]);
		});

		it("falls back to every category when only unknown names are given", () => {
			expect(normalizeScope(["nonsense"])).toEqual([...BILL_CATEGORIES]);
		});
	});

	describe("roundMoney", () => {
		it("rounds to two decimals", () => {
			expect(roundMoney(10.005)).toBe(10.01);
			expect(roundMoney("12.344")).toBe(12.34);
			expect(roundMoney(null)).toBe(0);
		});
	});

	describe("calculateBillFinancials", () => {
		it("returns the plain subtotal when nothing is configured", () => {
			const result = calculateBillFinancials(baseInput());
			expect(result.subtotal).toBe(1800);
			expect(result.discountAmount).toBe(0);
			expect(result.vatAmount).toBe(0);
			expect(result.finalTotal).toBe(1800);
		});

		it("exposes each category subtotal verbatim", () => {
			const result = calculateBillFinancials(baseInput());
			expect(result.services).toBe(1000);
			expect(result.drugs).toBe(500);
			expect(result.supplies).toBe(100);
			expect(result.tests).toBe(200);
		});

		it("applies a percentage discount across every category", () => {
			const result = calculateBillFinancials(
				baseInput({ discount: 10, discountType: "percentage" })
			);
			expect(result.discountableAmount).toBe(1800);
			expect(result.discountAmount).toBe(180);
			expect(result.totalAfterDiscount).toBe(1620);
			expect(result.finalTotal).toBe(1620);
		});

		it("applies VAT on the post-discount amount of every category", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					vatPercentage: 14,
				})
			);
			// (1800 - 180) * 14% = 226.8
			expect(result.vatAmount).toBeCloseTo(226.8, 6);
			expect(result.finalTotal).toBeCloseTo(1846.8, 6);
		});

		it("adds admin expenses to the total and charges VAT on them", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					vatPercentage: 14,
					administrativeExpenses: 50,
				})
			);
			// vatBase = 1620 + 50 = 1670 -> 233.8
			expect(result.vatAmount).toBeCloseTo(233.8, 6);
			expect(result.finalTotal).toBeCloseTo(1620 + 233.8 + 50, 6);
		});

		it("treats a fixed discount as an absolute amount", () => {
			const result = calculateBillFinancials(
				baseInput({ discount: 200, discountType: "fixed" })
			);
			expect(result.discountAmount).toBe(200);
			expect(result.finalTotal).toBe(1600);
		});

		it("treats a non-percentage discount type as fixed (legacy behaviour)", () => {
			const result = calculateBillFinancials(
				baseInput({ discount: 100, discountType: null })
			);
			expect(result.discountAmount).toBe(100);
		});

		it("scopes the discount to the selected categories only", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					discountScope: ["services"],
				})
			);
			// 10% of services (1000) only
			expect(result.discountableAmount).toBe(1000);
			expect(result.discountAmount).toBe(100);
			expect(result.finalTotal).toBe(1700);
		});

		it("ignores a fixed discount when the scoped base is zero", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 250,
					discountType: "fixed",
					discountScope: ["tests"],
					tests: 0,
				})
			);
			expect(result.discountableAmount).toBe(0);
			expect(result.discountAmount).toBe(0);
			expect(result.finalTotal).toBe(1600);
		});

		it("scopes VAT to the selected categories", () => {
			const result = calculateBillFinancials(
				baseInput({ vatPercentage: 14, vatScope: ["services"] })
			);
			expect(result.vattableAmount).toBe(1000);
			expect(result.vatAmount).toBeCloseTo(140, 6);
			expect(result.finalTotal).toBeCloseTo(1940, 6);
		});

		it("splits the discount proportionally across overlapping scopes", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					discountScope: ["services"],
					vatPercentage: 14,
					vatScope: ["services", "drugs"],
				})
			);
			// Discount 100 on services. VAT base 1500, overlap 1000, so the
			// vattable share of the discount is (1000/1000)*100 = 100.
			expect(result.vatAmount).toBeCloseTo((1500 - 100) * 0.14, 6);
			expect(result.finalTotal).toBeCloseTo(1700 + 196, 6);
		});

		it("does not apply the discount to non-overlapping VAT categories", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					discountScope: ["tests"],
					vatPercentage: 10,
					vatScope: ["services"],
				})
			);
			// Discount hits tests (200 -> 20). VAT scope has no overlap with
			// the discount scope, so services are taxed in full: 1000 * 10%.
			expect(result.discountAmount).toBe(20);
			expect(result.vatAmount).toBeCloseTo(100, 6);
			expect(result.finalTotal).toBeCloseTo(1780 + 100, 6);
		});

		it("treats null scopes as all categories", () => {
			const result = calculateBillFinancials(
				baseInput({
					discount: 10,
					discountType: "percentage",
					discountScope: null,
					vatPercentage: 14,
					vatScope: null,
				})
			);
			expect(result.discountAmount).toBe(180);
			expect(result.vatAmount).toBeCloseTo(226.8, 6);
		});

		it("never produces NaN for empty bills", () => {
			const result = calculateBillFinancials({
				services: 0,
				drugs: 0,
				supplies: 0,
				tests: 0,
				discount: 0,
				discountType: "percentage",
				discountScope: null,
				vatPercentage: 0,
				vatScope: null,
				administrativeExpenses: 0,
			});
			expect(result.subtotal).toBe(0);
			expect(Number.isNaN(result.finalTotal)).toBeFalse();
			expect(result.finalTotal).toBe(0);
		});

		it("coerces string inputs coming straight from Postgres", () => {
			// Postgres NUMERIC arrives as a string; the declared types say
			// `number`, so the cast mirrors what the models actually pass.
			const result = calculateBillFinancials({
				services: "1000.00",
				drugs: "500.00",
				supplies: "100.00",
				tests: "200.00",
				discount: "10.00",
				discountType: "percentage",
				discountScope: null,
				vatPercentage: "14.00",
				vatScope: null,
				administrativeExpenses: "50.00",
			} as unknown as Parameters<typeof calculateBillFinancials>[0]);
			expect(result.finalTotal).toBeCloseTo(1620 + 233.8 + 50, 6);
		});

		it("charges VAT on admin expenses even when every scope is empty", () => {
			const result = calculateBillFinancials({
				services: 0,
				drugs: 0,
				supplies: 0,
				tests: 0,
				discount: 0,
				discountType: null,
				discountScope: [],
				vatPercentage: 10,
				vatScope: [],
				administrativeExpenses: 300,
			});
			expect(result.vatAmount).toBeCloseTo(30, 6);
			expect(result.finalTotal).toBeCloseTo(330, 6);
		});
	});
});
