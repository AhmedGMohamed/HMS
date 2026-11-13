// src/app/tests/models/Reports.statistics.spec.ts
//
// Phase 6.11.4 — statistics report. Covers the seven series the tab renders:
// generated buckets (including the quiet ones), census vs admissions,
// discharges/average stay, revenue with the end date included, the 2-D
// distribution, top services/drugs by revenue, staff utilization and the
// export envelope.

import StatisticsReportModel, {
	type StatisticsFilters,
} from "../../models/reports/StatisticsReport.model.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const RANGE = { startDate: "2026-01-01", endDate: "2026-03-31" };

const DAY_FILTERS: StatisticsFilters = { range: RANGE, grouping: "day" };
const MONTH_FILTERS: StatisticsFilters = { range: RANGE, grouping: "month" };
const YEAR_FILTERS: StatisticsFilters = { range: RANGE, grouping: "year" };

interface Fixture {
	data: TestData;
	/** Patients with a history in the range. */
	john: number;
	bob: number;
	sarah: number;
	/** April admission — one day past `RANGE.endDate`. */
	outside: number;
	nurse: number;
	doctor: number;
}

/**
 * A fixed quarter: `2026-01-01 … 2026-03-31`, so every expectation is a
 * literal rather than "however many days ago today is".
 *
 * Histories
 *   John   admitted 2026-01-10 08:00, **still in the ward**
 *   Bob    admitted 2026-02-05 09:00, discharged 2026-02-15 09:00 (10 days)
 *   Sarah  admitted 2026-03-31 23:00 (the last hour of the range)
 *   outside admitted 2026-04-01 00:30 — one hour after the range ends
 *
 * Bills (generated 2026-02-10, so only February has revenue)
 *   bill 1  1500 billed / 1000 paid
 *   bill 2   800 billed /  800 paid
 *
 * Bill detail (same timestamp)
 *   ICU Care      1 × 1000   → top service
 *   Paracetamol  10 × 1      → top drug
 *   Medical Check 1 × 100
 */
