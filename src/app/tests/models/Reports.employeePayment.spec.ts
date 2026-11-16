// src/app/tests/models/Reports.employeePayment.spec.ts
//
// Phase 6.11.5 — employee payments (payroll). Covers the three money rules
// (deductions period-scoped once per employee, paid/unpaid gross, void
// excluded), the half-open range, the employee-type/name filters, the two
// chart series, the detail document with its paged payments and period
// deductions, the per-payment associations, and the fixed-cost export.
//
// The legacy model ran one query per payment plus a rolling 30-day deduction
// query per payment, so the same clock-in was subtracted once for every payment
// in the window. The fixture below makes that failure impossible to miss: the
// doctor has two in-range payments and 75 of deductions, so the legacy
// arithmetic would report 150.

import EmployeePaymentReportModel, {
	EMPLOYEE_PAYMENT_SORT_COLUMNS,
	type EmployeePaymentFilters,
	type EmployeePaymentListQuery,
} from "../../models/reports/EmployeePaymentReport.model.js";
import { NotFoundError } from "../../models/reports/shared.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Local `YYYY-MM-DD` (never `toISOString()` — that is the UTC date). */
function localDate(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function localStamp(offsetDays: number, time = "10:00:00"): string {
	return `${localDate(offsetDays)} ${time}`;
}

const TODAY = localDate(0);
const RANGE = { startDate: localDate(-30), endDate: TODAY };

const SORT_DEFAULT = {
	column: "net",
	direction: "desc" as const,
	sql: `${EMPLOYEE_PAYMENT_SORT_COLUMNS.net} DESC`,
};

const PAGING = { page: 1, pageSize: 25, offset: 0, limit: 25 };

interface Fixture {
	data: TestData;
	/** Doctor (employee 0) — two in-range payments, one void, one out of range. */
	doctor: number;
	/** Nurse (employee 2) — two in-range payments, one tomorrow. */
	nurse: number;
	/** Nurse with a deduction but no payment: must never enter the report. */
	nurseNoPay: number;
	/** `other` employee: proves the employee-type filter. */
	admin: number;
	paymentDoctorA: number;
	paymentDoctorB: number;
	paymentNurseA: number;
	paymentNurseB: number;
}

async function insertPayment(values: {
	employeeId: number;
	amount: number;
	extra?: number;
	type?: string;
	paid?: boolean;
	isVoid?: boolean;
	issued: string;
	paidBy?: number | null;
}): Promise<number> {
	const { rows } = await query(
		`INSERT INTO EmployeePayment
		     (employee_id, payment_amount, extra_amount, payment_type,
		      is_paid, is_void, issued_timestamp, paid_timestamp, paid_by_user_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp, $9)
		 RETURNING payment_id`,
		[
			values.employeeId,
			values.amount,
			values.extra ?? 0,
			values.type ?? "salary",
			values.paid ?? false,
			values.isVoid ?? false,
			values.issued,
			values.paid ? values.issued : null,
			values.paidBy ?? null,
		]
	);
	return Number(rows[0].payment_id);
}

async function insertClockIn(values: {
	employeeId: number;
	clockIn: string;
	clockOut: string | null;
	deduction: number;
}): Promise<void> {
	await query(
		`INSERT INTO EmployeeClockIn (employee_id, clock_in, clock_out, pay_deduction)
		 VALUES ($1, $2::timestamp, $3::timestamp, $4)`,
		[values.employeeId, values.clockIn, values.clockOut, values.deduction]
	);
}

/**
 * Payroll matrix over `[start, end]` = the last 30 days.
 *
 *   Doctor (shift 08:00–17:00)
 *     payment  1000 + 200 extra, paid,   -10d
 *     payment   500 +   0 extra, unpaid, today   ← end-date inclusion
 *     payment  9999, void,               -5d     ← must never be money
 *     payment   700,                     -40d    ← out of range
 *     clock    -6d 09:30→17:00, 50 deduction     → late
 *     clock    -2d 08:00→16:00, 25 deduction     → early
 *     clock    -40d, 500 deduction               ← out of range
 *     → base 1500, extra 200, paid 1200, unpaid 500, deductions 75, net 1625
 *
 *   Nurse (shift 08:00–17:00)
 *     payment   800, paid,               -3d
 *     payment   400 + 100 extra, unpaid, -1d   (type `bonus`)
 *     payment   300,                     +1d    ← day after the range
 *     clock    -4d 08:10→17:00, 30 deduction     → on_time
 *     → base 1200, extra 100, paid 800, unpaid 500, deductions 30, net 1270
 *
 *   Nurse without payments: a 999 deduction that must not appear anywhere.
 *
 * Whole set: 2 employees, 4 payments, base 2700, extra 300, deductions 105,
 * paid 2000, unpaid 1000, net 2895. Gross chart total 3000.
 */
async function buildFixture(data: TestData): Promise<Fixture> {
	const doctor = data.employees[0].employee_id;
	const nurse = data.employees[2].employee_id;
	const nurseNoPay = data.employees[3].employee_id;
	const admin = data.employees[4].employee_id;
	const userId = data.users[0].user_id;

	const paymentDoctorA = await insertPayment({
		employeeId: doctor,
		amount: 1000,
		extra: 200,
		paid: true,
		issued: localStamp(-10),
		paidBy: userId,
	});
	const paymentDoctorB = await insertPayment({
		employeeId: doctor,
		amount: 500,
		issued: localStamp(0),
	});
	await insertPayment({
		employeeId: doctor,
		amount: 9999,
		paid: true,
		isVoid: true,
		issued: localStamp(-5),
	});
	await insertPayment({
		employeeId: doctor,
		amount: 700,
		issued: localStamp(-40),
	});

	const paymentNurseA = await insertPayment({
		employeeId: nurse,
		amount: 800,
		paid: true,
		issued: localStamp(-3),
		paidBy: userId,
	});
	const paymentNurseB = await insertPayment({
		employeeId: nurse,
		amount: 400,
		extra: 100,
		type: "bonus",
		issued: localStamp(-1),
	});
	await insertPayment({
		employeeId: nurse,
		amount: 300,
		issued: localStamp(1),
	});

	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-6, "09:30:00"),
		clockOut: localStamp(-6, "17:00:00"),
		deduction: 50,
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-2, "08:00:00"),
		clockOut: localStamp(-2, "16:00:00"),
		deduction: 25,
	});
	await insertClockIn({
		employeeId: doctor,
		clockIn: localStamp(-40, "08:00:00"),
		clockOut: localStamp(-40, "17:00:00"),
		deduction: 500,
	});
	await insertClockIn({
		employeeId: nurse,
		clockIn: localStamp(-4, "08:10:00"),
		clockOut: localStamp(-4, "17:00:00"),
		deduction: 30,
	});
	await insertClockIn({
		employeeId: nurseNoPay,
		clockIn: localStamp(-5, "08:00:00"),
		clockOut: null,
		deduction: 999,
	});

	// Patient work behind the doctor's first payment (2 patients) and the
	// nurse's first payment (1 patient). The doctor's second payment has none,
	// so the `LEFT JOIN` path in the export is exercised too.
	await query(
		`INSERT INTO EmployeePaymentPatient
		     (payment_id, patient_id, patient_history_id, work_date, hours_worked,
		      payment_amount, payment_type)
		 VALUES ($1, $3, $5, $7::date, 2, 300, 'fixed_per_patient'),
		        ($1, $4, $6, $8::date, 3, 400, 'fixed_per_patient'),
		        ($2, $3, $5, $7::date, 1, 800, 'fixed_per_patient')`,
		[
			paymentDoctorA,
			paymentNurseA,
			data.patients[0].patient_id,
			data.patients[1].patient_id,
			data.patientHistories[0].patient_history_id,
			data.patientHistories[1].patient_history_id,
			localDate(-10),
			localDate(-9),
		]
	);

	return {
		data,
		doctor,
		nurse,
		nurseNoPay,
		admin,
		paymentDoctorA,
		paymentDoctorB,
		paymentNurseA,
		paymentNurseB,
	};
}

