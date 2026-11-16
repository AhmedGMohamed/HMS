// src/app/controllers/EmployeeClockIn.controller.ts
import { Request, Response } from "express";
import EmployeeClockInModel from "../models/EmployeeClockIn.model.js";
import type {
	ClockInListOptions,
	ClockedInListOptions
} from "../models/EmployeeClockIn.model.js";
import EmployeeModel from "../models/Employee.model.js";
import { CreateEmployeeClockInDTO } from "../utils/types/employees.js";
import { buildPage, parsePagination } from "../utils/pagination.js";

const CLOCK_IN_STATUSES = new Set(["all", "active", "closed"]);
const CLOCK_IN_SORTS = new Set([
	"employee",
	"clockIn",
	"clockOut",
	"duration",
	"payDeduction"
]);
const CLOCKED_IN_SORTS = new Set(["clockIn", "duration", "employee"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readString(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (Array.isArray(value)) return readString(value[0]);
	return undefined;
}

function readBoolean(value: unknown): boolean {
	const raw = readString(value);
	return raw === "true" || raw === "1";
}

/** Only forward well-formed `YYYY-MM-DD` values; anything else is ignored. */
function readDate(value: unknown): string | undefined {
	const raw = readString(value);
	if (!raw || !ISO_DATE.test(raw)) return undefined;
	const parsed = new Date(`${raw}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) ? undefined : raw;
}

export default class EmployeeClockInController {
	static async getAllClockIns(req: Request, res: Response): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const rawStatus = readString(req.query?.status);
			const rawSort = readString(req.query?.sort);
			const options: ClockInListOptions = {
				offset: pagination.offset,
				limit: pagination.limit,
				status:
					rawStatus && CLOCK_IN_STATUSES.has(rawStatus)
						? (rawStatus as ClockInListOptions["status"])
						: "all",
				search: readString(req.query?.search),
				from: readDate(req.query?.from),
				to: readDate(req.query?.to),
				sort:
					rawSort && CLOCK_IN_SORTS.has(rawSort)
						? (rawSort as ClockInListOptions["sort"])
						: "clockIn",
				dir: readString(req.query?.dir) === "asc" ? "asc" : "desc"
			};

			const { rows, total } =
				await EmployeeClockInModel.getAllClockIns(options);
			res.status(200).json(buildPage(rows, total, pagination));
		} catch {
			res.status(500).json({ error: "Failed to fetch clock-ins" });
		}
	}

	static async getEligibleEmployees(
		_req: Request,
		res: Response
	): Promise<void> {
		try {
			const employees = await EmployeeClockInModel.getEligibleEmployees();
			res.status(200).json(employees);
		} catch {
			res.status(500).json({ error: "Failed to fetch eligible employees" });
		}
	}

	static async getClockedInEmployees(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const pagination = parsePagination(req);
			const all = readBoolean(req.query?.all);
			const rawSort = readString(req.query?.sort);
			const options: ClockedInListOptions = {
				offset: all ? undefined : pagination.offset,
				limit: all ? undefined : pagination.limit,
				missingOnly: readBoolean(req.query?.missingOnly),
				today: readDate(req.query?.today),
				sort:
					rawSort && CLOCKED_IN_SORTS.has(rawSort)
						? (rawSort as ClockedInListOptions["sort"])
						: "clockIn",
				dir: readString(req.query?.dir) === "desc" ? "desc" : "asc"
			};

			const { rows, total } =
				await EmployeeClockInModel.getClockedInEmployees(options);
			const page = all
				? { ...pagination, page: 1, pageSize: rows.length }
				: pagination;
			res.status(200).json(buildPage(rows, total, page));
		} catch {
			res.status(500).json({ error: "Failed to fetch clock-ins" });
		}
	}

	/** KPI/badge figures for the Active tab — not paginated. */
	static async getClockedInStats(
		req: Request,
		res: Response
	): Promise<void> {
		try {
			const stats = await EmployeeClockInModel.getClockedInStats(
				readDate(req.query?.today)
			);
			res.status(200).json(stats);
		} catch {
			res.status(500).json({ error: "Failed to fetch clocking stats" });
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
				employee.need_clock_in && employee.shift_start_time
					? await EmployeeClockInModel.calculatePayDeduction(
							employee_id,
							req.body.clock_in,
							employee.shift_start_time
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

	static async deleteClockIn(req: Request, res: Response): Promise<void> {
		try {
			const clock_id = parseInt(req.params.id);
			await EmployeeClockInModel.deleteClockIn(clock_id);
			res.status(204).send();
		} catch (error) {
			res.status(500).json({ error: "Failed to delete clock-in" });
		}
	}
}
