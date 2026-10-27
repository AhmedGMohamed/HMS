/**
 * Reports v2 controller — Phase 6.11.
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

import OptionsReportModel from "../models/reports/OptionsReport.model.js";
import PatientReportModel, {
	PATIENT_SORT_COLUMNS,
} from "../models/reports/PatientReport.model.js";
import {
	NotFoundError,
	ReportValidationError,
	parseDateRange,
	parseEnumParam,
	parseOptionalId,
	parsePaging,
	parseRequiredId,
	parseSearch,
	parseSort,
} from "../models/reports/shared.js";

export { NotFoundError };

/** Admin bypass mirrors `auth.middleware.checkPermissions`. */
export function userHasPermission(req: Request, permission: string): boolean {
	if (!req.user) return false;
	if (req.user.role === "Admin") return true;
	return req.user.permissions.includes(permission);
}

/** Admin bypass for an "all of these" check. */
export function userHasAllPermissions(
	req: Request,
	permissions: string[]
): boolean {
	if (!req.user) return false;
	if (req.user.role === "Admin") return true;
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

export class ReportV2Controller {
	/**
	 * `GET /api/reports/v2/options`
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
	 * `GET /api/reports/v2/patients`
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
	 * `GET /api/reports/v2/patients/:patientId`
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
	 * `GET /api/reports/v2/patients/export`
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
			res.status(200).json(payload);
		} catch (error) {
			sendError(res, error, "export patient report");
		}
	}
}

/* ------------------------------------------------------------------ */
/* Query parsing                                                       */
/* ------------------------------------------------------------------ */

/** Payment types the report accepts (`all`/absent means no filter). */
const PATIENT_PAYMENT_TYPES = ["cash", "credit", "insurance"] as const;

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

export default new ReportV2Controller();
