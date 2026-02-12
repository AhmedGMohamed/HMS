-- Migration: Add discount_scope and vat_scope_custom columns to Bill table
-- Date: 2026-01-26
-- Description: Adds selective discount and VAT application support
-- Add new columns with default values for backward compatibility
ALTER TABLE Bill
ADD COLUMN IF NOT EXISTS discount_scope JSONB DEFAULT '["services", "drugs", "supplies", "tests"]',
    ADD COLUMN IF NOT EXISTS vat_scope_custom JSONB DEFAULT '["services", "drugs", "supplies", "tests"]';
-- Update existing bills to have the default scope (all categories)
UPDATE Bill
SET discount_scope = '["services", "drugs", "supplies", "tests"]',
    vat_scope_custom = '["services", "drugs", "supplies", "tests"]'
WHERE discount_scope IS NULL
    OR vat_scope_custom IS NULL;
-- Add comment to document the columns
COMMENT ON COLUMN Bill.discount_scope IS 'JSONB array of item types where discount applies: services, drugs, supplies, tests';
COMMENT ON COLUMN Bill.vat_scope_custom IS 'JSONB array of item types where VAT applies: services, drugs, supplies, tests';