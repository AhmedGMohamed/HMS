import { query } from "./database/connection.js";
import {
	ReportDateRange,
	TimeGrouping,
	PaymentTypeFilter,
	EmployeeTypeFilter,
	PatientReportData,
	PatientAdmissionDetail,
	DailyStaffAssignment,
	DoctorPatientReport,
	NursePatientReport,
	NurseDailyAssignment,
	PatientStatistics,
	DoctorStatistics,
	EmployeePaymentReport,
	EmployeePaymentDetail,
	PaymentSummary,
	TimeGroupedData,
	ChartData
} from "../utils/types/reports.js";

export default class ReportModel {
	// ==================== PATIENT REPORTS ====================

	/**
	 * Get detailed patient reports filtered by payment type and date range
	 */
	static async getPatientReports(
		dateRange: ReportDateRange,
		paymentType: PaymentTypeFilter = "all",
		insuranceId?: number
	): Promise<PatientReportData[]> {
		let paymentTypeCondition = "";
		const params: any[] = [dateRange.start_date, dateRange.end_date];
		let paramIndex = 3;

		if (paymentType !== "all") {
			paymentTypeCondition = `AND p.payment_type = $${paramIndex}`;
			params.push(paymentType);
			paramIndex++;
		}

		if (insuranceId) {
			paymentTypeCondition += ` AND p.insurance_id = $${paramIndex}`;
			params.push(insuranceId);
			paramIndex++;
		}

		const sql = `
            SELECT DISTINCT
                p.patient_id,
                p.name as patient_name,
                p.national_id,
                p.gender,
                p.phone,
                p.address,
                p.payment_type,
                ic.name as insurance_company,
                p.insurance_form_id,
                rd.employee_id as referring_doctor_id,
                rd.name as referring_doctor_name
            FROM Patient p
            LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
            LEFT JOIN Doctor d ON p.referring_doctor_id = d.doctor_id
            LEFT JOIN Employee rd ON d.doctor_id = rd.employee_id
            WHERE EXISTS (
                SELECT 1 FROM PatientHistory ph
                WHERE ph.patient_id = p.patient_id
                AND ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            )
            ${paymentTypeCondition}
            ORDER BY p.name
        `;

		const result = await query(sql, params);
		const patients: PatientReportData[] = [];

		for (const row of result.rows) {
			const admissions = await this.getPatientAdmissions(
				row.patient_id,
				dateRange
			);

			const totalBill = admissions.reduce(
				(sum, adm) => sum + parseFloat(adm.total_amount as any),
				0
			);
			const totalPaid = admissions.reduce(
				(sum, adm) => sum + parseFloat(adm.paid_amount as any),
				0
			);

			patients.push({
				patient_id: row.patient_id,
				patient_name: row.patient_name,
				national_id: row.national_id,
				gender: row.gender,
				phone: row.phone,
				address: row.address,
				payment_type: row.payment_type,
				insurance_company: row.insurance_company,
				insurance_form_id: row.insurance_form_id,
				referring_doctor_id: row.referring_doctor_id,
				referring_doctor_name: row.referring_doctor_name,
				admissions: admissions,
				total_bill_amount: totalBill,
				total_paid_amount: totalPaid,
				total_outstanding: totalBill - totalPaid
			});
		}

		return patients;
	}

	private static calculateAgeFromNationalId(
		nationalId: string | null
	): number {
		if (!nationalId || nationalId.length < 7) {
			return 0;
		}

		try {
			const centuryDigit = parseInt(nationalId.charAt(0));
			const yearDigits = parseInt(nationalId.substring(1, 3));
			const monthDigits = parseInt(nationalId.substring(3, 5));
			const dayDigits = parseInt(nationalId.substring(5, 7));

			// Determine century
			let century: number;
			if (centuryDigit === 2) {
				century = 1900;
			} else if (centuryDigit === 3) {
				century = 2000;
			} else {
				return 0; // Invalid century digit
			}

			const birthYear = century + yearDigits;
			const birthDate = new Date(birthYear, monthDigits - 1, dayDigits);

			// Calculate age
			const today = new Date();
			let age = today.getFullYear() - birthDate.getFullYear();
			const monthDiff = today.getMonth() - birthDate.getMonth();

			if (
				monthDiff < 0 ||
				(monthDiff === 0 && today.getDate() < birthDate.getDate())
			) {
				age--;
			}

			return age;
		} catch (error) {
			console.error("Error calculating age from national ID:", error);
			return 0;
		}
	}

	/**
	 * Get formatted patient report data for PDF generation
	 */
	static async getPatientReportFormatted(
		dateRange: ReportDateRange,
		paymentType: PaymentTypeFilter = "all",
		insuranceId?: number,
		patientId?: number
	): Promise<any> {
		let paymentTypeCondition = "";
		const params: any[] = [dateRange.start_date, dateRange.end_date];
		let paramIndex = 3;

		if (paymentType !== "all") {
			paymentTypeCondition = `AND p.payment_type = $${paramIndex}`;
			params.push(paymentType);
			paramIndex++;
		}

		if (insuranceId) {
			paymentTypeCondition += ` AND p.insurance_id = $${paramIndex}`;
			params.push(insuranceId);
			paramIndex++;
		}

		let patientCondition = "";
		if (patientId) {
			patientCondition = `AND p.patient_id = $${paramIndex}`;
			params.push(patientId);
			paramIndex++;
		}

		// Get patients with their summary data
		const patientsSql = `
            SELECT DISTINCT
                p.patient_id,
                p.name as patient_name,
                p.national_id,
                p.gender,
                p.phone,
                p.address,
                p.payment_type,
                ic.name as insurance_company,
                p.insurance_form_id,
                p.insurance_card_id,
                rd.employee_id as referring_doctor_id,
                rd.name as referring_doctor_name,
                COALESCE(SUM(b.total_amount), 0) as total_billed,
                COALESCE(SUM(b.paid_amount), 0) as total_paid
            FROM Patient p
            LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
            LEFT JOIN Doctor d ON p.referring_doctor_id = d.doctor_id
            LEFT JOIN Employee rd ON d.doctor_id = rd.employee_id
            JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            ${paymentTypeCondition}
            ${patientCondition}
            GROUP BY p.patient_id, p.name, p.national_id, p.gender, p.phone, p.address, 
                     p.payment_type, ic.name, p.insurance_form_id, p.insurance_card_id,
                     rd.employee_id, rd.name
            ORDER BY p.name
        `;

		const patientsResult = await query(patientsSql, params);
		const patients = [];

		for (const patient of patientsResult.rows) {
			// Calculate age from national ID
			const age = this.calculateAgeFromNationalId(patient.national_id);

			const admissions = await this.getPatientAdmissionsFormatted(
				patient.patient_id,
				dateRange
			);

			patients.push({
				patient_id: patient.patient_id,
				patient_name: patient.patient_name,
				national_id: patient.national_id,
				gender: patient.gender,
				age: age,
				phone: patient.phone,
				address: patient.address,
				payment_type: patient.payment_type,
				insurance_company: patient.insurance_company,
				insurance_form_id: patient.insurance_form_id,
				insurance_card_id: patient.insurance_card_id,
				referring_doctor_name: patient.referring_doctor_name,
				total_billed: parseFloat(patient.total_billed),
				total_paid: parseFloat(patient.total_paid),
				admissions: admissions
			});
		}

		return patients;
	}

	/**
	 * Get all admissions for a patient within date range with full details
	 */
	private static async getPatientAdmissions(
		patientId: number,
		dateRange: ReportDateRange
	): Promise<PatientAdmissionDetail[]> {
		const sql = `
            SELECT 
                ph.patient_history_id,
                ph.admission_time,
                ph.discharge_time,
                ph.diagnosis,
                ph.bill_id,
                b.total_amount,
                b.paid_amount,
                COALESCE(b.discount, 0) as discount
            FROM PatientHistory ph
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.patient_id = $1
            AND ph.admission_time BETWEEN $2 AND $3::DATE + '1 day'::INTERVAL
            ORDER BY ph.admission_time DESC
        `;

		const result = await query(sql, [
			patientId,
			dateRange.start_date,
			dateRange.end_date
		]);
		const admissions: PatientAdmissionDetail[] = [];

		for (const row of result.rows) {
			const dailyStaff = await this.getDailyStaffAssignments(
				patientId,
				row.patient_history_id,
				row.admission_time,
				row.discharge_time
			);

			const services = await this.getAdmissionServices(row.bill_id);
			const drugs = await this.getAdmissionDrugs(row.bill_id, patientId);

			admissions.push({
				patient_history_id: row.patient_history_id,
				admission_time: row.admission_time,
				discharge_time: row.discharge_time,
				diagnosis: row.diagnosis,
				bill_id: row.bill_id,
				total_amount: parseFloat(row.total_amount || 0),
				paid_amount: parseFloat(row.paid_amount || 0),
				discount: parseFloat(row.discount || 0),
				daily_staff: dailyStaff,
				services: services,
				drugs: drugs
			});
		}

		return admissions;
	}

