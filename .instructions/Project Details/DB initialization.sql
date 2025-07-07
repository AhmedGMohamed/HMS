-- Create Enum Types First
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

CREATE TYPE payment_type AS ENUM ('cash', 'credit', 'insurance');

CREATE TYPE leave_reason_type AS ENUM ('death', 'improvement', 'transfer', 'as_desired');

CREATE TYPE discount_type AS ENUM ('fixed', 'percentage');

CREATE TYPE sale_type AS ENUM ('outside', 'medical_check', 'admitted');

CREATE TYPE service_type AS ENUM ('once', 'hourly', 'daily');

CREATE TYPE transaction_type AS ENUM ('patient', 'check', 'outside');

CREATE TYPE employee_type AS ENUM ('doctor', 'nurse', 'other');

CREATE TYPE payment_calculation AS ENUM ('fixed', 'per patient', 'both');

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
);

CREATE TABLE IF NOT EXISTS Patient (
	patient_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	gender gender_type,
	phone VARCHAR(20),
	address TEXT,
	payment_type payment_type NOT NULL,
	insurance_id INTEGER REFERENCES InsuranceCompany(insurance_id),
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
	bill_id INTEGER,
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
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

CREATE TABLE IF NOT EXISTS DrugUsage (
	usage_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	drug_id INTEGER REFERENCES DrugCard(drug_id),
	transaction_id INTEGER REFERENCES DrugTransaction(transaction_id),
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
	service_id INTEGER REFERENCES Service(service_id),
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id),
	price DECIMAL(15, 2) NOT NULL,
	requires_prepayment BOOLEAN DEFAULT false,
	prepayment_type prepayment_type,
	prepayment_amount DECIMAL(15, 2),
	PRIMARY KEY (service_id, pricelist_id)
);

CREATE TABLE IF NOT EXISTS ShipmentPrice (
	shipment_id INTEGER REFERENCES DrugShipment(shipment_id) ON DELETE CASCADE,
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id),
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

-- Create Indexes for Frequent Queries
CREATE INDEX IF NOT EXISTS idx_patient_name ON Patient(name);

CREATE INDEX IF NOT EXISTS idx_drug_name ON DrugCard(name);

CREATE INDEX IF NOT EXISTS idx_bill_date ON Bill(generated_at);

CREATE INDEX IF NOT EXISTS idx_employee_hire_date ON Employee(hire_date);

-- Foreign Key Constraints
ALTER TABLE
	PatientHistory
ADD
	CONSTRAINT patienthistory_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES Bill(bill_id)