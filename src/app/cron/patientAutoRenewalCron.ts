// src/app/cron/patientAutoRenewalCron.ts
import { CronJob } from "cron";
import { query } from "../models/database/connection.js";
import PatientModel from "../models/Patient.model.js";

export class PatientAutoRenewalCron {
	private serviceRenewalJob: CronJob;
	private drugAdministrationJob: CronJob;
	private medicalSupplyAdministrationJob: CronJob;

	constructor() {
		// Run service renewal every hour
		this.serviceRenewalJob = new CronJob(
			"0 * * * * *", // Every minute
			this.processServiceRenewals.bind(this),
			null,
			false,
			"system"
		);

		// Run drug administration check every minute
		this.drugAdministrationJob = new CronJob(
			"0 * * * * *", // Every minute
			this.processDrugAdministrations.bind(this),
			null,
			false,
			"system"
		);

		// Run medical supply administration check every minute
		this.medicalSupplyAdministrationJob = new CronJob(
			"0 * * * * *", // Every minute
			this.processMedicalSupplyAdministrations.bind(this),
			null,
			false,
			"system"
		);
	}

	start() {
		console.log("Starting patient auto-renewal cron jobs...");
		this.serviceRenewalJob.start();
		this.drugAdministrationJob.start();
		this.medicalSupplyAdministrationJob.start();
	}

	stop() {
		console.log("Stopping patient auto-renewal cron jobs...");
		this.serviceRenewalJob.stop();
		this.drugAdministrationJob.stop();
		this.medicalSupplyAdministrationJob.stop();
	}

	private async processServiceRenewals(): Promise<void> {
		try {
			console.log("Processing service renewals...");

			// Get services that need renewal
			const renewalServicesSql = `
				SELECT 
				    aps.active_service_id,
				    aps.patient_id,
				    aps.service_id,
				    aps.start_date,
				    aps.last_renewed,
				    COALESCE(aps.last_renewed, aps.start_date) AS effective_last,
				    s.name as service_name,
				    s.service_type,
				    s.auto_renew,
				    ph.bill_id,
				    sp.price,
				    CASE 
				        WHEN s.service_type = 'hourly' THEN 3600
				        WHEN s.service_type = 'daily' THEN 86400
				        ELSE 0
				    END AS seconds_per_period,
				    CASE 
				        WHEN s.service_type = 'hourly' THEN INTERVAL '1 hour'
				        WHEN s.service_type = 'daily' THEN INTERVAL '1 day'
				        ELSE INTERVAL '0'
				    END AS interval_period,
				    CASE
				        WHEN s.service_type = 'hourly' THEN 
				            FLOOR(EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::TIMESTAMP - COALESCE(aps.last_renewed, aps.start_date))) / 3600)
				        WHEN s.service_type = 'daily' THEN 
				            CASE 
				                WHEN DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo') = DATE(COALESCE(aps.last_renewed, aps.start_date)) THEN 1
				                ELSE ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::DATE - DATE(COALESCE(aps.last_renewed, aps.start_date)))::INTEGER
				            END
				        ELSE 0
				    END AS number_of_periods
				FROM ActivePatientService aps
				JOIN Service s ON aps.service_id = s.service_id
				JOIN Patient p ON aps.patient_id = p.patient_id
				JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
				    AND ph.discharge_time IS NULL
				JOIN ServicePrice sp ON s.service_id = sp.service_id
				    AND sp.pricelist_id = ph.pricelist_id
				WHERE 
				    aps.is_active = true
				    AND p.is_active = true
				    AND s.auto_renew = true
				    AND s.service_type IN ('hourly', 'daily')
				    AND (
				        (s.service_type = 'hourly' AND FLOOR(EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::TIMESTAMP - COALESCE(aps.last_renewed, aps.start_date))) / 3600) >= 1)
				        OR 
				        (s.service_type = 'daily' 
				         AND EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')) >= 12
				         AND COALESCE(aps.last_renewed, aps.start_date) < ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::DATE + INTERVAL '12 hours')::TIMESTAMP)
				    );
            `;

			const renewalServices = await query(renewalServicesSql);

			for (const service of renewalServices.rows) {
				await this.renewService(service);
			}

			console.log(
				`Processed ${renewalServices.rows.length} service renewals`
			);
		} catch (error) {
			console.error("Error processing service renewals:", error);
		}
	}

