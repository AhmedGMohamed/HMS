// src/app/tests/models/ReportV2.patient.spec.ts
//
// Phase 6.11.1 — patient report. Covers the two-query list, the three-query
// detail, filters, sorting, paging, the half-open end-date window, the
// authoritative `Bill.total_amount`, item grouping by date, staff-day
// attachment and the national-ID derivation.

import PatientReportModel from "../../models/reports/PatientReport.model.js";
import { NotFoundError, parseSort } from "../../models/reports/shared.js";
import { parseEgyptianNationalId } from "../../utils/nationalId.js";
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

/** `YYYY-MM-DD HH:MM:SS` for a local calendar date. */
function localStamp(offsetDays: number, time = "10:00:00"): string {
	return `${localDate(offsetDays)} ${time}`;
}

const TODAY = localDate(0);
const RANGE_START = localDate(-30);
const RANGE_END = TODAY;

const SORT_DEFAULT = { column: "name", direction: "asc" as const, sql: "p.name ASC" };
const PAGING = { page: 1, pageSize: 25, offset: 0, limit: 25 };

interface Fixture {
	data: TestData;
	/** Patient with an active admission, a bill and staff assignments. */
	patientA: number;
	/** Patient discharged two days after admission, bill fully paid. */
	patientB: number;
	/** Insurance patient with an admission but no bill. */
	patientC: number;
	admissionA: number;
	admissionB: number;
	admissionC: number;
}

