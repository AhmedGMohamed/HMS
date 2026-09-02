import bcrypt from "bcryptjs";
import { query, pgPool } from "../../models/database/connection.js";
import { Patient, PatientHistory } from "../../utils/types/patients.js";
import { Permission, Role, User } from "../../utils/types/users.js";
import {
	Service,
	ServiceDrug,
	ServicePrice,
	ActivePatientService
} from "../../utils/types/services.js";
import { PriceList } from "../../utils/types/priceLists.js";
import {
	DrugCard,
	DrugShipment,
	DrugTransaction,
	DrugUsage,
	ShipmentPrice
} from "../../utils/types/drugs.js";
import overridePgDate from "../../utils/pgDateOverride.js";

export interface TestData {
	roles: Role[];
	permissions: Permission[];
	users: User[];
	employees: any[];
	doctors: any[];
	insuranceCompanies: any[];
	patients: Patient[];
	patientHistories: PatientHistory[];
	warehouses: any[];
	drugCards: DrugCard[];
	drugShipments: DrugShipment[];
	shipmentPrices: ShipmentPrice[];
	drugTransactions: DrugTransaction[];
	drugUsages: DrugUsage[];
	priceLists: PriceList[];
	services: Service[];
	servicePrices: ServicePrice[];
	serviceDrugs: ServiceDrug[];
	activePatientServices: ActivePatientService[];
	bills: any[];
	billDetails: any[];
}