async function buildFixture(data: TestData): Promise<Fixture> {
	const john = data.patients[0].patient_id;
	const bob = data.patients[1].patient_id;
	const sarah = data.patients[2].patient_id;

	await query(
		`UPDATE PatientHistory
		    SET admission_time = '2026-01-10 08:00:00',
		        discharge_time = NULL,
		        diagnosis = 'Pneumonia'
		  WHERE patient_history_id = $1`,
		[data.patientHistories[0].patient_history_id]
	);

	await query(
		`UPDATE PatientHistory
		    SET admission_time = '2026-02-05 09:00:00',
		        discharge_time = '2026-02-15 09:00:00',
		        diagnosis = 'Fracture'
		  WHERE patient_history_id = $1`,
		[data.patientHistories[1].patient_history_id]
	);

	// Sarah: two admissions straddling the end boundary.
	await query(
		`INSERT INTO PatientHistory
		     (patient_id, quick_check, diagnosis, admission_time, discharge_time)
		 VALUES ($1, false, 'Observation', '2026-03-31 23:00:00', NULL),
		        ($1, false, 'Follow-up',   '2026-04-01 00:30:00', NULL)`,
		[sarah]
	);

	// Only February has revenue.
	await query(
		`UPDATE Bill SET generated_at = '2026-02-10 12:00:00'`
	);
	await query(
		`UPDATE BillDetail SET generated_at = '2026-02-10 12:00:00'`
	);

	const nurse = data.employees[2].employee_id;
	const doctor = data.doctors[0].doctor_id;

	await query(
		`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
		 VALUES ($1, $3, '2026-02-01', 2),
		        ($1, $3, '2026-02-02', 3),
		        ($2, $4, '2026-02-03', 4),
		        -- outside the range: must not appear in any roll-up
		        ($1, $3, '2026-04-05', 9)`,
		[nurse, doctor, john, bob]
	);

	return { data, john, bob, sarah, outside: 0, nurse, doctor };
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports — statistics report", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportsSchema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();
		fixture = await buildFixture(data);
	});

	/* -------------------------------------------------------------- */
	/* Buckets                                                         */
	/* -------------------------------------------------------------- */

	describe("buckets", () => {
		it("generates every day in the range, quiet ones included", async () => {
			const report = await StatisticsReportModel.getStatistics(DAY_FILTERS);

			// 2026-01-01 … 2026-03-31 inclusive = 90 days.
			expect(report.patient_census).toHaveSize(90);
			expect(report.patient_census[0].period).toBe("2026-01-01");
			expect(report.patient_census[89].period).toBe("2026-03-31");
			expect(report.range.grouping).toBe("day");
		});

		it("aligns month buckets to calendar months, not to the start day", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);

			expect(report.patient_census.map((point) => point.period)).toEqual([
				"2026-01",
				"2026-02",
				"2026-03",
			]);
			expect(report.revenue_trends.map((point) => point.period)).toEqual([
				"2026-01",
				"2026-02",
				"2026-03",
			]);
		});

		it("collapses a quarter into one year bucket", async () => {
			const report = await StatisticsReportModel.getStatistics(YEAR_FILTERS);

			expect(report.patient_census).toHaveSize(1);
			expect(report.patient_census[0].period).toBe("2026");
			expect(report.patient_census[0].year).toBe(2026);
		});

		it("truncates a partial month to the same single bucket", async () => {
			const report = await StatisticsReportModel.getStatistics({
				range: { startDate: "2026-02-10", endDate: "2026-02-20" },
				grouping: "month",
			});

			expect(report.patient_census.map((point) => point.period)).toEqual(["2026-02"]);
		});
	});

	/* -------------------------------------------------------------- */
	/* Census / admissions / discharges                                 */
	/* -------------------------------------------------------------- */

	describe("patient flow", () => {
		it("counts patients present in the bucket, not only new admissions", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const [january, february, march] = report.patient_census;

			// John was admitted in January and never discharged.
			expect(january.census).toBe(1);
			expect(january.admissions).toBe(1);

			// Bob joins in February; both are in the ward.
			expect(february.census).toBe(2);
			expect(february.admissions).toBe(1);

			// Bob left on the 15th, so John and Sarah are in the ward.
			expect(march.census).toBe(2);
			// Sarah's 23:00 admission is inside the range; the 00:30 April one
			// is not.
			expect(march.admissions).toBe(1);
		});

		it("counts the end date itself and excludes the next day", async () => {
			const report = await StatisticsReportModel.getStatistics({
				range: { startDate: "2026-03-31", endDate: "2026-03-31" },
				grouping: "day",
			});

			expect(report.patient_census).toHaveSize(1);
			expect(report.kpis.total_admissions).toBe(1);
			expect(report.kpis.total_patients).toBe(1);
			// John (admitted in January, still in) + Sarah.
			expect(report.patient_census[0].census).toBe(2);
		});

		it("reports admissions, discharges and the net change per bucket", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const [january, february, march] = report.admission_discharge;

			expect([january.admissions, january.discharges, january.net_change]).toEqual([
				1, 0, 1,
			]);
			expect([february.admissions, february.discharges, february.net_change]).toEqual([
				1, 1, 0,
			]);
			expect([march.admissions, march.discharges, march.net_change]).toEqual([
				1, 0, 1,
			]);
		});

		it("averages only the stays discharged in the bucket", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const [january, february, march] = report.average_stay;

			expect([january.discharges, january.avg_stay_days]).toEqual([0, 0]);
			expect(february.discharges).toBe(1);
			expect(february.avg_stay_days).toBeCloseTo(10, 2);
			// March has no discharges, so it reports 0 rather than a 0-day
			// average of nothing.
			expect([march.discharges, march.avg_stay_days]).toEqual([0, 0]);
		});
	});

	/* -------------------------------------------------------------- */
	/* KPIs                                                            */
	/* -------------------------------------------------------------- */

	describe("kpis", () => {
		it("summarises the whole range", async () => {
			const { kpis } = await StatisticsReportModel.getStatistics(MONTH_FILTERS);

			expect(kpis.total_patients).toBe(3);
			expect(kpis.total_admissions).toBe(3);
			expect(kpis.total_discharges).toBe(1);
			expect(kpis.avg_stay_days).toBeCloseTo(10, 2);
			expect(kpis.total_billed).toBe(2300);
			expect(kpis.total_collected).toBe(1800);
			expect(kpis.total_outstanding).toBe(500);
		});

		it("returns zeros for a range with no activity", async () => {
			const { kpis, patient_census } = await StatisticsReportModel.getStatistics({
				range: { startDate: "2025-01-01", endDate: "2025-01-31" },
				grouping: "day",
			});

			expect(patient_census).toHaveSize(31);
			expect([patient_census[0].census, patient_census[0].admissions]).toEqual([0, 0]);
			expect(kpis).toEqual({
				total_patients: 0,
				total_admissions: 0,
				total_discharges: 0,
				avg_stay_days: 0,
				total_billed: 0,
				total_collected: 0,
				total_outstanding: 0,
			});
		});
	});

	/* -------------------------------------------------------------- */
	/* Revenue                                                         */
	/* -------------------------------------------------------------- */

	describe("revenue trends", () => {
		it("puts each bill in its own bucket and zeroes the others", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const [january, february, march] = report.revenue_trends;

			expect([
				january.billed,
				january.collected,
				january.outstanding,
				january.bill_count,
				january.avg_bill_amount,
			]).toEqual([0, 0, 0, 0, 0]);

			expect([
				february.billed,
				february.collected,
				february.outstanding,
				february.bill_count,
				february.avg_bill_amount,
			]).toEqual([2300, 1800, 500, 2, 1150]);

			expect(march.billed).toBe(0);
		});

		it("includes a bill generated on the last day of the range", async () => {
			await query(
				`INSERT INTO Bill (patient_id, total_amount, paid_amount, generated_at)
				 VALUES ($1, 100, 25, '2026-03-31 23:30:00')`,
				[fixture.john]
			);

			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			expect([
				report.revenue_trends[2].billed,
				report.revenue_trends[2].collected,
			]).toEqual([100, 25]);
			expect(report.kpis.total_billed).toBe(2400);
		});
	});

	/* -------------------------------------------------------------- */
	/* Distribution                                                    */
	/* -------------------------------------------------------------- */

	describe("distribution", () => {
		it("splits admissions by payment type and gender", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);

			// John and Bob are cash/male; Sarah is insurance/female.
			expect(report.distribution.payment_type).toEqual([
				{ key: "cash", count: 2 },
				{ key: "insurance", count: 1 },
			]);
			expect(report.distribution.gender).toEqual([
				{ key: "male", count: 2 },
				{ key: "female", count: 1 },
			]);
		});

		it("returns empty arrays when nothing was admitted", async () => {
			const report = await StatisticsReportModel.getStatistics({
				range: { startDate: "2025-01-01", endDate: "2025-01-31" },
				grouping: "day",
			});

			expect(report.distribution.payment_type).toEqual([]);
			expect(report.distribution.gender).toEqual([]);
		});
	});

	/* -------------------------------------------------------------- */
	/* Top N                                                           */
	/* -------------------------------------------------------------- */

	describe("top services and drugs", () => {
		it("orders services by revenue and counts usage", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);

			expect(report.top_services.map((row) => row.service_name)).toEqual([
				"ICU Care",
				"Medical Check",
			]);
			expect(report.top_services[0]).toEqual({
				service_id: report.top_services[0].service_id,
				service_name: "ICU Care",
				service_type: "daily",
				usage_count: 1,
				total_quantity: 1,
				total_revenue: 1000,
			});
		});

		it("orders drugs by revenue through the shipment join", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);

			expect(report.top_drugs.map((row) => row.drug_name)).toEqual(["Paracetamol"]);
			expect(report.top_drugs[0]).toEqual({
				drug_id: report.top_drugs[0].drug_id,
				drug_name: "Paracetamol",
				manufacturer: "PharmaCo",
				usage_count: 1,
				total_quantity: 10,
				total_revenue: 10,
			});
		});

		it("leaves both lists empty outside the range", async () => {
			const report = await StatisticsReportModel.getStatistics({
				range: { startDate: "2025-01-01", endDate: "2025-01-31" },
				grouping: "day",
			});

			expect(report.top_services).toEqual([]);
			expect(report.top_drugs).toEqual([]);
		});
	});

	/* -------------------------------------------------------------- */
	/* Staff utilization                                               */
	/* -------------------------------------------------------------- */

	describe("staff utilization", () => {
		it("rolls up assignments per employee type", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const byType = Object.fromEntries(
				report.staff_utilization.map((row) => [row.employee_type, row])
			);

			expect(byType.nurse).toEqual({
				employee_type: "nurse",
				staff_count: 1,
				patients_served: 1,
				avg_hours_per_assignment: 2.5,
				total_hours_worked: 5,
				avg_patients_per_staff: 1,
			});
			expect(byType.doctor).toEqual({
				employee_type: "doctor",
				staff_count: 1,
				patients_served: 1,
				avg_hours_per_assignment: 4,
				total_hours_worked: 4,
				avg_patients_per_staff: 1,
			});
		});

		it("excludes assignments outside the range", async () => {
			const report = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const nurse = report.staff_utilization.find(
				(row) => row.employee_type === "nurse"
			);

			// The April 5th row (9 hours) must not be counted.
			expect(nurse?.total_hours_worked).toBe(5);
		});

		it("does not divide by zero for a quiet range", async () => {
			const report = await StatisticsReportModel.getStatistics({
				range: { startDate: "2025-01-01", endDate: "2025-01-31" },
				grouping: "day",
			});

			expect(report.staff_utilization).toEqual([]);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportStatistics", () => {
		it("returns the report document plus generated_at", async () => {
			const payload = await StatisticsReportModel.exportStatistics(MONTH_FILTERS);

			expect(Object.keys(payload)).toEqual([
				"generated_at",
				"range",
				"kpis",
				"patient_census",
				"distribution",
				"average_stay",
				"revenue_trends",
				"admission_discharge",
				"top_services",
				"top_drugs",
				"staff_utilization",
			]);
			expect(new Date(payload.generated_at).getTime()).toBeGreaterThan(0);
			expect(payload.kpis.total_billed).toBe(2300);
		});

		it("matches the on-screen report exactly", async () => {
			const view = await StatisticsReportModel.getStatistics(MONTH_FILTERS);
			const exported = await StatisticsReportModel.exportStatistics(MONTH_FILTERS);

			const { generated_at: _ignored, ...rest } = exported;
			expect(rest).toEqual(view);
		});
	});
});
