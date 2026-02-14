// src/app/models/Insurance.model.ts
import { query } from "./database/connection.js";
import {
	InsuranceCompany,
	InsurancePayment,
	CreateInsuranceCompanyDTO,
	UpdateInsuranceCompanyDTO,
	CreateInsurancePaymentDTO,
	InsurancePatient,
	InsuranceReportSummary,
	InsuranceReportFilters,
	InsuranceReportItem,
	PatientReportSummary,
	PatientReportFilters
} from "../utils/types/insurance.js";

class InsuranceModel {
	// Basic CRUD Operations
	async getAllInsuranceCompanies(): Promise<InsuranceCompany[]> {
		const sql = `
            SELECT 
                ic.*,
                pl.name as pricelist_name,
                COUNT(p.patient_id) as patient_count
            FROM InsuranceCompany ic
            LEFT JOIN PriceList pl ON ic.pricelist_id = pl.pricelist_id
            LEFT JOIN Patient p ON ic.insurance_id = p.insurance_id
            GROUP BY ic.insurance_id, pl.name
            ORDER BY ic.name;
        `;
		const { rows } = await query(sql);
		return rows.map((row) => ({
			...row,
			patient_count: parseInt(row.patient_count) || 0
		}));
	}

	async getInsuranceCompanyById(
		insuranceId: number
	): Promise<InsuranceCompany | null> {
		const sql = `
            SELECT 
                ic.*,
                pl.name as pricelist_name,
                COUNT(p.patient_id) as patient_count
            FROM InsuranceCompany ic
            LEFT JOIN PriceList pl ON ic.pricelist_id = pl.pricelist_id
            LEFT JOIN Patient p ON ic.insurance_id = p.insurance_id
            WHERE ic.insurance_id = $1
            GROUP BY ic.insurance_id, pl.name;
        `;
		const { rows } = await query(sql, [insuranceId]);
		if (rows.length === 0) return null;

		return {
			...rows[0],
			patient_count: parseInt(rows[0].patient_count) || 0
		};
	}

