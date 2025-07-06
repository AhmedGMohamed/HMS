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
		mockPoolQuery.and.returnValue(Promise.resolve({ rows: mockEmployees }));

		const employees = await EmployeeModel.getAllEmployees();
		expect(employees).toEqual(mockEmployees);
		expect(mockPoolQuery).toHaveBeenCalledWith("SELECT * FROM Employee");
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
			need_clock_in: true
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
			dto.employee_type,
			undefined,
			undefined,
			undefined,
			undefined,
			dto.need_clock_in,
			undefined
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
