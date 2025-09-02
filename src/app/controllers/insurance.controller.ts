// src/app/controllers/Insurance.controller.ts
import { Request, Response } from "express";
import InsuranceModel from "../models/Insurance.model.js";

class InsuranceController {
	async getAllInsuranceCompanies(
		_req: Request,
		res: Response
	): Promise<void> {
		try {
			const insuranceCompanies =
				await InsuranceModel.getAllInsuranceCompanies();
			res.json(insuranceCompanies);
		} catch (error) {
			console.error("Error fetching insurance companies:", error);
			res.status(500).json({
				error: "Failed to fetch insurance companies"
			});
		}
	}
}

export default new InsuranceController();