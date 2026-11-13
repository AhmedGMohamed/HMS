/**
 * Reports controller — Phase 6.11.
 *
 * Thin by design: validates/parses query params (via the shared helpers in
 * `models/reports/shared.ts`), calls one model method, and shapes the
 * response. All SQL lives in the models. Route-level middleware already
 * enforced authentication + permissions, so the only permission logic here
 * is the payroll employee list, which is filtered rather than rejected.
 *
 * Error contract (plan §3.2):
 *   400 `{ error }` for validation problems (`ReportValidationError`)
 *   404 `{ error }` for unknown ids
 *   500 `{ error }` for everything else (real error logged server-side)
 *
 * The legacy `/api/reports/*` controller/model are untouched and keep
 * serving the legacy HTML page until Phase 7.
 */

import { Request, Response } from "express";

import { isPrivilegedRole } from "../utils/roles.js";
import OptionsReportModel from "../models/reports/OptionsReport.model.js";
import DoctorReportModel, {
	DOCTOR_PATIENT_SORT_COLUMNS,
	DOCTOR_SORT_COLUMNS,
} from "../models/reports/DoctorReport.model.js";
import NurseReportModel, {
	NURSE_PATIENT_SORT_COLUMNS,
	NURSE_SORT_COLUMNS,
} from "../models/reports/NurseReport.model.js";
import PatientReportModel, {
	PATIENT_SORT_COLUMNS,
} from "../models/reports/PatientReport.model.js";
import EmployeePaymentReportModel, {
	EMPLOYEE_PAYMENT_GROUPINGS,
	EMPLOYEE_PAYMENT_SORT_COLUMNS,
	EMPLOYEE_PAYMENT_TYPE_FILTERS,
	type EmployeePaymentGrouping,
} from "../models/reports/EmployeePaymentReport.model.js";
import StatisticsReportModel, {
	STATISTICS_GROUPINGS,
	type StatisticsGrouping,
} from "../models/reports/StatisticsReport.model.js";
import ClockInReportModel, {
	CLOCK_IN_SORT_KEYS,
	CLOCK_IN_STATUS_FILTERS,
	CLOCK_IN_TYPE_FILTERS,
	type ClockInSortKey,
	type ClockInStatusFilter,
} from "../models/reports/ClockInReport.model.js";
import {
	NotFoundError,
	ReportValidationError,
	parseBooleanParam,
	parseDateRange,
	parseEnumParam,
	parseOptionalId,
	parsePaging,
	parseRequiredId,
	parseSearch,
	parseSort,
} from "../models/reports/shared.js";

export { NotFoundError };

/** Privileged-role bypass mirrors `auth.middleware.checkPermissions`. */
export function userHasPermission(req: Request, permission: string): boolean {
	if (!req.user) return false;
	if (isPrivilegedRole(req.user.role)) return true;
	return req.user.permissions.includes(permission);
}

/** Privileged-role bypass for an "all of these" check. */
export function userHasAllPermissions(
	req: Request,
	permissions: string[]
): boolean {
	if (!req.user) return false;
	if (isPrivilegedRole(req.user.role)) return true;
	return permissions.every((permission) =>
		req.user!.permissions.includes(permission)
	);
}

/** Standard 400/404/500 translation for a thrown model error. */
export function sendError(
	res: Response,
	error: unknown,
	context: string,
	notFoundMessage?: string
): void {
	if (error instanceof ReportValidationError) {
		res.status(400).json({ error: error.message });
		return;
	}
	if (notFoundMessage && error instanceof NotFoundError) {
		res.status(404).json({ error: notFoundMessage });
		return;
	}
	console.error(`Error ${context}:`, error);
	res.status(500).json({ error: `Failed to ${context}` });
}

/**
 * Plan §3.7: exports are uncapped, so a huge report is allowed — it is just
 * logged, and the client shows the same warning from `ReportShell`.
 *
 * This is the only server-side signal that an export was unusually expensive:
 * the response itself carries no marker, because the document is the response.
 */
export const EXPORT_ROW_WARNING_THRESHOLD = 5000;

export function warnIfLargeExport(label: string, rowCount: number): void {
	if (!Number.isFinite(rowCount) || rowCount <= EXPORT_ROW_WARNING_THRESHOLD) {
		return;
	}
	console.warn(
		`Large report export: ${label} returned ${rowCount} rows ` +
			`(threshold ${EXPORT_ROW_WARNING_THRESHOLD}).`
	);
}

