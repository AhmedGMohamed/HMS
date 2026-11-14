// src/app/controllers/Employee.controller.ts
import { Request, Response } from "express";
import EmployeeModel, { type EmployeeListOptions } from "../models/Employee.model.js";
import { CreateEmployeeDTO } from "../utils/types/employees.js";
import { buildPage, parsePagination } from "../utils/pagination.js";

const EMPLOYEE_TYPES = new Set(["doctor", "nurse", "other"]);
const EMPLOYEE_SORTS = new Set(["name", "hireDate", "basePay", "shiftType"]);
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

export default class EmployeeController {
	static async getAllEmployees(req: Request, res: Response): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const all = readBooleanFlag(req.query?.all) === true;
			const rawType = readString(req.query?.type);
			const rawShift = readString(req.query?.shiftType);
			const rawSort = readString(req.query?.sort);

			const options: EmployeeListOptions = {
				offset: all ? undefined : pagination.offset,
				limit: all ? undefined : pagination.limit,
				type:
					rawType && EMPLOYEE_TYPES.has(rawType)
						? (rawType as EmployeeListOptions["type"])
						: "all",
				search: readString(req.query?.search),
				isActive: readBooleanFlag(req.query?.isActive),
				shiftType:
					rawShift && SHIFT_TYPES.has(rawShift)
						? (rawShift as EmployeeListOptions["shiftType"])
						: undefined,
				sort:
					rawSort && EMPLOYEE_SORTS.has(rawSort)
						? (rawSort as EmployeeListOptions["sort"])
						: "name",
				dir: readString(req.query?.dir) === "desc" ? "desc" : "asc"
			};

			const { rows, total } = await EmployeeModel.getAllEmployees(options);
			const page = all
				? { ...pagination, page: 1, pageSize: rows.length }
				: pagination;
			res.status(200).json(buildPage(rows, total, page));
		} catch (error) {
			console.error("Error fetching employees:", error);
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