export const dbHelper = {
	async getUsers(): Promise<User[]> {
		try {
			const result = await query(`
			SELECT * FROM "User";
		`);
			return result.rows;
		} catch (error) {
			throw error;
		}
	},
	// Core System Tables
	async seedRoles(): Promise<Role[]> {
		const result = await query(`
            INSERT INTO Role (name) VALUES 
            ('Admin'), ('User'), ('Limited User')
            RETURNING *;
        `);
		return result.rows;
	},

	async seedPermissions(): Promise<Permission[]> {
		const result = await query(`
            INSERT INTO Permission (feature_name, description) VALUES 
			('view_dashboard', 'Can view admin dashboard and statistics'),
            ('manage_patients', 'Can manage patient records'),
			('view_patients', 'Can view patient records'),
            ('manage_services', 'Can manage services'),
            ('manage_billing', 'Can manage billing'),
            ('manage_pharmacy', 'Can manage pharmacy'),
            ('manage_employees', 'Can manage employees'),
			('view_vault', 'Can view vault details'),
			('manage_vault', 'Can add manual payments to vault'),
            ('manage_reports', 'Can access reports'),
            ('manage_settings', 'Can manage system settings'),
			('manage_users', 'Can manage users'),
			('manage_prices', 'Can manage price lists'),
			('manage_employees', 'Can manage employees'),
			('manage_payments', 'Can manage employee payments'),
			('manage_clocking', 'Can manage employee clock-in/out'),
            ('view_only', 'Can only view records')
            RETURNING *;
        `);
		return result.rows;
	},

	async seedRolePermissions(
		roleId: Role["role_id"],
		permissionsIds: Permission["permission_id"][]
	) {
		let paramArray: string[] = [];
		permissionsIds.forEach((_, ind) => {
			paramArray.push(`($1, $${ind + 2})`);
		});

		const result = await query(
			`
            INSERT INTO RolePermission (role_id, permission_id) VALUES
			${paramArray.join(", ")}
            RETURNING *;
        `,
			[roleId, ...permissionsIds]
		);
		return result.rows;
	},

	async seedUsers(
		adminRoleId: number,
		userRoleId: number,
		limitedRoleId: number
	): Promise<User[]> {
		const result = await query(
			`
            INSERT INTO "User" (username, password_hash, role_id)
            VALUES
            ('admin', $4, $1),
            ('user', $5, $2),
            ('limited', $6, $3),
			('system', $7, $1)
            RETURNING *;
        `,
			[
				adminRoleId,
				userRoleId,
				limitedRoleId,
				await bcrypt.hash("admin_hash", 10),
				await bcrypt.hash("user_hash", 10),
				await bcrypt.hash("limited_hash", 10),
				await bcrypt.hash("system_hash", 10)
			]
		);
		return result.rows;
	},

	// Employee Management
	async seedEmployees() {
		const result = await query(`
            INSERT INTO Employee (
                name, phone, is_facility_employee, hire_date, is_active, employee_type,
                base_pay, extra_amount, extra_payment_type, per_patient_payment_type,
                percentage_scope, need_clock_in, shift_type, shift_start_time, shift_end_time
            ) VALUES 
            ('Dr. John Smith', '1234567890', false, CURRENT_DATE - INTERVAL '1 year', true, 'doctor',
                5000.00, 0.00, null, 'fixed', null, false, null, "08:00:00", "17:00:00"),
            ('Dr. Sarah Johnson', '2345678901', false, CURRENT_DATE - INTERVAL '2 years', true, 'doctor',
                6000.00, 0.00, null, 'fixed', null, false, null, "08:00:00", "17:00:00"),
            ('Nurse Mary Brown', '3456789012', true, CURRENT_DATE - INTERVAL '6 months', true, 'nurse',
                3000.00, 0.00,null, null, null, true, 'morning', "08:00:00", "17:00:00"),
            ('Nurse James Wilson', '4567890123', true, CURRENT_DATE - INTERVAL '1 year', true, 'nurse',
                3000.00, 0.00, null, null, null, true, 'night', "08:00:00", "17:00:00"),
            ('Admin Jane Doe', '5678901234', true, CURRENT_DATE - INTERVAL '3 years', true, 'other',
                2500.00, 0.00, 'percentage', null, 'before_deductions', false, null, "08:00:00", "17:00:00")
            RETURNING *;
        `);
		return result.rows;
	},

	async seedDoctors(doctorEmployeeIds: number[]) {
		const result = await query(
			`
            INSERT INTO Doctor (
                doctor_id, doctor_type, is_active, daily_pay,
                per_patient_pay, payment_calculation, referral_bonus
            ) VALUES 
            ($1, 'attending', true, 500.00, 100.00, 'both', null),
            ($2, 'referring', true, null, null, null, 50.00)
            RETURNING *;
        `,
			doctorEmployeeIds
		);
		return result.rows;
	},

	async seedEmployeePayments(employeeIds: number[], userId: number) {
		const result = await query(
			`
            INSERT INTO EmployeePayment (
                employee_id, payment_amount, payment_type,
                extra_payment_type, percentage_scope, extra_amount,
                is_paid, paid_by_user_id
            ) VALUES 
            ($1, 5000.00, 'salary', null, null, null, true, $3),
            ($2, 3000.00, 'salary', null, null, null, false, $3)
            RETURNING *;
        `,
			[employeeIds[0], employeeIds[1], userId]
		);
		return result.rows;
	},

	async seedEmployeeClockIns(employeeIds: number[]) {
		const result = await query(
			`
            INSERT INTO EmployeeClockIn (
                employee_id, clock_in, clock_out, pay_deduction
            ) VALUES 
            ($1, CURRENT_TIMESTAMP - INTERVAL '8 hours', CURRENT_TIMESTAMP, 0),
            ($2, CURRENT_TIMESTAMP - INTERVAL '12 hours', null, 0)
            RETURNING *;
        `,
			employeeIds
		);
		return result.rows;
	},

	// Patient Management
	async seedInsuranceCompanies() {
		const result = await query(`
            INSERT INTO InsuranceCompany (name, contact_info)
            VALUES 
            ('MediCare Insurance', '{"phone": "1234567890", "email": "contact@medicare.com"}'),
            ('HealthFirst', '{"phone": "0987654321", "email": "support@healthfirst.com"}')
            RETURNING *;
        `);
		return result.rows;
	},
	async seedPatients(
		referringDoctorId: number | null,
		insuranceId: number,
		userId: number
	): Promise<Patient[]> {
		const result = await query(
			`
            INSERT INTO Patient (
                name, gender, phone, address, payment_type,
                insurance_id, insurance_card_id, guardian_info,
                quick_check, is_active, referring_doctor_id, created_by_user_id
            ) VALUES 
            ('John Patient', 'male', '1234567890', '123 Patient St', 'cash',
                null, null, 
                '{"name": "Jane Guardian", "phone": "0987654321", "address": "123 Guardian St", "kinship": "Parent"}'::jsonb,
                false, true, $1, $2),
				('Bob Johnson', 'male', '1234567890', '123 Patient St', 'cash', null, null, '{}'::jsonb, false, true, $1, $2),
            ('Sarah Insurance', 'female', '2345678901', '456 Patient Ave', 'insurance',
                $3, 'INS123456', '{}'::jsonb, false, true, null, $2)
            RETURNING *;
        `,
			[referringDoctorId, userId, insuranceId]
		);
		return result.rows;
	},

	async seedPatientHistory(patientIds: number[]): Promise<PatientHistory[]> {
		const result = await query(
			`
            INSERT INTO PatientHistory (
                patient_id, quick_check, diagnosis,
                admission_time, discharge_time
            ) VALUES 
            ($1, false, 'Initial diagnosis', 
                CURRENT_TIMESTAMP - INTERVAL '5 days', null),
            ($2, false, 'Regular check-up', 
                CURRENT_TIMESTAMP - INTERVAL '2 days', 
                CURRENT_TIMESTAMP - INTERVAL '1 day')
            RETURNING *;
        `,
			[patientIds[0], patientIds[1]]
		);
		return result.rows;
	},

	async seedPatientDoctors(patientId: number, doctorIds: number[]) {
		const result = await query(
			`
            INSERT INTO PatientDoctor (patient_id, doctor_id)
            VALUES ($1, $2), ($1, $3)
            RETURNING *;
        `,
			[patientId, doctorIds[0], doctorIds[1]]
		);
		return result.rows;
	},

	// Pharmacy Management
	async seedWarehouses() {
		const result = await query(`
            INSERT INTO Warehouse (name, location)
            VALUES 
            ('Main Warehouse', 'Building A, Floor 1'),
            ('Emergency Storage', 'Building B, Floor 2')
            RETURNING *;
        `);
		return result.rows;
	},

	async seedDrugCards(userId: number) {
		const result = await query(
			`
            INSERT INTO DrugCard (
                name, manufacturer, provider, is_obligatory_continuous,
                sale_quantity, frequency, min_stock_alert, max_days_expiry_alert,
                unit_conversion, created_by_user_id
            ) VALUES 
            ('Paracetamol', 'PharmaCo', 'MediSupply', false,
                100, '6 hours', 50, 90,
                '{"larger": "box", "smaller": "strip", "ratio": 100}',
                $1),
            ('Insulin', 'BioTech', 'MedLife', true,
                50, '12 hours', 20, 180,
                '{"larger": "box", "smaller": "vial", "ratio": 5}',
                $1),
			('Aspirin', 'PharmaCo', 'MediSupply', true,
				100, '6 hours', 50, 90,
				'{"larger": "box", "smaller": "strip", "ratio": 100}',
				$1)
            RETURNING *;
        `,
			[userId]
		);
		return result.rows;
	},

	async seedDrugShipments(
		drugIds: number[],
		warehouseIds: number[],
		userId: number
	) {
		const result = await query(
			`
            INSERT INTO DrugShipment (
                drug_id, warehouse_id, quantity,
                buy_price, expiry_date,
                created_by_user_id
            ) VALUES 
            ($1, $3, 10, 0.5, CURRENT_DATE + INTERVAL '1 year', $5),
            ($2, $4, 500, 25.0, CURRENT_DATE + INTERVAL '2 years', $5),
			($1, $4, 1, 0.75, CURRENT_DATE + INTERVAL '32 days', $5)
            RETURNING *;
        `,
			[drugIds[0], drugIds[1], warehouseIds[0], warehouseIds[1], userId]
		);
		return result.rows;
	},

	async seedShipmentPrices(
		shipments: any[],
		priceLists: any[],
		specificDrugId: number
	): Promise<ShipmentPrice[]> {
		const results = [];
		for (const shipment of shipments) {
			for (const priceList of priceLists) {
				const result = await query(
					`
                    INSERT INTO ShipmentPrice (
                        shipment_id, pricelist_id, price,
                        requires_prepayment, prepayment_type, prepayment_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *;
                `,
					[
						shipment.shipment_id,
						priceList.pricelist_id,
						shipment.shipment_id == specificDrugId ? 1000.0 : 100.0,
						shipment.shipment_id == specificDrugId,
						shipment.shipment_id == specificDrugId ? "fixed" : null,
						shipment.shipment_id == specificDrugId ? 500.0 : null
					]
				);
				results.push(result.rows[0]);
			}
		}
		return results;
	},

	async seedDrugTransactions(shipmentIds: number[], userId: number) {
		const result = await query(
			`
            INSERT INTO DrugTransaction (
                shipment_id, transaction_type, quantity,
                price, created_by_user_id
            ) VALUES 
            ($1, 'patient', 100, 1.0, $3),
            ($2, 'outside', 50, 40.0, $3)
            RETURNING *;
        `,
			[shipmentIds[0], shipmentIds[1], userId]
		);
		return result.rows;
	},

	async seedDrugUsage(
		patientId: number,
		drugId: number,
		transactionId: number,
		quantity: number,
		lastAdministered?: Date
	) {
		const result = await query(
			`
            INSERT INTO DrugUsage (
                patient_id,
                drug_id,
                transaction_id,
                remaining_quantity,
                last_administered
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `,
			[
				patientId,
				drugId,
				transactionId,
				quantity,
				lastAdministered || null
			]
		);

		return result.rows[0];
	},

	// Services and Pricing
	async seedPriceLists(): Promise<PriceList[]> {
		const result = await query(`
            INSERT INTO PriceList (name, is_default)
            VALUES 
            ('Standard', true),
            ('VIP', false),
            ('Insurance', false)
            RETURNING *;
        `);
		return result.rows;
	},

	async seedServices(): Promise<Service[]> {
		const result = await query(`
            INSERT INTO Service (
                name, auto_renew, auto_add_on_admission, service_type
            ) VALUES 
            ('Room Service', true, true, 'daily'),
            ('Medical Check', false, false, 'once'),
            ('Monitoring', true, false, 'hourly'),
            ('ICU Care', true, true, 'daily')
            RETURNING *;
        `);
		return result.rows;
	},

	async seedServicePrices(
		services: any[],
		priceLists: any[]
	): Promise<ServicePrice[]> {
		const results = [];
		for (const service of services) {
			for (const priceList of priceLists) {
				const result = await query(
					`
                    INSERT INTO ServicePrice (
                        service_id, pricelist_id, price,
                        requires_prepayment, prepayment_type, prepayment_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *;
                `,
					[
						service.service_id,
						priceList.pricelist_id,
						service.name.includes("ICU") ? 1000.0 : 100.0,
						service.name.includes("ICU"),
						service.name.includes("ICU") ? "fixed" : null,
						service.name.includes("ICU") ? 500.0 : null
					]
				);
				results.push(result.rows[0]);
			}
		}
		return results;
	},

	async seedServiceDrugs(
		serviceId: number,
		drugIds: number[]
	): Promise<ServiceDrug[]> {
		const result = await query(
			`
            INSERT INTO ServiceDrug (service_id, drug_id)
            VALUES ($1, $2), ($1, $3), ($1, $4)
            RETURNING *;
        `,
			[serviceId, drugIds[0], drugIds[1], drugIds[2]]
		);
		return result.rows;
	},

	async seedActivePatientServices(
		patientIds: number[],
		serviceIds: number[]
	) {
		const result = await query(
			`
            INSERT INTO ActivePatientService (
                patient_id, service_id, start_date, is_active
            ) VALUES 
            ($1, $3, CURRENT_TIMESTAMP - INTERVAL '5 days', true),
            ($1, $4, CURRENT_TIMESTAMP - INTERVAL '5 days', true),
            ($2, $5, CURRENT_TIMESTAMP - INTERVAL '2 days', false)
            RETURNING *;
        `,
			[
				patientIds[0],
				patientIds[1],
				serviceIds[0],
				serviceIds[2],
				serviceIds[1]
			]
		);
		return result.rows;
	}, // Billing Management
	async seedBills(patientIds: number[], userId: number) {
		const result = await query(
			`
            INSERT INTO Bill (
                patient_id, total_amount, paid_amount,
                discount_type, discount, administrative_expenses,
                vat_percentage, vat_scope, issued_by_user_id
            ) VALUES 
            ($1, 1500.00, 1000.00, 'percentage', 10.00, 50.00, 5.00, 'both', $3),
            ($2, 800.00, 800.00, 'fixed', 100.00, 25.00, 5.00, 'services', $3)
            RETURNING *;
        `,
			[patientIds[0], patientIds[1], userId]
		);
		return result.rows;
	},

	async seedBillDetails(
		billIds: number[],
		serviceIds: number[],
		shipmentIds: number[]
	) {
		const result = await query(
			`
            INSERT INTO BillDetail (
                bill_id, service_id, drug_shipment_id,
                quantity, unit_price, sale_type
            ) VALUES 
            ($1, $3, null, 1, 1000.00, 'admitted'),
            ($1, null, $5, 10, 1.00, 'admitted'),
            ($2, $4, null, 1, 100.00, 'medical_check')
            RETURNING *;
        `,
			[
				billIds[0],
				billIds[1],
				serviceIds[3],
				serviceIds[1],
				shipmentIds[0]
			]
		);
		return result.rows;
	},

	// Main Seeding Function
	async seedDatabase(): Promise<TestData> {
		try {
			overridePgDate();
			await query("BEGIN");

			// Seed core system tables
			const roles = await this.seedRoles();
			const permissions = await this.seedPermissions();
			const permissionIds: Permission["permission_id"][] =
				permissions.map((p) => p.permission_id);
			await this.seedRolePermissions(roles[0].role_id, permissionIds);
			await this.seedRolePermissions(roles[1].role_id, [
				permissionIds[0],
				permissionIds[1],
				permissionIds[3],
				permissionIds[4]
			]);
			const users = await this.seedUsers(
				roles[0].role_id,
				roles[1].role_id,
				roles[2].role_id
			);

			// Seed employee-related tables
			const employees = await this.seedEmployees();
			const doctors = await this.seedDoctors([
				employees[0].employee_id,
				employees[1].employee_id
			]);

			await this.seedEmployeePayments(
				[employees[0].employee_id, employees[2].employee_id],
				users[0].user_id
			);

			await this.seedEmployeeClockIns([
				employees[2].employee_id,
				employees[3].employee_id
			]);

			// Seed patient-related tables
			const insuranceCompanies = await this.seedInsuranceCompanies();
			const patients: Patient[] = await this.seedPatients(
				doctors[1].doctor_id,
				insuranceCompanies[0].insurance_id,
				users[0].user_id
			);

			const patientHistories = await this.seedPatientHistory(
				patients.map((p) => p.patient_id)
			);

			await this.seedPatientDoctors(
				patients[0].patient_id,
				doctors.map((d) => d.doctor_id)
			);

			// Seed pharmacy-related tables
			const priceLists = await this.seedPriceLists();
			const warehouses = await this.seedWarehouses();
			const drugCards = await this.seedDrugCards(users[0].user_id);

			const drugShipments = await this.seedDrugShipments(
				drugCards.map((d) => d.drug_id),
				warehouses.map((w) => w.warehouse_id),
				users[0].user_id
			);

			const specificDrugId = drugCards[0].drug_id;

			const shipmentPrices = await this.seedShipmentPrices(
				drugShipments,
				priceLists,
				specificDrugId
			);

			const drugTransactions = await this.seedDrugTransactions(
				drugShipments.map((s) => s.shipment_id),
				users[0].user_id
			);

			const drugUsages = [];

			// Create a usage for an obligatory continuous drug with remaining quantity
			const continuousDrugUsage = await this.seedDrugUsage(
				patients[0].patient_id,
				drugCards[0].drug_id,
				drugTransactions[1].transaction_id,
				50, // remaining quantity in smaller units
				new Date(Date.now() - 24 * 60 * 60 * 1000) // last administered 24 hours ago
			);
			drugUsages.push(continuousDrugUsage);

			// Create a usage for a completed drug course
			const completedDrugUsage = await this.seedDrugUsage(
				patients[0].patient_id,
				drugCards[1].drug_id,
				drugTransactions[1].transaction_id,
				0, // no remaining quantity
				new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last administered a week ago
			);
			drugUsages.push(completedDrugUsage);

			// Create a usage for a newly prescribed drug
			const newDrugUsage = await this.seedDrugUsage(
				patients[1].patient_id,
				drugCards[0].drug_id,
				drugTransactions[0].transaction_id,
				100, // full quantity remaining
				undefined // not yet administered
			);
			drugUsages.push(newDrugUsage);

			// Seed service-related tables
			const services = await this.seedServices();
			const servicePrices = await this.seedServicePrices(
				services,
				priceLists
			);

			const serviceDrugs = await this.seedServiceDrugs(
				services[2].service_id,
				drugCards.map((d) => d.drug_id)
			);

			const activePatientServices = await this.seedActivePatientServices(
				patients.map((p) => p.patient_id),
				services.map((s) => s.service_id)
			);

			// Seed billing-related tables
			const bills = await this.seedBills(
				patients.map((p) => p.patient_id),
				users[0].user_id
			);

			const billDetails = await this.seedBillDetails(
				bills.map((b) => b.bill_id),
				services.map((s) => s.service_id),
				drugShipments.map((s) => s.shipment_id)
			);

			await query("COMMIT");

			return {
				roles,
				permissions,
				users,
				employees,
				doctors,
				insuranceCompanies,
				patients,
				patientHistories,
				warehouses,
				drugCards,
				drugShipments,
				shipmentPrices,
				drugTransactions,
				drugUsages,
				priceLists,
				services,
				servicePrices,
				serviceDrugs: serviceDrugs, // This would be populated if you want to track service-drug associations
				activePatientServices,
				bills,
				billDetails
			};
		} catch (error) {
			await query("ROLLBACK");
			console.error("Error seeding database:", error);
			throw error;
		}
	},

	// Clearing Functions
	async clearAuditLogs() {
		await query("DELETE FROM AuditLog");
	},

	async clearBillDetails() {
		await query("DELETE FROM BillDetail");
	},

	async clearBills() {
		await query("DELETE FROM Bill");
	},

	async clearActivePatientServices() {
		await query("DELETE FROM ActivePatientService");
	},

	async clearServiceDrugs() {
		await query("DELETE FROM ServiceDrug");
	},

	async clearServicePrices() {
		await query("DELETE FROM ServicePrice");
	},

	async clearServices() {
		await query("DELETE FROM Service");
	},

	async clearPriceLists() {
		await query("DELETE FROM PriceList");
	},

	async clearDrugUsages() {
		await query("DELETE FROM DrugUsage");
	},

	async clearDrugTransactions() {
		await query("DELETE FROM DrugTransaction");
	},

	async clearShipmentPrices() {
		await query("DELETE FROM ShipmentPrice");
	},

	async clearDrugShipments() {
		await query("DELETE FROM DrugShipment");
	},

	async clearDrugCards() {
		await query("DELETE FROM DrugCard");
	},

	async clearWarehouses() {
		await query("DELETE FROM Warehouse");
	},

	async clearPatientDoctors() {
		await query("DELETE FROM PatientDoctor");
	},

	async clearPatientHistory() {
		await query("DELETE FROM PatientHistory");
	},

	async clearPatients() {
		await query("DELETE FROM Patient");
	},

	async clearInsuranceCompanies() {
		await query("DELETE FROM InsuranceCompany");
	},

	async clearEmployeeClockIns() {
		await query("DELETE FROM EmployeeClockIn");
	},

	async clearEmployeePayments() {
		await query("DELETE FROM EmployeePayment");
	},

	async clearDoctors() {
		await query("DELETE FROM Doctor");
	},

	async clearEmployees() {
		await query("DELETE FROM Employee");
	}, // Core System Clear Functions
	async clearRolePermissions() {
		await query("DELETE FROM RolePermission");
	},

	async clearPermissions() {
		await query("DELETE FROM Permission");
	},

	async clearUsers() {
		await query('DELETE FROM "User"');
	},

	async clearRoles() {
		await query("DELETE FROM Role");
	},

	// Main Clearing Function
	async clearDatabase() {
		try {
			await query("BEGIN");

			// Clear tables in reverse order of dependencies
			await this.clearAuditLogs();
			await this.clearBillDetails();
			await this.clearBills();
			await this.clearActivePatientServices();
			await this.clearServiceDrugs();
			await this.clearServicePrices();
			await this.clearServices();
			await this.clearDrugUsages();
			await this.clearDrugTransactions();
			await this.clearShipmentPrices();
			await this.clearDrugShipments();
			await this.clearDrugCards();
			await this.clearWarehouses();
			await this.clearPriceLists();
			await this.clearPatientDoctors();
			await this.clearPatientHistory();
			await this.clearPatients();
			await this.clearInsuranceCompanies();
			await this.clearEmployeeClockIns();
			await this.clearEmployeePayments();
			await this.clearDoctors();
			await this.clearEmployees();
			await this.clearRolePermissions();
			await this.clearUsers();
			await this.clearPermissions();
			await this.clearRoles();

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error("Error clearing database:", error);
			throw error;
		}
	},

	async createDBIfNotExists(dbName: string) {
		const result = await pgPool.query(
			`SELECT datname FROM pg_catalog.pg_database WHERE datname = '${dbName}'`
		);
		if (result.rowCount === 0) {
			console.log(`${dbName} database not found, creating it.`);
			await pgPool.query(`CREATE DATABASE "${dbName}";`);
			console.log(`created database ${dbName}`);
			console.log(await this.initDB());
			console.log(`initialized database ${dbName}`);
		} else {
			console.log(`${dbName} database exists.`);
		}
	},
	async initDB() {
		return await query(`
			-- Create Enum Types First
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

CREATE TYPE payment_type AS ENUM ('cash', 'credit', 'insurance');

CREATE TYPE leave_reason_type AS ENUM ('death', 'improvement', 'transfer', 'as_desired');

CREATE TYPE discount_type AS ENUM ('fixed', 'percentage');

CREATE TYPE sale_type AS ENUM ('outside', 'medical_check', 'admitted');

CREATE TYPE service_type AS ENUM ('once', 'hourly', 'daily');

CREATE TYPE transaction_type AS ENUM ('patient', 'check', 'outside');

CREATE TYPE employee_type AS ENUM ('doctor', 'nurse', 'other');

CREATE TYPE payment_calculation AS ENUM ('fixed', 'per_patient', 'both');

CREATE TYPE doctor_type AS ENUM (
	'attending',
	'supervising',
	'outside',
	'referring'
);

CREATE TYPE prepayment_type AS ENUM ('fixed', 'percentage');

CREATE TYPE percentage_scope AS ENUM ('before_deductions', 'after_deductions');

CREATE TYPE shift_type AS ENUM ('morning', 'night');

CREATE TYPE vat_scope_type AS ENUM ('services', 'drugs', 'both');

CREATE TYPE vault_manual_payment_type AS ENUM ('addition', 'deduction');

-- Core tables
CREATE TABLE IF NOT EXISTS Role (
	role_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS Permission (
	permission_id SERIAL PRIMARY KEY,
	feature_name VARCHAR(255) NOT NULL,
	description TEXT
);

CREATE TABLE IF NOT EXISTS RolePermission (
	role_id INTEGER REFERENCES Role(role_id),
	permission_id INTEGER REFERENCES Permission(permission_id),
	PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS "User" (
	user_id SERIAL PRIMARY KEY,
	username VARCHAR(255) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	role_id INTEGER REFERENCES Role(role_id),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee Management
CREATE TABLE IF NOT EXISTS Employee (
	employee_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	phone VARCHAR(20),
	is_facility_employee BOOLEAN DEFAULT false,
	is_active BOOLEAN DEFAULT true,
	hire_date DATE NOT NULL,
	employee_type employee_type NOT NULL,
	base_pay DECIMAL(15, 2) DEFAULT 0,
	extra_amount DECIMAL(15, 2) DEFAULT 0,
	extra_payment_type VARCHAR(50),
	per_patient_payment_type VARCHAR(50),
	percentage_scope percentage_scope,
	need_clock_in BOOLEAN DEFAULT false,
	shift_type shift_type
);

CREATE TABLE IF NOT EXISTS Doctor (
	doctor_id SERIAL PRIMARY KEY REFERENCES Employee(employee_id),
	doctor_type doctor_type NOT NULL,
	is_active BOOLEAN DEFAULT true,
	daily_pay DECIMAL(15, 2),
	per_patient_pay DECIMAL(15, 2),
	payment_calculation payment_calculation,
	referral_bonus DECIMAL(15, 2)
);

CREATE TABLE IF NOT EXISTS EmployeePayment (
	payment_id SERIAL PRIMARY KEY,
	employee_id INTEGER REFERENCES Employee(employee_id) ON DELETE CASCADE,
	payment_amount DECIMAL(15, 2) NOT NULL,
	extra_payment_type VARCHAR(50),
	payment_type VARCHAR(50) NOT NULL,
	percentage_scope percentage_scope,
	extra_amount DECIMAL(15, 2),
	is_paid BOOLEAN DEFAULT false,
	is_void BOOLEAN DEFAULT false,
	issued_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	paid_timestamp TIMESTAMP,
	paid_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS EmployeeClockIn (
	clock_id SERIAL PRIMARY KEY,
	employee_id INTEGER REFERENCES Employee(employee_id) ON DELETE CASCADE,
	clock_in TIMESTAMP NOT NULL,
	clock_out TIMESTAMP,
	pay_deduction DECIMAL(15, 2) DEFAULT 0
);

-- Patient Related tables
CREATE TABLE IF NOT EXISTS InsuranceCompany (
	insurance_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	contact_info TEXT
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id),
	last_cleared_date DATE
);

CREATE TABLE IF NOT EXISTS InsurancePayments (
	payment_id SERIAL PRIMARY KEY,
	insurance_id INTEGER REFERENCES InsuranceCompany(insurance_id),
	payment_amount DECIMAL(15, 2) NOT NULL,
	payment_from DATE NOT NULL,
	payment_to DATE NOT NULL,
	added_by_user_id INTEGER REFERENCES "User"(user_id),
	issued_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Patient (
	patient_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	national_id VARCHAR(255) UNIQUE,
	gender gender_type,
	phone VARCHAR(20),
	address TEXT,
	payment_type payment_type NOT NULL,
	insurance_id INTEGER REFERENCES InsuranceCompany(insurance_id),
	insurance_form_id VARCHAR(255),
	insurance_card_id VARCHAR(255),
	guardian_info JSONB,
	quick_check BOOLEAN DEFAULT false,
	is_active BOOLEAN DEFAULT true,
	registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	referring_doctor_id INTEGER REFERENCES Doctor(doctor_id),
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS PatientHistory (
	patient_history_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	bill_id INTEGER REFERENCES Bill(bill_id),
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id),
	leave_reason leave_reason_type,
	quick_check BOOLEAN,
	diagnosis TEXT,
	admission_time TIMESTAMP,
	discharge_time TIMESTAMP
);

-- Doctor Relationships
CREATE TABLE IF NOT EXISTS DoctorPatientHistory (
	patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
	doctor_id INTEGER REFERENCES Doctor(doctor_id),
	PRIMARY KEY (patient_history_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS PatientDoctor (
	patient_id INTEGER REFERENCES Patient(patient_id),
	doctor_id INTEGER REFERENCES Doctor(doctor_id),
	PRIMARY KEY (patient_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS PatientNurse (
	patient_id INTEGER REFERENCES Patient(patient_id),
	nurse_id INTEGER REFERENCES Employee(employee_id),
	PRIMARY KEY (patient_id, nurse_id)
);

CREATE TABLE IF NOT EXISTS NursePatientHistory (
	patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
	nurse_id INTEGER REFERENCES Employee(employee_id),
	PRIMARY KEY (patient_history_id, nurse_id)
)

-- Pharmacy Management
CREATE TABLE IF NOT EXISTS Warehouse (
	warehouse_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS DrugCard (
	drug_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	manufacturer VARCHAR(255),
	provider VARCHAR(255),
	is_obligatory_continuous BOOLEAN DEFAULT false,
	sale_quantity INTEGER NOT NULL,
	frequency INTERVAL,
	min_stock_alert INTEGER,
	max_days_expiry_alert INTEGER,
	unit_conversion JSONB NOT NULL,
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS DrugShipment (
	shipment_id SERIAL PRIMARY KEY,
	drug_id INTEGER REFERENCES DrugCard(drug_id),
	warehouse_id INTEGER REFERENCES Warehouse(warehouse_id),
	quantity INTEGER NOT NULL,
	buy_price DECIMAL(15, 2) NOT NULL,
	expiry_date DATE NOT NULL,
	received_date DATE DEFAULT CURRENT_DATE,
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS DrugTransaction (
	transaction_id SERIAL PRIMARY KEY,
	shipment_id INTEGER REFERENCES DrugShipment(shipment_id),
	transaction_type transaction_type NOT NULL,
	quantity INTEGER NOT NULL,
	price DECIMAL(15, 2) NOT NULL,
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	created_by_user_id INTEGER REFERENCES "User"(user_id),
	patient_id INTEGER REFERENCES Patient(patient_id)
);

CREATE TABLE IF NOT EXISTS DrugUsage (
	usage_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	drug_id INTEGER REFERENCES DrugCard(drug_id),
	transaction_id INTEGER REFERENCES DrugTransaction(transaction_id),
	patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
	remaining_quantity INTEGER NOT NULL,
	last_administered TIMESTAMP
);

-- Services and Pricing
CREATE TABLE IF NOT EXISTS Service (
	service_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	auto_renew BOOLEAN DEFAULT false,
	auto_add_on_admission BOOLEAN DEFAULT false,
	service_type service_type NOT NULL
);

CREATE TABLE IF NOT EXISTS ActivePatientService (
	active_service_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	service_id INTEGER REFERENCES Service(service_id),
	start_date TIMESTAMP NOT NULL,
	end_date TIMESTAMP,
	is_active BOOLEAN DEFAULT true
	last_renewed TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS ServiceDrug (
	service_id INTEGER REFERENCES Service(service_id),
	drug_id INTEGER REFERENCES DrugCard(drug_id),
	PRIMARY KEY (service_id, drug_id)
);

-- Billing System
CREATE TABLE IF NOT EXISTS Bill (
	bill_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	total_amount DECIMAL(15, 2) NOT NULL,
	paid_amount DECIMAL(15, 2) DEFAULT 0,
	discount_type discount_type,
	discount DECIMAL(15, 2) DEFAULT 0,
	administrative_expenses DECIMAL(15, 2) DEFAULT 0,
	vat_percentage DECIMAL(5, 2),
	vat_scope vat_scope_type,
	generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	issued_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS BillDetail (
	bill_detail_id SERIAL PRIMARY KEY,
	bill_id INTEGER REFERENCES Bill(bill_id),
	service_id INTEGER REFERENCES Service(service_id),
	drug_shipment_id INTEGER REFERENCES DrugShipment(shipment_id),
	quantity INTEGER NOT NULL,
	unit_price DECIMAL(15, 2) NOT NULL,
	charge_type VARCHAR(50),
	sale_type sale_type NOT NULL,
	generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP CHECK (
		(
			service_id IS NOT NULL
			AND drug_shipment_id IS NULL
		)
		OR (
			service_id IS NULL
			AND drug_shipment_id IS NOT NULL
		)
	)
);

-- Inventory and Pricing
CREATE TABLE IF NOT EXISTS PriceList (
	pricelist_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	is_default BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS ServicePrice (
	service_price_id SERIAL PRIMARY KEY,
	service_id INTEGER REFERENCES Service(service_id) ON DELETE CASCADE,
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id) ON DELETE CASCADE,
	price DECIMAL(15, 2) NOT NULL,
	requires_prepayment BOOLEAN DEFAULT false,
	prepayment_type prepayment_type,
	prepayment_amount DECIMAL(15, 2),
	PRIMARY KEY (service_id, pricelist_id)
);

CREATE TABLE IF NOT EXISTS ShipmentPrice (
	shipment_id INTEGER REFERENCES DrugShipment(shipment_id) ON DELETE CASCADE,
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id) ON DELETE CASCADE,
	price DECIMAL(15, 2) NOT NULL,
	requires_prepayment BOOLEAN DEFAULT false,
	prepayment_type prepayment_type,
	prepayment_amount DECIMAL(15, 2),
	PRIMARY KEY (shipment_id, pricelist_id)
);

-- Audit System
CREATE TABLE IF NOT EXISTS AuditLog (
	log_id SERIAL PRIMARY KEY,
	user_id INTEGER REFERENCES "User"(user_id),
	action_type VARCHAR(255) NOT NULL,
	details JSONB,
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS VaultManualPayment (
	payment_id SERIAL PRIMARY KEY,
	payment_amount DECIMAL(15, 2) NOT NULL,
	payment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	payment_type vault_manual_payment_type NOT NULL
)

-- Create Indexes for Frequent Queries
CREATE INDEX IF NOT EXISTS idx_patient_name ON Patient(name);

CREATE INDEX IF NOT EXISTS idx_drug_name ON DrugCard(name);

CREATE INDEX IF NOT EXISTS idx_bill_date ON Bill(generated_at);

CREATE INDEX IF NOT EXISTS idx_employee_hire_date ON Employee(hire_date);

-- Foreign Key Constraints
ALTER TABLE
	PatientHistory
ADD
	CONSTRAINT patienthistory_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES Bill(bill_id);

-- Add indexes for bill queries
CREATE INDEX IF NOT EXISTS idx_bill_patient ON Bill(patient_id);

CREATE INDEX IF NOT EXISTS idx_bill_generated ON Bill(generated_at);

CREATE INDEX IF NOT EXISTS idx_bill_detail_bill ON BillDetail(bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_detail_service ON BillDetail(service_id);

CREATE INDEX IF NOT EXISTS idx_bill_detail_drug ON BillDetail(drug_shipment_id);

-- Add indexes for active patient services
CREATE INDEX IF NOT EXISTS idx_active_patient_service_patient ON ActivePatientService(patient_id);

CREATE INDEX IF NOT EXISTS idx_active_patient_service_active ON ActivePatientService(patient_id, is_active)
WHERE
	is_active = true;

CREATE INDEX IF NOT EXISTS idx_active_patient_service_service ON ActivePatientService(service_id);

-- Add indexes for drug usage tracking
CREATE INDEX IF NOT EXISTS idx_drug_usage_patient ON DrugUsage(patient_id);

CREATE INDEX IF NOT EXISTS idx_drug_usage_drug ON DrugUsage(drug_id);

CREATE INDEX IF NOT EXISTS idx_drug_usage_remaining ON DrugUsage(remaining_quantity)
WHERE
	remaining_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_drug_usage_administered ON DrugUsage(last_administered);

-- Add indexes for doctor patient history
CREATE INDEX IF NOT EXISTS idx_doctor_patient_history_patient ON DoctorPatientHistory(patient_history_id);

CREATE INDEX IF NOT EXISTS idx_doctor_patient_history_doctor ON DoctorPatientHistory(doctor_id);

-- Add a view for currently admitted patients with their details
CREATE
OR REPLACE VIEW CurrentAdmissions AS
SELECT
	p.patient_id,
	p.name as patient_name,
	p.gender,
	p.phone,
	p.payment_type,
	p.insurance_id,
	ic.name as insurance_company_name,
	ph.patient_history_id,
	ph.diagnosis,
	ph.admission_time,
	ph.bill_id,
	b.total_amount,
	b.paid_amount,
	array_agg(DISTINCT e.name) as attending_doctors,
	array_agg(DISTINCT dph.doctor_id) as attending_doctor_ids
FROM
	Patient p
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
	LEFT JOIN InsuranceCompany ic ON p.insurance_id = ic.insurance_id
	LEFT JOIN Bill b ON ph.bill_id = b.bill_id
	LEFT JOIN DoctorPatientHistory dph ON ph.patient_history_id = dph.patient_history_id
	LEFT JOIN Employee e ON dph.doctor_id = e.employee_id
WHERE
	p.is_active = true
GROUP BY
	p.patient_id,
	p.name,
	p.gender,
	p.phone,
	p.payment_type,
	p.insurance_id,
	ic.name,
	ph.patient_history_id,
	ph.diagnosis,
	ph.admission_time,
	ph.bill_id,
	b.total_amount,
	b.paid_amount;

-- Add a view for service renewals that are due
CREATE
OR REPLACE VIEW ServiceRenewalsDue AS
SELECT
	aps.active_service_id,
	aps.patient_id,
	p.name as patient_name,
	aps.service_id,
	s.name as service_name,
	s.service_type,
	s.auto_renew,
	aps.start_date,
	ph.bill_id,
	sp.price,
	CASE
		WHEN s.service_type = 'hourly' THEN aps.start_date + (
			FLOOR(
				EXTRACT(
					EPOCH
					FROM
						(CURRENT_TIMESTAMP - aps.start_date)
				) / 3600
			) + 1
		) * INTERVAL '1 hour'
		WHEN s.service_type = 'daily' THEN aps.start_date + (
			FLOOR(
				EXTRACT(
					EPOCH
					FROM
						(CURRENT_TIMESTAMP - aps.start_date)
				) / 86400
			) + 1
		) * INTERVAL '1 day'
		ELSE NULL
	END as next_charge_time
FROM
	ActivePatientService aps
	JOIN Service s ON aps.service_id = s.service_id
	JOIN Patient p ON aps.patient_id = p.patient_id
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
	JOIN ServicePrice sp ON s.service_id = sp.service_id
	JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
WHERE
	aps.is_active = true
	AND p.is_active = true
	AND s.auto_renew = true
	AND s.service_type IN ('hourly', 'daily')
	AND pl.is_default = true
	AND CASE
		WHEN s.service_type = 'hourly' THEN CURRENT_TIMESTAMP >= aps.start_date + (
			FLOOR(
				EXTRACT(
					EPOCH
					FROM
						(CURRENT_TIMESTAMP - aps.start_date)
				) / 3600
			)
		) * INTERVAL '1 hour'
		WHEN s.service_type = 'daily' THEN CURRENT_TIMESTAMP >= aps.start_date + (
			FLOOR(
				EXTRACT(
					EPOCH
					FROM
						(CURRENT_TIMESTAMP - aps.start_date)
				) / 86400
			)
		) * INTERVAL '1 day'
		ELSE false
	END;

-- Add a view for drug administrations that are due
CREATE
OR REPLACE VIEW DrugAdministrationsDue AS
SELECT
	du.usage_id,
	du.patient_id,
	p.name as patient_name,
	du.drug_id,
	dc.name as drug_name,
	du.remaining_quantity,
	du.last_administered,
	dc.frequency,
	dc.is_obligatory_continuous,
	dc.sale_quantity,
	ph.bill_id,
	COALESCE(
		du.last_administered + dc.frequency :: interval,
		CURRENT_TIMESTAMP
	) as next_administration
FROM
	DrugUsage du
	JOIN DrugCard dc ON du.drug_id = dc.drug_id
	JOIN Patient p ON du.patient_id = p.patient_id
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
WHERE
	du.remaining_quantity > 0
	AND p.is_active = true
	AND dc.is_obligatory_continuous = true
	AND dc.frequency IS NOT NULL
	AND (
		du.last_administered IS NULL
		OR CURRENT_TIMESTAMP >= du.last_administered + dc.frequency :: interval
	);

-- Add a view for drugs that need replenishment
CREATE
OR REPLACE VIEW DrugReplenishmentNeeded AS
SELECT
	du.usage_id,
	du.patient_id,
	p.name as patient_name,
	du.drug_id,
	dc.name as drug_name,
	du.remaining_quantity,
	dc.sale_quantity,
	dc.is_obligatory_continuous,
	ph.bill_id
FROM
	DrugUsage du
	JOIN DrugCard dc ON du.drug_id = dc.drug_id
	JOIN Patient p ON du.patient_id = p.patient_id
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
WHERE
	du.remaining_quantity <= 0
	AND p.is_active = true
	AND dc.is_obligatory_continuous = true;

-- Create a function to calculate next service charge time
CREATE
OR REPLACE FUNCTION calculate_next_service_charge(
	start_date TIMESTAMP,
	service_type service_type
) RETURNS TIMESTAMP AS $ $ BEGIN CASE
	service_type
	WHEN 'hourly' THEN RETURN start_date + (
		FLOOR(
			EXTRACT(
				EPOCH
				FROM
					(CURRENT_TIMESTAMP - start_date)
			) / 3600
		) + 1
	) * INTERVAL '1 hour';

WHEN 'daily' THEN RETURN start_date + (
	FLOOR(
		EXTRACT(
			EPOCH
			FROM
				(CURRENT_TIMESTAMP - start_date)
		) / 86400
	) + 1
) * INTERVAL '1 day';

ELSE RETURN NULL;

END CASE;

END;

$$ LANGUAGE plpgsql;
-- Insert required permissions
INSERT INTO
	Permission (feature_name, description)
VALUES
	('view_dashboard', 'Can view admin dashboard and statistics'),
	('manage_patients', 'Can manage patient records'),
	('view_patients', 'Can view patient records'),
	('manage_services', 'Can manage services'),
	('manage_billing', 'Can manage billing'),
	('manage_pharmacy', 'Can manage pharmacy'),
	('manage_insurance', 'Can manage insurance companies and their payments'),
	('manage_employees', 'Can manage employees'),
	('view_vault', 'Can view vault details'),
	(
		'manage_vault',
		'Can manage vault and add vault payments'
	),
	('manage_reports', 'Can access reports'),
	('manage_settings', 'Can manage system settings'),
	('manage_users', 'Can manage users'),
	('manage_prices', 'Can manage price lists'),
	('manage_employees', 'Can manage employees'),
	(
		'manage_payments',
		'Can manage employee payments'
	),
	(
		'manage_clocking',
		'Can manage employee clock-in/out'
	),
	('view_only', 'Can only view records');
`);
	}
};
