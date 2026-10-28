/**
 * Reports v2 wire types — Phase 6.11.
 *
 * These describe the JSON the `/api/reports/v2/*` endpoints return. Field
 * names are snake_case on the wire; the renderer's `lib/api.ts` converts
 * them to camelCase once at the boundary, so the React code never sees
 * these names directly.
 *
 * Every numeric money field is already coerced to `number` by the model —
 * Postgres `NUMERIC` arrives as a string and must never leak to the client
 * (the legacy reports shipped `"120.00"` and the renderer did `"10" < "9"`).
 */

/* ------------------------------------------------------------------ */
/* Shared envelopes                                                    */
/* ------------------------------------------------------------------ */

export interface ReportRange {
	start_date: string;
	end_date: string;
}

export interface ReportListEnvelope<TSummary, TRow> {
	summary: TSummary;
	data: TRow[];
	total: number;
	page: number;
	page_size: number;
}

export interface ReportExportEnvelope<TSummary, TRow> {
	generated_at: string;
	range: ReportRange;
	summary: TSummary;
	data: TRow[];
}

/* ------------------------------------------------------------------ */
/* Options                                                            */
/* ------------------------------------------------------------------ */

export interface ReportOptionDTO {
	id: number;
	name: string;
	doctor_type?: string | null;
	is_active?: boolean;
	employee_type?: string | null;
}

export interface ReportOptionsDTO {
	insurance_companies: ReportOptionDTO[];
	doctors: ReportOptionDTO[];
	nurses: ReportOptionDTO[];
	payroll_employees: ReportOptionDTO[];
	clock_in_employees: ReportOptionDTO[];
}

/* ------------------------------------------------------------------ */
/* Patient report                                                      */
/* ------------------------------------------------------------------ */

export interface PatientReportSummary {
	total_patients: number;
	total_admissions: number;
	total_billed: number;
	total_paid: number;
	total_outstanding: number;
}

export interface PatientReportRow {
	patient_id: number;
	patient_name: string;
	national_id: string | null;
	gender: string | null;
	age: number | null;
	birth_date: string | null;
	phone: string | null;
	address: string | null;
	payment_type: string;
	insurance_company: string | null;
	insurance_form_id: string | null;
	insurance_card_id: string | null;
	referring_doctor_name: string | null;
	admissions_count: number;
	first_admission: string | null;
	last_admission: string | null;
	has_active_admission: boolean;
	total_billed: number;
	total_paid: number;
	total_outstanding: number;
}

export interface PatientReportItem {
	item_type: string;
	item_name: string;
	quantity: number;
	unit_price: number;
	total_price: number;
}

export interface PatientReportItemGroup {
	service_date: string;
	date_total: number;
	items: PatientReportItem[];
}

export interface PatientReportStaffMember {
	employee_id: number;
	name: string;
	hours_worked: number;
}

export interface PatientReportStaffDay {
	work_date: string;
	doctors: PatientReportStaffMember[];
	nurses: PatientReportStaffMember[];
}

export interface PatientReportAdmission {
	patient_history_id: number;
	bill_id: number | null;
	admission_time: string | null;
	discharge_time: string | null;
	diagnosis: string | null;
	leave_reason: string | null;
	length_of_stay_days: number;
	base_total: number;
	medical_tests_amount: number;
	discount_type: string | null;
	discount: number;
	discount_scope: string[];
	calculated_discount: number;
	vat_percentage: number;
	vat_scope_custom: string[];
	calculated_vat: number;
	administrative_expenses: number;
	final_total: number;
	paid_amount: number;
	outstanding_amount: number;
	items_by_date: PatientReportItemGroup[];
	daily_staff: PatientReportStaffDay[];
}

export interface PatientReportDetailDTO {
	patient: PatientReportRow;
	admissions: PatientReportAdmission[];
}

/**
 * Export row — the list row plus every admission in the range, each carrying
 * its billed items and daily staff.
 *
 * Only the export endpoint populates `admissions`: the paginated list must not
 * (it would multiply the payload by the admission count for data the table
 * never renders). The export is a full document, so it pays the one extra
 * batched query.
 */
export interface PatientReportExportRow extends PatientReportRow {
	admissions: PatientReportAdmission[];
}

/* ------------------------------------------------------------------ */
/* Doctor report                                                       */
/* ------------------------------------------------------------------ */

export type DoctorRelationship = "referred" | "attended" | "supervised";

export interface DoctorReportSummary {
	relationship: DoctorRelationship;
	total_doctors: number;
	total_patients: number;
	total_patient_assignments: number;
	total_admissions: number;
	total_billed: number;
	total_paid: number;
}

export interface DoctorReportRow {
	doctor_id: number;
	doctor_name: string;
	doctor_type: string | null;
	patients_count: number;
	admissions_count: number;
	total_billed: number;
	total_paid: number;
}

