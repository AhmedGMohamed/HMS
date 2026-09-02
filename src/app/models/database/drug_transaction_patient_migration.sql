-- Phase 6.4: Add patient linkage to DrugTransaction for patient/check sales.
-- Safe to run on an existing database: the column is nullable and appended at the end,
-- and the index is created only if missing.

ALTER TABLE DrugTransaction
	ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES Patient(patient_id);

CREATE INDEX IF NOT EXISTS idx_drug_transaction_patient
	ON DrugTransaction(patient_id);