	/**
	 * Get formatted admissions for a patient with grouped items by date
	 */
	private static async getPatientAdmissionsFormatted(
		patientId: number,
		dateRange: ReportDateRange
	): Promise<any[]> {
		const admissionsSql = `
            SELECT 
                ph.patient_history_id,
                ph.admission_time,
                ph.discharge_time,
                ph.diagnosis,
                ph.bill_id,
                b.total_amount,
                b.paid_amount
            FROM PatientHistory ph
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.patient_id = $1
            AND ph.admission_time BETWEEN $2 AND $3::DATE + '1 day'::INTERVAL
            ORDER BY ph.admission_time DESC
        `;

		const admissionsResult = await query(admissionsSql, [
			patientId,
			dateRange.start_date,
			dateRange.end_date
		]);

		const admissions = [];

		for (const admission of admissionsResult.rows) {
			// Get services and drugs grouped by date
			const itemsByDate = await this.getAdmissionItemsByDate(
				admission.bill_id
			);

			// Get daily staff assignments
			const dailyStaff = await this.getDailyStaffForReport(
				patientId,
				admission.admission_time,
				admission.discharge_time
			);

			admissions.push({
				patient_history_id: admission.patient_history_id,
				admission_time: admission.admission_time,
				discharge_time: admission.discharge_time,
				diagnosis: admission.diagnosis,
				bill_id: admission.bill_id,
				total_amount: parseFloat(admission.total_amount || 0),
				paid_amount: parseFloat(admission.paid_amount || 0),
				items_by_date: itemsByDate,
				daily_staff: dailyStaff
			});
		}

		return admissions;
	}

	/**
	 * Get single admission formatted data
	 */
	static async getSingleAdmissionFormatted(
		patientHistoryId: number
	): Promise<any> {
		// Get patient and admission data
		const admissionSql = `
            SELECT 
                p.patient_id,
                p.name as patient_name,
                p.national_id,
                p.gender,
                p.phone,
                p.address,
                p.payment_type,
                ic.name as insurance_company,
                p.insurance_form_id,
                p.insurance_card_id,
                rd.name as referring_doctor_name,
                ph.patient_history_id,
                ph.admission_time,
                ph.discharge_time,
                ph.diagnosis,
                ph.bill_id,
                b.total_amount,
                b.paid_amount
            FROM PatientHistory ph
            JOIN Patient p ON ph.patient_id = p.patient_id
            LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
            LEFT JOIN Doctor d ON p.referring_doctor_id = d.doctor_id
            LEFT JOIN Employee rd ON d.doctor_id = rd.employee_id
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.patient_history_id = $1
        `;

		const result = await query(admissionSql, [patientHistoryId]);

		if (result.rows.length === 0) {
			throw new Error("Admission not found");
		}

		const data = result.rows[0];
		const age = this.calculateAgeFromNationalId(data.national_id);

		// Get services and drugs grouped by date
		const itemsByDate = await this.getAdmissionItemsByDate(data.bill_id);

		// Get daily staff assignments
		const dailyStaff = await this.getDailyStaffForReport(
			data.patient_id,
			data.admission_time,
			data.discharge_time
		);

		return {
			patient_id: data.patient_id,
			patient_name: data.patient_name,
			national_id: data.national_id,
			gender: data.gender,
			age: age,
			phone: data.phone,
			address: data.address,
			payment_type: data.payment_type,
			insurance_company: data.insurance_company,
			insurance_form_id: data.insurance_form_id,
			insurance_card_id: data.insurance_card_id,
			referring_doctor_name: data.referring_doctor_name,
			admission: {
				patient_history_id: data.patient_history_id,
				admission_time: data.admission_time,
				discharge_time: data.discharge_time,
				diagnosis: data.diagnosis,
				bill_id: data.bill_id,
				total_amount: parseFloat(data.total_amount || 0),
				paid_amount: parseFloat(data.paid_amount || 0),
				items_by_date: itemsByDate,
				daily_staff: dailyStaff
			}
		};
	}

	/**
	 * Get daily staff assignments for a patient admission
	 */
	private static async getDailyStaffAssignments(
		patientId: number,
		_patientHistoryId: number,
		admissionTime: string,
		dischargeTime?: string
	): Promise<DailyStaffAssignment[]> {
		const endDate = dischargeTime || new Date().toISOString();

		const sql = `
            SELECT 
                dsa.work_date,
                e.employee_id,
                e.name as employee_name,
                e.employee_type,
                dsa.hours_worked
            FROM DailyStaffAssignment dsa
            JOIN Employee e ON dsa.employee_id = e.employee_id
            WHERE dsa.patient_id = $1
            AND dsa.work_date >= $2::date
            AND dsa.work_date <= $3::date
            ORDER BY dsa.work_date, e.employee_type
        `;

		const result = await query(sql, [patientId, admissionTime, endDate]);

		// Group by date
		const groupedByDate = new Map<string, DailyStaffAssignment>();

		result.rows.forEach((row) => {
			const dateKey = row.work_date;
			if (!groupedByDate.has(dateKey)) {
				groupedByDate.set(dateKey, {
					work_date: dateKey,
					doctors: [],
					nurses: []
				});
			}

			const dayAssignment = groupedByDate.get(dateKey)!;
			const staffMember = {
				employee_id: row.employee_id,
				employee_name: row.employee_name,
				employee_type: row.employee_type,
				hours_worked: parseFloat(row.hours_worked)
			};

			if (row.employee_type === "doctor") {
				dayAssignment.doctors.push(staffMember);
			} else if (row.employee_type === "nurse") {
				dayAssignment.nurses.push(staffMember);
			}
		});

		return Array.from(groupedByDate.values());
	}

	/**
	 * Get daily staff assignments formatted for report
	 */
	private static async getDailyStaffForReport(
		patientId: number,
		admissionTime: string,
		dischargeTime?: string
	): Promise<any[]> {
		const endDate = dischargeTime || new Date().toISOString();

		const staffSql = `
            SELECT 
                dsa.work_date,
                e.employee_id,
                e.name as employee_name,
                e.employee_type
            FROM DailyStaffAssignment dsa
            JOIN Employee e ON dsa.employee_id = e.employee_id
            WHERE dsa.patient_id = $1
            AND dsa.work_date >= $2::date
            AND dsa.work_date <= $3::date
            AND dsa.hours_worked > 0
            ORDER BY dsa.work_date, e.employee_type, e.name
        `;

		const result = await query(staffSql, [
			patientId,
			admissionTime,
			endDate
		]);

		// Group by date
		const groupedByDate = new Map<
			string,
			{ doctors: string[]; nurses: string[] }
		>();

		result.rows.forEach((row) => {
			const dateKey = row.work_date;
			if (!groupedByDate.has(dateKey)) {
				groupedByDate.set(dateKey, { doctors: [], nurses: [] });
			}

			const dayStaff = groupedByDate.get(dateKey)!;
			if (row.employee_type === "doctor") {
				dayStaff.doctors.push(row.employee_name);
			} else if (row.employee_type === "nurse") {
				dayStaff.nurses.push(row.employee_name);
			}
		});

		return Array.from(groupedByDate.entries()).map(([date, staff]) => ({
			work_date: date,
			doctors: staff.doctors,
			nurses: staff.nurses
		}));
	}

	/**
	 * Get services used in an admission
	 */
	private static async getAdmissionServices(billId: number): Promise<any[]> {
		const sql = `
            SELECT 
                s.service_id,
                s.name as service_name,
                s.service_type,
                SUM(bd.quantity) as quantity,
                bd.unit_price,
                SUM(bd.quantity * bd.unit_price) as total_price,
                array_agg(DISTINCT bd.generated_at::date ORDER BY bd.generated_at::date) as charge_dates
            FROM BillDetail bd
            JOIN Service s ON bd.service_id = s.service_id
            WHERE bd.bill_id = $1
            AND bd.service_id IS NOT NULL
            GROUP BY s.service_id, s.name, s.service_type, bd.unit_price
            ORDER BY s.name
        `;

		const result = await query(sql, [billId]);
		return result.rows.map((row) => ({
			service_id: row.service_id,
			service_name: row.service_name,
			service_type: row.service_type,
			quantity: parseInt(row.quantity),
			unit_price: parseFloat(row.unit_price),
			total_price: parseFloat(row.total_price),
			charge_dates: row.charge_dates || []
		}));
	}