export interface DoctorPatientRow {
	patient_id: number;
	patient_name: string;
	national_id: string | null;
	gender: string | null;
	age: number | null;
	payment_type: string;
	insurance_company: string | null;
	insurance_card_id: string | null;
	insurance_form_id: string | null;
	admissions_count: number;
	total_billed: number;
	total_paid: number;
	last_admission_time: string | null;
	last_discharge_time: string | null;
	last_diagnosis: string | null;
}

export interface DoctorDetailDTO {
	doctor: { doctor_id: number; doctor_name: string; doctor_type: string | null };
	summary: {
		patients: number;
		admissions: number;
		billed: number;
		paid: number;
	};
	data: DoctorPatientRow[];
	total: number;
	page: number;
	page_size: number;
}

export interface DoctorExportRow {
	doctor_id: number;
	doctor_name: string;
	doctor_type: string | null;
	patients: Array<DoctorPatientRow & { admissions?: PatientReportAdmission[] }>;
	totals: { patients: number; admissions: number; billed: number; paid: number };
}

/* ------------------------------------------------------------------ */
/* Nurse report                                                        */
/* ------------------------------------------------------------------ */

export interface NurseReportSummary {
	total_nurses: number;
	total_patients: number;
	total_patient_assignments: number;
	total_days: number;
	total_hours: number;
}

export interface NurseReportRow {
	nurse_id: number;
	nurse_name: string;
	patients_count: number;
	days_worked: number;
	total_hours: number;
	last_work_date: string | null;
}

export interface NursePatientRow {
	patient_id: number;
	patient_name: string;
	payment_type: string;
	last_admission_time: string | null;
	last_discharge_time: string | null;
	diagnosis: string | null;
	days_assigned: number;
	hours_worked: number;
}

export interface NurseDailyAssignment {
	work_date: string;
	patient_count: number;
	total_hours: number;
	patients: Array<{
		patient_id: number;
		patient_name: string;
		payment_type: string;
		diagnosis: string | null;
		hours_worked: number;
	}>;
}

export interface NurseDetailDTO {
	nurse: { nurse_id: number; nurse_name: string };
	summary: { patients: number; days: number; hours: number };
	data: NursePatientRow[];
	daily_assignments: NurseDailyAssignment[];
	total: number;
	page: number;
	page_size: number;
}

