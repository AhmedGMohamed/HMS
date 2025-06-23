// src/app/controllers/DrugShipment.controller.ts
import { Request, Response } from "express";
import DrugShipmentModel from "../models/DrugShipment.model.js";
import {
	CreateDrugShipmentDTO,
	UpdateDrugShipmentDTO
} from "../utils/types/drugs.js";

export class DrugShipmentController {
	async getAllShipments(_req: Request, res: Response) {
		try {
			const shipments = await DrugShipmentModel.getAllShipments();
			res.json(shipments);
		} catch (error) {
			console.error("Error fetching shipments:", error);
			res.status(500).json({ error: "Failed to fetch shipments" });
		}
	}

	async getShipmentById(req: Request, res: Response) {
		try {
			const shipmentId = parseInt(req.params.id);
			const shipment = await DrugShipmentModel.getShipmentById(
				shipmentId
			);

			if (!shipment) {
				res.status(404).json({ error: "Shipment not found" });
				return
			}

			res.json(shipment);
		} catch (error) {
			console.error("Error fetching shipment:", error);
			res.status(500).json({ error: "Failed to fetch shipment" });
		}
	}

	async createShipment(req: Request, res: Response) {
		try {
			const shipmentData: CreateDrugShipmentDTO = req.body;

			// Validate required fields
			if (!this.validateShipmentData(shipmentData)) {
				res.status(400).json({
					error: "Missing or invalid required fields"
				});
				return
			}

			// Validate numeric values
			if (!this.validateNumericValues(shipmentData)) {
				res.status(400).json({
					error: "Invalid numeric values"
				});
				return
			}

			// Validate dates
			if (!this.validateDates(shipmentData)) {
				res.status(400).json({
					error: "Invalid date values"
				});
				return
			}

			const userId = (req as any).user.userId;
			const newShipment = await DrugShipmentModel.createShipment(
				shipmentData,
				userId
			);

			res.status(201).json(newShipment);
		} catch (error: any) {
			if (error.message === "Drug not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "Warehouse not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error creating shipment:", error);
				res.status(500).json({ error: "Failed to create shipment" });
			}
		}
	}

	async updateShipment(req: Request, res: Response) {
		try {
			const shipmentId = parseInt(req.params.id);
			const updateData: UpdateDrugShipmentDTO = {
				...req.body,
				shipment_id: shipmentId
			};

			// Validate numeric values if provided
			if (!this.validateUpdateNumericValues(updateData)) {
				res.status(400).json({
					error: "Invalid numeric values"
				});
				return
			}

			// Validate dates if provided
			if (
				updateData.expiry_date &&
				!this.isValidDate(updateData.expiry_date)
			) {
				res.status(400).json({
					error: "Invalid expiry date"
				});
				return
			}

			const updatedShipment = await DrugShipmentModel.updateShipment(
				updateData
			);
			res.json(updatedShipment);
		} catch (error: any) {
			if (error.message === "Shipment not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message === "Warehouse not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error updating shipment:", error);
				res.status(500).json({ error: "Failed to update shipment" });
			}
		}
	}

	async deleteShipment(req: Request, res: Response) {
		try {
			const shipmentId = parseInt(req.params.id);
			await DrugShipmentModel.deleteShipment(shipmentId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Shipment not found") {
				res.status(404).json({ error: error.message });
			} else if (error.message.includes("Cannot delete shipment")) {
				res.status(400).json({ error: error.message });
			} else {
				console.error("Error deleting shipment:", error);
				res.status(500).json({ error: "Failed to delete shipment" });
			}
		}
	}

	async getShipmentsByDrug(req: Request, res: Response) {
		try {
			const drugId = parseInt(req.params.id);
			const shipments = await DrugShipmentModel.getShipmentsByDrug(
				drugId
			);
			res.json(shipments);
		} catch (error) {
			console.error("Error fetching drug shipments:", error);
			res.status(500).json({ error: "Failed to fetch drug shipments" });
		}
	}

	async getShipmentsByWarehouse(req: Request, res: Response) {
		try {
			const warehouseId = parseInt(req.params.id);
			const shipments = await DrugShipmentModel.getShipmentsByWarehouse(
				warehouseId
			);
			res.json(shipments);
		} catch (error) {
			console.error("Error fetching warehouse shipments:", error);
			res.status(500).json({
				error: "Failed to fetch warehouse shipments"
			});
		}
	}

	async getWarehouses(_req: Request, res: Response) {
		try {
			const warehouses = await DrugShipmentModel.getWarehouses();
			res.json(warehouses);
		} catch (error) {
			console.error("Error fetching warehouses:", error);
			res.status(500).json({ error: "Failed to fetch warehouses" });
		}
	}

	private validateShipmentData(data: CreateDrugShipmentDTO): boolean {
		return !!(
			data.drug_id &&
			data.warehouse_id &&
			data.quantity &&
			data.buy_price &&
			data.prices &&
			data.expiry_date
		);
	}

	private validateNumericValues(data: CreateDrugShipmentDTO): boolean {
		let check = true;
		if (data.quantity <= 0 || data.buy_price <= 0) {
			check = false;
		}
		data.prices.forEach((price) => {
			if (price.price as number <= 0) {
				check = false;
			}
		})

		return check
	}

	private validateUpdateNumericValues(data: UpdateDrugShipmentDTO): boolean {
		let check = true;

		if (
			data.quantity &&
			data.quantity <= 0 ||
			data.buy_price &&
			data.buy_price <= 0
		) {
			check = false;
		}
		if (data.prices) {
			data.prices.forEach((price) => {
				if (price.price as number <= 0) {
					check = false;
				}
			})
		}
		
		return (check);
	}

	private validateDates(data: CreateDrugShipmentDTO): boolean {
		// Validate expiry date
		if (!this.isValidDate(data.expiry_date)) {
			return false;
		}

		const expiryDate = new Date(data.expiry_date);
		if (expiryDate <= new Date()) {
			return false;
		}

		// Validate received date if provided
		if (data.received_date) {
			if (!this.isValidDate(data.received_date)) {
				return false;
			}

			const receivedDate = new Date(data.received_date);
			if (receivedDate > new Date() || receivedDate >= expiryDate) {
				return false;
			}
		}

		return true;
	}

	private isValidDate(dateString: string): boolean {
		const date = new Date(dateString);
		return date instanceof Date && !isNaN(date.getTime());
	}
}

export default new DrugShipmentController();
