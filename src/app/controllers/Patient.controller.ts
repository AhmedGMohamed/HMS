import PatientModel from "../models/Patient.model.js";
import { Request, Response } from "express";

export class PatientController {
	async getActivePatients(_req: Request, res: Response) {
		try {
			const patients = await PatientModel.getActivePatients();

			res.json(patients);
		} catch (error) {
			console.error("Error fetching user:", error);
			res.status(500).json({ error: "Failed to fetch user" });
		}
	}
}

export default new PatientController()