export interface NurseExportRow {
	nurse_id: number;
	nurse_name: string;
	/** Per-nurse roll-up. Named `totals` (not `summary`) so it cannot be
	 * confused with the envelope's whole-set `summary`; same as the doctor
	 * export row. */
	totals: { patients: number; days: number; hours: number };
	patients: NursePatientRow[];
	daily_assignments: NurseDailyAssignment[];
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export type ReportGrouping = "day" | "month" | "year";

export interface StatisticsKpis {
	total_patients: number;
	total_admissions: number;
	total_discharges: number;
	avg_stay_days: number;
	total_billed: number;
	total_collected: number;
	total_outstanding: number;
}

export interface StatisticsPeriodPoint {
	period: string;
	year: number;
	month: number;
	day: number;
}

export interface PatientCensusPoint extends StatisticsPeriodPoint {
	census: number;
	admissions: number;
}

export interface AverageStayPoint extends StatisticsPeriodPoint {
	discharges: number;
	avg_stay_days: number;
}

export interface RevenueTrendPoint extends StatisticsPeriodPoint {
	billed: number;
	collected: number;
	outstanding: number;
	bill_count: number;
	avg_bill_amount: number;
}

export interface AdmissionDischargePoint extends StatisticsPeriodPoint {
	admissions: number;
	discharges: number;
	net_change: number;
}

export interface TopServiceRow {
	service_id: number;
	service_name: string;
	service_type: string | null;
	usage_count: number;
	total_quantity: number;
	total_revenue: number;
}

export interface TopDrugRow {
	drug_id: number;
	drug_name: string;
	manufacturer: string | null;
	usage_count: number;
	total_quantity: number;
	total_revenue: number;
}

export interface StaffUtilizationRow {
	employee_type: string;
	staff_count: number;
	patients_served: number;
	avg_hours_per_assignment: number;
	total_hours_worked: number;
	avg_patients_per_staff: number;
}

export interface StatisticsDistributionEntry {
	key: string;
	count: number;
}

export interface StatisticsReportDTO {
	range: ReportRange & { grouping: ReportGrouping };
	kpis: StatisticsKpis;
	patient_census: PatientCensusPoint[];
	distribution: {
		payment_type: StatisticsDistributionEntry[];
		gender: StatisticsDistributionEntry[];
	};
	average_stay: AverageStayPoint[];
	revenue_trends: RevenueTrendPoint[];
	admission_discharge: AdmissionDischargePoint[];
	top_services: TopServiceRow[];
	top_drugs: TopDrugRow[];
	staff_utilization: StaffUtilizationRow[];
}

/**
 * Statistics export document — the report plus `generated_at`.
 *
 * There is no separate paging to drop: the tab already shows the whole range,
 * so the export is the same seven queries with a timestamp (`plan §3.5.5`).
 */
export interface StatisticsReportExportPayload extends StatisticsReportDTO {
	generated_at: string;
}

/* ------------------------------------------------------------------ */
/* Employee payments                                                   */
/* ------------------------------------------------------------------ */

export interface EmployeePaymentSummary {
	total_employees: number;
	total_payments: number;
	total_base_pay: number;
	total_extra_pay: number;
	total_deductions: number;
	total_paid: number;
	total_unpaid: number;
	total_net: number;
}

export interface EmployeePaymentRow {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	hire_date: string | null;
	payment_count: number;
	total_base_pay: number;
	total_extra_pay: number;
	total_deductions: number;
	total_paid: number;
	total_unpaid: number;
	net_payment: number;
}

export interface EmployeePaymentCharts {
	timeline: Array<{ period: string; total: number }>;
	by_type: Array<{ payment_type: string; total: number }>;
}

export interface EmployeePaymentDetailRow {
	payment_id: number;
	payment_date: string;
	payment_amount: number;
	extra_amount: number;
	extra_payment_type: string | null;
	payment_type: string;
	percentage_scope: string | null;
	is_paid: boolean;
	paid_timestamp: string | null;
	paid_by: string | null;
	patient_count: number;
}

export interface PeriodDeductionRow {
	clock_id: number;
	clock_in: string;
	clock_out: string | null;
	hours_worked: number;
	pay_deduction: number;
	status: string;
}

export interface EmployeePaymentDetailDTO {
	employee: {
		employee_id: number;
		employee_name: string;
		employee_type: string;
		hire_date: string | null;
	};
	breakdown: {
		base_pay: number;
		base_extra_amount: number;
		base_extra_payment_type: string | null;
		per_patient_payment_type: string | null;
		percentage_scope: string | null;
		need_clock_in: boolean;
		shift_type: string | null;
		shift_start_time: string | null;
		shift_end_time: string | null;
		total_work_days: number;
		total_patients_served: number;
	};
	summary: {
		total_payments: number;
		total_base_pay: number;
		total_extra_pay: number;
		total_deductions: number;
		total_paid: number;
		total_unpaid: number;
		net_payment: number;
	};
	payments: EmployeePaymentDetailRow[];
	period_deductions: PeriodDeductionRow[];
	total: number;
	page: number;
	page_size: number;
}

export interface PaymentAssociationRow {
	payment_patient_id: number;
	patient_id: number;
	patient_name: string;
	patient_history_id: number | null;
	admission_time: string | null;
	discharge_time: string | null;
	diagnosis: string | null;
	work_date: string;
	hours_worked: number;
	payment_amount: number;
	payment_type: string;
}

/* ------------------------------------------------------------------ */
/* Clock-in report                                                     */
/* ------------------------------------------------------------------ */

export interface AttendanceSummary {
	total_days: number;
	worked_days: number;
	on_time_days: number;
	late_days: number;
	early_days: number;
	incomplete_days: number;
	missing_days: number;
	punctuality_rate: number;
}

export interface ClockInReportSummary {
	total_employees: number;
	total_clock_ins: number;
	total_hours: number;
	avg_hours_per_employee: number;
	total_deductions: number;
}

export interface ClockInReportRow {
	employee_id: number;
	employee_name: string;
	employee_type: string;
	shift_type: string | null;
	shift_start_time: string | null;
	shift_end_time: string | null;
	clock_in_count: number;
	total_hours: number;
	avg_hours_per_day: number;
	total_deductions: number;
	attendance_summary: AttendanceSummary;
}

export interface ClockInReportCharts {
	hours_by_employee: Array<{
		employee_id: number;
		employee_name: string;
		hours: number;
	}>;
	status_distribution: Array<{ status: string; count: number }>;
}

export interface ClockInPatientRow {
	patient_id: number;
	patient_name: string;
	payment_type: string;
	diagnosis: string | null;
	hours_worked: number;
	admission_time: string | null;
	discharge_time: string | null;
}

export interface ClockInRecordRow {
	clock_id: number | null;
	date: string;
	clock_in: string | null;
	clock_out: string | null;
	hours_worked: number;
	pay_deduction: number;
	status: string;
	is_missing: boolean;
	late_minutes: number;
	early_minutes: number;
	patients: ClockInPatientRow[];
	patient_count: number;
}

export interface ClockInDetailDTO {
	employee: {
		employee_id: number;
		employee_name: string;
		employee_type: string;
		shift_type: string | null;
		shift_start_time: string | null;
		shift_end_time: string | null;
	};
	attendance_summary: AttendanceSummary;
	records: ClockInRecordRow[];
	total: number;
	page: number;
	page_size: number;
}
