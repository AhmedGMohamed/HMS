import EmployeePaymentModel from "../../models/EmployeePayment.model.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/**
 * Insert a payment with SQL expressions allowed for the timestamp so the
 * fixtures stay relative to the database clock.
 */
async function insertPayment(
	employeeId: number,
	paymentAmount: number,
	options: {
		extraAmount?: number | null;
		isPaid?: boolean;
		isVoid?: boolean;
		paidByUserId?: number | null;
		issuedSql?: string;
	} = {}
) {
	const {
		extraAmount = null,
		isPaid = false,
		isVoid = false,
		paidByUserId = null,
		issuedSql = "CURRENT_TIMESTAMP"
	} = options;

	const { rows } = await query(
		`INSERT INTO EmployeePayment (
			employee_id, payment_amount, payment_type, extra_amount,
			is_paid, is_void, paid_by_user_id, issued_timestamp
		 ) VALUES ($1, $2, 'salary', $3, $4, $5, $6, ${issuedSql})
		 RETURNING *;`,
		[employeeId, paymentAmount, extraAmount, isPaid, isVoid, paidByUserId]
	);
	return rows[0] as {
		payment_id: number;
		employee_id: number;
		payment_amount: string;
		is_paid: boolean;
		is_void: boolean;
		paid_by_user_id: number | null;
		issued_timestamp: string;
	};
}

