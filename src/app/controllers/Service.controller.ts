import { Request, Response } from "express";
import ServiceModel, { ServiceListOptions } from "../models/Service.model.js";
import {
	CreateServiceDTO,
	ServicePrice,
	UpdateServiceDTO
} from "../utils/types/services.js";
import { buildPage, parsePagination } from "../utils/pagination.js";

const SERVICE_TYPES = new Set(["once", "hourly", "daily"]);

function readString(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (Array.isArray(value)) {
		return readString(value[0]);
	}
	return undefined;
}

function readBoolean(value: unknown): boolean {
	const raw = readString(value);
	return raw === "true" || raw === "1";
}

function readInt(value: unknown): number | undefined {
	const raw = readString(value);
	if (raw == null) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export class ServiceController {
	async getAllServices(req: Request, res: Response) {
		try {
			const pagination = parsePagination(req);
			const all = readBoolean(req.query?.all);
			const rawType = readString(req.query?.serviceType);
			const serviceType =
				rawType && SERVICE_TYPES.has(rawType)
					? (rawType as ServiceListOptions["serviceType"])
					: undefined;
			const options: ServiceListOptions = {
				offset: all ? undefined : pagination.offset,
				limit: all ? undefined : pagination.limit,
				search: readString(req.query?.search),
				serviceType,
				pricelistId: readInt(req.query?.pricelistId),
				drug: readString(req.query?.drug),
				sort: readString(req.query?.sort) === "serviceType"
					? "serviceType"
					: "name",
				dir: readString(req.query?.dir) === "desc" ? "desc" : "asc"
			};

			const { rows, total } = await ServiceModel.getAllServices(options);
			const page = all
				? { ...pagination, page: 1, pageSize: rows.length }
				: pagination;
			res.json(buildPage(rows, total, page));
		} catch (error) {
			console.error("Error fetching services:", error);
			res.status(500).json({ error: "Failed to fetch services" });
		}
	}

	async getServiceById(req: Request, res: Response) {
		try {
			const serviceId = parseInt(req.params.id, 10);
			const service = await ServiceModel.getServiceById(serviceId);

			if (service.prices) {
				service.prices.forEach((sp: ServicePrice) => {
					sp.price = (sp.price as number).toFixed(2);
				});
			}
			res.json(service);
		} catch (error: any) {
			if (error.message === "Service not found") {
				res.status(404).json({ error: "Service not found" });
			} else {
				console.error("Error fetching service:", error);
				res.status(500).json({ error: "Failed to fetch service" });
			}
		}
	}

	async createService(req: Request, res: Response) {
		try {
			const serviceData: CreateServiceDTO = req.body;
			const service = await ServiceModel.createService(serviceData);
			
			res.status(201).json(service);
		} catch (error) {
			console.error("Error creating service:", error);
			res.status(500).json({ error: "Failed to create service" });
		}
	}

	// Update other methods that handle IDs to use parseInt
	async updateService(req: Request, res: Response) {
		try {
			const serviceData: UpdateServiceDTO = {
				...req.body,
				service_id: parseInt(req.params.id, 10)
			};
			const service = await ServiceModel.updateService(serviceData);

			if (service.prices) {
				service.prices.forEach((sp: ServicePrice) => {
					sp.price = (sp.price as number).toFixed(2);
				});
			}
			res.json(service);
		} catch (error: any) {
			if (error.message === "Service not found") {
				res.status(404).json({ error: "Service not found" });
			} else {
				console.error("Error updating service:", error);
				res.status(500).json({ error: "Failed to update service" });
			}
		}
	}

	async deleteService(req: Request, res: Response) {
		try {
			await ServiceModel.getServiceById(parseInt(req.params.id, 10));

			const serviceId = parseInt(req.params.id, 10);
			await ServiceModel.deleteService(serviceId);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === "Service not found") {
				res.status(404).json({ error: "Service not found" });
			} else if (
				error.message.startsWith("Cannot delete this service:")
			) {
				res.status(409).json({ error: error.message });
			} else {
				console.error("Error deleting service:", error);
				res.status(500).json({ error: "Failed to delete service" });
			}
		}
	}

	// Search services
	async searchServices(req: Request, res: Response) {
		try {
			const searchTerm = req.query.q as string;

			if (!searchTerm || searchTerm.trim().length === 0) {
				res.status(400).json({ error: "Search term is required" });
				return;
			}

			const services = await ServiceModel.searchServices(
				searchTerm.trim()
			);
			res.json(services);
		} catch (error) {
			console.error("Error searching services:", error);
			res.status(500).json({ error: "Failed to search services" });
		}
	}

	// Get service suggestions for autocomplete
	async getServiceSuggestions(req: Request, res: Response) {
		try {
			const prefix = req.query.prefix as string;

			if (!prefix || prefix.trim().length === 0) {
				res.status(400).json({ error: "Prefix is required" });
				return;
			}

			const suggestions = await ServiceModel.getServiceSuggestions(
				prefix.trim()
			);
			res.json(suggestions);
		} catch (error) {
			console.error("Error getting service suggestions:", error);
			res.status(500).json({
				error: "Failed to get service suggestions"
			});
		}
	}

	async getServiceDrugs(req: Request, res: Response) {
		try {
			const serviceId = parseInt(req.params.id);
			const drugs = await ServiceModel.getServiceDrugs(serviceId);
			res.json(drugs);
		} catch (error) {
			console.error("Error fetching service drugs:", error);
			res.status(500).json({ error: "Failed to fetch service drugs" });
		}
	}

	async getActivePatientServices(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.patientId);
			const services = await ServiceModel.getActivePatientServices(
				patientId
			);
			res.json(services);
		} catch (error) {
			console.error("Error fetching active patient services:", error);
			res.status(500).json({
				error: "Failed to fetch active patient services"
			});
		}
	}

	async addServiceToPatient(req: Request, res: Response) {
		try {
			const patientId = parseInt(req.params.patientId);
			const { serviceId, startDate } = req.body;
			const activeService = await ServiceModel.addServiceToPatient(
				patientId,
				serviceId,
				startDate ? new Date(startDate) : undefined
			);
			res.status(201).json(activeService);
		} catch (error: any) {
			if (error.message === "Service not found") {
				res.status(404).json({ error: "Service not found" });
			} else if (error.message === "Patient not found") {
				res.status(404).json({ error: "Patient not found" });
			} else {
				console.error("Error adding service to patient:", error);
				res.status(500).json({
					error: "Failed to add service to patient"
				});
			}
		}
	}

	async deactivatePatientService(req: Request, res: Response) {
		try {
			const activeServiceId = parseInt(req.params.activeServiceId);
			const { endDate } = req.body;
			const service = await ServiceModel.deactivatePatientService(
				activeServiceId,
				endDate ? new Date(endDate) : undefined
			);
			res.json(service);
		} catch (error: any) {
			if (error.message === "Active service not found") {
				res.status(404).json({ error: error.message });
			} else {
				console.error("Error deactivating patient service:", error);
				res.status(500).json({
					error: "Failed to deactivate patient service"
				});
			}
		}
	}
}

export default new ServiceController();
