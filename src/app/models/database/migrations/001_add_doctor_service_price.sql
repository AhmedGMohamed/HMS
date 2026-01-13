-- Create a join table for Doctor and Service specific pricing/commission
CREATE TABLE IF NOT EXISTS DoctorServicePrice (
    doctor_id INTEGER REFERENCES Doctor(doctor_id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES Service(service_id) ON DELETE CASCADE,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (doctor_id, service_id)
);
-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_doctor_service_price_doctor ON DoctorServicePrice(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_service_price_service ON DoctorServicePrice(service_id);