	/**
	 * Get drugs used in an admission
	 */
	private static async getAdmissionDrugs(
		billId: number,
		_patientId: number
	): Promise<any[]> {
		const sql = `
            SELECT 
                dc.drug_id,
                dc.name as drug_name,
                dc.manufacturer,
                SUM(bd.quantity) as quantity,
                bd.unit_price,
                SUM(bd.quantity * bd.unit_price) as total_price,
                array_agg(DISTINCT bd.generated_at::date ORDER BY bd.generated_at::date) as administration_dates
            FROM BillDetail bd
            JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
            JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE bd.bill_id = $1
            AND bd.drug_shipment_id IS NOT NULL
            GROUP BY dc.drug_id, dc.name, dc.manufacturer, bd.unit_price
            ORDER BY dc.name
        `;

		const result = await query(sql, [billId]);
		return result.rows.map((row) => ({
			drug_id: row.drug_id,
			drug_name: row.drug_name,
			manufacturer: row.manufacturer,
			quantity: parseInt(row.quantity),
			unit_price: parseFloat(row.unit_price),
			total_price: parseFloat(row.total_price),
			administration_dates: row.administration_dates || []
		}));
	}

	/**
	 * Get services and drugs grouped by service date
	 */
	private static async getAdmissionItemsByDate(
		billId: number
	): Promise<any[]> {
		const itemsSql = `
            SELECT 
                bd.generated_at::date as service_date,
                COALESCE(s.name, dc.name) as item_name,
                CASE 
                    WHEN bd.service_id IS NOT NULL THEN 'service'
                    ELSE 'drug'
                END as item_type,
                bd.quantity,
                bd.unit_price,
                (bd.quantity * bd.unit_price) as total_price
            FROM BillDetail bd
            LEFT JOIN Service s ON bd.service_id = s.service_id
            LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
            LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
            WHERE bd.bill_id = $1
            ORDER BY bd.generated_at::date, item_type, item_name
        `;

		const result = await query(itemsSql, [billId]);

		// Group by date
		const groupedByDate = new Map<string, any[]>();

		result.rows.forEach((row) => {
			const dateKey = row.service_date;
			if (!groupedByDate.has(dateKey)) {
				groupedByDate.set(dateKey, []);
			}

			groupedByDate.get(dateKey)!.push({
				item_name: row.item_name,
				item_type: row.item_type,
				quantity: parseInt(row.quantity),
				unit_price: parseFloat(row.unit_price),
				total_price: parseFloat(row.total_price)
			});
		});

		// Convert to array format
		return Array.from(groupedByDate.entries()).map(([date, items]) => ({
			service_date: date,
			items: items,
			date_total: items.reduce((sum, item) => sum + item.total_price, 0)
		}));
	}

	// ==================== DOCTOR REPORTS ====================

	private static async getDoctorPatientDetails(
		doctorId: number,
		dateRange: ReportDateRange,
		relationshipType: "referred" | "attended" | "supervised"
	): Promise<any[]> {
		let joinClause = "";
		let whereClause = "";

		switch (relationshipType) {
			case "referred":
				whereClause = "p.referring_doctor_id = $1";
				break;
			case "attended":
			case "supervised":
				joinClause =
					"JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id";
				whereClause = "dph.doctor_id = $1";
				break;
		}

		const sql = `
    	    SELECT 
    	        p.patient_id,
    	        p.name as patient_name,
    	        p.national_id,
    	        p.gender,
    	        p.payment_type,
    	        ic.name as insurance_company,
    	        p.insurance_card_id,
    	        p.insurance_form_id,
    	        COUNT(DISTINCT ph.patient_history_id) as admission_count,
    	        COALESCE(SUM(b.total_amount), 0) as total_billed,
    	        COALESCE(SUM(b.paid_amount), 0) as total_paid,
    	        MAX(ph.admission_time) as last_admission_time,
    	        MAX(ph.discharge_time) as last_discharge_time,
    	        MAX(ph.diagnosis) as last_diagnosis
    	    FROM Patient p
    	    LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
    	    JOIN PatientHistory ph ON p.patient_id = ph.patient_id
    	    ${joinClause}
    	    LEFT JOIN Bill b ON ph.bill_id = b.bill_id
    	    WHERE ${whereClause}
    	    AND ph.admission_time BETWEEN $2 AND $3::DATE + '1 day'::INTERVAL
    	    GROUP BY p.patient_id, p.name, p.national_id, p.gender, p.payment_type, 
    	             ic.name, p.insurance_card_id, p.insurance_form_id
    	    ORDER BY p.name
    	`;

		const result = await query(sql, [
			doctorId,
			dateRange.start_date,
			dateRange.end_date
		]);

		return result.rows.map((row) => ({
			patient_id: row.patient_id,
			patient_name: row.patient_name,
			national_id: row.national_id,
			gender: row.gender,
			age: this.calculateAgeFromNationalId(row.national_id),
			payment_type: row.payment_type,
			insurance_company: row.insurance_company,
			insurance_card_id: row.insurance_card_id,
			insurance_form_id: row.insurance_form_id,
			admission_count: parseInt(row.admission_count),
			total_billed: parseFloat(row.total_billed),
			total_paid: parseFloat(row.total_paid),
			last_admission_time: row.last_admission_time,
			last_discharge_time: row.last_discharge_time,
			last_diagnosis: row.last_diagnosis
		}));
	}

	/**
	 * Get patients referred by specific doctor
	 */
	static async getPatientsReferredByDoctor(
		doctorId: number,
		dateRange: ReportDateRange
	): Promise<DoctorPatientReport> {
		const doctorSql = `
	        SELECT e.employee_id as doctor_id, e.name as doctor_name, d.doctor_type
	        FROM Doctor d
	        JOIN Employee e ON d.doctor_id = e.employee_id
	        WHERE d.doctor_id = $1
	    `;
		const doctorResult = await query(doctorSql, [doctorId]);

		if (doctorResult.rows.length === 0) {
			throw new Error("Doctor not found");
		}

		const doctor = doctorResult.rows[0];
		const patients = await this.getDoctorPatientDetails(
			doctorId,
			dateRange,
			"referred"
		);

		return {
			doctor_id: doctor.doctor_id,
			doctor_name: doctor.doctor_name,
			doctor_type: doctor.doctor_type,
			total_patients: patients.length,
			patients: patients
		};
	}

	/**
	 * Get all patients referred by all doctors
	 */
	static async getAllPatientsReferredByDoctors(
		dateRange: ReportDateRange
	): Promise<DoctorPatientReport[]> {
		const doctorsSql = `
            SELECT DISTINCT d.doctor_id, e.name as doctor_name, d.doctor_type
            FROM Doctor d
            JOIN Employee e ON d.doctor_id = e.employee_id
            WHERE EXISTS (
                SELECT 1 FROM Patient p
                JOIN PatientHistory ph ON p.patient_id = ph.patient_id
                WHERE p.referring_doctor_id = d.doctor_id
                AND ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            )
            ORDER BY e.name
        `;

		const doctorsResult = await query(doctorsSql, [
			dateRange.start_date,
			dateRange.end_date
		]);
		const reports: DoctorPatientReport[] = [];

		for (const doctor of doctorsResult.rows) {
			const report = await this.getPatientsReferredByDoctor(
				doctor.doctor_id,
				dateRange
			);
			reports.push(report);
		}

		return reports;
	}

	/**
	 * Get patients attended by specific doctor
	 */
	static async getPatientsAttendedByDoctor(
		doctorId: number,
		dateRange: ReportDateRange
	): Promise<DoctorPatientReport> {
		const doctorSql = `
    	    SELECT e.employee_id as doctor_id, e.name as doctor_name, d.doctor_type
    	    FROM Doctor d
    	    JOIN Employee e ON d.doctor_id = e.employee_id
    	    WHERE d.doctor_id = $1
    	`;
		const doctorResult = await query(doctorSql, [doctorId]);

		if (doctorResult.rows.length === 0) {
			throw new Error("Doctor not found");
		}

		const doctor = doctorResult.rows[0];
		const patients = await this.getDoctorPatientDetails(
			doctorId,
			dateRange,
			"attended"
		);

		return {
			doctor_id: doctor.doctor_id,
			doctor_name: doctor.doctor_name,
			doctor_type: doctor.doctor_type,
			total_patients: patients.length,
			patients: patients
		};
	}

