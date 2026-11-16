-- Reports indexes — Phase 6.11.
--
-- Additive only: none of these replace or drop an existing index. They back
-- the aggregate scans the new `/api/reports/*` endpoints perform:
--
--   * EmployeePayment  — payroll list/summary scans filter `is_void = false`
--                        and range on `issued_timestamp` per employee.
--   * EmployeeClockIn  — payroll period deductions and clock-in records are
--                        always `employee_id` + a `clock_in` range.
--   * Employee         — the clock-in report enumerates active employees that
--                        need to clock in.
--
-- Kept in sync with the CREATE INDEX block in `setUpDatabase.ts` so fresh
-- installs and existing databases converge.

CREATE INDEX IF NOT EXISTS idx_employee_payment_employee_issued
	ON EmployeePayment(employee_id, issued_timestamp) WHERE is_void = false;

CREATE INDEX IF NOT EXISTS idx_employee_clock_in_employee_clock_in
	ON EmployeeClockIn(employee_id, clock_in);

CREATE INDEX IF NOT EXISTS idx_employee_clock_in_deduction
	ON EmployeeClockIn(employee_id, clock_in) WHERE pay_deduction > 0;

CREATE INDEX IF NOT EXISTS idx_employee_need_clock_in
	ON Employee(need_clock_in, is_active);
