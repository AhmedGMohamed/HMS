import EmployeeModel from "../../models/Employee.model.js";
import pool from "../../models/database/connection.js";
import { Employee, CreateEmployeeDTO } from "../../utils/types/employees.js";

describe("EmployeeModel", () => {
	let mockPoolQuery: jasmine.Spy;

	beforeEach(() => {
		mockPoolQuery = spyOn(pool, "query").and.callFake(() => {
			return Promise.resolve({ rows: [] } as any)
		});
	});

	afterEach(() => {
		mockPoolQuery.calls.reset();
	});

	it("should get all employees", async () => {
		const mockEmployees: Employee[] = [
			{
				employee_id: 1,
				name: "John Doe",
				is_facility_employee: true,
				hire_date: "2023-01-01",
				employee_type: "nurse",
				need_clock_in: true
			}
		];
		mockPoolQuery.and.callFake((sql: string) =>
			Promise.resolve({
				rows: sql.includes("COUNT(*)")
					? [{ total: mockEmployees.length }]
					: mockEmployees
			} as any)
		);

		const { rows, total } = await EmployeeModel.getAllEmployees();
		expect(rows).toEqual(mockEmployees);
		expect(total).toBe(1);
		expect(mockPoolQuery).toHaveBeenCalledTimes(2);
	});

	it("should pass filters, sort, and pagination to the query", async () => {
		mockPoolQuery.and.callFake((sql: string) =>
			Promise.resolve({
				rows: sql.includes("COUNT(*)") ? [{ total: 0 }] : []
			} as any)
		);

		await EmployeeModel.getAllEmployees({
			type: "nurse",
			search: "Mary",
			isActive: true,
			shiftType: "morning",
			sort: "hireDate",
			dir: "desc",
			offset: 25,
			limit: 25
		});

		const dataCall = mockPoolQuery.calls.allArgs()[0];
		const sql = dataCall[0] as string;
		expect(sql).toContain("employee_type = $1");
		expect(sql).toContain("name ILIKE $2");
		expect(sql).toContain("is_active = $3");
		expect(sql).toContain("shift_type = $4");
		expect(sql).toContain("ORDER BY hire_date DESC");
		expect(sql).toContain("LIMIT $5 OFFSET $6");
		expect(dataCall[1]).toEqual([
			"nurse",
			"%Mary%",
			true,
			"morning",
			25,
			25
		]);
	});

	it("should get employee by ID", async () => {
		const mockEmployee: Employee = {
			employee_id: 1,
			name: "John Doe",
			is_facility_employee: true,
			hire_date: "2023-01-01",
			employee_type: "nurse",
			need_clock_in: true
		};
		mockPoolQuery.and.returnValue(
			Promise.resolve({ rows: [mockEmployee] })
		);

		const employee = await EmployeeModel.getEmployeeById(1);
		expect(employee).toEqual(mockEmployee);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			"SELECT * FROM Employee WHERE employee_id = $1",
			[1]
		);
	});

	it("should create an employee", async () => {
		const dto: CreateEmployeeDTO = {
			name: "Jane Doe",
			is_facility_employee: true,
			hire_date: "2023-01-01",
			employee_type: "nurse",
			need_clock_in: true,
			shift_start_time: new Date("2023-01-01T08:00:00"),
			shift_end_time: new Date("2023-01-01T16:00:00")
		};
		const mockEmployee: Employee = { ...dto, employee_id: 2 };
		mockPoolQuery.and.returnValue(
			Promise.resolve({ rows: [mockEmployee] })
		);

		const employee = await EmployeeModel.createEmployee(dto);
		expect(employee).toEqual(mockEmployee);
		expect(mockPoolQuery).toHaveBeenCalledWith(jasmine.any(String), [
			dto.name,
			undefined,
			dto.is_facility_employee,
			dto.hire_date,
			true,
			dto.employee_type,
			undefined,
			0.0,
			undefined,
			undefined,
			undefined,
			dto.need_clock_in,
			undefined,
			dto.shift_start_time,
			dto.shift_end_time
		]);
	});

	it("should update an employee", async () => {
		const employee_id = 1;
		const dto: Partial<CreateEmployeeDTO> = { name: "Updated Name" };
		const mockEmployee: Employee = {
			employee_id,
			name: "Updated Name",
			is_facility_employee: true,
			hire_date: "2023-01-01",
			employee_type: "nurse",
			need_clock_in: true
		};
		mockPoolQuery.and.returnValue(
			Promise.resolve({ rows: [mockEmployee] })
		);

		const employee = await EmployeeModel.updateEmployee(employee_id, dto);
		expect(employee).toEqual(mockEmployee);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			"UPDATE Employee SET name = $1 WHERE employee_id = $2 RETURNING *",
			[dto.name, employee_id]
		);
	});

	it("should delete an employee", async () => {
		mockPoolQuery.and.returnValue(Promise.resolve({ rows: [] }));

		await EmployeeModel.deleteEmployee(1);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			"DELETE FROM Employee WHERE employee_id = $1",
			[1]
		);
	});

	it("should search employees by name", async () => {
		const mockEmployees: Employee[] = [
			{
				employee_id: 1,
				name: "John Doe",
				is_facility_employee: true,
				hire_date: "2023-01-01",
				employee_type: "nurse",
				need_clock_in: true
			}
		];
		mockPoolQuery.and.returnValue(Promise.resolve({ rows: mockEmployees }));

		const employees = await EmployeeModel.searchEmployeesByName("John");
		expect(employees).toEqual(mockEmployees);
		expect(mockPoolQuery).toHaveBeenCalledWith(
			"SELECT * FROM Employee WHERE name ILIKE $1",
			["%John%"]
		);
	});
});
