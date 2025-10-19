// src/app/controllers/EmployeeClockIn.controller.ts
import { Request, Response } from "express";
import EmployeeClockInModel from "../models/EmployeeClockIn.model.js";
import EmployeeModel from "../models/Employee.model.js";
import {
	CreateEmployeeClockInDTO
} from "../utils/types/employees.js";

export default class EmployeeClockInController {
	static async getAllClockIns(_req: Request, res: Response): Promise<void> {
		try {
			const clockIns = await EmployeeClockInModel.getAllClockIns();
			res.status(200).json(clockIns);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch clock-ins" });
		}
	}

	static async getClockedInEmployees(
		_req: Request,
		res: Response
	): Promise<void> {
		try {
			const clockIns = await EmployeeClockInModel.getClockedInEmployees();
			res.status(200).json(clockIns);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch clock-ins" });
		}
	}

	static async getClockInById(req: Request, res: Response): Promise<void> {
		try {
			const clock_id = parseInt(req.params.id);
			const clockIn = await EmployeeClockInModel.getClockInById(clock_id);
			if (!clockIn) {
				res.status(404).json({ error: "Clock-in not found" });
				return;
			}
			res.status(200).json(clockIn);
		} catch (error) {
			res.status(500).json({ error: "Failed to fetch clock-in" });
		}
	}

	static async getClockInsByEmployeeId(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const employee_id = parseInt(req.params.id);
			const clockIns = await EmployeeClockInModel.getClockInsByEmployeeId(
				employee_id
			);
			res.status(200).json(clockIns);
		} catch (error) {
			res.status(500).json({
				error: "Failed to fetch employee clock-ins"
			});
		}
	}

	static async createClockIn(req: Request, res: Response): Promise<void> {
		try {
			const employee_id = parseInt(req.body.employee_id);
			const employee = await EmployeeModel.getEmployeeById(employee_id);
			if (!employee) {
				res.status(404).json({ error: "Employee not found" });
				return;
			}

			const pay_deduction =
				employee.employee_type === "nurse" && employee.shift_type
					? await EmployeeClockInModel.calculatePayDeduction(
							employee_id,
							req.body.clock_in,
							employee.shift_type
					  )
					: 0;

			const dto: CreateEmployeeClockInDTO = {
				employee_id,
				clock_in: req.body.clock_in,
				clock_out: req.body.clock_out,
				pay_deduction
			};
			const clockIn = await EmployeeClockInModel.createClockIn(dto);
			res.status(201).json(clockIn);
		} catch (error) {
			res.status(500).json({ error: "Failed to create clock-in" });
		}
	}

	static async updateClockIn(req: Request, res: Response): Promise<void> {
		try {
			const clock_id = parseInt(req.params.id);
			const dto: Partial<CreateEmployeeClockInDTO> = req.body;
			const clockIn = await EmployeeClockInModel.updateClockIn(
				clock_id,
				dto
			);
			if (!clockIn) {
				res.status(404).json({ error: "Clock-in not found" });
				return;
			}
			res.status(200).json(clockIn);
		} catch (error) {
			res.status(500).json({ error: "Failed to update clock-in" });
		}
	}
}