async function buildFixture(data: TestData): Promise<Fixture> {
	const patientA = data.patients[0].patient_id;
	const patientB = data.patients[1].patient_id;
	const patientC = data.patients[2].patient_id;

	// Deterministic identities: search needs a phone and a national id, and
	// the national id drives the derived birth date / age.
	await query(
		`UPDATE Patient SET national_id = $2, phone = $3 WHERE patient_id = $1`,
		[patientA, "29001011234567", "01000000001"]
	);
	await query(
		`UPDATE Patient SET national_id = $2, phone = $3 WHERE patient_id = $1`,
		[patientB, "29505051234562", "01000000002"]
	);

	// Admission windows. A is still admitted; B and C are discharged.
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = NULL,
		        bill_id = $3,
		        diagnosis = 'Pneumonia'
		  WHERE patient_history_id = $1`,
		[data.patientHistories[0].patient_history_id, localStamp(-3), data.bills[0].bill_id]
	);
	await query(
		`UPDATE PatientHistory
		    SET admission_time = $2::timestamp,
		        discharge_time = $3::timestamp,
		        bill_id = $4,
		        diagnosis = 'Observation'
		  WHERE patient_history_id = $1`,
		[
			data.patientHistories[1].patient_history_id,
			localStamp(-10, "09:00:00"),
			localStamp(-8, "12:00:00"),
			data.bills[1].bill_id,
		]
	);

	const admissionC = await query(
		`INSERT INTO PatientHistory
		     (patient_id, quick_check, diagnosis, admission_time, discharge_time)
		 VALUES ($1, false, 'Recovery', $2::timestamp, $3::timestamp)
		 RETURNING patient_history_id`,
		[patientC, localStamp(-20, "14:00:00"), localStamp(-18, "09:00:00")]
	);

	// Bill items spread over two dates so the per-date grouping is exercised.
	const details = await query(
		`SELECT bill_detail_id, bill_id, service_id
		   FROM BillDetail
		  ORDER BY bill_detail_id`
	);
	const billZeroLines = details.rows.filter((row) => row.bill_id === data.bills[0].bill_id);
	await query(
		`UPDATE BillDetail SET generated_at = $2::timestamp WHERE bill_detail_id = $1`,
		[billZeroLines[0].bill_detail_id, localStamp(-3, "10:05:00")]
	);
	await query(
		`UPDATE BillDetail SET generated_at = $2::timestamp WHERE bill_detail_id = $1`,
		[billZeroLines[1].bill_detail_id, localStamp(-1, "09:00:00")]
	);

	// Staff days: doctor + nurse on A's admission day, a 0-hour assignment on
	// the next day (must be dropped), and one day before A was even admitted
	// (inside the report range, outside the admission window).
	const doctorId = data.employees[0].employee_id;
	const nurseId = data.employees[2].employee_id;
	const otherNurseId = data.employees[3].employee_id;

	await query(
		`INSERT INTO DailyStaffAssignment (employee_id, patient_id, work_date, hours_worked)
		 VALUES ($1, $3, $4::date, 4.5),
		        ($2, $3, $4::date, 8),
		        ($5, $3, $6::date, 0),
		        ($2, $3, $7::date, 6),
		        ($2, $8, $9::date, 2)`,
		[
			doctorId,
			nurseId,
			patientA,
			localDate(-3),
			otherNurseId,
			localDate(-2),
			localDate(-30),
			patientC,
			localDate(-19),
		]
	);

	return {
		data,
		patientA,
		patientB,
		patientC,
		admissionA: data.patientHistories[0].patient_history_id,
		admissionB: data.patientHistories[1].patient_history_id,
		admissionC: admissionC.rows[0].patient_history_id,
	};
}

const RANGE = { startDate: RANGE_START, endDate: RANGE_END };

function listQuery(overrides: Partial<Parameters<typeof PatientReportModel.listPatients>[0]> = {}) {
	return {
		range: RANGE,
		paymentType: null,
		insuranceId: null,
		search: null,
		paging: PAGING,
		sort: SORT_DEFAULT,
		...overrides,
	};
}

/* ------------------------------------------------------------------ */
/* Specs                                                               */
/* ------------------------------------------------------------------ */

describe("Reports v2 — patient report", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		expect(process.env.NODE_ENV).toBe("test");
		await dbHelper.ensureReportV2Schema();
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		const data = await dbHelper.seedDatabase();
		fixture = await buildFixture(data);
	});

	/* -------------------------------------------------------------- */
	/* List                                                            */
	/* -------------------------------------------------------------- */

	describe("listPatients", () => {
		it("returns one row per patient with aggregated admissions in range", async () => {
			const result = await PatientReportModel.listPatients(listQuery());

			expect(result.total).toBe(3);
			expect(result.data.length).toBe(3);
			expect(result.page).toBe(1);
			expect(result.page_size).toBe(25);

			const names = result.data.map((row) => row.patient_name);
			expect(names).toEqual(["Bob Johnson", "John Patient", "Sarah Insurance"]);

			const john = result.data.find((row) => row.patient_id === fixture.patientA)!;
			expect(john.admissions_count).toBe(1);
			expect(john.has_active_admission).toBeTrue();
			expect(john.total_billed).toBe(1500);
			expect(john.total_paid).toBe(1000);
			expect(john.total_outstanding).toBe(500);
			expect(john.payment_type).toBe("cash");
			expect(john.referring_doctor_name).toBe("Dr. Sarah Johnson");

			const sarah = result.data.find((row) => row.patient_id === fixture.patientC)!;
			expect(sarah.payment_type).toBe("insurance");
			expect(sarah.insurance_company).toBe(
				fixture.data.insuranceCompanies[0].name
			);
			expect(sarah.insurance_card_id).toBe("INS123456");
			expect(sarah.total_billed).toBe(0);
			expect(sarah.total_outstanding).toBe(0);
		});

		it("summarizes the whole filtered set, not just the page", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({ paging: { page: 1, pageSize: 10, offset: 0, limit: 1 } })
			);

			expect(result.data.length).toBe(1);
			expect(result.total).toBe(3);
			expect(result.summary).toEqual({
				total_patients: 3,
				total_admissions: 3,
				total_billed: 2300,
				total_paid: 1800,
				total_outstanding: 500,
			});

			// The summary is the sum of the rows it describes.
			const all = await PatientReportModel.listPatients(listQuery());
			expect(result.summary.total_billed).toBe(
				all.data.reduce((sum, row) => sum + row.total_billed, 0)
			);
		});

		it("keeps the total when the requested page is past the end", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({ paging: { page: 5, pageSize: 10, offset: 40, limit: 10 } })
			);

			expect(result.data).toEqual([]);
			expect(result.total).toBe(3);
			expect(result.page).toBe(5);
		});

		it("includes an admission that happened on the end date", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({
					range: { startDate: localDate(-3), endDate: localDate(-3) },
				})
			);

			expect(result.data.map((row) => row.patient_id)).toEqual([fixture.patientA]);
			expect(result.total).toBe(1);
		});

		it("includes an admission late in the day on the end date", async () => {
			await query(
				`UPDATE PatientHistory SET admission_time = $2::timestamp WHERE patient_history_id = $1`,
				[fixture.admissionA, `${localDate(-3)} 23:30:00`]
			);

			const result = await PatientReportModel.listPatients(
				listQuery({
					range: { startDate: localDate(-3), endDate: localDate(-3) },
				})
			);

			expect(result.data.map((row) => row.patient_id)).toEqual([fixture.patientA]);
		});

		it("excludes admissions outside the range", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({
					range: { startDate: localDate(-12), endDate: localDate(-9) },
				})
			);

			expect(result.data.map((row) => row.patient_id)).toEqual([fixture.patientB]);
		});

		it("returns an empty report (and zeros) when nothing matches", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({
					range: { startDate: localDate(-200), endDate: localDate(-150) },
				})
			);

			expect(result.data).toEqual([]);
			expect(result.total).toBe(0);
			expect(result.summary).toEqual({
				total_patients: 0,
				total_admissions: 0,
				total_billed: 0,
				total_paid: 0,
				total_outstanding: 0,
			});
		});

		it("filters by payment type", async () => {
			const insurance = await PatientReportModel.listPatients(
				listQuery({ paymentType: "insurance" })
			);
			expect(insurance.data.map((row) => row.patient_id)).toEqual([fixture.patientC]);

			const cash = await PatientReportModel.listPatients(
				listQuery({ paymentType: "cash" })
			);
			expect(cash.data.map((row) => row.patient_id).sort()).toEqual(
				[fixture.patientA, fixture.patientB].sort()
			);
		});

		it("filters by insurance company", async () => {
			const companyId = fixture.data.insuranceCompanies[0].insurance_id;

			const matching = await PatientReportModel.listPatients(
				listQuery({ paymentType: "insurance", insuranceId: companyId })
			);
			expect(matching.data.map((row) => row.patient_id)).toEqual([fixture.patientC]);

			const other = await PatientReportModel.listPatients(
				listQuery({ paymentType: "insurance", insuranceId: companyId + 999 })
			);
			expect(other.data).toEqual([]);
		});

		it("searches by name, national id and phone", async () => {
			// "John Patient" rather than "John": "Bob Johnson" contains "John".
			const byName = await PatientReportModel.listPatients(
				listQuery({ search: "John Patient" })
			);
			expect(byName.data.map((row) => row.patient_id)).toEqual([fixture.patientA]);

			const byNationalId = await PatientReportModel.listPatients(
				listQuery({ search: "29505051234562" })
			);
			expect(byNationalId.data.map((row) => row.patient_id)).toEqual([
				fixture.patientB,
			]);

			const byPhone = await PatientReportModel.listPatients(
				listQuery({ search: "01000000002" })
			);
			expect(byPhone.data.map((row) => row.patient_id)).toEqual([fixture.patientB]);
		});

		it("derives age and birth date from the national id", async () => {
			const result = await PatientReportModel.listPatients(
				listQuery({ search: "John Patient" })
			);
			const john = result.data[0];

			expect(john.birth_date).toBe("1990-01-01");
			expect(typeof john.age).toBe("number");
			expect(john.age).toBeGreaterThanOrEqual(30);

			const sarah = (
				await PatientReportModel.listPatients(listQuery({ search: "Sarah" }))
			).data[0];
			expect(sarah.birth_date).toBeNull();
			expect(sarah.age).toBeNull();
		});

		it("sorts by every whitelisted column", async () => {
			const byBilled = await PatientReportModel.listPatients(
				listQuery({ sort: { column: "total_billed", direction: "desc", sql: "a.total_billed DESC" } })
			);
			expect(byBilled.data.map((row) => row.patient_id)).toEqual([
				fixture.patientA,
				fixture.patientB,
				fixture.patientC,
			]);

			const byOutstanding = await PatientReportModel.listPatients(
				listQuery({
					sort: {
						column: "outstanding",
						direction: "desc",
						sql: "(a.total_billed - a.total_paid) DESC",
					},
				})
			);
			expect(byOutstanding.data[0].patient_id).toBe(fixture.patientA);

			// Newest admission first: C (-20) is older than B (-10) and A (-3).
			const byLastAdmission = await PatientReportModel.listPatients(
				listQuery({
					sort: { column: "last_admission", direction: "desc", sql: "a.last_admission DESC" },
				})
			);
			expect(byLastAdmission.data.map((row) => row.patient_id)).toEqual([
				fixture.patientA,
				fixture.patientB,
				fixture.patientC,
			]);
		});

		it("rejects an unknown sort column instead of interpolating it", () => {
			expect(() =>
				parseSort({ sort: "p.name; DROP TABLE Bill" }, { name: "p.name" }, "name")
			).toThrowError(/sort must be one of name/);
		});
	});

	/* -------------------------------------------------------------- */
	/* Export                                                          */
	/* -------------------------------------------------------------- */

	describe("exportPatients", () => {
		it("returns every matching patient with the range and summary", async () => {
			const result = await PatientReportModel.exportPatients({
				range: RANGE,
				paymentType: null,
				insuranceId: null,
				search: null,
				sort: SORT_DEFAULT,
			});

			expect(result.range).toEqual({
				start_date: RANGE_START,
				end_date: RANGE_END,
			});
			expect(result.data.length).toBe(3);
			expect(result.summary.total_patients).toBe(3);
			expect(Number.isNaN(Date.parse(result.generated_at))).toBeFalse();
		});

		it("applies the same filters as the list", async () => {
			const result = await PatientReportModel.exportPatients({
				range: RANGE,
				paymentType: "cash",
				insuranceId: null,
				search: null,
				sort: SORT_DEFAULT,
			});

			expect(result.data.length).toBe(2);
			expect(result.summary.total_patients).toBe(2);
		});

		it("attaches every admission in range with its items and staff", async () => {
			const result = await PatientReportModel.exportPatients({
				range: RANGE,
				paymentType: null,
				insuranceId: null,
				search: null,
				sort: SORT_DEFAULT,
			});

			const rowA = result.data.find((row) => row.patient_id === fixture.patientA);
			expect(rowA).toBeDefined();
			expect(rowA!.admissions.length).toBe(1);

			const admission = rowA!.admissions[0];
			expect(admission.patient_history_id).toBe(fixture.admissionA);
			// Two service dates on the bill → two item groups.
			expect(admission.items_by_date.length).toBe(2);
			// Only the admission-day staff survives (the 0-hour row is dropped,
			// the day before admission is outside the stay window).
			expect(admission.daily_staff.length).toBe(1);
			expect(admission.daily_staff[0].doctors.length).toBe(1);
			expect(admission.daily_staff[0].nurses.length).toBe(1);

			// An admission with no bill is exported, not skipped.
			const rowC = result.data.find((row) => row.patient_id === fixture.patientC);
			expect(rowC).toBeDefined();
			expect(rowC!.admissions.length).toBe(1);
			expect(rowC!.admissions[0].bill_id).toBeNull();
		});

		it("keeps the exported aggregates equal to the attached admissions", async () => {
			const result = await PatientReportModel.exportPatients({
				range: RANGE,
				paymentType: null,
				insuranceId: null,
				search: null,
				sort: SORT_DEFAULT,
			});

			for (const row of result.data) {
				const billed = row.admissions.reduce(
					(sum, admission) => sum + admission.final_total,
					0
				);
				const paid = row.admissions.reduce(
					(sum, admission) => sum + admission.paid_amount,
					0
				);
				expect(row.admissions.length).toBe(row.admissions_count);
				expect(billed).toBe(row.total_billed);
				expect(paid).toBe(row.total_paid);
			}
		});

		it("does not attach admissions that fall outside the range", async () => {
			const result = await PatientReportModel.exportPatients({
				range: { startDate: localDate(-5), endDate: RANGE_END },
				paymentType: null,
				insuranceId: null,
				search: null,
				sort: SORT_DEFAULT,
			});

			// Only patient A's admission (-3) is inside this narrower window.
			expect(result.data.length).toBe(1);
			expect(result.data[0].patient_id).toBe(fixture.patientA);
			expect(result.data[0].admissions.length).toBe(1);
			expect(result.data[0].admissions[0].admission_time?.slice(0, 10)).toBe(
				localDate(-3)
			);
		});
	});

	/* -------------------------------------------------------------- */
	/* Detail                                                          */
	/* -------------------------------------------------------------- */

	describe("getPatientDetail", () => {
		it("returns the patient summary and every admission in range", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientA,
				RANGE
			);

			expect(detail.patient.patient_id).toBe(fixture.patientA);
			expect(detail.patient.admissions_count).toBe(1);
			expect(detail.patient.total_billed).toBe(1500);
			expect(detail.patient.total_paid).toBe(1000);
			expect(detail.patient.total_outstanding).toBe(500);
			expect(detail.patient.has_active_admission).toBeTrue();
			expect(detail.admissions.length).toBe(1);

			const admission = detail.admissions[0];
			expect(admission.patient_history_id).toBe(fixture.admissionA);
			expect(admission.bill_id).toBe(fixture.data.bills[0].bill_id);
			expect(admission.diagnosis).toBe("Pneumonia");
			expect(admission.discharge_time).toBeNull();
			expect(admission.length_of_stay_days).toBe(0);
		});

		it("keeps the stored bill total authoritative", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientA,
				RANGE
			);
			const admission = detail.admissions[0];

			// Item subtotal: ICU Care 1000 + Paracetamol 10 x 1.00 = 1010,
			// plus the bill's medical tests (120) = 1130.
			expect(admission.base_total).toBe(1130);
			expect(admission.medical_tests_amount).toBe(120);
			// 10% of 1130 = 113; VAT 5% on the billable base after the
			// discount share and the 50 admin expense = 53.35.
			expect(admission.calculated_discount).toBeCloseTo(113, 2);
			expect(admission.administrative_expenses).toBe(50);
			expect(admission.calculated_vat).toBeCloseTo(53.35, 2);
			// The stored total (1500) differs from the computed one (1130 -
			// 113 + 53.35 + 50 = 1120.35); `Bill.total_amount` wins because
			// it is what was billed.
			expect(admission.final_total).toBe(1500);
			expect(admission.paid_amount).toBe(1000);
			expect(admission.outstanding_amount).toBe(500);
		});

		it("groups billed items by date in category then name order", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientA,
				RANGE
			);
			const groups = detail.admissions[0].items_by_date;

			expect(groups.length).toBe(2);
			expect(groups[0].service_date).toBe(localDate(-3));
			expect(groups[0].items.length).toBe(1);
			expect(groups[0].items[0]).toEqual({
				item_type: "service",
				item_name: "ICU Care",
				quantity: 1,
				unit_price: 1000,
				total_price: 1000,
			});
			expect(groups[0].date_total).toBe(1000);

			expect(groups[1].service_date).toBe(localDate(-1));
			expect(groups[1].items[0]).toEqual({
				item_type: "drug",
				item_name: "Paracetamol",
				quantity: 10,
				unit_price: 1,
				total_price: 10,
			});
			expect(groups[1].date_total).toBe(10);
		});

		it("attaches staff days that fall inside the admission window", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientA,
				RANGE
			);
			const staff = detail.admissions[0].daily_staff;

			// The -2 (0 hours) and -30 (before admission) assignments are not
			// part of this admission.
			expect(staff.length).toBe(1);
			expect(staff[0].work_date).toBe(localDate(-3));
			expect(staff[0].doctors.length).toBe(1);
			expect(staff[0].doctors[0]).toEqual({
				employee_id: fixture.data.employees[0].employee_id,
				name: "Dr. John Smith",
				hours_worked: 4.5,
			});
			expect(staff[0].nurses.length).toBe(1);
			expect(staff[0].nurses[0]).toEqual({
				employee_id: fixture.data.employees[2].employee_id,
				name: "Nurse Mary Brown",
				hours_worked: 8,
			});
		});

		it("returns an admission with no bill as zero-valued rather than null", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientC,
				RANGE
			);

			expect(detail.admissions.length).toBe(1);
			const admission = detail.admissions[0];
			expect(admission.bill_id).toBeNull();
			expect(admission.base_total).toBe(0);
			expect(admission.final_total).toBe(0);
			expect(admission.paid_amount).toBe(0);
			expect(admission.outstanding_amount).toBe(0);
			expect(admission.items_by_date).toEqual([]);
			// The -19 nurse day belongs to this stay.
			expect(admission.daily_staff.length).toBe(1);
			expect(admission.daily_staff[0].nurses.length).toBe(1);
		});

		it("reports a patient with no admission in range as empty, not missing", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientB,
				{ startDate: localDate(-2), endDate: RANGE_END }
			);

			expect(detail.patient.patient_id).toBe(fixture.patientB);
			expect(detail.admissions).toEqual([]);
			expect(detail.patient.admissions_count).toBe(0);
			expect(detail.patient.total_billed).toBe(0);
		});

		it("reports the full stay length for a discharged admission", async () => {
			const detail = await PatientReportModel.getPatientDetail(
				fixture.patientB,
				RANGE
			);
			expect(detail.admissions[0].length_of_stay_days).toBe(2);
		});

		it("throws NotFoundError for an unknown patient", async () => {
			await expectAsync(
				PatientReportModel.getPatientDetail(999_999, RANGE)
			).toBeRejectedWithError(NotFoundError, /not found/);
		});
	});

	/* -------------------------------------------------------------- */
	/* National ID derivation                                          */
	/* -------------------------------------------------------------- */

	describe("parseEgyptianNationalId", () => {
		const today = new Date(2026, 9, 27); // 2026-10-27

		it("derives a 20th-century birth date and age", () => {
			expect(parseEgyptianNationalId("29001011234567", today)).toEqual({
				birthDate: "1990-01-01",
				age: 36,
			});
		});

		it("derives a 21st-century birth date", () => {
			expect(parseEgyptianNationalId("30506071234567", today)).toEqual({
				birthDate: "2005-06-07",
				age: 21,
			});
		});

		it("does not count a birthday that has not happened yet", () => {
			expect(parseEgyptianNationalId("29011011234567", today)?.age).toBe(35);
		});

		it("returns null for missing, short, non-numeric or impossible values", () => {
			expect(parseEgyptianNationalId(null, today)).toBeNull();
			expect(parseEgyptianNationalId("", today)).toBeNull();
			expect(parseEgyptianNationalId("290010", today)).toBeNull();
			expect(parseEgyptianNationalId("19001011234567", today)).toBeNull();
			expect(parseEgyptianNationalId("29013011234567", today)).toBeNull(); // month 13
			expect(parseEgyptianNationalId("29002301234567", today)).toBeNull(); // Feb 30
			expect(parseEgyptianNationalId("29A01011234567", today)).toBeNull();
		});
	});
});
