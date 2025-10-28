import { pgPool, query } from "../models/database/connection.js";

export async function createDBIfNotExists(dbName: string) {
	const result = await pgPool.query(
		`SELECT datname FROM pg_catalog.pg_database WHERE datname = '${dbName}'`
	);
	if (result.rowCount === 0) {
		console.log(`${dbName} database not found, creating it.`);
		await pgPool.query(`CREATE DATABASE "${dbName}";`);
		console.log(`created database ${dbName}`);
		await initDB();
		console.log(`initialized database ${dbName}`);
		return true;
	} else {
		console.log(`${dbName} database exists.`);
		return false;
	}
}

async function initDB() {
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
			
		CREATE TABLE IF NOT EXISTS "User" (
			user_id SERIAL PRIMARY KEY,
			username VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role_id INTEGER REFERENCES Role(role_id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
			
		CREATE TABLE IF NOT EXISTS RolePermission (
			role_id INTEGER REFERENCES Role(role_id),
			permission_id INTEGER REFERENCES Permission(permission_id),
			PRIMARY KEY (role_id, permission_id)
		);
			
		-- Inventory and Pricing
		CREATE TABLE IF NOT EXISTS PriceList (
			pricelist_id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			is_default BOOLEAN DEFAULT false
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
			--"per_patient" | "income" | "both" | "none"
			per_patient_payment_type VARCHAR(50),
			--"fixed" | "percentage"
			percentage_scope percentage_scope,
			need_clock_in BOOLEAN DEFAULT false,
			shift_type shift_type,
			shift_start_time TIME,
			shift_end_time TIME
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
			buy_quantity INTEGER NOT NULL,
			quantity INTEGER NOT NULL,
			buy_price DECIMAL(15, 2) NOT NULL,
			expiry_date DATE NOT NULL,
			received_date DATE DEFAULT CURRENT_DATE,
			created_by_user_id INTEGER REFERENCES "User"(user_id)
		);
			
		-- Services and Pricing
		CREATE TABLE IF NOT EXISTS Service (
			service_id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			auto_renew BOOLEAN DEFAULT false,
			auto_add_on_admission BOOLEAN DEFAULT false,
			service_type service_type NOT NULL
		);
			
		-- Patient Related tables
		CREATE TABLE IF NOT EXISTS InsuranceCompany (
			insurance_id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			contact_info TEXT,
			pricelist_id INTEGER REFERENCES PriceList(pricelist_id),
			last_cleared_date DATE DEFAULT CURRENT_DATE
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
			PRIMARY KEY (patient_id, doctor_id),
			assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			unassigned_at TIMESTAMP DEFAULT NULL
		);
			
		CREATE TABLE IF NOT EXISTS PatientNurse (
			patient_id INTEGER REFERENCES Patient(patient_id),
			nurse_id INTEGER REFERENCES Employee(employee_id),
			PRIMARY KEY (patient_id, nurse_id),
			assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			unassigned_at TIMESTAMP DEFAULT NULL
		);
			
		CREATE TABLE IF NOT EXISTS NursePatientHistory (
			patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
			nurse_id INTEGER REFERENCES Employee(employee_id),
			PRIMARY KEY (patient_history_id, nurse_id)
		);
			
		CREATE TABLE IF NOT EXISTS DailyStaffAssignment (
			assignment_id SERIAL PRIMARY KEY,
			employee_id INTEGER REFERENCES Employee(employee_id),
			patient_id INTEGER REFERENCES Patient(patient_id),
			work_date DATE NOT NULL,
			hours_worked DECIMAL(4, 2) DEFAULT 24.0,
			payment_processed BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(employee_id, patient_id, work_date)
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
			
		CREATE TABLE IF NOT EXISTS DrugTransaction (
			transaction_id SERIAL PRIMARY KEY,
			shipment_id INTEGER REFERENCES DrugShipment(shipment_id),
			transaction_type transaction_type NOT NULL,
			quantity INTEGER NOT NULL,
			price DECIMAL(15, 2) NOT NULL,
			timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by_user_id INTEGER REFERENCES "User"(user_id)
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
			
		CREATE TABLE IF NOT EXISTS ActivePatientService (
			active_service_id SERIAL PRIMARY KEY,
			patient_id INTEGER REFERENCES Patient(patient_id),
			service_id INTEGER REFERENCES Service(service_id),
			start_date TIMESTAMP NOT NULL,
			end_date TIMESTAMP,
			is_active BOOLEAN DEFAULT true,
			last_renewed TIMESTAMP DEFAULT NULL
		);
			
		CREATE TABLE IF NOT EXISTS ServiceDrug (
			service_id INTEGER REFERENCES Service(service_id),
			drug_id INTEGER REFERENCES DrugCard(drug_id),
			PRIMARY KEY (service_id, drug_id)
		);
			
		CREATE TABLE IF NOT EXISTS ServicePrice (
			service_price_id SERIAL,
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
			
		CREATE TABLE IF NOT EXISTS EmployeePayment (
			payment_id SERIAL PRIMARY KEY,
			employee_id INTEGER REFERENCES Employee(employee_id) ON DELETE CASCADE,
			payment_amount DECIMAL(15, 2) NOT NULL,
			extra_payment_type VARCHAR(50),
			-- 'none' | 'per_patient' | 'income'
			payment_type VARCHAR(50) NOT NULL,
			-- 'manual' | 'bonus' | 'overtime' | 'salary' | 'commission' 
			percentage_scope percentage_scope,
			extra_amount DECIMAL(15, 2),
			is_paid BOOLEAN DEFAULT false,
			is_void BOOLEAN DEFAULT false,
			issued_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			paid_timestamp TIMESTAMP,
			paid_by_user_id INTEGER REFERENCES "User"(user_id)
		);
			
		CREATE TABLE IF NOT EXISTS EmployeePaymentPatient (
			payment_patient_id SERIAL PRIMARY KEY,
			payment_id INTEGER REFERENCES EmployeePayment(payment_id) ON DELETE CASCADE,
			patient_id INTEGER REFERENCES Patient(patient_id),
			patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
			work_date DATE NOT NULL,
			hours_worked DECIMAL(4, 2) NOT NULL,
			payment_amount DECIMAL(15, 2) NOT NULL,
			-- Portion of total payment from this patient
			payment_type VARCHAR(50) NOT NULL,
			-- 'fixed_per_patient', 'percentage_per_patient'
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
			
		CREATE TABLE IF NOT EXISTS EmployeeClockIn (
			clock_id SERIAL PRIMARY KEY,
			employee_id INTEGER REFERENCES Employee(employee_id) ON DELETE CASCADE,
			clock_in TIMESTAMP NOT NULL,
			clock_out TIMESTAMP,
			pay_deduction DECIMAL(15, 2) DEFAULT 0
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
			payment_type vault_manual_payment_type NOT NULL,
			description TEXT
		);
			
		-- Create Indexes for Frequent Queries
		CREATE INDEX IF NOT EXISTS idx_patient_name ON Patient(name);
			
		CREATE INDEX IF NOT EXISTS idx_drug_name ON DrugCard(name);
			
		CREATE INDEX IF NOT EXISTS idx_bill_date ON Bill(generated_at);
			
		CREATE INDEX IF NOT EXISTS idx_employee_hire_date ON Employee(hire_date);
			
		-- Additional database schema updates for enhanced patient management
		-- Add indexes for better performance on patient queries
		CREATE INDEX IF NOT EXISTS idx_patient_active ON Patient(is_active);
			
		CREATE INDEX IF NOT EXISTS idx_patient_payment_type ON Patient(payment_type);
			
		CREATE INDEX IF NOT EXISTS idx_patient_insurance ON Patient(insurance_id);
			
		CREATE INDEX IF NOT EXISTS idx_patient_referring_doctor ON Patient(referring_doctor_id);
			
		-- Add indexes for patient history queries
		CREATE INDEX IF NOT EXISTS idx_patient_history_patient ON PatientHistory(patient_id);
			
		CREATE INDEX IF NOT EXISTS idx_patient_history_admission ON PatientHistory(admission_time);
			
		CREATE INDEX IF NOT EXISTS idx_patient_history_discharge ON PatientHistory(discharge_time);
			
		CREATE INDEX IF NOT EXISTS idx_patient_history_active ON PatientHistory(patient_id, discharge_time)
		WHERE
			discharge_time IS NULL;
			
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
			
		CREATE INDEX IF NOT EXISTS idx_daily_staff_assignment_date ON DailyStaffAssignment(work_date, payment_processed);
			
		CREATE INDEX IF NOT EXISTS idx_daily_staff_assignment_employee ON DailyStaffAssignment(employee_id, work_date);
			
		-- Add indexes for employee patient payments
		CREATE INDEX IF NOT EXISTS idx_employee_payment_patient_payment ON EmployeePaymentPatient(payment_id);
			
		CREATE INDEX IF NOT EXISTS idx_employee_payment_patient_employee_date ON EmployeePaymentPatient(payment_id, work_date);
			
		CREATE INDEX IF NOT EXISTS idx_employee_payment_patient_patient ON EmployeePaymentPatient(patient_id);
			
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
		) RETURNS TIMESTAMP AS $$ BEGIN CASE
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
			
		END CASE
		;
			
		END;
			
		$$ LANGUAGE plpgsql;
			
		-- Insert required permissions
		INSERT INTO
			Permission (feature_name, description)
		VALUES
			(
				'view_dashboard',
				'Can view admin dashboard and statistics'
			),
			('manage_patients', 'Can manage patient records'),
			('view_patients', 'Can view patient records'),
			('manage_services', 'Can manage services'),
			('manage_billing', 'Can manage billing'),
			('manage_pharmacy', 'Can manage pharmacy'),
			('manage_shipments', 'Can manage/edit shipments'),
			(
				'manage_insurance',
				'Can manage insurance companies and their payments'
			),
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
			(
				'manage_payments',
				'Can manage employee payments'
			),
			(
				'manage_clocking',
				'Can manage employee clock-in/out'
			),
			('view_reports', 'Can view facility reports'),
			('view_only', 'Can only view records');
			
		INSERT INTO
			Role (name)
		VALUES
			('Admin');
			
		INSERT INTO
			RolePermission (role_id, permission_id)
		VALUES
			(1, 12),
			(1, 13);
			
		INSERT INTO
			"User" (username, password_hash, role_id)
		VALUES
			('admin', '$2a$10$5wtO8QuMZ3X62mmnwXzyXu3ZPKeSxJsafylPqLVLQG8dpTOxR0PdO', 1),
			('system', '$2a$10$yYxnEDZ6MLLzxXHn/T.ba.mm/F.9drU/l0E6QbPi/l72KSp7dciuS', 1);
			
		INSERT INTO PriceList (name, is_default)
		VALUES
			('Default', true);
			
		INSERT INTO Warehouse (name, location)
		VALUES
			('Default', 'Default');`);
}
