import { query } from "./build/app/models/database/connection.js";

async function fixConstraint() {
    try {
        console.log("Dropping old constraint...");
        await query('ALTER TABLE BillDetail DROP CONSTRAINT IF EXISTS billdetail_check');

        console.log("Adding new constraint...");
        await query(`
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
            )
        `);
        console.log("Constraint fixed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error fixing constraint:", error);
        process.exit(1);
    }
}

fixConstraint();
