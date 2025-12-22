-- Medical Supplies Schema Migration
-- This script adds Medical Supplies functionality to the HMS database

-- Create MedicalSupply table (similar to DrugCard but without unit_conversion)
CREATE TABLE IF NOT EXISTS MedicalSupply (
	supply_id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	manufacturer VARCHAR(255),
	provider VARCHAR(255),
	is_obligatory_continuous BOOLEAN DEFAULT false,
	sale_quantity INTEGER NOT NULL,
	frequency INTERVAL,
	min_stock_alert INTEGER,
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

-- Create MedicalSupplyShipment table (similar to DrugShipment)
CREATE TABLE IF NOT EXISTS MedicalSupplyShipment (
	shipment_id SERIAL PRIMARY KEY,
	supply_id INTEGER REFERENCES MedicalSupply(supply_id),
	warehouse_id INTEGER REFERENCES Warehouse(warehouse_id),
	buy_quantity INTEGER NOT NULL,
	quantity INTEGER NOT NULL,
	buy_price DECIMAL(15, 2) NOT NULL,
	expiry_date DATE,
	received_date DATE DEFAULT CURRENT_DATE,
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

-- Create MedicalSupplyTransaction table (similar to DrugTransaction)
CREATE TABLE IF NOT EXISTS MedicalSupplyTransaction (
	transaction_id SERIAL PRIMARY KEY,
	shipment_id INTEGER REFERENCES MedicalSupplyShipment(shipment_id),
	transaction_type transaction_type NOT NULL,
	quantity INTEGER NOT NULL,
	price DECIMAL(15, 2) NOT NULL,
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	created_by_user_id INTEGER REFERENCES "User"(user_id)
);

-- Create MedicalSupplyUsage table (similar to DrugUsage)
CREATE TABLE IF NOT EXISTS MedicalSupplyUsage (
	usage_id SERIAL PRIMARY KEY,
	patient_id INTEGER REFERENCES Patient(patient_id),
	supply_id INTEGER REFERENCES MedicalSupply(supply_id),
	transaction_id INTEGER REFERENCES MedicalSupplyTransaction(transaction_id),
	patient_history_id INTEGER REFERENCES PatientHistory(patient_history_id),
	remaining_quantity INTEGER NOT NULL,
	last_administered TIMESTAMP
);

-- Create ShipmentPrice table for MedicalSupplyShipment (similar to DrugShipment pricing)
CREATE TABLE IF NOT EXISTS MedicalSupplyShipmentPrice (
	shipment_id INTEGER REFERENCES MedicalSupplyShipment(shipment_id) ON DELETE CASCADE,
	pricelist_id INTEGER REFERENCES PriceList(pricelist_id) ON DELETE CASCADE,
	price DECIMAL(15, 2) NOT NULL,
	requires_prepayment BOOLEAN DEFAULT false,
	prepayment_type prepayment_type,
	prepayment_amount DECIMAL(15, 2),
	PRIMARY KEY (shipment_id, pricelist_id)
);

-- Update BillDetail table to include medical_supply_shipment_id
ALTER TABLE BillDetail 
ADD COLUMN IF NOT EXISTS medical_supply_shipment_id INTEGER REFERENCES MedicalSupplyShipment(shipment_id);

-- Drop the existing CHECK constraint on BillDetail
ALTER TABLE BillDetail DROP CONSTRAINT IF EXISTS billdetail_check;
ALTER TABLE BillDetail DROP CONSTRAINT IF EXISTS billdetail_generated_at_check;

-- Add updated CHECK constraint to include medical supplies
ALTER TABLE BillDetail ADD CONSTRAINT billdetail_check CHECK (
	(
		service_id IS NOT NULL
		AND active_service_id IS NOT NULL
		AND drug_shipment_id IS NULL
		AND medical_supply_shipment_id IS NULL
	)
	OR (
		service_id IS NULL
		AND active_service_id IS NULL
		AND drug_shipment_id IS NOT NULL
		AND medical_supply_shipment_id IS NULL
	)
	OR (
		service_id IS NULL
		AND active_service_id IS NULL
		AND drug_shipment_id IS NULL
		AND medical_supply_shipment_id IS NOT NULL
	)
);

-- Create indexes for Medical Supplies
CREATE INDEX IF NOT EXISTS idx_medical_supply_name ON MedicalSupply(name);

CREATE INDEX IF NOT EXISTS idx_medical_supply_usage_patient ON MedicalSupplyUsage(patient_id);

CREATE INDEX IF NOT EXISTS idx_medical_supply_usage_supply ON MedicalSupplyUsage(supply_id);

CREATE INDEX IF NOT EXISTS idx_medical_supply_usage_remaining ON MedicalSupplyUsage(remaining_quantity)
WHERE remaining_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_medical_supply_usage_administered ON MedicalSupplyUsage(last_administered);

CREATE INDEX IF NOT EXISTS idx_bill_detail_medical_supply ON BillDetail(medical_supply_shipment_id);

-- Create view for medical supply administrations that are due
CREATE OR REPLACE VIEW MedicalSupplyAdministrationsDue AS
SELECT
	msu.usage_id,
	msu.patient_id,
	p.name as patient_name,
	msu.supply_id,
	ms.name as supply_name,
	msu.remaining_quantity,
	msu.last_administered,
	ms.frequency,
	ms.is_obligatory_continuous,
	ms.sale_quantity,
	ph.bill_id,
	COALESCE(
		msu.last_administered + ms.frequency :: interval,
		CURRENT_TIMESTAMP
	) as next_administration
FROM
	MedicalSupplyUsage msu
	JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
	JOIN Patient p ON msu.patient_id = p.patient_id
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
WHERE
	msu.remaining_quantity > 0
	AND p.is_active = true
	AND ms.is_obligatory_continuous = true
	AND ms.frequency IS NOT NULL
	AND (
		msu.last_administered IS NULL
		OR CURRENT_TIMESTAMP >= msu.last_administered + ms.frequency :: interval
	);

-- Create view for medical supplies that need replenishment
CREATE OR REPLACE VIEW MedicalSupplyReplenishmentNeeded AS
SELECT
	msu.usage_id,
	msu.patient_id,
	p.name as patient_name,
	msu.supply_id,
	ms.name as supply_name,
	msu.remaining_quantity,
	ms.sale_quantity,
	ms.is_obligatory_continuous,
	ph.bill_id
FROM
	MedicalSupplyUsage msu
	JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
	JOIN Patient p ON msu.patient_id = p.patient_id
	JOIN PatientHistory ph ON p.patient_id = ph.patient_id
	AND ph.discharge_time IS NULL
WHERE
	msu.remaining_quantity <= 0
	AND p.is_active = true
	AND ms.is_obligatory_continuous = true;

-- Insert permission for managing medical supplies
INSERT INTO Permission (feature_name, description)
VALUES ('manage_supplies', 'Can manage medical supplies and inventory')
ON CONFLICT DO NOTHING;
