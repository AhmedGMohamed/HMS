import { Request, Response } from "express";
import WarehouseModel from "../models/Warehouse.model.js";

export class WarehouseController {
	async getAllWarehouses(_req: Request, res: Response) {
		try {
			const warehouses = await WarehouseModel.getAllWarehouses();
			res.status(200).json(warehouses);
		} catch (error) {
			console.error("Error fetching warehouses:", error);
			res.status(500).json({ error: "Failed to fetch warehouses" });
		}
	}

	async getWarehouseById(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const warehouseId = parseInt(id);

			if (isNaN(warehouseId)) {
				res.status(400).json({ error: "Invalid warehouse ID" });
				return;
			}

			const warehouse = await WarehouseModel.getWarehouseById(
				warehouseId
			);

			if (!warehouse) {
				res.status(404).json({ error: "Warehouse not found" });
				return;
			}

			res.status(200).json(warehouse);
		} catch (error) {
			console.error("Error fetching warehouse:", error);
			res.status(500).json({ error: "Failed to fetch warehouse" });
		}
	}

	async createWarehouse(req: Request, res: Response) {
		try {
			const { name, location } = req.body;

			if (!name || !location) {
				res.status(400).json({
					error: "Warehouse name and location are required"
				});
				return;
			}

			if (name.trim().length < 3) {
				res.status(400).json({
					error: "Warehouse name must be at least 3 characters long"
				});
				return;
			}

			if (location.trim().length < 5) {
				res.status(400).json({
					error: "Location must be at least 5 characters long"
				});
				return;
			}

			const warehouseData = {
				name: name.trim(),
				location: location.trim()
			};

			const newWarehouse = await WarehouseModel.createWarehouse(
				warehouseData
			);

			res.status(201).json({
				message: "Warehouse created successfully",
				warehouse: newWarehouse
			});
		} catch (error: any) {
			console.error("Error creating warehouse:", error);

			if (error.code === "23505") {
				// PostgreSQL unique violation
				res.status(400).json({
					error: "Warehouse with this name already exists"
				});
				return;
			}

			res.status(500).json({ error: "Failed to create warehouse" });
		}
	}

	async updateWarehouse(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { name, location } = req.body;
			const warehouseId = parseInt(id);

			if (isNaN(warehouseId)) {
				res.status(400).json({ error: "Invalid warehouse ID" });
				return;
			}

			if (!name && !location) {
				res.status(400).json({
					error: "At least one field (name or location) must be provided"
				});
				return;
			}

			const updateData: any = {};

			if (name) {
				if (name.trim().length < 3) {
					res.status(400).json({
						error: "Warehouse name must be at least 3 characters long"
					});
					return;
				}
				updateData.name = name.trim();
			}

			if (location) {
				if (location.trim().length < 5) {
					res.status(400).json({
						error: "Location must be at least 5 characters long"
					});
					return;
				}
				updateData.location = location.trim();
			}

			const updatedWarehouse = await WarehouseModel.updateWarehouse(
				warehouseId,
				updateData
			);

			if (!updatedWarehouse) {
				res.status(404).json({ error: "Warehouse not found" });
				return;
			}

			res.status(200).json({
				message: "Warehouse updated successfully",
				warehouse: updatedWarehouse
			});
		} catch (error: any) {
			console.error("Error updating warehouse:", error);

			if (error.code === "23505") {
				res.status(400).json({
					error: "Warehouse with this name already exists"
				});
				return;
			}

			res.status(500).json({ error: "Failed to update warehouse" });
		}
	}

	async deleteWarehouse(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const warehouseId = parseInt(id);

			if (isNaN(warehouseId)) {
				res.status(400).json({ error: "Invalid warehouse ID" });
				return;
			}

			const deleted = await WarehouseModel.deleteWarehouse(warehouseId);

			if (!deleted) {
				res.status(404).json({ error: "Warehouse not found" });
				return;
			}

			res.status(200).json({
				message: "Warehouse deleted successfully"
			});
		} catch (error: any) {
			console.error("Error deleting warehouse:", error);

			if (error.message.includes("Cannot delete warehouse")) {
				res.status(400).json({ error: error.message });
				return;
			}

			res.status(500).json({ error: "Failed to delete warehouse" });
		}
	}

	async getWarehouseInventory(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const warehouseId = parseInt(id);

			if (isNaN(warehouseId)) {
				res.status(400).json({ error: "Invalid warehouse ID" });
				return;
			}

			const inventory = await WarehouseModel.getWarehouseInventory(
				warehouseId
			);
			res.status(200).json(inventory);
		} catch (error) {
			console.error("Error fetching warehouse inventory:", error);
			res.status(500).json({
				error: "Failed to fetch warehouse inventory"
			});
		}
	}

	async getWarehouseShipments(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const warehouseId = parseInt(id);

			if (isNaN(warehouseId)) {
				res.status(400).json({ error: "Invalid warehouse ID" });
				return;
			}

			const shipments = await WarehouseModel.getWarehouseShipments(
				warehouseId
			);
			res.status(200).json(shipments);
		} catch (error) {
			console.error("Error fetching warehouse shipments:", error);
			res.status(500).json({
				error: "Failed to fetch warehouse shipments"
			});
		}
	}
}

export default new WarehouseController();
