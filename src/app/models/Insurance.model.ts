// src/app/models/Insurance.model.ts
import { query } from "./database/connection.js";
import { InsuranceCompany } from "../utils/types/patients.js";

class InsuranceModel {
	async getAllInsuranceCompanies(): Promise<InsuranceCompany[]> {
		const sql = "SELECT * FROM InsuranceCompany ORDER BY name";
		const { rows } = await query(sql);
		return rows;
	}
}

export default new InsuranceModel();