/** Local `YYYY-MM-DD` for N days from today (the client sends these). */
function localDay(offsetDays = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate()
	)}`;
}

describe("EmployeePaymentModel", () => {
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllPayments", () => {
		it("should return a page plus the full total, newest first", async () => {
			const { rows, total } = await EmployeePaymentModel.getAllPayments();

			// seedEmployeePayments inserts one paid and one user-stamped
			// unpaid row.
			expect(total).toBe(2);
			expect(rows.length).toBe(2);
			expect(rows[0].payment_id).toBeGreaterThan(rows[1].payment_id);
		});

		it("should paginate with a stable total", async () => {
			const first = await EmployeePaymentModel.getAllPayments({
				offset: 0,
				limit: 1
			});
			expect(first.total).toBe(2);
			expect(first.rows.length).toBe(1);

			const second = await EmployeePaymentModel.getAllPayments({
				offset: 1,
				limit: 1
			});
			expect(second.total).toBe(2);
			expect(second.rows.length).toBe(1);
			expect(second.rows[0].payment_id).not.toBe(
				first.rows[0].payment_id
			);
		});
	});

	describe("pending queue", () => {
		it("should ignore seeded payments that carry a paid_by_user_id", async () => {
			// The seed has an unpaid row, but it is stamped with a user —
			// only system-issued (NULL) rows enter the queue.
			const { rows, total } =
				await EmployeePaymentModel.getPendingPaymentGroups();
			expect(total).toBe(0);
			expect(rows.length).toBe(0);

			const stats = await EmployeePaymentModel.getPendingPaymentStats();
			expect(stats.pending_count).toBe(0);
			expect(stats.employee_count).toBe(0);
		});

		it("should group pending payments per employee, oldest first", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;

			await insertPayment(emp0, 100, {
				extraAmount: 25,
				issuedSql: "now() - interval '5 days'"
			});
			await insertPayment(emp0, 50, {
				issuedSql: "now() - interval '4 days'"
			});
			await insertPayment(emp2, 70, {
				issuedSql: "now() - interval '1 day'"
			});

			const { rows, total } =
				await EmployeePaymentModel.getPendingPaymentGroups();

			expect(total).toBe(2);
			expect(rows.length).toBe(2);
			expect(rows[0].employee_id).toBe(emp0);
			expect(rows[0].employee_name).toBe("Dr. John Smith");
			expect(rows[0].payment_count).toBe(2);
			expect(rows[0].total_amount).toBe(175);
			expect(rows[1].employee_id).toBe(emp2);
			expect(rows[1].payment_count).toBe(1);
			expect(rows[1].total_amount).toBe(70);
		});

		it("should filter groups by employee name", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp2, 70);

			const { rows, total } =
				await EmployeePaymentModel.getPendingPaymentGroups({
					search: "Mary"
				});

			expect(total).toBe(1);
			expect(rows[0].employee_id).toBe(emp2);
			expect(rows[0].employee_name).toBe("Nurse Mary Brown");
		});

		it("should filter by issued date range", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp4 = insertedData.employees[4].employee_id;

			await insertPayment(emp0, 100, {
				issuedSql: "now() - interval '3 days'"
			});
			await insertPayment(emp4, 60, { issuedSql: "CURRENT_TIMESTAMP" });

			const fromToday =
				await EmployeePaymentModel.getPendingPaymentGroups({
					from: localDay(0)
				});
			expect(fromToday.total).toBe(1);
			expect(fromToday.rows[0].employee_id).toBe(emp4);

			const upToYesterday =
				await EmployeePaymentModel.getPendingPaymentGroups({
					to: localDay(-1)
				});
			expect(upToYesterday.total).toBe(1);
			expect(upToYesterday.rows[0].employee_id).toBe(emp0);

			const window = await EmployeePaymentModel.getPendingPaymentGroups(
				{ from: localDay(-4), to: localDay(-1) }
			);
			expect(window.total).toBe(1);
			expect(window.rows[0].employee_id).toBe(emp0);
		});

		it("should sort by total amount and by employee name", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp2, 400);

			const byAmount = await EmployeePaymentModel.getPendingPaymentGroups({
				sort: "totalAmount",
				dir: "desc"
			});
			expect(byAmount.rows[0].employee_id).toBe(emp2);

			const byName = await EmployeePaymentModel.getPendingPaymentGroups({
				sort: "employee",
				dir: "asc"
			});
			expect(byName.rows[0].employee_name).toBe("Dr. John Smith");
		});

		it("should paginate grouped rows", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp2, 70);

			const first = await EmployeePaymentModel.getPendingPaymentGroups({
				offset: 0,
				limit: 1
			});
			expect(first.total).toBe(2);
			expect(first.rows.length).toBe(1);

			const second = await EmployeePaymentModel.getPendingPaymentGroups({
				offset: 1,
				limit: 1
			});
			expect(second.total).toBe(2);
			expect(second.rows.length).toBe(1);
			expect(second.rows[0].employee_id).not.toBe(first.rows[0].employee_id);
		});

		it("should aggregate stats with the same filters", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp0, 50);
			await insertPayment(emp2, 70);

			const stats = await EmployeePaymentModel.getPendingPaymentStats();
			expect(stats.pending_count).toBe(3);
			expect(stats.employee_count).toBe(2);

			const filtered = await EmployeePaymentModel.getPendingPaymentStats({
				search: "John"
			});
			expect(filtered.pending_count).toBe(2);
			expect(filtered.employee_count).toBe(1);
		});

		it("should return one employee's pending payments oldest first", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			const paidRow = await insertPayment(emp0, 999, { isPaid: true });
			const voidRow = await insertPayment(emp0, 888, { isVoid: true });
			const older = await insertPayment(emp0, 50, {
				issuedSql: "now() - interval '2 days'"
			});
			const newer = await insertPayment(emp0, 100);
			await insertPayment(emp2, 70);

			const rows =
				await EmployeePaymentModel.getPendingPaymentsForEmployee(emp0);

			expect(rows.length).toBe(2);
			expect(rows[0].payment_id).toBe(older.payment_id);
			expect(rows[1].payment_id).toBe(newer.payment_id);
			expect(
				rows.some(
					(p) =>
						p.payment_id === paidRow.payment_id ||
						p.payment_id === voidRow.payment_id
				)
			).toBeFalse();
		});

		it("should mark every pending payment of one employee paid", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			const emp2 = insertedData.employees[2].employee_id;
			const userId = insertedData.users[0].user_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp0, 50);
			await insertPayment(emp2, 70);

			const updated =
				await EmployeePaymentModel.markPendingPaymentsPaidForEmployee(
					emp0,
					userId
				);
			expect(updated).toBe(2);

			const stats = await EmployeePaymentModel.getPendingPaymentStats();
			expect(stats.pending_count).toBe(1);
			expect(stats.employee_count).toBe(1);

			const rows =
				await EmployeePaymentModel.getPaymentsByEmployeeId(emp0);
			const pending = rows.filter(
				(p) => !p.is_paid && !p.is_void && p.paid_by_user_id == null
			);
			expect(pending.length).toBe(0);
		});

		it("should void every pending payment of one employee", async () => {
			const emp0 = insertedData.employees[0].employee_id;
			await insertPayment(emp0, 100);
			await insertPayment(emp0, 50);

			const updated =
				await EmployeePaymentModel.voidPendingPaymentsForEmployee(emp0);
			expect(updated).toBe(2);

			const { total } =
				await EmployeePaymentModel.getPendingPaymentGroups();
			expect(total).toBe(0);
		});
	});
});
