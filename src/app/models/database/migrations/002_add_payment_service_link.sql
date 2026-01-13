-- Add active_service_id to EmployeePaymentPatient table
ALTER TABLE EmployeePaymentPatient
ADD COLUMN IF NOT EXISTS active_service_id INTEGER REFERENCES ActivePatientService(active_service_id) ON DELETE CASCADE;
-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employee_payment_patient_service ON EmployeePaymentPatient(active_service_id);