/** Total table rows a statistics document lays out (it has no single total). */
export function countStatisticsExportRows(payload: {
	patient_census: unknown[];
	revenue_trends: unknown[];
	admission_discharge: unknown[];
	average_stay: unknown[];
	top_services: unknown[];
	top_drugs: unknown[];
	staff_utilization: unknown[];
}): number {
	return (
		payload.patient_census.length +
		payload.revenue_trends.length +
		payload.admission_discharge.length +
		payload.average_stay.length +
		payload.top_services.length +
		payload.top_drugs.length +
		payload.staff_utilization.length
	);
}

export class ReportsController {
	/**
	 * `GET /api/reports/options`
	 *
	 * Picker lists for every tab. The payroll list is only populated when the
	 * caller also holds `manage_employees` — the payroll endpoints enforce the
	 * same pair, so a report-only user never sees employee names here.
	 */
	async getOptions(req: Request, res: Response) {
		try {
			const includePayroll = userHasPermission(req, "manage_employees");
			const options = await OptionsReportModel.getOptions(includePayroll);
			res.status(200).json(options);
		} catch (error) {
			sendError(res, error, "load report options");
		}
	}

	/* -------------------------------------------------------------- */
	/* Patient report                                                  */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/patients`
	 *
	 * Query: `start_date`, `end_date`, `payment_type`, `insurance_id`,
	 * `search`, `page`, `page_size`, `sort`, `dir`.
	 */
	async listPatients(req: Request, res: Response) {
		try {
			const filters = parsePatientFilters(req.query);
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, PATIENT_SORT_COLUMNS, "name");

			const payload = await PatientReportModel.listPatients({
				...filters,
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load patient report");
		}
	}

	/**
	 * `GET /api/reports/patients/:patientId`
	 *
	 * Returns the patient summary plus every admission in range, each with its
	 * items grouped by date and its daily staff assignments.
	 */
	async getPatient(req: Request, res: Response) {
		try {
			const patientId = parseRequiredId(req.params.patientId, "patientId");
			const range = parseDateRange(req.query);

			const payload = await PatientReportModel.getPatientDetail(
				patientId,
				range
			);
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load patient report details",
				"Patient not found"
			);
		}
	}

	/**
	 * `GET /api/reports/patients/export`
	 *
	 * Same filters as the list, no paging — the PDF/CSV data source.
	 */
	async exportPatients(req: Request, res: Response) {
		try {
			const filters = parsePatientFilters(req.query);
			const sort = parseSort(req.query, PATIENT_SORT_COLUMNS, "name");

			const payload = await PatientReportModel.exportPatients({
				...filters,
				sort,
			});
			warnIfLargeExport("patients", payload.data.length);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export patient report");
		}
	}

	/* -------------------------------------------------------------- */
	/* Doctor report                                                   */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/doctors`
	 *
	 * Query: `start_date`, `end_date`, `relationship`, `doctor_id`, `search`,
	 * `page`, `page_size`, `sort`, `dir`.
	 */
	async listDoctors(req: Request, res: Response) {
		try {
			const filters = parseDoctorFilters(req.query);
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, DOCTOR_SORT_COLUMNS, "name");

			const payload = await DoctorReportModel.listDoctors({
				...filters,
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load doctor report");
		}
	}

	/**
	 * `GET /api/reports/doctors/:doctorId`
	 *
	 * The doctor's header + summary and one page of their patients. `search`
	 * narrows the patients by name (the doctor is already fixed by the route).
	 */
	async getDoctor(req: Request, res: Response) {
		try {
			const doctorId = parseRequiredId(req.params.doctorId, "doctorId");
			const range = parseDateRange(req.query);
			const relationship =
				parseEnumParam(
					req.query.relationship,
					DOCTOR_RELATIONSHIPS,
					"relationship",
					"referred"
				) ?? "referred";
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, DOCTOR_PATIENT_SORT_COLUMNS, "name");

			const payload = await DoctorReportModel.getDoctorDetail(doctorId, {
				range,
				relationship,
				search: parseSearch(req.query),
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load doctor report details",
				"Doctor not found"
			);
		}
	}

	/**
	 * `GET /api/reports/doctors/export`
	 *
	 * Same filters as the list, no paging. `include_admissions` only has an
	 * effect together with `doctor_id` (the single-doctor document).
	 */
	async exportDoctors(req: Request, res: Response) {
		try {
			const filters = parseDoctorFilters(req.query);
			const sort = parseSort(req.query, DOCTOR_SORT_COLUMNS, "name");
			const includeAdmissions = parseBooleanParam(
				req.query.include_admissions,
				false
			);

			const payload = await DoctorReportModel.exportDoctors({
				...filters,
				sort,
				includeAdmissions,
			});
			warnIfLargeExport("doctors", payload.data.length);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export doctor report");
		}
	}

	/* -------------------------------------------------------------- */
	/* Nurse report                                                    */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/nurses`
	 *
	 * Query: `start_date`, `end_date`, `nurse_id`, `search`, `page`,
	 * `page_size`, `sort`, `dir`.
	 */
	async listNurses(req: Request, res: Response) {
		try {
			const filters = parseNurseFilters(req.query);
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, NURSE_SORT_COLUMNS, "name");

			const payload = await NurseReportModel.listNurses({
				...filters,
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load nurse report");
		}
	}

	/**
	 * `GET /api/reports/nurses/:nurseId`
	 *
	 * The nurse's header + summary, one page of their patients and the whole
	 * daily-assignment accordion. `search` narrows the patients by name (and the
	 * accordion follows the same filter).
	 */
	async getNurse(req: Request, res: Response) {
		try {
			const nurseId = parseRequiredId(req.params.nurseId, "nurseId");
			const range = parseDateRange(req.query);
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, NURSE_PATIENT_SORT_COLUMNS, "name");

			const payload = await NurseReportModel.getNurseDetail(nurseId, {
				range,
				search: parseSearch(req.query),
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load nurse report details",
				"Nurse not found"
			);
		}
	}

	/**
	 * `GET /api/reports/nurses/export`
	 *
	 * Same filters as the list, no paging: every nurse with every patient and
	 * every daily assignment.
	 */
	async exportNurses(req: Request, res: Response) {
		try {
			const filters = parseNurseFilters(req.query);
			const sort = parseSort(req.query, NURSE_SORT_COLUMNS, "name");

			const payload = await NurseReportModel.exportNurses({
				...filters,
				sort,
			});
			warnIfLargeExport("nurses", payload.data.length);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export nurse report");
		}
	}

	/* -------------------------------------------------------------- */
	/* Statistics                                                      */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/statistics`
	 *
	 * Query: `start_date`, `end_date`, `grouping` (`day|month|year`, default
	 * `day`). Reads only — no paging, no sort: every series is returned whole so
	 * the charts and the export always describe the same set.
	 */
	async getStatistics(req: Request, res: Response) {
		try {
			const payload = await StatisticsReportModel.getStatistics(
				parseStatisticsFilters(req.query)
			);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load statistics report");
		}
	}

	/**
	 * `GET /api/reports/statistics/export`
	 *
	 * The same document plus `generated_at`; `manage_reports` is enforced by the
	 * route.
	 */
	async exportStatistics(req: Request, res: Response) {
		try {
			const payload = await StatisticsReportModel.exportStatistics(
				parseStatisticsFilters(req.query)
			);
			warnIfLargeExport("statistics", countStatisticsExportRows(payload));
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export statistics report");
		}
	}

	/* -------------------------------------------------------------- */
	/* Employee payments (payroll)                                     */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/employee-payments`
	 *
	 * Query: `start_date`, `end_date`, `employee_type`, `employee_id`,
	 * `search`, `grouping`, `page`, `page_size`, `sort`, `dir`.
	 */
	async listEmployeePayments(req: Request, res: Response) {
		try {
			const filters = parseEmployeePaymentFilters(req.query);
			const paging = parsePaging(req.query);
			const sort = parseSort(req.query, EMPLOYEE_PAYMENT_SORT_COLUMNS, "net", "desc");

			const payload = await EmployeePaymentReportModel.listEmployeePayments({
				...filters,
				paging,
				sort,
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load employee payments report");
		}
	}

	/**
	 * `GET /api/reports/employee-payments/:employeeId`
	 *
	 * The employee's identity, pay configuration, summary, one page of payments
	 * and every period deduction.
	 */
	async getEmployeePayment(req: Request, res: Response) {
		try {
			const employeeId = parseRequiredId(req.params.employeeId, "employeeId");

			const payload = await EmployeePaymentReportModel.getEmployeeDetail(
				employeeId,
				{
					range: parseDateRange(req.query),
					paging: parsePaging(req.query),
				}
			);
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load employee payment details",
				"Employee not found"
			);
		}
	}

	/**
	 * `GET /api/reports/employee-payments/:employeeId/payments/:paymentId`
	 *
	 * The patient work behind one payment. No range: the associations belong to
	 * the payment, and hiding work outside the window would misstate it.
	 */
	async getPaymentAssociations(req: Request, res: Response) {
		try {
			const employeeId = parseRequiredId(req.params.employeeId, "employeeId");
			const paymentId = parseRequiredId(req.params.paymentId, "paymentId");

			const payload = await EmployeePaymentReportModel.getPaymentAssociations(
				employeeId,
				paymentId
			);
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load payment associations",
				"Payment not found"
			);
		}
	}

	/**
	 * `GET /api/reports/employee-payments/export`
	 *
	 * Same filters as the list, no paging: every employee with every payment,
	 * every association and every period deduction. `manage_reports` is
	 * enforced by the route.
	 */
	async exportEmployeePayments(req: Request, res: Response) {
		try {
			const filters = parseEmployeePaymentFilters(req.query);
			const sort = parseSort(req.query, EMPLOYEE_PAYMENT_SORT_COLUMNS, "net", "desc");

			const payload = await EmployeePaymentReportModel.exportEmployeePayments({
				...filters,
				sort,
			});
			warnIfLargeExport("employee payments", payload.data.length);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export employee payments report");
		}
	}

	/* -------------------------------------------------------------- */
	/* Clock-in                                                        */
	/* -------------------------------------------------------------- */

	/**
	 * `GET /api/reports/clock-ins`
	 *
	 * Query: `start_date`, `end_date`, `employee_type`, `employee_id`,
	 * `search`, `page`, `page_size`, `sort`, `dir`.
	 */
	async listClockIns(req: Request, res: Response) {
		try {
			const payload = await ClockInReportModel.listClockIns({
				...parseClockInFilters(req.query),
				paging: parsePaging(req.query),
				sort: parseClockInSort(req.query),
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "load clock-in report");
		}
	}

	/**
	 * `GET /api/reports/clock-ins/:employeeId`
	 *
	 * The employee's identity, the attendance summary for the whole range and
	 * one page of records, with the `status` filter applied **after** missing
	 * days are synthesized.
	 */
	async getClockInEmployee(req: Request, res: Response) {
		try {
			const employeeId = parseRequiredId(req.params.employeeId, "employeeId");

			const payload = await ClockInReportModel.getEmployeeDetail(employeeId, {
				range: parseDateRange(req.query),
				status: parseClockInStatus(req.query.status),
				paging: parsePaging(req.query),
			});
			res.status(200).json(payload);
		} catch (error) {
			sendError(
				res,
				error,
				"load clock-in details",
				"Employee not found"
			);
		}
	}

	/**
	 * `GET /api/reports/clock-ins/export`
	 *
	 * Same filters as the list, no paging. `manage_reports` is enforced by the
	 * route.
	 */
	async exportClockIns(req: Request, res: Response) {
		try {
			const payload = await ClockInReportModel.exportClockIns(
				parseClockInFilters(req.query)
			);
			warnIfLargeExport("clock-ins", payload.summary.total_clock_ins);
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export clock-in report");
		}
	}
}

/* ------------------------------------------------------------------ */
/* Query parsing                                                       */
/* ------------------------------------------------------------------ */

/** Payment types the report accepts (`all`/absent means no filter). */
const PATIENT_PAYMENT_TYPES = ["cash", "credit", "insurance"] as const;

/** Doctor relationship populations (plan §3.5.3). */
const DOCTOR_RELATIONSHIPS = ["referred", "attended", "supervised"] as const;

/**
 * Shared filter parsing for the list and export endpoints.
 *
 * `insurance_id` is only honoured for `payment_type=insurance` — the legacy
 * UI only sent it in that combination, and allowing it elsewhere would let a
 * stale URL silently filter every cash patient out.
 */
function parsePatientFilters(query: Record<string, unknown>) {
	const range = parseDateRange(query);
	const paymentType = parseEnumParam(
		query.payment_type,
		PATIENT_PAYMENT_TYPES,
		"payment_type"
	);
	const insuranceId =
		paymentType === "insurance"
			? parseOptionalId(query.insurance_id, "insurance_id")
			: null;

	return {
		range,
		paymentType,
		insuranceId,
		search: parseSearch(query),
	};
}

/**
 * Shared doctor filter parsing for the list and export endpoints.
 *
 * `relationship` defaults to `referred` (the legacy default tab) rather than
 * erroring, so an old link without the param still renders a report.
 */
function parseDoctorFilters(query: Record<string, unknown>) {
	const range = parseDateRange(query);
	const relationship =
		parseEnumParam(
			query.relationship,
			DOCTOR_RELATIONSHIPS,
			"relationship",
			"referred"
		) ?? "referred";

	return {
		range,
		relationship,
		doctorId: parseOptionalId(query.doctor_id, "doctor_id"),
		search: parseSearch(query),
	};
}

/**
 * Shared nurse filter parsing for the list and export endpoints.
 *
 * There is no relationship select on this tab (a nurse either has assignments
 * in the range or is not in the report), so the filter set is range + optional
 * nurse + nurse-name search.
 */
function parseNurseFilters(query: Record<string, unknown>) {
	return {
		range: parseDateRange(query),
		nurseId: parseOptionalId(query.nurse_id, "nurse_id"),
		search: parseSearch(query),
	};
}

/** Statistics grouping; absent means daily buckets. */
function parseStatisticsGrouping(value: unknown): StatisticsGrouping {
	return parseEnumParam(value, STATISTICS_GROUPINGS, "grouping", "day") as StatisticsGrouping;
}

/**
 * Shared statistics filter parsing for the read and export endpoints.
 *
 * There is nothing else to parse: the tab has no scope, search, payment filter
 * or paging — every series covers the whole range, which is what makes the
 * export identical to the screen.
 */
function parseStatisticsFilters(query: Record<string, unknown>) {
	return {
		range: parseDateRange(query),
		grouping: parseStatisticsGrouping(query.grouping),
	};
}

/**
 * Payroll grouping; absent means monthly buckets.
 *
 * A payroll list is a per-employee table, so the timeline only has a handful of
 * buckets even over a year — `month` is the useful default where the statistics
 * tab defaults to `day`.
 */
function parseEmployeePaymentGrouping(
	value: unknown
): EmployeePaymentGrouping {
	return parseEnumParam(
		value,
		EMPLOYEE_PAYMENT_GROUPINGS,
		"grouping",
		"month"
	) as EmployeePaymentGrouping;
}

/**
 * Shared payroll filter parsing for the list and export endpoints.
 *
 * `employee_type` defaults to `all` rather than erroring, so a link without the
 * param still renders a report; an unknown value is a 400 (a typo should not
 * silently widen the population).
 */
function parseEmployeePaymentFilters(query: Record<string, unknown>) {
	const employeeType =
		parseEnumParam(
			query.employee_type,
			EMPLOYEE_PAYMENT_TYPE_FILTERS,
			"employee_type",
			"all"
		) ?? "all";

	return {
		range: parseDateRange(query),
		employeeType,
		employeeId: parseOptionalId(query.employee_id, "employee_id"),
		search: parseSearch(query),
		grouping: parseEmployeePaymentGrouping(query.grouping),
	};
}

/**
 * Shared clock-in filter parsing for the list and export endpoints.
 *
 * `employee_type` defaults to `all` and an unknown value is a 400: a typo in a
 * shared link must not silently widen the population to the whole staff.
 */
function parseClockInFilters(query: Record<string, unknown>) {
	const employeeType =
		parseEnumParam(
			query.employee_type,
			CLOCK_IN_TYPE_FILTERS,
			"employee_type",
			"all"
		) ?? "all";

	return {
		range: parseDateRange(query),
		employeeType,
		employeeId: parseOptionalId(query.employee_id, "employee_id"),
		search: parseSearch(query),
	};
}

/** `?status=` on the detail endpoint; absent means every record. */
function parseClockInStatus(value: unknown): ClockInStatusFilter {
	return parseEnumParam(
		value,
		CLOCK_IN_STATUS_FILTERS,
		"status",
		"all"
	) as ClockInStatusFilter;
}

/**
 * Clock-in sort — validated here rather than through `parseSort`.
 *
 * `parseSort` returns a SQL fragment because the other tabs sort in Postgres.
 * The clock-in rows are aggregated in TS (the status rule lives in
 * `clockStatusFor`), so a SQL fragment would be a lie: the model only needs the
 * key and the direction.
 */
function parseClockInSort(query: Record<string, unknown>): {
	column: ClockInSortKey;
	direction: "asc" | "desc";
} {
	const raw =
		query.sort === undefined || query.sort === "" ? "name" : String(query.sort);
	if (!(CLOCK_IN_SORT_KEYS as readonly string[]).includes(raw)) {
		throw new ReportValidationError(
			`sort must be one of ${CLOCK_IN_SORT_KEYS.join(", ")}`
		);
	}

	const rawDir =
		query.dir === undefined || query.dir === "" ? "asc" : String(query.dir);
	if (rawDir !== "asc" && rawDir !== "desc") {
		throw new ReportValidationError("dir must be asc or desc");
	}

	return { column: raw as ClockInSortKey, direction: rawDir };
}

export default new ReportsController();
