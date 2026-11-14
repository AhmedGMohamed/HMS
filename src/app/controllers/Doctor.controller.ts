// src/app/controllers/Doctor.controller.ts
import { Request, Response } from "express";
import DoctorModel, { type DoctorListOptions } from "../models/Doctor.model.js";
import { CreateDoctorDTO } from "../utils/types/employees.js";
import { buildPage, parsePagination } from "../utils/pagination.js";

const DOCTOR_SORTS = new Set([
	"name",
	"doctorType",
	"hireDate",
	"dailyPay",
	"perPatientPay",
	"shiftType"
]);
const SHIFT_TYPES = new Set(["morning", "night"]);

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

function readBooleanFlag(value: unknown): boolean | undefined {
	const raw = readString(value);
	if (raw === "true" || raw === "1") return true;
	if (raw === "false" || raw === "0") return false;
	return undefined;
}

export default class DoctorController {
	static async getAllDoctors(req: Request, res: Response): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const all = readBooleanFlag(req.query?.all) === true;
			const rawSort = readString(req.query?.sort);
			const rawShift = readString(req.query?.shiftType);

			const options: DoctorListOptions = {
				offset: all ? undefined : pagination.offset,
				limit: all ? undefined : pagination.limit,
				search: readString(req.query?.search),
				isActive: readBooleanFlag(req.query?.isActive),
				shiftType:
					rawShift && SHIFT_TYPES.has(rawShift)
						? (rawShift as DoctorListOptions["shiftType"])
						: undefined,
				doctorType: readString(req.query?.doctorType),
				sort:
					rawSort && DOCTOR_SORTS.has(rawSort)
						? (rawSort as DoctorListOptions["sort"])
						: "name",
				dir: readString(req.query?.dir) === "desc" ? "desc" : "asc"
			};

			const { rows, total } = await DoctorModel.getAllDoctors(options);
			const page = all
				? { ...pagination, page: 1, pageSize: rows.length }
				: pagination;
			res.status(200).json(buildPage(rows, total, page));
		} catch (error) {
			console.error("Error fetching doctors:", error);
			res.status(500).json({ error: "Failed to fetch doctors" });
		}
	}

	static async getDoctorById(req: Request, res: Response): Promise<void> {
		try {
			const doctor_id = parseInt(req.params.id);
			const doctor = await DoctorModel.getDoctorById(doctor_id);
			if (!doctor) {
				res.status(404).json({ error: "Doctor not found" });
				return;
			}
			res.status(200).json(doctor);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch doctor" });
		}
	}

	static async createDoctor(req: Request, res: Response): Promise<void> {
		try {
			const dto: CreateDoctorDTO = req.body;
			const doctor = await DoctorModel.createDoctor(dto);

			if (dto.service_prices && dto.service_prices.length > 0) {
				// Upserts new/changed overrides; `price: null` entries
				// remove the override for that service (Phase 6.7).
				for (const sp of dto.service_prices) {
					// `price: null` = removal request (Phase 6.7); anything
					// else upserts the override.
					if (sp.price === null) {
						await DoctorModel.deleteDoctorServicePrice(doctor.employee_id, sp.service_id);
					} else {
						await DoctorModel.setDoctorServicePrice(doctor.employee_id, sp.service_id, sp.price);
					}
				}
			}

			res.status(201).json(doctor);
		} catch (error) {
			res.status(500).json({ error: "Failed to create doctor" });
		}
	}

	static async updateDoctor(req: Request, res: Response): Promise<void> {
		try {
			const doctor_id = parseInt(req.params.id);
			const dto: Partial<CreateDoctorDTO> = req.body;
			const doctor = await DoctorModel.updateDoctor(doctor_id, dto);
			if (!doctor) {
				res.status(404).json({ error: "Doctor not found" });
				return;
			}

			if (dto.service_prices && dto.service_prices.length > 0) {
				// Upserts new/changed overrides; `price: null` entries
				// remove the override for that service (Phase 6.7).
				for (const sp of dto.service_prices) {
					if (sp.price === null) {
						await DoctorModel.deleteDoctorServicePrice(doctor_id, sp.service_id);
					} else {
						await DoctorModel.setDoctorServicePrice(doctor_id, sp.service_id, sp.price);
					}
				}
			}

			res.status(200).json(doctor);
		} catch (error) {
			res.status(500).json({ error: "Failed to update doctor" });
		}
	}

	static async deleteDoctor(req: Request, res: Response): Promise<void> {
		try {
			const doctor_id = parseInt(req.params.id);
			await DoctorModel.deleteDoctor(doctor_id);
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ error: "Failed to delete doctor" });
		}
	}

	static async searchDoctorsByName(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const name = req.query.q as string;
			const doctors = await DoctorModel.searchDoctorsByName(name);
			res.status(200).json(doctors);
		} catch (error) {
			res.status(500).json({ error: "Failed to search doctors" });
		}
	}

	static async getDoctorServicePrices(req: Request, res: Response): Promise<void> {
		try {
			const doctor_id = parseInt(req.params.id);
			const prices = await DoctorModel.getDoctorServicePrices(doctor_id);
			res.status(200).json(prices);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch doctor service prices" });
		}
	}
}