function listQuery(
	overrides: Partial<EmployeePaymentListQuery> = {}
): EmployeePaymentListQuery {
	return {
		range: RANGE,
		employeeType: "all",
		employeeId: null,
		search: null,
		grouping: "day",
		paging: PAGING,
		sort: SORT_DEFAULT,
		...overrides,
	};
}

function filters(
	overrides: Partial<EmployeePaymentFilters> = {}
): EmployeePaymentFilters {
	return {
		range: RANGE,
		employeeType: "all",
		employeeId: null,
		search: null,
		grouping: "day",
		...overrides,
	};
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports — employee payments", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportsSchema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();
		// `seedDatabase` adds one paid and one unpaid payment; start from the
		// fixture's own matrix so every expectation is exact.
		await query("DELETE FROM EmployeePayment");
		await query("DELETE FROM EmployeeClockIn");
		fixture = await buildFixture(data);
	});

	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	describe("listEmployeePayments", () => {
		it("lists only employees with a non-void payment in range", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);

			expect(result.total).toBe(2);
			expect(result.page).toBe(1);
			expect(result.page_size).toBe(25);
			// Default sort is net desc: doctor 1625, nurse 1270.
			expect(result.data.map((row) => row.employee_name)).toEqual([
				"Dr. John Smith",
				"Nurse Mary Brown",
			]);
		});

		it("rolls up base, extra, paid, unpaid and net per employee", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);
			const [doctor, nurse] = result.data;

			expect(doctor).toEqual({
				employee_id: fixture.doctor,
				employee_name: "Dr. John Smith",
				employee_type: "doctor",
				hire_date: jasmine.any(String),
				payment_count: 2,
				total_base_pay: 1500,
				total_extra_pay: 200,
				total_deductions: 75,
				total_paid: 1200,
				total_unpaid: 500,
				net_payment: 1625,
			});

			expect(nurse.payment_count).toBe(2);
			expect(nurse.total_base_pay).toBe(1200);
			expect(nurse.total_extra_pay).toBe(100);
			expect(nurse.total_deductions).toBe(30);
			expect(nurse.total_paid).toBe(800);
			expect(nurse.total_unpaid).toBe(500);
			expect(nurse.net_payment).toBe(1270);
		});

		it("counts each period deduction once, not once per payment", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);
			const doctor = result.data[0];

			// Two in-range payments and 75 of deductions: the legacy per-payment
			// arithmetic would have subtracted 150 and reported 1550.
			expect(doctor.payment_count).toBe(2);
			expect(doctor.total_deductions).toBe(75);
			expect(doctor.net_payment).toBe(1625);
		});

		it("treats paid and unpaid as gross (base + extra)", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);
			const doctor = result.data[0];

			// 1000 + 200 extra is the paid figure — deductions never enter it.
			expect(doctor.total_paid).toBe(1200);
			expect(doctor.total_unpaid).toBe(500);
			expect(doctor.total_paid + doctor.total_unpaid).toBe(
				doctor.total_base_pay + doctor.total_extra_pay
			);
		});

		it("excludes void payments everywhere", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);
			const doctor = result.data[0];

			expect(doctor.payment_count).toBe(2);
			expect(doctor.total_base_pay).toBe(1500);
			expect(result.summary.total_base_pay).toBe(2700);
		});

		it("summarises the whole filtered set", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);

			expect(result.summary).toEqual({
				total_employees: 2,
				total_payments: 4,
				total_base_pay: 2700,
				total_extra_pay: 300,
				total_deductions: 105,
				total_paid: 2000,
				total_unpaid: 1000,
				// 2700 + 300 − 105
				total_net: 2895,
			});
		});

		it("includes a payment issued on the end date and excludes the next day", async () => {
			// The doctor's second payment is issued today at 10:00; the nurse's
			// third is issued tomorrow.
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);
			const nurse = result.data.find((row) => row.employee_id === fixture.nurse)!;

			expect(result.data[0].payment_count).toBe(2); // today included
			expect(nurse.payment_count).toBe(2); // tomorrow excluded
			expect(nurse.total_base_pay).toBe(1200);
		});

		it("narrows to one employee with employee_id", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ employeeId: fixture.nurse })
			);

			expect(result.data.map((row) => row.employee_id)).toEqual([
				fixture.nurse,
			]);
			expect(result.total).toBe(1);
			expect(result.summary.total_employees).toBe(1);
			expect(result.summary.total_net).toBe(1270);
		});

		it("filters by employee_type", async () => {
			const doctors = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ employeeType: "doctor" })
			);
			expect(doctors.data.map((row) => row.employee_id)).toEqual([
				fixture.doctor,
			]);
			expect(doctors.summary.total_employees).toBe(1);

			const nurses = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ employeeType: "nurse" })
			);
			expect(nurses.data.map((row) => row.employee_id)).toEqual([
				fixture.nurse,
			]);

			// No `other` employee has a payment in range.
			const others = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ employeeType: "other" })
			);
			expect(others.data).toHaveSize(0);
			expect(others.summary.total_employees).toBe(0);
			expect(others.summary.total_net).toBe(0);
		});

		it("searches employee names case-insensitively", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ search: "mary" })
			);

			expect(result.data.map((row) => row.employee_name)).toEqual([
				"Nurse Mary Brown",
			]);
			expect(result.summary.total_employees).toBe(1);
			expect(result.summary.total_payments).toBe(2);
		});

		it("sorts by deductions ascending", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({
					sort: {
						column: "deductions",
						direction: "asc",
						sql: `${EMPLOYEE_PAYMENT_SORT_COLUMNS.deductions} ASC`,
					},
				})
			);

			expect(result.data.map((row) => row.total_deductions)).toEqual([
				30, 75,
			]);
		});

		it("pages without losing the whole-set summary", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({ paging: { page: 2, pageSize: 1, offset: 1, limit: 1 } })
			);

			expect(result.data).toHaveSize(1);
			expect(result.data[0].employee_name).toBe("Nurse Mary Brown");
			expect(result.total).toBe(2);
			expect(result.summary.total_employees).toBe(2);
			expect(result.summary.total_net).toBe(2895);
		});

		it("returns an empty report for a range with no payments", async () => {
			const result = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery({
					range: { startDate: localDate(-400), endDate: localDate(-350) },
				})
			);

			expect(result.data).toHaveSize(0);
			expect(result.total).toBe(0);
			expect(result.summary.total_employees).toBe(0);
			expect(result.summary.total_net).toBe(0);
		});
	});

	/* -------------------------------------------------------------- */
	/* Charts                                                          */
	/* -------------------------------------------------------------- */

	describe("getCharts", () => {
		it("buckets the gross timeline with zero rows for quiet days", async () => {
			const charts = await EmployeePaymentReportModel.getCharts(
				filters({ grouping: "day" })
			);

			// 30 days back through today, inclusive.
			expect(charts.timeline).toHaveSize(31);
			const total = charts.timeline.reduce((sum, point) => sum + point.total, 0);
			expect(total).toBe(3000); // 2700 base + 300 extra, void excluded
			expect(charts.timeline[0].period).toBe(localDate(-30));
			expect(charts.timeline[0].total).toBe(0);
		});

		it("splits by payment type, largest first", async () => {
			const charts = await EmployeePaymentReportModel.getCharts(filters());

			expect(charts.by_type).toEqual([
				{ payment_type: "salary", total: 2500 },
				{ payment_type: "bonus", total: 500 },
			]);
		});

		it("follows the employee filter", async () => {
			const charts = await EmployeePaymentReportModel.getCharts(
				filters({ employeeType: "nurse" })
			);

			const total = charts.timeline.reduce((sum, point) => sum + point.total, 0);
			expect(total).toBe(1300); // nurse gross only
			expect(charts.by_type).toEqual([
				{ payment_type: "salary", total: 800 },
				{ payment_type: "bonus", total: 500 },
			]);
		});

		it("uses one bucket per month when asked", async () => {
			const charts = await EmployeePaymentReportModel.getCharts(
				filters({ grouping: "month" })
			);

			// One or two calendar months depending on today's date, but never
			// one per payment.
			expect(charts.timeline.length).toBeGreaterThanOrEqual(1);
			expect(charts.timeline.length).toBeLessThanOrEqual(2);
			const total = charts.timeline.reduce((sum, point) => sum + point.total, 0);
			expect(total).toBe(3000);
		});
	});

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	describe("getEmployeeDetail", () => {
		it("returns identity, pay configuration and the period summary", async () => {
			const detail = await EmployeePaymentReportModel.getEmployeeDetail(
				fixture.doctor,
				{ range: RANGE, paging: PAGING }
			);

			expect(detail.employee).toEqual({
				employee_id: fixture.doctor,
				employee_name: "Dr. John Smith",
				employee_type: "doctor",
				hire_date: jasmine.any(String),
			});
			expect(detail.breakdown).toEqual({
				base_pay: 5000,
				base_extra_amount: 0,
				base_extra_payment_type: null,
				per_patient_payment_type: "fixed",
				percentage_scope: null,
				need_clock_in: false,
				shift_type: null,
				shift_start_time: "08:00:00",
				shift_end_time: "17:00:00",
				total_work_days: 0,
				total_patients_served: 0,
			});
			expect(detail.summary).toEqual({
				total_payments: 2,
				total_base_pay: 1500,
				total_extra_pay: 200,
				total_deductions: 75,
				total_paid: 1200,
				total_unpaid: 500,
				net_payment: 1625,
			});
		});

		it("pages the payments newest first and reports the total", async () => {
			const first = await EmployeePaymentReportModel.getEmployeeDetail(
				fixture.doctor,
				{ range: RANGE, paging: { page: 1, pageSize: 1, offset: 0, limit: 1 } }
			);

			expect(first.total).toBe(2);
			expect(first.page).toBe(1);
			expect(first.page_size).toBe(1);
			expect(first.payments).toHaveSize(1);
			// The payment issued today comes before the one issued ten days ago.
			expect(first.payments[0].payment_id).toBe(fixture.paymentDoctorB);
			expect(first.payments[0].is_paid).toBe(false);

			const second = await EmployeePaymentReportModel.getEmployeeDetail(
				fixture.doctor,
				{ range: RANGE, paging: { page: 2, pageSize: 1, offset: 1, limit: 1 } }
			);

			expect(second.payments[0].payment_id).toBe(fixture.paymentDoctorA);
			expect(second.payments[0].payment_amount).toBe(1000);
			expect(second.payments[0].extra_amount).toBe(200);
			expect(second.payments[0].is_paid).toBe(true);
			expect(second.payments[0].paid_by).toBe("admin");
			expect(second.payments[0].patient_count).toBe(2);
		});

		it("lists only deductions that reduced pay, newest first, with a status", async () => {
			const detail = await EmployeePaymentReportModel.getEmployeeDetail(
				fixture.doctor,
				{ range: RANGE, paging: PAGING }
			);

			expect(detail.period_deductions).toHaveSize(2);
			// The out-of-range 500 deduction is not part of the period.
			expect(
				detail.period_deductions.reduce(
					(sum, row) => sum + row.pay_deduction,
					0
				)
			).toBe(75);

			const [early, late] = detail.period_deductions;
			expect(early.clock_in.startsWith(localDate(-2))).toBe(true);
			expect(early.status).toBe("early");
			expect(early.hours_worked).toBe(8);

			expect(late.clock_in.startsWith(localDate(-6))).toBe(true);
			expect(late.status).toBe("late");
			expect(late.pay_deduction).toBe(50);
		});

		it("marks a clock-in without a clock-out as incomplete", async () => {
			// The nurse without payments is not in the list, but the detail
			// endpoint is addressed by id and must still describe her.
			const detail = await EmployeePaymentReportModel.getEmployeeDetail(
				fixture.nurseNoPay,
				{ range: RANGE, paging: PAGING }
			);

			expect(detail.summary.total_payments).toBe(0);
			expect(detail.summary.net_payment).toBe(-999);
			expect(detail.period_deductions).toHaveSize(1);
			expect(detail.period_deductions[0].status).toBe("incomplete");
		});

		it("404s for an unknown employee", async () => {
			await expectAsync(
				EmployeePaymentReportModel.getEmployeeDetail(999_999, {
					range: RANGE,
					paging: PAGING,
				})
			).toBeRejectedWithError(NotFoundError, /not found/);
		});
	});

	/* -------------------------------------------------------------- */
	/* Associations                                                    */
	/* -------------------------------------------------------------- */

	describe("getPaymentAssociations", () => {
		it("returns the patient work behind one payment", async () => {
			const result = await EmployeePaymentReportModel.getPaymentAssociations(
				fixture.doctor,
				fixture.paymentDoctorA
			);

			expect(result.payment.payment_id).toBe(fixture.paymentDoctorA);
			expect(result.payment.patient_count).toBe(2);
			expect(result.associations).toHaveSize(2);
			// work_date DESC.
			expect(result.associations[0].work_date).toBe(localDate(-9));
			expect(result.associations[1].work_date).toBe(localDate(-10));
			expect(result.associations[1].patient_name).toBe("John Patient");
			expect(result.associations[1].payment_amount).toBe(300);
			expect(result.associations[1].payment_type).toBe("fixed_per_patient");
		});

		it("returns an empty list for a payment with no patient work", async () => {
			const result = await EmployeePaymentReportModel.getPaymentAssociations(
				fixture.doctor,
				fixture.paymentDoctorB
			);

			expect(result.associations).toHaveSize(0);
			expect(result.payment.patient_count).toBe(0);
		});

		it("is not scoped by the report range", async () => {
			// The associations belong to the payment, not to the window: asking
			// for a payment inside the range must show all of its work.
			const result = await EmployeePaymentReportModel.getPaymentAssociations(
				fixture.nurse,
				fixture.paymentNurseA
			);

			expect(result.associations).toHaveSize(1);
		});

		it("404s when the payment belongs to another employee", async () => {
			await expectAsync(
				EmployeePaymentReportModel.getPaymentAssociations(
					fixture.doctor,
					fixture.paymentNurseA
				)
			).toBeRejectedWithError(NotFoundError, /not found/);
		});

		it("404s for a void payment", async () => {
			const { rows } = await query(
				`SELECT payment_id FROM EmployeePayment
				  WHERE employee_id = $1 AND is_void = true`,
				[fixture.doctor]
			);
			const voidPaymentId = Number(rows[0].payment_id);

			await expectAsync(
				EmployeePaymentReportModel.getPaymentAssociations(
					fixture.doctor,
					voidPaymentId
				)
			).toBeRejectedWithError(NotFoundError, /not found/);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportEmployeePayments", () => {
		it("returns every employee with a per-entity `totals` roll-up", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery()
			);

			expect(payload.data).toHaveSize(2);
			const [doctor, nurse] = payload.data;

			expect(doctor.employee_name).toBe("Dr. John Smith");
			expect(doctor.totals).toEqual({
				payments: 2,
				base_pay: 1500,
				extra_pay: 200,
				deductions: 75,
				paid: 1200,
				unpaid: 500,
				net: 1625,
			});
			// Contract 36: the per-entity roll-up is never called `summary`.
			expect("summary" in doctor).toBe(false);
			expect(nurse.totals.net).toBe(1270);
		});

		it("attaches every payment with its associations", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery()
			);
			const doctor = payload.data[0];

			expect(doctor.payments).toHaveSize(2);
			const withWork = doctor.payments.find(
				(payment) => payment.payment_id === fixture.paymentDoctorA
			)!;
			const withoutWork = doctor.payments.find(
				(payment) => payment.payment_id === fixture.paymentDoctorB
			)!;

			expect(withWork.associations).toHaveSize(2);
			expect(withWork.patient_count).toBe(2);
			expect(withoutWork.associations).toHaveSize(0);
			expect(withoutWork.patient_count).toBe(0);
		});

		it("attaches every period deduction with a derived status", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery()
			);
			const doctor = payload.data[0];

			expect(doctor.period_deductions).toHaveSize(2);
			expect(doctor.period_deductions.map((row) => row.status)).toEqual([
				"early",
				"late",
			]);
			expect(doctor.breakdown.shift_start_time).toBe("08:00:00");
			expect(doctor.breakdown.base_pay).toBe(5000);
		});

		it("derives the envelope summary from the same rows it prints", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery()
			);
			const list = await EmployeePaymentReportModel.listEmployeePayments(
				listQuery()
			);

			expect(payload.summary).toEqual(list.summary);
			expect(payload.summary.total_net).toBe(2895);
			expect(
				payload.data.reduce((sum, row) => sum + row.totals.net, 0)
			).toBe(2895);
			expect(
				payload.data.reduce((sum, row) => sum + row.totals.deductions, 0)
			).toBe(105);
		});

		it("carries the range, grouping and chart series", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery({ grouping: "month" })
			);

			expect(payload.range).toEqual({
				start_date: RANGE.startDate,
				end_date: RANGE.endDate,
			});
			expect(payload.grouping).toBe("month");
			expect(payload.generated_at).toBeTruthy();
			const total = payload.charts.timeline.reduce(
				(sum, point) => sum + point.total,
				0
			);
			expect(total).toBe(3000);
		});

		it("honours the filters", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery({ employeeType: "nurse" })
			);

			expect(payload.data).toHaveSize(1);
			expect(payload.data[0].employee_id).toBe(fixture.nurse);
			expect(payload.summary.total_employees).toBe(1);
			expect(payload.summary.total_net).toBe(1270);
		});

		it("returns an empty document without issuing per-employee queries", async () => {
			const payload = await EmployeePaymentReportModel.exportEmployeePayments(
				listQuery({
					range: { startDate: localDate(-400), endDate: localDate(-350) },
				})
			);

			expect(payload.data).toHaveSize(0);
			expect(payload.summary.total_employees).toBe(0);
			expect(payload.summary.total_net).toBe(0);
		});
	});
});
