/**
 * Report filter options — Phase 6.11 plan §3.6.
 *
 * One call replaces the three picker fetches the legacy page made
 * (`/api/insurance-companies`, `/api/doctors`, `/api/employees?type=nurse`).
 * The nurse picker used to require `manage_employees`, which silently broke
 * the Nurse tab for report-only roles; `/api/reports/options` is gated by
 * `view_reports` alone.
 *
 * The payroll employee list is the exception: it is only returned when the
 * caller also holds `manage_employees` (enforced by the controller, which
 * passes `includePayroll`). The report endpoints enforce the same pair.
 *
 * Wire keys are **snake_case** like every other endpoint; the renderer's
 * `lib/api.ts` camelCases them once at the boundary.
 */

import { query } from "../database/connection.js";
import type {
	ReportOptionDTO,
	ReportOptionsDTO,
} from "../../utils/types/reportsApi.js";

export type { ReportOptionDTO, ReportOptionsDTO };

export default class OptionsReportModel {
	/**
	 * Loads every picker list in parallel. `includePayroll = false` skips the
	 * payroll query entirely (it returns `[]` without touching the table).
	 */
	static async getOptions(includePayroll: boolean): Promise<ReportOptionsDTO> {
		const [
			insuranceCompanies,
			doctors,
			nurses,
			payrollEmployees,
			clockInEmployees,
		] = await Promise.all([
			OptionsReportModel.getInsuranceCompanies(),
			OptionsReportModel.getDoctors(),
			OptionsReportModel.getNurses(),
			includePayroll
				? OptionsReportModel.getPayrollEmployees()
				: Promise.resolve([] as ReportOptionDTO[]),
			OptionsReportModel.getClockInEmployees(),
		]);

		return {
			insurance_companies: insuranceCompanies,
			doctors,
			nurses,
			payroll_employees: payrollEmployees,
			clock_in_employees: clockInEmployees,
		};
	}

	static async getInsuranceCompanies(): Promise<ReportOptionDTO[]> {
		const { rows } = await query(
			`SELECT insurance_id AS id, name
			 FROM InsuranceCompany
			 ORDER BY name`
		);
		return rows.map((row) => ({ id: Number(row.id), name: row.name }));
	}

	static async getDoctors(): Promise<ReportOptionDTO[]> {
		const { rows } = await query(
			`SELECT d.doctor_id AS id,
			        e.name,
			        d.doctor_type,
			        COALESCE(d.is_active, e.is_active, true) AS is_active
			 FROM Doctor d
			 JOIN Employee e ON e.employee_id = d.doctor_id
			 ORDER BY e.name`
		);
		return rows.map((row) => ({
			id: Number(row.id),
			name: row.name,
			doctor_type: row.doctor_type ?? null,
			is_active: Boolean(row.is_active),
		}));
	}

	static async getNurses(): Promise<ReportOptionDTO[]> {
		const { rows } = await query(
			`SELECT employee_id AS id, name
			 FROM Employee
			 WHERE employee_type = 'nurse' AND is_active = true
			 ORDER BY name`
		);
		return rows.map((row) => ({ id: Number(row.id), name: row.name }));
	}

	static async getPayrollEmployees(): Promise<ReportOptionDTO[]> {
		const { rows } = await query(
			`SELECT employee_id AS id, name, employee_type
			 FROM Employee
			 ORDER BY name`
		);
		return rows.map((row) => ({
			id: Number(row.id),
			name: row.name,
			employee_type: row.employee_type ?? null,
		}));
	}

	static async getClockInEmployees(): Promise<ReportOptionDTO[]> {
		const { rows } = await query(
			`SELECT employee_id AS id, name, employee_type
			 FROM Employee
			 WHERE need_clock_in = true AND is_active = true
			 ORDER BY name`
		);
		return rows.map((row) => ({
			id: Number(row.id),
			name: row.name,
			employee_type: row.employee_type ?? null,
		}));
	}
}