	private async renewService(serviceInfo: any): Promise<void> {
		try {
			await query("BEGIN");

			// Add new bill detail for the renewed service
			const billDetailSql = `
                INSERT INTO BillDetail (
                    bill_id, active_service_id, service_id, quantity, unit_price, 
                    charge_type, sale_type, generated_at
                ) VALUES ($1, $2, $3, $4, $5, 'auto_renewal', 'admitted', CURRENT_TIMESTAMP)
                RETURNING *;
            `;

			await query(billDetailSql, [
				serviceInfo.bill_id,
				serviceInfo.active_service_id,
				serviceInfo.service_id,
				serviceInfo.number_of_periods,
				serviceInfo.price
			]);

			// Update bill total
			await query(
				`UPDATE Bill 
                 SET total_amount = (
                     SELECT COALESCE(SUM(quantity * unit_price), 0)
                     FROM BillDetail 
                     WHERE bill_id = $1
                 ),
                 updated_at = CURRENT_TIMESTAMP
                 WHERE bill_id = $1`,
				[serviceInfo.bill_id]
			);

			// Handle service drugs if any
			await this.addServiceDrugsForRenewal(
				serviceInfo.patient_id,
				serviceInfo.service_id,
				serviceInfo.bill_id,
				serviceInfo.number_of_periods
			);

			// Update last_renewed = effective_last + number_of_periods * interval_period
			await query(
				`UPDATE ActivePatientService 
                 SET last_renewed = $1::TIMESTAMP + ($2::INTEGER * $3::INTERVAL)
                 WHERE active_service_id = $4`,
				[
					serviceInfo.effective_last,
					parseInt(serviceInfo.number_of_periods),
					serviceInfo.interval_period,
					serviceInfo.active_service_id
				]
			);

			await query("COMMIT");

			console.log(
				`Renewed service ${serviceInfo.service_name} for patient ${serviceInfo.patient_id}`
			);
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error renewing service ${serviceInfo.service_id} for patient ${serviceInfo.patient_id}:`,
				error
			);
		}
	}

	private async processDrugAdministrations(): Promise<void> {
		try {
			console.log("Processing drug administrations...");

			// Get drugs that need administration
			const pendingDrugsSql = `
                SELECT 
                    du.usage_id,
                    du.patient_id,
                    du.drug_id,
                    du.remaining_quantity,
                    du.last_administered,
                    dc.name as drug_name,
                    dc.frequency,
                    dc.is_obligatory_continuous,
                    dc.sale_quantity,
                    ph.bill_id,
                    p.name as patient_name,
                    COALESCE(
                        du.last_administered + dc.frequency::interval,
                        CURRENT_TIMESTAMP
                    ) as next_administration
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
                    AND ph.discharge_time IS NULL
					AND du.patient_history_id = ph.patient_history_id
                WHERE 
                    du.remaining_quantity > 0
                    AND p.is_active = true
                    AND dc.frequency IS NOT NULL
                    AND (
                        du.last_administered IS NULL
                        OR CURRENT_TIMESTAMP >= du.last_administered + dc.frequency::interval
                    );
            `;

			const pendingDrugs = await query(pendingDrugsSql);

			for (const drugUsage of pendingDrugs.rows) {
				await this.administerDrug(drugUsage);
			}

			// Check for drugs that need replenishment
			await this.checkDrugReplenishment();

			console.log(
				`Processed ${pendingDrugs.rows.length} drug administrations`
			);
		} catch (error) {
			console.error("Error processing drug administrations:", error);
		}
	}

	private async administerDrug(drugUsage: any): Promise<void> {
		try {
			await query("BEGIN");

			// Update last administered time and reduce remaining quantity by 1
			await query(
				`UPDATE DrugUsage 
                 SET last_administered = CURRENT_TIMESTAMP,
                     remaining_quantity = remaining_quantity - 1
                 WHERE usage_id = $1`,
				[drugUsage.usage_id]
			);

			console.log(
				`Administered ${drugUsage.drug_name} to patient ${drugUsage.patient_name}`
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error administering drug ${drugUsage.drug_name} to patient ${drugUsage.patient_id}:`,
				error
			);
		}
	}

	private async checkDrugReplenishment(): Promise<void> {
		try {
			// Get drugs that need replenishment (remaining quantity <= 0 and patient still active)
			const replenishmentSql = `
                SELECT DISTINCT ON (du.patient_id, du.drug_id)
                    du.usage_id,
                    du.patient_id,
                    du.drug_id,
                    du.remaining_quantity,
                    dc.name as drug_name,
                    dc.sale_quantity,
                    dc.is_obligatory_continuous,
                    ph.bill_id,
                    p.name as patient_name
                FROM DrugUsage du
                JOIN DrugCard dc ON du.drug_id = dc.drug_id
                JOIN Patient p ON du.patient_id = p.patient_id
                JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
                    AND ph.discharge_time IS NULL
					AND du.patient_history_id = ph.patient_history_id
                WHERE 
                    du.remaining_quantity <= 0
                    AND p.is_active = true
                    AND dc.is_obligatory_continuous = true
					AND NOT EXISTS (
				        SELECT 1 
				        FROM DrugUsage du2 
				        WHERE du2.patient_history_id = du.patient_history_id 
				            AND du2.drug_id = du.drug_id 
				            AND du2.remaining_quantity > 0
				    )
				ORDER BY du.patient_id, du.drug_id, du.usage_id DESC;
            `;

			const replenishmentDrugs = await query(replenishmentSql);

			for (const drugInfo of replenishmentDrugs.rows) {
				await this.replenishDrug(drugInfo);
			}

			if (replenishmentDrugs.rows.length > 0) {
				console.log(
					`Replenished ${replenishmentDrugs.rows.length} drugs`
				);
			}
		} catch (error) {
			console.error("Error checking drug replenishment:", error);
		}
	}

	private async replenishDrug(drugInfo: any): Promise<void> {
		try {
			await query("BEGIN");

			// Get system user ID
			const systemUserId = await this.getSystemUserId();
			if (!systemUserId) {
				throw new Error("System user not found");
			}

			// Get available shipments (FIFO - First to expire, first out)
			const availableShipmentsSql = `
        	    SELECT ds.*, sp.price
        	    FROM DrugShipment ds
        	    JOIN ShipmentPrice sp ON ds.shipment_id = sp.shipment_id
        	    JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
        	    WHERE ds.drug_id = $1 AND ds.quantity > 0 AND pl.is_default = true
        	    ORDER BY ds.expiry_date ASC;
        	`;
			const shipmentsResult = await query(availableShipmentsSql, [
				drugInfo.drug_id
			]);

			if (shipmentsResult.rows.length === 0) {
				console.warn(
					`No available shipments for drug ${drugInfo.drug_name} - patient ${drugInfo.patient_id}`
				);
				await query("ROLLBACK");
				return;
			}

			let remainingQuantity = drugInfo.sale_quantity;

			for (const shipment of shipmentsResult.rows) {
				if (remainingQuantity <= 0) break;

				const quantityToDispense = Math.min(
					remainingQuantity,
					shipment.quantity
				);

				// Create drug transaction
				const transactionSql = `
            	    INSERT INTO DrugTransaction (
            	        shipment_id, transaction_type, quantity, price, created_by_user_id
            	    ) VALUES ($1, 'patient', $2, $3, $4)
            	    RETURNING transaction_id;
				`;
				const transactionResult = await query(transactionSql, [
					shipment.shipment_id,
					quantityToDispense,
					shipment.price,
					systemUserId
				]);

				// Update shipment quantity
				await query(
					"UPDATE DrugShipment SET quantity = quantity - $1 WHERE shipment_id = $2",
					[quantityToDispense, shipment.shipment_id]
				);

				const currentAdmission = await PatientModel.getCurrentAdmission(
					drugInfo.patient_id
				);

				// Create new drug usage record
				await query(
					`INSERT INTO DrugUsage (
						patient_id, drug_id, transaction_id, patient_history_id, remaining_quantity, last_administered
					) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
					[
						drugInfo.patient_id,
						drugInfo.drug_id,
						transactionResult.rows[0].transaction_id,
						currentAdmission!.patient_history_id,
						quantityToDispense
					]
				);

				// Add to bill details
				await query(
					`INSERT INTO BillDetail (
                	    bill_id, drug_shipment_id, quantity, unit_price, 
                	    charge_type, sale_type, generated_at
                	) VALUES ($1, $2, $3, $4, 'auto_drug_replenishment', 'admitted', CURRENT_TIMESTAMP)`,
					[
						drugInfo.bill_id,
						shipment.shipment_id,
						quantityToDispense,
						shipment.price
					]
				);

				remainingQuantity -= quantityToDispense;
			}

			if (remainingQuantity > 0) {
				console.warn(
					`Could not fully replenish ${drugInfo.drug_name} for patient ${drugInfo.patient_name} - short by ${remainingQuantity} units`
				);
			}

			// Update bill total
			await query(
				`UPDATE Bill 
            	 SET total_amount = (
            	     SELECT COALESCE(SUM(quantity * unit_price), 0)
            	     FROM BillDetail 
            	     WHERE bill_id = $1
            	 ),
            	 updated_at = CURRENT_TIMESTAMP
            	 WHERE bill_id = $1`,
				[drugInfo.bill_id]
			);

			console.log(
				`Replenished ${drugInfo.sale_quantity - remainingQuantity
				} units of ${drugInfo.drug_name} for patient ${drugInfo.patient_name
				}`
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error replenishing drug ${drugInfo.drug_name} for patient ${drugInfo.patient_id}:`,
				error
			);
		}
	}

	private async addServiceDrugsForRenewal(
		patientId: number,
		serviceId: number,
		billId: number,
		number_of_periods: number = 1
	): Promise<void> {
		try {
			await query("BEGIN");

			// Get drugs associated with this service
			const serviceDrugsSql = `
                SELECT sd.drug_id, dc.sale_quantity
                FROM ServiceDrug sd
                JOIN DrugCard dc ON sd.drug_id = dc.drug_id
                WHERE sd.service_id = $1;
            `;
			const serviceDrugsResult = await query(serviceDrugsSql, [
				serviceId
			]);

			const currentAdmission = await PatientModel.getCurrentAdmission(
				patientId
			);

			for (const drugInfo of serviceDrugsResult.rows) {
				await this.dispenseDrugForService(
					patientId,
					drugInfo.drug_id,
					drugInfo.sale_quantity * number_of_periods,
					currentAdmission!.patient_history_id,
					billId
				);
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error adding service drugs for renewal - Service ${serviceId}, Patient ${patientId}:`,
				error
			);
		}
	}

	private async dispenseDrugForService(
		patientId: number,
		drugId: number,
		quantity: number,
		patient_history_id: number,
		billId: number
	): Promise<void> {
		try {
			await query("BEGIN");

			// Check if there is available drug usage for that drug
			const availableDrugUsagesSql = `
				SELECT du.drug_id, du.remaining_quantity
				FROM DrugUsage du
				WHERE du.patient_id = $1 AND du.drug_id = $2
				AND du.remaining_quantity > 0
				ORDER BY du.last_administered ASC;
			`;
			const availableDrugUsagesResult = await query(
				availableDrugUsagesSql,
				[patientId, drugId]
			);

			// skip if there is available drug usage
			if (availableDrugUsagesResult.rows.length !== 0) return;

			// Get system user ID
			const systemUserId = await this.getSystemUserId();
			// Get available shipments (FIFO - First to expire, first out)
			const availableShipmentsSql = `
                SELECT ds.*, sp.price
                FROM DrugShipment ds
                JOIN ShipmentPrice sp ON ds.shipment_id = sp.shipment_id
                JOIN PriceList pl ON sp.pricelist_id = pl.pricelist_id
                WHERE ds.drug_id = $1 AND ds.quantity > 0 AND pl.is_default = true
                ORDER BY ds.expiry_date ASC;
            `;
			const shipmentsResult = await query(availableShipmentsSql, [
				drugId
			]);

			if (shipmentsResult.rows.length === 0) {
				console.warn(`No available shipments for drug ID: ${drugId}`);
				return;
			}

			let remainingQuantity = quantity;

			for (const shipment of shipmentsResult.rows) {
				if (remainingQuantity <= 0) break;

				const quantityToTake = Math.min(
					remainingQuantity,
					shipment.quantity
				);

				// Create drug transaction
				const transactionSql = `
                    INSERT INTO DrugTransaction (
                        shipment_id, transaction_type, quantity, price, created_by_user_id
                    ) VALUES ($1, 'patient', $2, $3, $4)
                    RETURNING transaction_id;
                `;
				const transactionResult = await query(transactionSql, [
					shipment.shipment_id,
					quantityToTake,
					shipment.price,
					systemUserId
				]);

				// Update shipment quantity
				await query(
					"UPDATE DrugShipment SET quantity = quantity - $1 WHERE shipment_id = $2",
					[quantityToTake, shipment.shipment_id]
				);

				// Create drug usage record
				await query(
					`INSERT INTO DrugUsage (
                        patient_id, drug_id, transaction_id, patient_history_id, remaining_quantity
                    ) VALUES ($1, $2, $3, $4, $5)`,
					[
						patientId,
						drugId,
						transactionResult.rows[0].transaction_id,
						patient_history_id,
						quantityToTake
					]
				);

				// Add to bill details
				await query(
					`INSERT INTO BillDetail (
                        bill_id, drug_shipment_id, quantity, unit_price, 
                        charge_type, sale_type, generated_at
                    ) VALUES ($1, $2, $3, $4, 'service_drug_renewal', 'admitted', CURRENT_TIMESTAMP)`,
					[
						billId,
						shipment.shipment_id,
						quantityToTake,
						shipment.price
					]
				);

				remainingQuantity -= quantityToTake;
			}

			if (remainingQuantity > 0) {
				console.warn(
					`Could not fully dispense drug ID: ${drugId} for service renewal - short by ${remainingQuantity} units`
				);
			}

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error dispensing drug ${drugId} for service renewal:`,
				error
			);
		}
	}

	private async getSystemUserId(): Promise<number> {
		//get system user ID
		const userSql = `
				SELECT user_id
				FROM "User"
				WHERE username = 'system';
			`;
		const userResult = await query(userSql);
		const systemUserId = userResult.rows[0].user_id;

		return systemUserId;
	}

	// Medical Supply Administration Methods
	private async processMedicalSupplyAdministrations(): Promise<void> {
		try {
			console.log("Processing medical supply administrations...");

			// Get medical supplies that need administration
			const pendingSuppliesSql = `
                SELECT 
                    msu.usage_id,
                    msu.patient_id,
                    msu.supply_id,
                    msu.remaining_quantity,
                    msu.last_administered,
                    ms.name as supply_name,
                    ms.frequency,
                    ms.is_obligatory_continuous,
                    ms.sale_quantity,
                    ph.bill_id,
                    p.name as patient_name,
                    COALESCE(
                        msu.last_administered + ms.frequency::interval,
                        CURRENT_TIMESTAMP
                    ) as next_administration
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
                    AND ph.discharge_time IS NULL
					AND msu.patient_history_id = ph.patient_history_id
                WHERE 
                    msu.remaining_quantity > 0
                    AND p.is_active = true
                    AND ms.frequency IS NOT NULL
                    AND (
                        msu.last_administered IS NULL
                        OR CURRENT_TIMESTAMP >= msu.last_administered + ms.frequency::interval
                    );
            `;

			const pendingSupplies = await query(pendingSuppliesSql);

			for (const supplyUsage of pendingSupplies.rows) {
				await this.administerMedicalSupply(supplyUsage);
			}

			// Check for medical supplies that need replenishment
			await this.checkMedicalSupplyReplenishment();

			console.log(
				`Processed ${pendingSupplies.rows.length} medical supply administrations`
			);
		} catch (error) {
			console.error("Error processing medical supply administrations:", error);
		}
	}

	private async administerMedicalSupply(supplyUsage: any): Promise<void> {
		try {
			await query("BEGIN");

			// Update last administered time and reduce remaining quantity by 1
			await query(
				`UPDATE MedicalSupplyUsage 
                 SET last_administered = CURRENT_TIMESTAMP,
                     remaining_quantity = remaining_quantity - 1
                 WHERE usage_id = $1`,
				[supplyUsage.usage_id]
			);

			console.log(
				`Administered ${supplyUsage.supply_name} to patient ${supplyUsage.patient_name}`
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error administering medical supply ${supplyUsage.supply_name} to patient ${supplyUsage.patient_id}:`,
				error
			);
		}
	}

	private async checkMedicalSupplyReplenishment(): Promise<void> {
		try {
			// Get medical supplies that need replenishment (remaining quantity <= 0 and patient still active)
			const replenishmentSql = `
                SELECT DISTINCT ON (msu.patient_id, msu.supply_id)
                    msu.usage_id,
                    msu.patient_id,
                    msu.supply_id,
                    msu.remaining_quantity,
                    ms.name as supply_name,
                    ms.sale_quantity,
                    ms.is_obligatory_continuous,
                    ph.bill_id,
                    p.name as patient_name
                FROM MedicalSupplyUsage msu
                JOIN MedicalSupply ms ON msu.supply_id = ms.supply_id
                JOIN Patient p ON msu.patient_id = p.patient_id
                JOIN PatientHistory ph ON p.patient_id = ph.patient_id 
                    AND ph.discharge_time IS NULL
					AND msu.patient_history_id = ph.patient_history_id
                WHERE 
                    msu.remaining_quantity <= 0
                    AND p.is_active = true
                    AND ms.is_obligatory_continuous = true
					AND NOT EXISTS (
				        SELECT 1 
				        FROM MedicalSupplyUsage msu2 
				        WHERE msu2.patient_history_id = msu.patient_history_id 
				            AND msu2.supply_id = msu.supply_id 
				            AND msu2.remaining_quantity > 0
				    )
                ORDER BY msu.patient_id, msu.supply_id, msu.usage_id DESC;
            `;

			const replenishmentSupplies = await query(replenishmentSql);

			for (const supplyInfo of replenishmentSupplies.rows) {
				await this.replenishMedicalSupply(supplyInfo);
			}

			if (replenishmentSupplies.rows.length > 0) {
				console.log(
					`Replenished ${replenishmentSupplies.rows.length} medical supplies`
				);
			}
		} catch (error) {
			console.error("Error checking medical supply replenishment:", error);
		}
	}

	private async replenishMedicalSupply(supplyInfo: any): Promise<void> {
		try {
			await query("BEGIN");

			// Get system user ID
			const systemUserId = await this.getSystemUserId();
			if (!systemUserId) {
				throw new Error("System user not found");
			}

			// Get available shipments (FIFO - First to expire, first out)
			const availableShipmentsSql = `
        	    SELECT mss.*, mssp.price
        	    FROM MedicalSupplyShipment mss
        	    JOIN MedicalSupplyShipmentPrice mssp ON mss.shipment_id = mssp.shipment_id
        	    JOIN PriceList pl ON mssp.pricelist_id = pl.pricelist_id
        	    WHERE mss.supply_id = $1 AND mss.quantity > 0 AND pl.is_default = true
        	    ORDER BY mss.expiry_date ASC NULLS LAST;
        	`;
			const shipmentsResult = await query(availableShipmentsSql, [
				supplyInfo.supply_id
			]);

			if (shipmentsResult.rows.length === 0) {
				console.warn(
					`No available shipments for medical supply ${supplyInfo.supply_name} - patient ${supplyInfo.patient_id}`
				);
				await query("ROLLBACK");
				return;
			}

			let remainingQuantity = supplyInfo.sale_quantity;

			for (const shipment of shipmentsResult.rows) {
				if (remainingQuantity <= 0) break;

				const quantityToDispense = Math.min(
					remainingQuantity,
					shipment.quantity
				);

				// Create medical supply transaction
				const transactionSql = `
            	    INSERT INTO MedicalSupplyTransaction (
            	        shipment_id, transaction_type, quantity, price, created_by_user_id
            	    ) VALUES ($1, 'patient', $2, $3, $4)
            	    RETURNING transaction_id;
				`;
				const transactionResult = await query(transactionSql, [
					shipment.shipment_id,
					quantityToDispense,
					shipment.price,
					systemUserId
				]);

				// Update shipment quantity
				await query(
					"UPDATE MedicalSupplyShipment SET quantity = quantity - $1 WHERE shipment_id = $2",
					[quantityToDispense, shipment.shipment_id]
				);

				const currentAdmission = await PatientModel.getCurrentAdmission(
					supplyInfo.patient_id
				);

				// Create new medical supply usage record
				await query(
					`INSERT INTO MedicalSupplyUsage (
						patient_id, supply_id, transaction_id, patient_history_id, remaining_quantity, last_administered
					) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
					[
						supplyInfo.patient_id,
						supplyInfo.supply_id,
						transactionResult.rows[0].transaction_id,
						currentAdmission!.patient_history_id,
						quantityToDispense
					]
				);

				// Add to bill details
				await query(
					`INSERT INTO BillDetail (
                	    bill_id, medical_supply_shipment_id, quantity, unit_price, 
                	    charge_type, sale_type, generated_at
                	) VALUES ($1, $2, $3, $4, 'auto_supply_replenishment', 'admitted', CURRENT_TIMESTAMP)`,
					[
						supplyInfo.bill_id,
						shipment.shipment_id,
						quantityToDispense,
						shipment.price
					]
				);

				remainingQuantity -= quantityToDispense;
			}

			if (remainingQuantity > 0) {
				console.warn(
					`Could not fully replenish ${supplyInfo.supply_name} for patient ${supplyInfo.patient_name} - short by ${remainingQuantity} units`
				);
			}

			// Update bill total
			await query(
				`UPDATE Bill 
            	 SET total_amount = (
            	     SELECT COALESCE(SUM(quantity * unit_price), 0)
            	     FROM BillDetail 
            	     WHERE bill_id = $1
            	 ),
            	 updated_at = CURRENT_TIMESTAMP
            	 WHERE bill_id = $1`,
				[supplyInfo.bill_id]
			);

			console.log(
				`Replenished ${supplyInfo.sale_quantity - remainingQuantity
				} units of ${supplyInfo.supply_name} for patient ${supplyInfo.patient_name
				}`
			);

			await query("COMMIT");
		} catch (error) {
			await query("ROLLBACK");
			console.error(
				`Error replenishing medical supply ${supplyInfo.supply_name} for patient ${supplyInfo.patient_id}:`,
				error
			);
		}
	}
}

export default new PatientAutoRenewalCron();