	/**
	 * Get all patients attended by all doctors
	 */
	static async getAllPatientsAttendedByDoctors(
		dateRange: ReportDateRange
	): Promise<DoctorPatientReport[]> {
		const doctorsSql = `
            SELECT DISTINCT d.doctor_id, e.name as doctor_name, d.doctor_type
            FROM Doctor d
            JOIN Employee e ON d.doctor_id = e.employee_id
            WHERE EXISTS (
                SELECT 1 FROM DoctorPatientHistory dph
                JOIN PatientHistory ph ON dph.patient_history_id = ph.patient_history_id
                WHERE dph.doctor_id = d.doctor_id
                AND ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            )
            ORDER BY e.name
        `;

		const doctorsResult = await query(doctorsSql, [
			dateRange.start_date,
			dateRange.end_date
		]);
		const reports: DoctorPatientReport[] = [];

		for (const doctor of doctorsResult.rows) {
			const report = await this.getPatientsAttendedByDoctor(
				doctor.doctor_id,
				dateRange
			);
			reports.push(report);
		}

		return reports;
	}

	/**
	 * Get patients supervised by specific supervising doctor
	 */
	static async getPatientsSupervisedByDoctor(
		doctorId: number,
		dateRange: ReportDateRange
	): Promise<DoctorPatientReport> {
		const doctorSql = `
	        SELECT e.employee_id as doctor_id, e.name as doctor_name, d.doctor_type
	        FROM Doctor d
	        JOIN Employee e ON d.doctor_id = e.employee_id
	        WHERE d.doctor_id = $1 AND d.doctor_type = 'supervising'
	    `;
		const doctorResult = await query(doctorSql, [doctorId]);

		if (doctorResult.rows.length === 0) {
			throw new Error("Supervising doctor not found");
		}

		const doctor = doctorResult.rows[0];
		const patients = await this.getDoctorPatientDetails(
			doctorId,
			dateRange,
			"supervised"
		);

		return {
			doctor_id: doctor.doctor_id,
			doctor_name: doctor.doctor_name,
			doctor_type: doctor.doctor_type,
			total_patients: patients.length,
			patients: patients
		};
	}

	// ==================== NURSE REPORTS ====================

	/**
	 * Get daily staff assignments for a nurse
	 */
	private static async getNurseDailyAssignments(
		nurseId: number,
		dateRange: ReportDateRange
	): Promise<NurseDailyAssignment[]> {
		const sql = `
        SELECT 
            dsa.work_date,
            p.patient_id,
            p.name as patient_name,
            dsa.hours_worked,
            p.payment_type,
            ph.diagnosis
        FROM DailyStaffAssignment dsa
        JOIN Patient p ON dsa.patient_id = p.patient_id
        LEFT JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            AND dsa.work_date BETWEEN ph.admission_time::date AND COALESCE(ph.discharge_time::date + '1 day'::interval, CURRENT_DATE)
        WHERE dsa.employee_id = $1
        AND dsa.work_date BETWEEN $2 AND $3
        AND dsa.hours_worked > 0
        ORDER BY dsa.work_date DESC, p.name
    `;

		const result = await query(sql, [
			nurseId,
			dateRange.start_date,
			dateRange.end_date
		]);

		// Group by date
		const groupedByDate = new Map<string, any[]>();

		result.rows.forEach((row) => {
			const dateKey = row.work_date;
			if (!groupedByDate.has(dateKey)) {
				groupedByDate.set(dateKey, []);
			}

			groupedByDate.get(dateKey)!.push({
				patient_id: row.patient_id,
				patient_name: row.patient_name,
				hours_worked: parseFloat(row.hours_worked),
				payment_type: row.payment_type,
				diagnosis: row.diagnosis
			});
		});

		// Convert to array format
		return Array.from(groupedByDate.entries()).map(([date, patients]) => ({
			work_date: date,
			patients: patients,
			total_hours: patients.reduce((sum, p) => sum + p.hours_worked, 0),
			patient_count: patients.length
		}));
	}

	/**
	 * Update getPatientsAttendedByNurse to include daily assignments
	 */
	static async getPatientsAttendedByNurse(
		nurseId: number,
		dateRange: ReportDateRange
	): Promise<NursePatientReport> {
		const nurseSql = `
	        SELECT employee_id as nurse_id, name as nurse_name
	        FROM Employee
	        WHERE employee_id = $1 AND employee_type = 'nurse'
	    `;
		const nurseResult = await query(nurseSql, [nurseId]);

		if (nurseResult.rows.length === 0) {
			throw new Error("Nurse not found");
		}

		const nurse = nurseResult.rows[0];

		const patientsSql = `
	        SELECT DISTINCT
	            p.patient_id,
	            p.name as patient_name,
	            p.payment_type,
	            MAX(ph.admission_time) as last_admission_time,
	            MAX(ph.discharge_time) as last_discharge_time,
	            MAX(ph.diagnosis) as diagnosis,
	            COUNT(DISTINCT dsa.work_date) as total_days_assigned
	        FROM Patient p
	        JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	        JOIN DailyStaffAssignment dsa ON p.patient_id = dsa.patient_id
	        WHERE dsa.employee_id = $1
	        AND ph.admission_time BETWEEN $2 AND $3::DATE + '1 day'::INTERVAL
	        GROUP BY p.patient_id, p.name, p.payment_type
	        ORDER BY last_admission_time DESC
	    `;

		const patientsResult = await query(patientsSql, [
			nurseId,
			dateRange.start_date,
			dateRange.end_date
		]);

		const patients = patientsResult.rows.map((row) => ({
			patient_id: row.patient_id,
			patient_name: row.patient_name,
			last_admission_time: row.last_admission_time,
			last_discharge_time: row.last_discharge_time,
			payment_type: row.payment_type,
			diagnosis: row.diagnosis,
			total_days_assigned: parseInt(row.total_days_assigned)
		}));

		// Get daily assignments
		const dailyAssignments = await this.getNurseDailyAssignments(
			nurseId,
			dateRange
		);

		return {
			nurse_id: nurse.nurse_id,
			nurse_name: nurse.nurse_name,
			total_patients: patients.length,
			patients: patients,
			daily_assignments: dailyAssignments
		};
	}

	/**
	 * Update getAllPatientsAttendedByNurses to include daily assignments
	 */
	static async getAllPatientsAttendedByNurses(
		dateRange: ReportDateRange
	): Promise<NursePatientReport[]> {
		const nursesSql = `
	        SELECT DISTINCT e.employee_id as nurse_id, e.name as nurse_name
	        FROM Employee e
	        WHERE e.employee_type = 'nurse'
	        AND EXISTS (
	            SELECT 1 FROM DailyStaffAssignment dsa
	            JOIN PatientHistory ph ON dsa.patient_id = ph.patient_id
	            WHERE dsa.employee_id = e.employee_id
	            AND ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
	        )
	        ORDER BY e.name
	    `;

		const nursesResult = await query(nursesSql, [
			dateRange.start_date,
			dateRange.end_date
		]);
		const reports: NursePatientReport[] = [];

		for (const nurse of nursesResult.rows) {
			const report = await this.getPatientsAttendedByNurse(
				nurse.nurse_id,
				dateRange
			);
			reports.push(report);
		}

		return reports;
	}

	// ==================== STATISTICAL REPORTS ====================

