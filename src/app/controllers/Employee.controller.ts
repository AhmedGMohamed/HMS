// src/app/controllers/Employee.controller.ts
import { Request, Response } from "express";
import EmployeeModel from "../models/Employee.model.js";
import { CreateEmployeeDTO } from "../utils/types/employees.js";

export default class EmployeeController {
	static async getAllEmployees(req: Request, res: Response): Promise<void> {
		try {
			let type = "all"
			if (req.query.type) {
				type = req.query.type as string;
			}
			const employees = await EmployeeModel.getAllEmployees(type);
			res.status(200).json(employees);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch employees" });
		}
	}

	static async getEmployeeById(req: Request, res: Response): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const employee = await EmployeeModel.getEmployeeById(employee_id);
			if (!employee) {
				res.status(404).json({ error: "Employee not found" });
				return;
			}
			res.status(200).json(employee);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch employee" });
		}
	}

	static async createEmployee(req: Request, res: Response): Promise<void> {
		try {
			const dto: CreateEmployeeDTO = req.body;
			const employee = await EmployeeModel.createEmployee(dto);
			res.status(201).json(employee);
		} catch (error) {
			res.status(500).json({ error: "Failed to create employee" });
		}
	}

	static async updateEmployee(req: Request, res: Response): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const dto: Partial<CreateEmployeeDTO> = req.body;
			const employee = await EmployeeModel.updateEmployee(
				employee_id,
				dto
			);
			if (!employee) {
				res.status(404).json({ error: "Employee not found" });
				return;
			}
			res.status(200).json(employee);
		} catch (error) {
			res.status(500).json({ error: "Failed to update employee" });
		}
	}

	static async deleteEmployee(req: Request, res: Response): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			await EmployeeModel.deleteEmployee(employee_id);
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ error: "Failed to delete employee" });
		}
	}

	static async searchEmployeesByName(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const name = req.query.q as string;
			const employees = await EmployeeModel.searchEmployeesByName(name);
			res.status(200).json(employees);
		} catch (error) {
			res.status(500).json({ error: "Failed to search employees" });
		}
	}

	// New nurse assignment methods
	static async getAvailableNurses(_req: Request, res: Response) {
		try {
			const nurses = await EmployeeModel.getAvailableNurses();
			res.status(200).json(nurses);
		} catch (error) {
			console.error("Error fetching available nurses:", error);
			res.status(500).json({ error: "Failed to fetch available nurses" });
		}
	}
}