	async createInsuranceCompany(
		data: CreateInsuranceCompanyDTO
	): Promise<InsuranceCompany> {
		await query("BEGIN");
		try {
			// Validate pricelist if provided
			if (data.pricelist_id) {
				const pricelistCheck = await query(
					"SELECT pricelist_id FROM PriceList WHERE pricelist_id = $1",
					[data.pricelist_id]
				);
				if (pricelistCheck.rows.length === 0) {
					throw new Error("Price list not found");
				}
			}

			const sql = `
                INSERT INTO InsuranceCompany (name, contact_info, pricelist_id, last_cleared_date)
                VALUES ($1, $2, $3, CURRENT_DATE)
                RETURNING *;
            `;
			const { rows } = await query(sql, [
				data.name,
				data.contact_info || null,
				data.pricelist_id || null
			]);

			await query("COMMIT");
			return rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async updateInsuranceCompany(
		data: UpdateInsuranceCompanyDTO
	): Promise<InsuranceCompany | null> {
		await query("BEGIN");
		try {
			// Check if insurance company exists
			const existingInsurance = await this.getInsuranceCompanyById(
				data.insurance_id
			);
			if (!existingInsurance) {
				throw new Error("Insurance company not found");
			}

			// Validate pricelist if provided
			if (data.pricelist_id) {
				const pricelistCheck = await query(
					"SELECT pricelist_id FROM PriceList WHERE pricelist_id = $1",
					[data.pricelist_id]
				);
				if (pricelistCheck.rows.length === 0) {
					throw new Error("Price list not found");
				}
			}

			const updateFields: string[] = [];
			const values: any[] = [];
			let paramCount = 1;

			// Build dynamic update query
			Object.entries(data).forEach(([key, value]) => {
				if (key !== "insurance_id" && value !== undefined) {
					updateFields.push(`${key} = $${paramCount}`);
					values.push(value);
					paramCount++;
				}
			});

			if (updateFields.length === 0) {
				return existingInsurance;
			}

			values.push(data.insurance_id);
			const sql = `
                UPDATE InsuranceCompany 
                SET ${updateFields.join(", ")}
                WHERE insurance_id = $${paramCount}
                RETURNING *;
            `;

			await query(sql, values);
			await query("COMMIT");

			return await this.getInsuranceCompanyById(data.insurance_id);
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async deleteInsuranceCompany(insuranceId: number): Promise<boolean> {
		await query("BEGIN");
		try {
			// Check if there are patients using this insurance
			const patientCheck = await query(
				"SELECT COUNT(*) as count FROM Patient WHERE insurance_id = $1",
				[insuranceId]
			);

			if (parseInt(patientCheck.rows[0].count) > 0) {
				throw new Error(
					"Cannot delete insurance company with existing patients"
				);
			}

			// Delete insurance payments first
			await query(
				"DELETE FROM InsurancePayments WHERE insurance_id = $1",
				[insuranceId]
			);

			// Delete insurance company
			const result = await query(
				"DELETE FROM InsuranceCompany WHERE insurance_id = $1",
				[insuranceId]
			);

			await query("COMMIT");
			return result.rowCount! > 0;
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// Patient Management
	async getPatientsByInsurance(
		insuranceId: number
	): Promise<InsurancePatient[]> {
		const sql = `
            SELECT 
                p.patient_id,
                p.name,
                p.national_id,
                p.gender,
                p.phone,
                p.insurance_card_id,
                p.insurance_form_id,
                p.payment_type,
                p.is_active,
                p.registration_date,
                ph.patient_history_id,
                ph.admission_time,
                ph.diagnosis,
                ph.bill_id,
                b.total_amount,
                b.paid_amount,
                b.medical_tests_amount,
                (b.total_amount - b.paid_amount) as outstanding_amount
            FROM Patient p
            LEFT JOIN PatientHistory ph ON p.patient_id = ph.patient_id AND ph.discharge_time IS NULL
            LEFT JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE p.insurance_id = $1
            ORDER BY 
                CASE WHEN p.is_active THEN 0 ELSE 1 END,
                p.name;
        `;

		const { rows } = await query(sql, [insuranceId]);

		return rows.map((row) => ({
			patient_id: row.patient_id,
			name: row.name,
			national_id: row.national_id,
			gender: row.gender,
			phone: row.phone,
			insurance_card_id: row.insurance_card_id,
			insurance_form_id: row.insurance_form_id,
			payment_type: row.payment_type,
			is_active: row.is_active,
			registration_date: row.registration_date,
			current_admission: row.patient_history_id
				? {
					patient_history_id: row.patient_history_id,
					admission_time: row.admission_time,
					diagnosis: row.diagnosis,
					bill_id: row.bill_id,
					total_amount: parseFloat(row.total_amount || 0),
					paid_amount: parseFloat(row.paid_amount || 0),
					medical_tests_amount: parseFloat(row.medical_tests_amount || 0),
					outstanding_amount: parseFloat(
						row.outstanding_amount || 0
					)
				}
				: undefined
		}));
	}

	// Insurance Payments Management
	async getAllInsurancePayments(
		insuranceId?: number
	): Promise<InsurancePayment[]> {
		let sql = `
            SELECT 
                ip.*,
                u.username as added_by_username,
                ic.name as insurance_name
            FROM InsurancePayments ip
            JOIN "User" u ON ip.added_by_user_id = u.user_id
            JOIN InsuranceCompany ic ON ip.insurance_id = ic.insurance_id
        `;

		const values: any[] = [];
		if (insuranceId) {
			sql += " WHERE ip.insurance_id = $1";
			values.push(insuranceId);
		}

		sql += " ORDER BY ip.issued_timestamp DESC";

		const { rows } = await query(sql, values);
		return rows;
	}

	async createInsurancePayment(
		data: CreateInsurancePaymentDTO
	): Promise<InsurancePayment> {
		await query("BEGIN");
		try {
			// Validate insurance company exists
			const insuranceCheck = await query(
				"SELECT insurance_id FROM InsuranceCompany WHERE insurance_id = $1",
				[data.insurance_id]
			);
			if (insuranceCheck.rows.length === 0) {
				throw new Error("Insurance company not found");
			}

			// Validate date range
			const paymentFrom = new Date(data.payment_from);
			const paymentTo = new Date(data.payment_to);
			if (paymentFrom >= paymentTo) {
				throw new Error(
					"Payment from date must be before payment to date"
				);
			}

			const sql = `
                INSERT INTO InsurancePayments (
                    insurance_id, payment_amount, payment_from, payment_to, added_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;

			const { rows } = await query(sql, [
				data.insurance_id,
				data.payment_amount,
				paymentFrom,
				paymentTo,
				data.added_by_user_id
			]);

			await query("COMMIT");
			return rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	async deleteInsurancePayment(paymentId: number): Promise<boolean> {
		const result = await query(
			"DELETE FROM InsurancePayments WHERE payment_id = $1",
			[paymentId]
		);
		return result.rowCount! > 0;
	}

	// Clear Outstanding Balance
	async clearInsuranceBalance(
		insuranceId: number,
		clearDate: string
	): Promise<InsuranceCompany> {
		await query("BEGIN");
		try {
			// Validate insurance company exists
			const insuranceCompany = await this.getInsuranceCompanyById(
				insuranceId
			);
			if (!insuranceCompany) {
				throw new Error("Insurance company not found");
			}

			// Validate clear date
			const newClearDate = new Date(clearDate);
			if (newClearDate > new Date()) {
				throw new Error("Clear date cannot be in the future");
			}

			// Update last_cleared_date
			const sql = `
                UPDATE InsuranceCompany 
                SET last_cleared_date = $1
                WHERE insurance_id = $2
                RETURNING *;
            `;

			const { rows } = await query(sql, [newClearDate, insuranceId]);

			await query("COMMIT");
			return rows[0];
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	// Insurance Report Generation
	async generateInsuranceReport(
		filters: InsuranceReportFilters
	): Promise<InsuranceReportSummary> {
		await query("BEGIN");
		try {
			// Get insurance company details
			const insuranceCompany = await this.getInsuranceCompanyById(
				filters.insurance_id
			);
			if (!insuranceCompany) {
				throw new Error("Insurance company not found");
			}

			const startDate = new Date(filters.start_date);
			const endDate = new Date(filters.end_date);

			// Validate date range
			if (startDate > endDate) {
				throw new Error("Start date must be before end date");
			}

			// Get report items based on filters
			const reportItems = await this.getInsuranceReportItems(filters);

			// Get cleared payments in the period
			const clearedPayments = await this.getInsurancePaymentsByPeriod(
				filters.insurance_id,
				filters.start_date,
				filters.end_date
			);

			// Calculate totals
			const serviceItems = reportItems.filter(
				(item) => item.item_type === "service"
			);
			const drugItems = reportItems.filter(
				(item) => item.item_type === "drug"
			);
			const supplyItems = reportItems.filter(
				(item) => item.item_type === "supply"
			);

			const totalServicesCost = serviceItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);
			const totalDrugsCost = drugItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);
			const totalSuppliesCost = supplyItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);

			// Get medical tests total
			const totalMedicalTestsCost = await this.getMedicalTestsTotalByInsurance(
				filters.insurance_id,
				filters.start_date,
				filters.end_date
			);

			const totalCost = totalServicesCost + totalDrugsCost + totalSuppliesCost + totalMedicalTestsCost;

			// Get total patient payments for these bills
			const patientPayments =
				await this.getPatientPaymentsByInsuranceAndPeriod(
					filters.insurance_id,
					filters.start_date,
					filters.end_date
				);

			const outstandingAmount = totalCost - patientPayments;
			const uniquePatients = [
				...new Set(reportItems.map((item) => item.patient_id))
			].length;

			await query("COMMIT");

			return {
				insurance_id: filters.insurance_id,
				insurance_name: insuranceCompany.name,
				report_period: {
					start_date: startDate,
					end_date: endDate
				},
				last_cleared_date: insuranceCompany.last_cleared_date,
				total_services_cost: totalServicesCost,
				total_drugs_cost: totalDrugsCost,
				total_supplies_cost: totalSuppliesCost,
				total_medical_tests_cost: totalMedicalTestsCost,
				total_cost: totalCost,
				total_patient_payments: patientPayments,
				outstanding_amount: outstandingAmount,
				patient_count: uniquePatients,
				items: reportItems,
				cleared_payments: clearedPayments
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	private async getInsuranceReportItems(
		filters: InsuranceReportFilters
	): Promise<InsuranceReportItem[]> {
		let sql = `
        SELECT 
            p.patient_id,
            p.name as patient_name,
            p.insurance_card_id,
            p.insurance_form_id,
            ph.admission_time,
            ph.discharge_time,
            b.bill_id,
            bd.service_id,
            s.name as service_name,
            bd.drug_shipment_id,
            dc.name as drug_name,
            bd.medical_supply_shipment_id,
            ms.name as medical_supply_name,
            CASE 
                WHEN bd.service_id IS NOT NULL THEN 'service'
                WHEN bd.drug_shipment_id IS NOT NULL THEN 'drug'
                ELSE 'supply'
            END as item_type,
            SUM(bd.quantity) as quantity,  -- Group and sum quantities
            bd.unit_price,
            SUM(bd.quantity * bd.unit_price) as total_cost,  -- Sum total costs
            DATE(bd.generated_at) as service_date,  -- Group by date only
            bd.sale_type,
            b.paid_amount as patient_paid_amount,
            b.total_amount as patient_total_amount,
            COALESCE(b.medical_tests_amount, 0) as medical_tests_amount,
            b.discount,
            b.discount_type,
            b.discount_scope,
            b.vat_percentage,
            b.vat_scope_custom,
            b.administrative_expenses
        FROM Patient p
        JOIN PatientHistory ph ON p.patient_id = ph.patient_id
        JOIN Bill b ON ph.bill_id = b.bill_id
        JOIN BillDetail bd ON b.bill_id = bd.bill_id
        LEFT JOIN Service s ON bd.service_id = s.service_id
        LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
        LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
        LEFT JOIN MedicalSupplyShipment mss ON bd.medical_supply_shipment_id = mss.shipment_id
        LEFT JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
        WHERE p.insurance_id = $1
            AND bd.generated_at >= $2 
            AND bd.generated_at <= $3::DATE + '1 day'::INTERVAL
    `;

		const values = [
			filters.insurance_id,
			filters.start_date,
			filters.end_date
		];

		// Filter by drugs inclusion
		if (!filters.include_drugs) {
			sql += " AND bd.service_id IS NOT NULL";
		}

		// Filter by cleared items
		if (!filters.include_cleared_items) {
			sql += ` AND bd.generated_at > (
            SELECT last_cleared_date 
            FROM InsuranceCompany 
            WHERE insurance_id = $1
        )`;
		}

		// Group by patient, item, and date
		sql += `
        GROUP BY 
            p.patient_id, p.name, p.insurance_card_id, p.insurance_form_id,
            ph.admission_time, ph.discharge_time, b.bill_id, bd.service_id, 
            s.name, bd.drug_shipment_id, dc.name, bd.medical_supply_shipment_id, ms.name, bd.unit_price, 
            DATE(bd.generated_at), bd.sale_type, b.paid_amount, b.total_amount, b.medical_tests_amount,
            b.discount, b.discount_type, b.discount_scope, b.vat_percentage, b.vat_scope_custom, b.administrative_expenses
        ORDER BY p.name, DATE(bd.generated_at) DESC
    `;

		const { rows } = await query(sql, values);
		return rows.map((row) => ({
			...row,
			total_cost: parseFloat(row.total_cost),
			quantity: parseInt(row.quantity),
			unit_price: parseFloat(row.unit_price),
			patient_paid_amount: parseFloat(row.patient_paid_amount || 0),
			patient_total_amount: parseFloat(row.patient_total_amount || 0),
			medical_tests_amount: parseFloat(row.medical_tests_amount || 0),
			discount: parseFloat(row.discount || 0),
			discount_type: row.discount_type,
			discount_scope: row.discount_scope,
			vat_percentage: parseFloat(row.vat_percentage || 0),
			vat_scope_custom: row.vat_scope_custom,
			administrative_expenses: parseFloat(row.administrative_expenses || 0)
		}));
	}

	private async getInsurancePaymentsByPeriod(
		insuranceId: number,
		startDate: string,
		endDate: string
	): Promise<InsurancePayment[]> {
		const sql = `
            SELECT 
                ip.*,
                u.username as added_by_username
            FROM InsurancePayments ip
            JOIN "User" u ON ip.added_by_user_id = u.user_id
            WHERE ip.insurance_id = $1
                AND (
                    (ip.payment_from >= $2 AND ip.payment_from <= $3::DATE + '1 day'::INTERVAL)
                    OR (ip.payment_to >= $2 AND ip.payment_to <= $3::DATE + '1 day'::INTERVAL)
                    OR (ip.payment_from <= $2 AND ip.payment_to >= $3::DATE + '1 day'::INTERVAL)
                )
            ORDER BY ip.issued_timestamp DESC;
        `;

		const { rows } = await query(sql, [insuranceId, startDate, endDate]);
		return rows;
	}

	private async getPatientPaymentsByInsuranceAndPeriod(
		insuranceId: number,
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(b.paid_amount), 0) as total_payments
            FROM Patient p
            JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE p.insurance_id = $1
                AND b.updated_at >= $2
                AND b.updated_at <= $3::DATE + '1 day'::INTERVAL;
        `;

		const { rows } = await query(sql, [insuranceId, startDate, endDate]);
		return parseFloat(rows[0].total_payments);
	}

	private async getMedicalTestsTotalByInsurance(
		insuranceId: number,
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
            SELECT COALESCE(SUM(b.medical_tests_amount), 0) as total
            FROM Patient p
            JOIN PatientHistory ph ON p.patient_id = ph.patient_id
            JOIN Bill b ON ph.bill_id = b.bill_id
            WHERE p.insurance_id = $1
                AND b.generated_at >= $2
                AND b.generated_at <= $3::DATE + '1 day'::INTERVAL;
        `;

		const { rows } = await query(sql, [insuranceId, startDate, endDate]);
		return parseFloat(rows[0].total);
	}

	// Additional utility methods for reports and analytics
	async getInsuranceStatistics(insuranceId: number): Promise<any> {
		// Get basic patient and admission statistics (not filtered by date)
		const basicStatsSql = `
        SELECT 
            COUNT(DISTINCT p.patient_id) as total_patients,
            COUNT(DISTINCT CASE WHEN p.is_active THEN p.patient_id END) as active_patients,
            COUNT(DISTINCT ph.patient_history_id) as total_admissions,
            COUNT(DISTINCT CASE WHEN ph.discharge_time IS NULL THEN ph.patient_history_id END) as current_admissions
        FROM Patient p
        LEFT JOIN PatientHistory ph ON p.patient_id = ph.patient_id
        WHERE p.insurance_id = $1;
    `;

		// Get financial statistics (filtered by last_cleared_date)
		const financialStatsSql = `
        SELECT 
            COALESCE(SUM(b.total_amount), 0) as total_billed,
            COALESCE(SUM(b.paid_amount), 0) as total_paid,
            COALESCE(SUM(b.total_amount - b.paid_amount), 0) as total_outstanding
        FROM Patient p
        JOIN PatientHistory ph ON p.patient_id = ph.patient_id
        JOIN Bill b ON ph.bill_id = b.bill_id
        JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
        WHERE p.insurance_id = $1
            AND b.generated_at > ic.last_cleared_date::DATE + '1 day'::INTERVAL;
    `;

		// Get insurance payments total
		const insurancePaymentsSql = `
        SELECT COALESCE(SUM(payment_amount), 0) as total_insurance_payments
        FROM InsurancePayments
        WHERE insurance_id = $1;
    `;

		// Execute all queries
		const [basicStatsResult, financialStatsResult, paymentsResult] =
			await Promise.all([
				query(basicStatsSql, [insuranceId]),
				query(financialStatsSql, [insuranceId]),
				query(insurancePaymentsSql, [insuranceId])
			]);

		const basicStats = basicStatsResult.rows[0];
		const financialStats = financialStatsResult.rows[0];
		const paymentsStats = paymentsResult.rows[0];

		return {
			total_patients: parseInt(basicStats.total_patients),
			active_patients: parseInt(basicStats.active_patients),
			total_admissions: parseInt(basicStats.total_admissions),
			current_admissions: parseInt(basicStats.current_admissions),
			total_billed: parseFloat(financialStats.total_billed),
			total_paid: parseFloat(financialStats.total_paid),
			total_outstanding: parseFloat(financialStats.total_outstanding),
			total_insurance_payments: parseFloat(
				paymentsStats.total_insurance_payments
			),
			// Additional calculated fields
			net_outstanding:
				parseFloat(financialStats.total_outstanding) -
				parseFloat(paymentsStats.total_insurance_payments),
			payment_coverage_percentage:
				parseFloat(financialStats.total_billed) > 0
					? (parseFloat(paymentsStats.total_insurance_payments) /
						parseFloat(financialStats.total_billed)) *
					100
					: 0
		};
	}

	async getInsuranceOutstandingByPeriod(
		insuranceId: number,
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
        SELECT 
            COALESCE(SUM(b.total_amount - b.paid_amount), 0) as outstanding_amount
        FROM Patient p
        JOIN PatientHistory ph ON p.patient_id = ph.patient_id
        JOIN Bill b ON ph.bill_id = b.bill_id
        JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
        WHERE p.insurance_id = $1
            AND b.generated_at >= $2
            AND b.generated_at <= $3::DATE + '1 day'::INTERVAL
            AND b.generated_at > ic.last_cleared_date::DATE + '1 day'::INTERVAL
            AND (b.total_amount - b.paid_amount) > 0;
    `;

		const { rows } = await query(sql, [insuranceId, startDate, endDate]);
		return parseFloat(rows[0].outstanding_amount);
	}

	async generatePatientReport(
		filters: PatientReportFilters
	): Promise<PatientReportSummary> {
		await query("BEGIN");
		try {
			// Get insurance company details
			const insuranceCompany = await this.getInsuranceCompanyById(
				filters.insurance_id
			);
			if (!insuranceCompany) {
				throw new Error("Insurance company not found");
			}

			// Get patient details and verify they belong to this insurance
			const patientSql = `
			SELECT 
				p.*,
				ic.name as insurance_name,
				ic.last_cleared_date
			FROM Patient p
			JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
			WHERE p.patient_id = $1 AND p.insurance_id = $2;
		`;

			const patientResult = await query(patientSql, [
				filters.patient_id,
				filters.insurance_id
			]);
			if (patientResult.rows.length === 0) {
				throw new Error(
					"Patient not found or does not belong to this insurance company"
				);
			}

			const patient = patientResult.rows[0];

			const startDate = new Date(filters.start_date);
			const endDate = new Date(filters.end_date);

			// Validate date range
			if (startDate >= endDate) {
				throw new Error("Start date must be before end date");
			}

			// Get patient admissions in the date range
			const admissionsData = await this.getPatientAdmissionsWithItems(
				filters
			);

			// Get report items for this specific patient
			const reportItems = await this.getPatientReportItems(filters);

			// Calculate totals
			const serviceItems = reportItems.filter(
				(item) => item.item_type === "service"
			);
			const drugItems = reportItems.filter(
				(item) => item.item_type === "drug"
			);
			const supplyItems = reportItems.filter(
				(item) => item.item_type === "supply"
			);

			const totalServicesCost = serviceItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);
			const totalDrugsCost = drugItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);
			const totalSuppliesCost = supplyItems.reduce(
				(sum, item) => sum + item.total_cost,
				0
			);

			// Get medical tests total for this patient
			const totalMedicalTestsCost = await this.getMedicalTestsTotalByPatient(
				filters.patient_id,
				filters.start_date,
				filters.end_date
			);

			const totalCost = totalServicesCost + totalDrugsCost + totalSuppliesCost + totalMedicalTestsCost;

			// Get total patient payments for this patient in the period
			const patientPayments = await this.getPatientPaymentsByPeriod(
				filters.patient_id,
				filters.start_date,
				filters.end_date
			);

			const outstandingAmount = totalCost - patientPayments;

			await query("COMMIT");

			return {
				insurance_id: filters.insurance_id,
				insurance_name: patient.insurance_name,
				patient_id: filters.patient_id,
				patient_name: patient.name,
				patient_info: {
					national_id: patient.national_id,
					gender: patient.gender,
					phone: patient.phone,
					insurance_card_id: patient.insurance_card_id,
					insurance_form_id: patient.insurance_form_id,
					registration_date: patient.registration_date
				},
				report_period: {
					start_date: filters.start_date,
					end_date: filters.end_date
				},
				last_cleared_date: patient.last_cleared_date,
				admissions: admissionsData,
				total_services_cost: totalServicesCost,
				total_drugs_cost: totalDrugsCost,
				total_supplies_cost: totalSuppliesCost,
				total_medical_tests_cost: totalMedicalTestsCost,
				total_cost: totalCost,
				total_patient_payments: patientPayments,
				outstanding_amount: outstandingAmount,
				items: reportItems
			};
		} catch (error) {
			await query("ROLLBACK");
			throw error;
		}
	}

	private async getPatientAdmissionsWithItems(
		filters: PatientReportFilters
	): Promise<any[]> {
		const sql = `
		SELECT 
			ph.patient_history_id,
			ph.admission_time,
			ph.discharge_time,
			ph.diagnosis,
			ph.bill_id,
			b.total_amount,
			b.paid_amount,
			(b.total_amount - b.paid_amount) as outstanding_amount,
			COALESCE(b.medical_tests_amount, 0) as medical_tests_amount,
			b.discount,
			b.discount_type,
			b.discount_scope,
			b.vat_percentage,
			b.vat_scope_custom,
			b.administrative_expenses
		FROM PatientHistory ph
		JOIN Bill b ON ph.bill_id = b.bill_id
		WHERE ph.patient_id = $1
			AND ph.admission_time >= $2
			AND ph.admission_time <= $3::DATE + '1 day'::INTERVAL
		ORDER BY ph.admission_time DESC;
	`;

		const { rows } = await query(sql, [
			filters.patient_id,
			filters.start_date,
			filters.end_date
		]);

		// For each admission, get the items
		for (let admission of rows) {
			let itemsSql = `
			SELECT 
				bd.service_id,
				s.name as service_name,
				bd.drug_shipment_id,
				dc.name as drug_name,
				bd.medical_supply_shipment_id,
				ms.name as medical_supply_name,
				CASE 
					WHEN bd.service_id IS NOT NULL THEN 'service'
					WHEN bd.drug_shipment_id IS NOT NULL THEN 'drug'
					ELSE 'supply'
				END as item_type,
				SUM(bd.quantity) as quantity,  -- Group and sum quantities
				bd.unit_price,
				SUM(bd.quantity * bd.unit_price) as total_cost,  -- Sum total costs
				DATE(bd.generated_at) as service_date,  -- Group by date only
				bd.sale_type
			FROM BillDetail bd
			LEFT JOIN Service s ON bd.service_id = s.service_id
			LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
			LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
			LEFT JOIN MedicalSupplyShipment mss ON bd.medical_supply_shipment_id = mss.shipment_id
			LEFT JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
			WHERE bd.bill_id = $1
				AND bd.generated_at >= $2 
				AND bd.generated_at <= $3::DATE + '1 day'::INTERVAL
		`;

			let itemsQuery = [
				admission.bill_id,
				filters.start_date,
				filters.end_date
			];

			if (!filters.include_drugs) {
				itemsSql += " AND bd.service_id IS NOT NULL";
			}

			if (!filters.include_cleared_items) {
				itemsSql += ` AND bd.generated_at > (
				SELECT last_cleared_date 
				FROM InsuranceCompany 
				WHERE insurance_id = $${itemsQuery.length + 1}
			)`;
				itemsQuery.push(filters.insurance_id);
			}

			// Group by item and date
			itemsSql += `
				GROUP BY 
					bd.service_id, s.name, bd.drug_shipment_id, dc.name, 
					bd.medical_supply_shipment_id, ms.name, bd.unit_price, 
					DATE(bd.generated_at), bd.sale_type
				ORDER BY DATE(bd.generated_at) DESC
			`;

			const itemsResult = await query(itemsSql, itemsQuery);
			admission.items = itemsResult.rows.map((row) => ({
				...row,
				total_cost: parseFloat(row.total_cost),
				quantity: parseInt(row.quantity),
				unit_price: parseFloat(row.unit_price)
			}));
		}

		return rows.map((row) => ({
			...row,
			total_amount: parseFloat(row.total_amount || 0),
			paid_amount: parseFloat(row.paid_amount || 0),
			outstanding_amount: parseFloat(row.outstanding_amount || 0),
			discount: parseFloat(row.discount || 0),
			discount_type: row.discount_type,
			discount_scope: row.discount_scope,
			vat_percentage: parseFloat(row.vat_percentage || 0),
			vat_scope_custom: row.vat_scope_custom,
			administrative_expenses: parseFloat(row.administrative_expenses || 0)
		}));
	}

	private async getPatientReportItems(
		filters: PatientReportFilters
	): Promise<any[]> {
		let sql = `
		SELECT 
			p.patient_id,
			p.name as patient_name,
			p.insurance_card_id,
			p.insurance_form_id,
			ph.admission_time,
			ph.discharge_time,
			b.bill_id,
			bd.service_id,
			s.name as service_name,
			bd.drug_shipment_id,
			dc.name as drug_name,
			bd.medical_supply_shipment_id,
			ms.name as medical_supply_name,
			CASE 
				WHEN bd.service_id IS NOT NULL THEN 'service'
				WHEN bd.drug_shipment_id IS NOT NULL THEN 'drug'
				ELSE 'supply'
			END as item_type,
			SUM(bd.quantity) as quantity,  -- Group and sum quantities
			bd.unit_price,
			SUM(bd.quantity * bd.unit_price) as total_cost,  -- Sum total costs
			DATE(bd.generated_at) as service_date,  -- Group by date only
			bd.sale_type,
			b.paid_amount as patient_paid_amount,
			b.total_amount as patient_total_amount,
			COALESCE(b.medical_tests_amount, 0) as medical_tests_amount,
			b.discount,
			b.discount_type,
			b.discount_scope,
			b.vat_percentage,
			b.vat_scope_custom,
			b.administrative_expenses
		FROM Patient p
		JOIN PatientHistory ph ON p.patient_id = ph.patient_id
		JOIN Bill b ON ph.bill_id = b.bill_id
		JOIN BillDetail bd ON b.bill_id = bd.bill_id
		LEFT JOIN Service s ON bd.service_id = s.service_id
		LEFT JOIN DrugShipment ds ON bd.drug_shipment_id = ds.shipment_id
		LEFT JOIN DrugCard dc ON ds.drug_id = dc.drug_id
		LEFT JOIN MedicalSupplyShipment mss ON bd.medical_supply_shipment_id = mss.shipment_id
		LEFT JOIN MedicalSupply ms ON mss.supply_id = ms.supply_id
		WHERE p.patient_id = $1
			AND p.insurance_id = $2
			AND bd.generated_at >= $3 
			AND bd.generated_at <= $4::DATE + '1 day'::INTERVAL
	`;

		const values = [
			filters.patient_id,
			filters.insurance_id,
			filters.start_date,
			filters.end_date
		];

		// Filter by drugs inclusion
		if (!filters.include_drugs) {
			sql += " AND bd.service_id IS NOT NULL";
		}

		// Filter by cleared items
		if (!filters.include_cleared_items) {
			sql += ` AND bd.generated_at > (
			SELECT last_cleared_date 
			FROM InsuranceCompany 
			WHERE insurance_id = $2
		)`;
		}

		// Group by patient, item, and date
		sql += `
			GROUP BY 
				p.patient_id, p.name, p.insurance_card_id, p.insurance_form_id,
				ph.admission_time, ph.discharge_time, b.bill_id, bd.service_id, 
				s.name, bd.drug_shipment_id, dc.name, bd.medical_supply_shipment_id, ms.name, bd.unit_price, 
				DATE(bd.generated_at), bd.sale_type, b.paid_amount, b.total_amount, b.medical_tests_amount,
				b.discount, b.discount_type, b.discount_scope, b.vat_percentage, b.vat_scope_custom, b.administrative_expenses
			ORDER BY DATE(bd.generated_at) DESC
		`;

		const { rows } = await query(sql, values);
		return rows.map((row) => ({
			...row,
			total_cost: parseFloat(row.total_cost),
			quantity: parseInt(row.quantity),
			unit_price: parseFloat(row.unit_price),
			patient_paid_amount: parseFloat(row.patient_paid_amount || 0),
			patient_total_amount: parseFloat(row.patient_total_amount || 0),
			medical_tests_amount: parseFloat(row.medical_tests_amount || 0),
			discount: parseFloat(row.discount || 0),
			discount_type: row.discount_type,
			discount_scope: row.discount_scope,
			vat_percentage: parseFloat(row.vat_percentage || 0),
			vat_scope_custom: row.vat_scope_custom,
			administrative_expenses: parseFloat(row.administrative_expenses || 0)
		}));
	}

	private async getPatientPaymentsByPeriod(
		patientId: number,
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
		SELECT COALESCE(SUM(b.paid_amount), 0) as total_payments
		FROM Patient p
		JOIN PatientHistory ph ON p.patient_id = ph.patient_id
		JOIN Bill b ON ph.bill_id = b.bill_id
		WHERE p.patient_id = $1
			AND b.updated_at >= $2
			AND b.updated_at <= $3::DATE + '1 day'::INTERVAL;
	`;

		const { rows } = await query(sql, [patientId, startDate, endDate]);
		return parseFloat(rows[0].total_payments);
	}

	private async getMedicalTestsTotalByPatient(
		patientId: number,
		startDate: string,
		endDate: string
	): Promise<number> {
		const sql = `
		SELECT COALESCE(SUM(b.medical_tests_amount), 0) as total
		FROM Patient p
		JOIN PatientHistory ph ON p.patient_id = ph.patient_id
		JOIN Bill b ON ph.bill_id = b.bill_id
		WHERE p.patient_id = $1
			AND b.generated_at >= $2
			AND b.generated_at <= $3::DATE + '1 day'::INTERVAL;
	`;

		const { rows } = await query(sql, [patientId, startDate, endDate]);
		return parseFloat(rows[0].total);
	}
}

export default new InsuranceModel();