	/**
	 * Get patient statistics with time grouping
	 */
	static async getPatientStatistics(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<PatientStatistics & { time_grouped: TimeGroupedData[] }> {
		// Get overall statistics
		const statsSql = `
            SELECT 
                COUNT(DISTINCT p.patient_id) as total_patients,
                COUNT(DISTINCT CASE WHEN p.payment_type = 'cash' THEN p.patient_id END) as cash_patients,
                COUNT(DISTINCT CASE WHEN p.payment_type = 'credit' THEN p.patient_id END) as credit_patients,
                COUNT(DISTINCT CASE WHEN p.payment_type = 'insurance' THEN p.patient_id END) as insurance_patients,
                COUNT(DISTINCT CASE WHEN p.gender = 'male' THEN p.patient_id END) as male_patients,
                COUNT(DISTINCT CASE WHEN p.gender = 'female' THEN p.patient_id END) as female_patients,
                COUNT(DISTINCT CASE WHEN p.gender = 'other' THEN p.patient_id END) as other_gender_patients,
                AVG(EXTRACT(EPOCH FROM (ph.discharge_time - ph.admission_time)) / 86400.0) as avg_stay_duration_days
            FROM Patient p
            JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            WHERE ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
        `;

		const statsResult = await query(statsSql, [
			dateRange.start_date,
			dateRange.end_date
		]);
		const stats = statsResult.rows[0];

		// Get time-grouped data
		const timeGroupedData = await this.getTimeGroupedPatientData(
			dateRange,
			timeGrouping
		);

		return {
			total_patients: parseInt(stats.total_patients),
			by_payment_type: {
				cash: parseInt(stats.cash_patients),
				credit: parseInt(stats.credit_patients),
				insurance: parseInt(stats.insurance_patients)
			},
			by_gender: {
				male: parseInt(stats.male_patients),
				female: parseInt(stats.female_patients),
				other: parseInt(stats.other_gender_patients)
			},
			avg_stay_duration: parseFloat(stats.avg_stay_duration_days) || 0,
			time_grouped: timeGroupedData
		};
	}

	/**
	 * Get time-grouped patient data counting patients who were admitted during each period
	 */
	private static async getTimeGroupedPatientData(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<TimeGroupedData[]> {
		let periodFormat: string;
		let dateSeriesInterval: string;

		switch (timeGrouping) {
			case "year":
				periodFormat = "YYYY";
				dateSeriesInterval = "1 year";
				break;
			case "month":
				periodFormat = "YYYY-MM";
				dateSeriesInterval = "1 month";
				break;
			case "day":
				periodFormat = "YYYY-MM-DD";
				dateSeriesInterval = "1 day";
				break;
		}

		// Generate complete date series and count patients who were in the hospital during each period
		const sql = `
 	       WITH date_series AS (
 	           SELECT generate_series(
 	               $1::date,
 	               $2::date + '1 day'::interval,
 	               $3::interval
 	           )::date as period_date
 	       ),
 	       period_series AS (
 	           SELECT 
 	               period_date,
 	               TO_CHAR(period_date, $4) as period
 	           FROM date_series
 	       )
 	       SELECT 
 	           ps.period,
 	           COUNT(DISTINCT ph.patient_id) as patient_count,
 	           COALESCE(SUM(b.total_amount), 0) as total_amount
 	       FROM period_series ps
 	       LEFT JOIN PatientHistory ph ON (
 	           ph.admission_time::date <= ps.period_date
 	           AND (
 	               ph.discharge_time IS NULL 
 	               OR ph.discharge_time::date >= ps.period_date
 	           )
 	       )
 	       LEFT JOIN Bill b ON ph.bill_id = b.bill_id
 	       GROUP BY ps.period, ps.period_date
 	       ORDER BY ps.period_date
 	   `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			dateSeriesInterval,
			periodFormat
		]);

		return result.rows.map((row) => {
			const parsed = this.parsePeriodFromString(row.period, timeGrouping);
			return {
				period: row.period,
				year: parsed.year,
				month: parsed.month,
				day: parsed.day,
				count: parseInt(row.patient_count) || 0,
				total_amount: parseFloat(row.total_amount) || 0
			};
		});
	}

	/**
	 * Parse period string to extract components
	 */
	private static parsePeriodFromString(
		period: string,
		grouping: TimeGrouping
	): any {
		const result: any = {};

		switch (grouping) {
			case "year":
				result.year = parseInt(period);
				break;
			case "month":
				const [year, month] = period.split("-");
				result.year = parseInt(year);
				result.month = parseInt(month);
				break;
			case "day":
				const [y, m, d] = period.split("-");
				result.year = parseInt(y);
				result.month = parseInt(m);
				result.day = parseInt(d);
				break;
		}

		return result;
	}

	/**
	 * Get average stay duration grouped by time
	 */
	static async getAverageStayByTime(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<TimeGroupedData[]> {
		let periodFormat: string;
		let dateSeriesInterval: string;

		switch (timeGrouping) {
			case "year":
				periodFormat = "YYYY";
				dateSeriesInterval = "1 year";
				break;
			case "month":
				periodFormat = "YYYY-MM";
				dateSeriesInterval = "1 month";
				break;
			case "day":
				periodFormat = "YYYY-MM-DD";
				dateSeriesInterval = "1 day";
				break;
		}

		const sql = `
        WITH date_series AS (
            SELECT generate_series(
                $1::date,
                $2::date + '1 day'::interval,
                $3::interval
            )::date as period_date
        ),
        period_series AS (
            SELECT 
                period_date,
                TO_CHAR(period_date, $4) as period
            FROM date_series
        )
        SELECT 
            ps.period,
            AVG(
                CASE 
                    WHEN ph.discharge_time IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (ph.discharge_time - ph.admission_time)) / 86400.0
                    ELSE NULL
                END
            ) as avg_stay_days,
            COUNT(CASE WHEN ph.discharge_time IS NOT NULL THEN 1 END) as discharge_count
        FROM period_series ps
        LEFT JOIN PatientHistory ph ON (
            TO_CHAR(ph.admission_time, $4) = ps.period
            OR (
                ph.admission_time::date <= ps.period_date
                AND ph.discharge_time::date >= ps.period_date
            )
        )
        WHERE ph.discharge_time IS NOT NULL OR ph.patient_history_id IS NULL
        GROUP BY ps.period, ps.period_date
        ORDER BY ps.period_date
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			dateSeriesInterval,
			periodFormat
		]);

		return result.rows.map((row) => {
			const parsed = this.parsePeriodFromString(row.period, timeGrouping);
			return {
				period: row.period,
				year: parsed.year,
				month: parsed.month,
				day: parsed.day,
				count: parseInt(row.discharge_count) || 0,
				avg_stay_days: parseFloat(row.avg_stay_days) || 0
			};
		});
	}

	/**
	 * Get revenue trends
	 */
	static async getRevenueTrends(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<any[]> {
		let periodFormat: string;
		let dateSeriesInterval: string;

		switch (timeGrouping) {
			case "year":
				periodFormat = "YYYY";
				dateSeriesInterval = "1 year";
				break;
			case "month":
				periodFormat = "YYYY-MM";
				dateSeriesInterval = "1 month";
				break;
			case "day":
				periodFormat = "YYYY-MM-DD";
				dateSeriesInterval = "1 day";
				break;
		}

		const sql = `
        WITH date_series AS (
            SELECT generate_series(
                $1::date,
                $2::date + '1 day'::interval,
                $3::interval
            )::date as period_date
        ),
        period_series AS (
            SELECT 
                period_date,
                TO_CHAR(period_date, $4) as period
            FROM date_series
        ),
        revenue_data AS (
            SELECT 
                TO_CHAR(b.generated_at, $4) as period,
                SUM(b.total_amount) as total_revenue,
                SUM(b.paid_amount) as collected_revenue,
                SUM(b.total_amount - b.paid_amount) as outstanding_revenue,
                COUNT(DISTINCT b.bill_id) as bill_count,
                AVG(b.total_amount) as avg_bill_amount
            FROM Bill b
            WHERE b.generated_at BETWEEN $1 AND $2
            GROUP BY TO_CHAR(b.generated_at, $4)
        )
        SELECT 
            ps.period,
            COALESCE(rd.total_revenue, 0) as total_revenue,
            COALESCE(rd.collected_revenue, 0) as collected_revenue,
            COALESCE(rd.outstanding_revenue, 0) as outstanding_revenue,
            COALESCE(rd.bill_count, 0) as bill_count,
            COALESCE(rd.avg_bill_amount, 0) as avg_bill_amount
        FROM period_series ps
        LEFT JOIN revenue_data rd ON ps.period = rd.period
        ORDER BY ps.period_date
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			dateSeriesInterval,
			periodFormat
		]);

