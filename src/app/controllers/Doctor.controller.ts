// src/app/controllers/Doctor.controller.ts
import { Request, Response } from "express";
import DoctorModel from "../models/Doctor.model.js";
import { CreateDoctorDTO } from "../utils/types/employees.js";

export default class DoctorController {
	static async getAllDoctors(_req: Request, res: Response): Promise<void> {
		try {
			const doctors = await DoctorModel.getAllDoctors();
			res.status(200).json(doctors);
		} catch (error) {
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

			if (dto.servicePrices && dto.servicePrices.length > 0) {
				for (const sp of dto.servicePrices) {
					await DoctorModel.setDoctorServicePrice(doctor.employee_id, sp.service_id, sp.price);
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

			if (dto.servicePrices && dto.servicePrices.length > 0) {
				// We might want to clear existing first if we want full replacement, but usually setting is enough or UI handles it. 
				// Given the current ON CONFLICT implementation in model, this updates or inserts. 
				// To support removing, the UI should send 0 or we need a delete mechanism. 
				// For now, let's assume valid prices are sent.
				for (const sp of dto.servicePrices) {
					await DoctorModel.setDoctorServicePrice(doctor_id, sp.service_id, sp.price);
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