		return result.rows.map((row) => ({
			period: row.period,
			total_revenue: parseFloat(row.total_revenue) || 0,
			collected_revenue: parseFloat(row.collected_revenue) || 0,
			outstanding_revenue: parseFloat(row.outstanding_revenue) || 0,
			bill_count: parseInt(row.bill_count),
			avg_bill_amount: parseFloat(row.avg_bill_amount) || 0
		}));
	}

	/**
	 * Get admission vs discharge trends
	 */
	static async getAdmissionDischargeTrends(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<any[]> {
		let periodFormat: string;
		let dateSeriesInterval: string;

		switch (timeGrouping) {
			case "year":
				periodFormat = "YYYY";
				dateSeriesInterval = "1 year";
				break;
			case "month":
				periodFormat = "YYYY-MM";
				dateSeriesInterval = "1 month";
				break;
			case "day":
				periodFormat = "YYYY-MM-DD";
				dateSeriesInterval = "1 day";
				break;
		}

		const sql = `
        WITH date_series AS (
            SELECT generate_series(
                $1::date,
                $2::date + '1 day'::interval,
                $3::interval
            )::date as period_date
        ),
        period_series AS (
            SELECT 
                period_date,
                TO_CHAR(period_date, $4) as period
            FROM date_series
        ),
        admissions AS (
            SELECT 
                TO_CHAR(ph.admission_time, $4) as period,
                COUNT(*) as admission_count
            FROM PatientHistory ph
            WHERE ph.admission_time BETWEEN $1 AND $2
            GROUP BY TO_CHAR(ph.admission_time, $4)
        ),
        discharges AS (
            SELECT 
                TO_CHAR(ph.discharge_time, $4) as period,
                COUNT(*) as discharge_count
            FROM PatientHistory ph
            WHERE ph.discharge_time BETWEEN $1 AND $2
            GROUP BY TO_CHAR(ph.discharge_time, $4)
        )
        SELECT 
            ps.period,
            COALESCE(a.admission_count, 0) as admissions,
            COALESCE(d.discharge_count, 0) as discharges,
            COALESCE(a.admission_count, 0) - COALESCE(d.discharge_count, 0) as net_change
        FROM period_series ps
        LEFT JOIN admissions a ON ps.period = a.period
        LEFT JOIN discharges d ON ps.period = d.period
        ORDER BY ps.period_date
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			dateSeriesInterval,
			periodFormat
		]);

		return result.rows.map((row) => ({
			period: row.period,
			admissions: parseInt(row.admissions),
			discharges: parseInt(row.discharges),
			net_change: parseInt(row.net_change)
		}));
	}

	/**
	 * Get top services used
	 */
	static async getTopServices(
		dateRange: ReportDateRange,
		limit: number = 10
	): Promise<any[]> {
		const sql = `
        SELECT 
            s.service_id,
            s.name as service_name,
            s.service_type,
            COUNT(bd.bill_detail_id) as usage_count,
            SUM(bd.quantity) as total_quantity,
            SUM(bd.quantity * bd.unit_price) as total_revenue
        FROM BillDetail bd
        JOIN Service s ON bd.service_id = s.service_id
        JOIN Bill b ON bd.bill_id = b.bill_id
        WHERE b.generated_at BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
        GROUP BY s.service_id, s.name, s.service_type
        ORDER BY total_revenue DESC
        LIMIT $3
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			limit
		]);

		return result.rows.map((row) => ({
			service_id: row.service_id,
			service_name: row.service_name,
			service_type: row.service_type,
			usage_count: parseInt(row.usage_count),
			total_quantity: parseInt(row.total_quantity),
			total_revenue: parseFloat(row.total_revenue)
		}));
	}

	/**
	 * Get top drugs dispensed
	 */
	static async getTopDrugs(
		dateRange: ReportDateRange,
		limit: number = 10
	): Promise<any[]> {
		const sql = `
        SELECT 
            dc.drug_id,
            dc.name as drug_name,
            dc.manufacturer,
            COUNT(bd.bill_detail_id) as usage_count,
            SUM(bd.quantity) as total_quantity,
            SUM(bd.quantity * bd.unit_price) as total_revenue
        FROM BillDetail bd
        JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
        JOIN DrugCard dc ON ds.drug_id = dc.drug_id
        JOIN Bill b ON bd.bill_id = b.bill_id
        WHERE b.generated_at BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
        GROUP BY dc.drug_id, dc.name, dc.manufacturer
        ORDER BY total_revenue DESC
        LIMIT $3
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date,
			limit
		]);

		return result.rows.map((row) => ({
			drug_id: row.drug_id,
			drug_name: row.drug_name,
			manufacturer: row.manufacturer,
			usage_count: parseInt(row.usage_count),
			total_quantity: parseInt(row.total_quantity),
			total_revenue: parseFloat(row.total_revenue)
		}));
	}

	/**
	 * Get staff utilization statistics
	 */
	static async getStaffUtilization(dateRange: ReportDateRange): Promise<any> {
		const sql = `
        SELECT 
            e.employee_type,
            COUNT(DISTINCT e.employee_id) as staff_count,
            COUNT(DISTINCT dsa.patient_id) as patients_served,
            AVG(dsa.hours_worked) as avg_hours_per_assignment,
            SUM(dsa.hours_worked) as total_hours_worked
        FROM Employee e
        LEFT JOIN DailyStaffAssignment dsa ON e.employee_id = dsa.employee_id
            AND dsa.work_date BETWEEN $1 AND $2
        WHERE e.is_active = true
        GROUP BY e.employee_type
        ORDER BY e.employee_type
    `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date
		]);

		return result.rows.map((row) => ({
			employee_type: row.employee_type,
			staff_count: parseInt(row.staff_count),
			patients_served: parseInt(row.patients_served) || 0,
			avg_hours_per_assignment:
				parseFloat(row.avg_hours_per_assignment) || 0,
			total_hours_worked: parseFloat(row.total_hours_worked) || 0,
			avg_patients_per_staff:
				row.staff_count > 0
					? (parseInt(row.patients_served) || 0) /
					  parseInt(row.staff_count)
					: 0
		}));
	}

	/**
	 * Get patient statistics by gender with time grouping
	 */
	static async getPatientStatisticsByGender(
		dateRange: ReportDateRange,
		timeGrouping: TimeGrouping
	): Promise<any> {
		let groupByClause: string;
		let selectClause: string;

		switch (timeGrouping) {
			case "year":
				selectClause =
					"EXTRACT(YEAR FROM ph.admission_time)::text as period";
				groupByClause =
					"EXTRACT(YEAR FROM ph.admission_time), p.gender";
				break;
			case "month":
				selectClause =
					"TO_CHAR(ph.admission_time, 'YYYY-MM') as period";
				groupByClause =
					"TO_CHAR(ph.admission_time, 'YYYY-MM'), p.gender";
				break;
			case "day":
				selectClause =
					"TO_CHAR(ph.admission_time, 'YYYY-MM-DD') as period";
				groupByClause =
					"TO_CHAR(ph.admission_time, 'YYYY-MM-DD'), p.gender";
				break;
		}

		const sql = `
            SELECT 
                ${selectClause},
                p.gender,
                COUNT(DISTINCT p.patient_id) as count
            FROM Patient p
            JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            WHERE ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            GROUP BY ${groupByClause}
            ORDER BY period, p.gender
        `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date
		]);

		// Group by period
		const grouped = new Map<string, any>();
		result.rows.forEach((row) => {
			if (!grouped.has(row.period)) {
				grouped.set(row.period, {
					period: row.period,
					male: 0,
					female: 0,
					other: 0,
					total: 0
				});
			}
			const periodData = grouped.get(row.period)!;
			periodData[row.gender] = parseInt(row.count);
			periodData.total += parseInt(row.count);
		});

		return Array.from(grouped.values());
	}

	/**
	 * Get doctor statistics
	 */
	static async getDoctorStatistics(
		dateRange: ReportDateRange
	): Promise<DoctorStatistics[]> {
		const sql = `
            SELECT 
                d.doctor_id,
                e.name as doctor_name,
                d.doctor_type,
                COUNT(DISTINCT CASE 
                    WHEN dph.doctor_id IS NOT NULL THEN dph.patient_history_id 
                END) as total_patients_attended,
                COUNT(DISTINCT CASE 
                    WHEN p.referring_doctor_id = d.doctor_id THEN p.patient_id 
                END) as total_patients_referred,
                COUNT(DISTINCT CASE 
                    WHEN d.doctor_type = 'supervising' AND dph.doctor_id IS NOT NULL 
                    THEN dph.patient_history_id 
                END) as total_patients_supervised,
                COALESCE(SUM(b.paid_amount), 0) as total_revenue_generated
            FROM Doctor d
            JOIN Employee e ON d.doctor_id = e.employee_id
            LEFT JOIN DoctorPatientHistory dph ON d.doctor_id = dph.doctor_id
            LEFT JOIN PatientHistory ph ON dph.patient_history_id = ph.patient_history_id
            LEFT JOIN Patient p ON ph.patient_id = p.patient_id
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE ph.admission_time BETWEEN $1 AND $2::DATE + '1 day'::INTERVAL
            OR p.referring_doctor_id = d.doctor_id
            GROUP BY d.doctor_id, e.name, d.doctor_type
            ORDER BY total_revenue_generated DESC
        `;

		const result = await query(sql, [
			dateRange.start_date,
			dateRange.end_date
		]);

		// Calculate avg patients per day
		const days = Math.max(
			1,
			Math.ceil(
				(new Date(dateRange.end_date).getTime() -
					new Date(dateRange.start_date).getTime()) /
					(1000 * 60 * 60 * 24)
			)
		);

		return result.rows.map((row) => ({
			doctor_id: row.doctor_id,
			doctor_name: row.doctor_name,
			doctor_type: row.doctor_type,
			total_patients_attended: parseInt(row.total_patients_attended),
			total_patients_referred: parseInt(row.total_patients_referred),
			total_patients_supervised: parseInt(row.total_patients_supervised),
			avg_patients_per_day: parseInt(row.total_patients_attended) / days,
			total_revenue_generated: parseFloat(row.total_revenue_generated)
		}));
	}

	// ==================== EMPLOYEE PAYMENT REPORTS ====================

	/**
	 * Get employee payment report
	 */
	static async getEmployeePaymentReport(
		dateRange: ReportDateRange,
		employeeType?: EmployeeTypeFilter,
		employeeId?: number
	): Promise<EmployeePaymentReport[]> {
		let employeeCondition = "";
		const params: any[] = [dateRange.start_date, dateRange.end_date];
		let paramIndex = 3;

		if (employeeType && employeeType !== "all") {
			employeeCondition += ` AND e.employee_type = $${paramIndex}`;
			params.push(employeeType);
			paramIndex++;
		}

		if (employeeId) {
			employeeCondition += ` AND e.employee_id = $${paramIndex}`;
			params.push(employeeId);
			paramIndex++;
		}

		const sql = `
        SELECT DISTINCT
            e.employee_id,
            e.name as employee_name,
            e.employee_type,
            e.hire_date
        FROM Employee e
        WHERE EXISTS (
            SELECT 1 FROM EmployeePayment ep
            WHERE ep.employee_id = e.employee_id
            AND ep.issued_timestamp BETWEEN $1 AND $2
        )
        ${employeeCondition}
        ORDER BY e.name
    `;

		const employeesResult = await query(sql, params);
		const reports: EmployeePaymentReport[] = [];

		for (const employee of employeesResult.rows) {
			const paymentDetails = await this.getEmployeePaymentDetails(
				employee.employee_id,
				dateRange
			);

			const breakdown = await this.getEmployeePaymentBreakdown(
				employee.employee_id,
				dateRange
			);

			const summary = this.calculatePaymentSummary(paymentDetails);

			reports.push({
				employee_id: employee.employee_id,
				employee_name: employee.employee_name,
				employee_type: employee.employee_type,
				hire_date: employee.hire_date,
				payment_summary: summary,
				payment_details: paymentDetails,
				payment_breakdown: breakdown
			});
		}

		return reports;
	}

	/**
	 * Get detailed payment information for an employee with all granular data
	 */
	private static async getEmployeePaymentDetails(
		employeeId: number,
		dateRange: ReportDateRange
	): Promise<EmployeePaymentDetail[]> {
		const sql = `
	        SELECT 
	            ep.payment_id,
	            ep.issued_timestamp as payment_date,
	            ep.payment_amount,
	            ep.extra_amount,
	            ep.extra_payment_type,
	            ep.payment_type,
	            ep.percentage_scope,
	            ep.is_paid,
	            ep.is_void,
	            ep.paid_timestamp,
	            u.username as paid_by,
	            p.patient_id as main_patient_id,
	            p.name as main_patient_name
	        FROM EmployeePayment ep
	        LEFT JOIN "User" u ON ep.paid_by_user_id = u.user_id
	        LEFT JOIN (
	            SELECT DISTINCT ON (payment_id) 
	                epp.payment_id, 
	                epp.patient_id,
	                p.name
	            FROM EmployeePaymentPatient epp
	            JOIN Patient p ON epp.patient_id = p.patient_id
	        ) p ON ep.payment_id = p.payment_id
	        WHERE ep.employee_id = $1
	        AND ep.issued_timestamp BETWEEN $2 AND $3::DATE + INTERVAL '1 day'
	        AND ep.is_void = false
	        ORDER BY ep.issued_timestamp DESC
	    `;

		const result = await query(sql, [
			employeeId,
			dateRange.start_date,
			dateRange.end_date
		]);
		const details: EmployeePaymentDetail[] = [];

		for (const row of result.rows) {
			// Get patient associations for this payment
			const patientAssociations =
				await this.getPaymentPatientAssociations(row.payment_id);

			// Get clock-in deductions for this payment period
			const clockInDeductions = await this.getClockInDeductions(
				employeeId,
				row.payment_date
			);

			details.push({
				payment_id: row.payment_id,
				payment_date: row.payment_date,
				payment_amount: parseFloat(row.payment_amount),
				extra_amount: parseFloat(row.extra_amount || 0),
				extra_payment_type: row.extra_payment_type,
				payment_type: row.payment_type,
				percentage_scope: row.percentage_scope,
				is_paid: row.is_paid,
				is_void: row.is_void,
				paid_timestamp: row.paid_timestamp,
				paid_by: row.paid_by,
				main_patient_id: row.main_patient_id,
				main_patient_name: row.main_patient_name,
				patient_associations:
					patientAssociations.length > 0
						? patientAssociations
						: undefined,
				clock_in_deductions:
					clockInDeductions.length > 0 ? clockInDeductions : undefined
			});
		}

		return details;
	}

	/**
	 * Get patient associations for a payment
	 */
	private static async getPaymentPatientAssociations(
		paymentId: number
	): Promise<any[]> {
		const sql = `
	        SELECT 
	            epp.payment_patient_id,
	            epp.patient_id,
	            p.name as patient_name,
	            epp.patient_history_id,
	            ph.admission_time,
	            ph.discharge_time,
	            ph.diagnosis,
	            epp.work_date,
	            epp.hours_worked,
	            epp.payment_amount,
	            epp.payment_type
	        FROM EmployeePaymentPatient epp
	        JOIN Patient p ON epp.patient_id = p.patient_id
	        LEFT JOIN PatientHistory ph ON epp.patient_history_id = ph.patient_history_id
	        WHERE epp.payment_id = $1
	        ORDER BY epp.work_date DESC, p.name
	    `;

		const result = await query(sql, [paymentId]);

		return result.rows.map((row) => ({
			payment_patient_id: row.payment_patient_id,
			patient_id: row.patient_id,
			patient_name: row.patient_name,
			patient_history_id: row.patient_history_id,
			admission_time: row.admission_time,
			discharge_time: row.discharge_time,
			diagnosis: row.diagnosis,
			work_date: row.work_date,
			hours_worked: parseFloat(row.hours_worked),
			payment_amount: parseFloat(row.payment_amount),
			payment_type: row.payment_type
		}));
	}

	/**
	 * Get clock-in deductions for an employee around a payment date
	 */
	private static async getClockInDeductions(
		employeeId: number,
		paymentDate: string
	): Promise<any[]> {
		// Get deductions from the previous pay period to current payment date
		const sql = `
	        SELECT 
	            ec.clock_id,
	            ec.clock_in,
	            ec.clock_out,
	            ec.pay_deduction,
	            EXTRACT(EPOCH FROM (ec.clock_out - ec.clock_in)) / 3600.0 as hours_worked,
	            CASE 
	                WHEN ec.clock_out IS NULL THEN 'Incomplete'
	                WHEN ec.pay_deduction > 0 THEN 'Late/Early'
	                ELSE 'On Time'
	            END as status
	        FROM EmployeeClockIn ec
	        WHERE ec.employee_id = $1
	        AND ec.clock_in::date <= $2::date
	        AND ec.pay_deduction > 0
	        AND ec.clock_in >= $2::date - INTERVAL '30 days'
	        ORDER BY ec.clock_in DESC
	    `;

		const result = await query(sql, [employeeId, paymentDate]);

		return result.rows.map((row) => ({
			clock_id: row.clock_id,
			clock_in: row.clock_in,
			clock_out: row.clock_out,
			pay_deduction: parseFloat(row.pay_deduction),
			hours_worked: parseFloat(row.hours_worked) || 0,
			status: row.status
		}));
	}

	/**
	 * Get comprehensive employee payment breakdown
	 */
	private static async getEmployeePaymentBreakdown(
		employeeId: number,
		dateRange: ReportDateRange
	): Promise<any> {
		const sql = `
	        SELECT 
	            e.employee_id,
	            e.name as employee_name,
	            e.employee_type,
	            e.base_pay,
	            e.extra_amount as base_extra_amount,
	            e.extra_payment_type as base_extra_payment_type,
	            e.per_patient_payment_type,
	            e.percentage_scope,
	            e.need_clock_in,
	            e.shift_type,
	            e.shift_start_time,
	            e.shift_end_time,
	            COUNT(DISTINCT ep.payment_id) as total_payment_records,
	            SUM(ep.payment_amount) as total_base_pay,
	            SUM(ep.extra_amount) as total_extra_pay,
	            SUM(CASE WHEN ep.is_paid THEN ep.payment_amount + ep.extra_amount ELSE 0 END) as total_paid,
	            SUM(CASE WHEN NOT ep.is_paid THEN ep.payment_amount + ep.extra_amount ELSE 0 END) as total_unpaid,
	            (
	                SELECT COALESCE(SUM(ec.pay_deduction), 0)
	                FROM EmployeeClockIn ec
	                WHERE ec.employee_id = e.employee_id
	                AND ec.clock_in BETWEEN $2 AND $3::DATE + INTERVAL '1 day'
	            ) as total_deductions,
	            COUNT(DISTINCT dsa.work_date) as total_work_days,
	            COUNT(DISTINCT dsa.patient_id) as total_patients_served
	        FROM Employee e
	        LEFT JOIN EmployeePayment ep ON e.employee_id = ep.employee_id
	            AND ep.issued_timestamp BETWEEN $2 AND $3::DATE + INTERVAL '1 day'
	            AND ep.is_void = false
	        LEFT JOIN DailyStaffAssignment dsa ON e.employee_id = dsa.employee_id
	            AND dsa.work_date BETWEEN $2::date AND $3::date
	        WHERE e.employee_id = $1
	        GROUP BY e.employee_id, e.name, e.employee_type, e.base_pay, e.extra_amount, 
	                 e.extra_payment_type, e.per_patient_payment_type, e.percentage_scope,
	                 e.need_clock_in, e.shift_type, e.shift_start_time, e.shift_end_time
	    `;

		const result = await query(sql, [
			employeeId,
			dateRange.start_date,
			dateRange.end_date
		]);

		if (result.rows.length === 0) {
			return null;
		}

		const row = result.rows[0];

		return {
			employee_id: row.employee_id,
			employee_name: row.employee_name,
			employee_type: row.employee_type,
			base_pay: parseFloat(row.base_pay) || 0,
			base_extra_amount: parseFloat(row.base_extra_amount) || 0,
			base_extra_payment_type: row.base_extra_payment_type,
			per_patient_payment_type: row.per_patient_payment_type,
			percentage_scope: row.percentage_scope,
			need_clock_in: row.need_clock_in,
			shift_type: row.shift_type,
			shift_start_time: row.shift_start_time,
			shift_end_time: row.shift_end_time,
			total_payment_records: parseInt(row.total_payment_records),
			total_base_pay: parseFloat(row.total_base_pay) || 0,
			total_extra_pay: parseFloat(row.total_extra_pay) || 0,
			total_paid: parseFloat(row.total_paid) || 0,
			total_unpaid: parseFloat(row.total_unpaid) || 0,
			total_deductions: parseFloat(row.total_deductions) || 0,
			total_work_days: parseInt(row.total_work_days) || 0,
			total_patients_served: parseInt(row.total_patients_served) || 0,
			net_payment:
				parseFloat(row.total_base_pay) +
				parseFloat(row.total_extra_pay) -
				parseFloat(row.total_deductions)
		};
	}

	/**
	 * Update calculatePaymentSummary to include deductions
	 */
	private static calculatePaymentSummary(
		payments: EmployeePaymentDetail[]
	): PaymentSummary {
		const totalPayments = payments.length;
		const totalBasePay = payments.reduce(
			(sum, p) => sum + p.payment_amount,
			0
		);
		const totalExtraPay = payments.reduce(
			(sum, p) => sum + p.extra_amount,
			0
		);
		const totalPaid = payments
			.filter((p) => p.is_paid)
			.reduce((sum, p) => sum + p.payment_amount + p.extra_amount, 0);
		const totalUnpaid = payments
			.filter((p) => !p.is_paid)
			.reduce((sum, p) => sum + p.payment_amount + p.extra_amount, 0);

		// Calculate total deductions
		const totalDeductions = payments.reduce((sum, p) => {
			const deductions = p.clock_in_deductions || [];
			return (
				sum + deductions.reduce((dSum, d) => dSum + d.pay_deduction, 0)
			);
		}, 0);

		return {
			total_payments: totalPayments,
			total_base_pay: totalBasePay,
			total_extra_pay: totalExtraPay,
			total_paid: totalPaid,
			total_unpaid: totalUnpaid,
			total_voided: 0,
			total_deductions: totalDeductions,
			net_payment: totalBasePay + totalExtraPay - totalDeductions,
			avg_payment:
				totalPayments > 0
					? (totalBasePay + totalExtraPay) / totalPayments
					: 0
		};
	}

	// ==================== CHART DATA GENERATION ====================

	/**
	 * Generate chart data for patient statistics
	 */
	static generatePatientStatisticsChart(
		statistics: PatientStatistics & { time_grouped: TimeGroupedData[] }
	): ChartData {
		return {
			labels: statistics.time_grouped.map((tg) => tg.period),
			datasets: [
				{
					label: "Patient Count",
					data: statistics.time_grouped.map((tg) => tg.count),
					backgroundColor: "rgba(13, 110, 253, 0.5)",
					borderColor: "rgba(13, 110, 253, 1)",
					borderWidth: 2
				}
			]
		};
	}

	/**
	 * Generate chart data for payment type distribution
	 */
	static generatePaymentTypeChart(statistics: PatientStatistics): ChartData {
		return {
			labels: ["Cash", "Credit", "Insurance"],
			datasets: [
				{
					label: "Patients by Payment Type",
					data: [
						statistics.by_payment_type.cash,
						statistics.by_payment_type.credit,
						statistics.by_payment_type.insurance
					],
					backgroundColor: [
						"rgba(40, 167, 69, 0.7)",
						"rgba(255, 193, 7, 0.7)",
						"rgba(13, 110, 253, 0.7)"
					],
					borderColor: [
						"rgba(40, 167, 69, 1)",
						"rgba(255, 193, 7, 1)",
						"rgba(13, 110, 253, 1)"
					],
					borderWidth: 2
				}
			]
		};
	}

	/**
	 * Generate chart data for gender distribution
	 */
	static generateGenderDistributionChart(
		statistics: PatientStatistics
	): ChartData {
		return {
			labels: ["Male", "Female", "Other"],
			datasets: [
				{
					label: "Patients by Gender",
					data: [
						statistics.by_gender.male,
						statistics.by_gender.female,
						statistics.by_gender.other
					],
					backgroundColor: [
						"rgba(13, 110, 253, 0.7)",
						"rgba(220, 53, 69, 0.7)",
						"rgba(108, 117, 125, 0.7)"
					],
					borderColor: [
						"rgba(13, 110, 253, 1)",
						"rgba(220, 53, 69, 1)",
						"rgba(108, 117, 125, 1)"
					],
					borderWidth: 2
				}
			]
		};
	}

	/**
	 * Generate chart data for doctor statistics
	 */
	static generateDoctorStatisticsChart(
		statistics: DoctorStatistics[]
	): ChartData {
		const topDoctors = statistics.slice(0, 10); // Top 10 doctors by revenue

		return {
			labels: topDoctors.map((d) => d.doctor_name),
			datasets: [
				{
					label: "Patients Attended",
					data: topDoctors.map((d) => d.total_patients_attended),
					backgroundColor: "rgba(13, 110, 253, 0.5)",
					borderColor: "rgba(13, 110, 253, 1)",
					borderWidth: 1
				},
				{
					label: "Revenue Generated",
					data: topDoctors.map((d) => d.total_revenue_generated),
					backgroundColor: "rgba(40, 167, 69, 0.5)",
					borderColor: "rgba(40, 167, 69, 1)",
					borderWidth: 1
				}
			]
		};
	}

	/**
	 * Generate chart data for employee payments over time
	 */
	static generateEmployeePaymentChart(
		reports: EmployeePaymentReport[]
	): ChartData {
		// Aggregate payments by date
		const paymentsByDate = new Map<string, number>();

		reports.forEach((report) => {
			report.payment_details.forEach((payment) => {
				const date = new Date(payment.payment_date)
					.toISOString()
					.split("T")[0];
				const amount = payment.payment_amount + payment.extra_amount;
				paymentsByDate.set(
					date,
					(paymentsByDate.get(date) || 0) + amount
				);
			});
		});

		const sortedDates = Array.from(paymentsByDate.keys()).sort();

		return {
			labels: sortedDates,
			datasets: [
				{
					label: "Total Payments",
					data: sortedDates.map(
						(date) => paymentsByDate.get(date) || 0
					),
					backgroundColor: "rgba(13, 110, 253, 0.5)",
					borderColor: "rgba(13, 110, 253, 1)",
					borderWidth: 2
				}
			]
		};
	}

	/**
	 * Generate chart data for employee payment distribution by type
	 */
	static generateEmployeePaymentTypeChart(
		reports: EmployeePaymentReport[]
	): ChartData {
		const paymentTypes = new Map<string, number>();

		reports.forEach((report) => {
			report.payment_details.forEach((payment) => {
				const type = payment.payment_type;
				const amount = payment.payment_amount + payment.extra_amount;
				paymentTypes.set(type, (paymentTypes.get(type) || 0) + amount);
			});
		});

		return {
			labels: Array.from(paymentTypes.keys()),
			datasets: [
				{
					label: "Payment Amount by Type",
					data: Array.from(paymentTypes.values()),
					backgroundColor: [
						"rgba(13, 110, 253, 0.7)",
						"rgba(40, 167, 69, 0.7)",
						"rgba(255, 193, 7, 0.7)",
						"rgba(220, 53, 69, 0.7)",
						"rgba(13, 202, 240, 0.7)"
					],
					borderColor: [
						"rgba(13, 110, 253, 1)",
						"rgba(40, 167, 69, 1)",
						"rgba(255, 193, 7, 1)",
						"rgba(220, 53, 69, 1)",
						"rgba(13, 202, 240, 1)"
					],
					borderWidth: 2
				}
			]
		};
	}
}
