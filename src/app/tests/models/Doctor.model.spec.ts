import DoctorModel from "../../models/Doctor.model.js";
import { query } from "../../models/database/connection.js";
import { dbHelper, TestData } from "../helpers/db.helper.js";

/**
 * Doctor list pagination / filtering / sorting.
 *
 * `seedDatabase()` inserts exactly two doctors: "Dr. John Smith"
 * (attending, daily 500, per-patient 100, active) and
 * "Dr. Sarah Johnson" (referring, referral bonus 50, no daily /
 * per-patient pay, active).
 */
describe("DoctorModel", () => {
	let insertedData: TestData;

	beforeAll(() => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllDoctors", () => {
		it("should return a page plus the full total", async () => {
			const { rows, total } = await DoctorModel.getAllDoctors();

			expect(total).toBe(2);
			expect(rows.length).toBe(2);
			expect(rows.some((d) => d.name === "Dr. John Smith")).toBeTrue();
			// The Doctor columns are joined onto the Employee payload.
			const attending = rows.find((d) => d.name === "Dr. John Smith")!;
			expect(attending.doctor_type).toBe("attending");
			expect(attending.payment_calculation).toBe("both");
		});

		it("should return an empty page when no doctors exist", async () => {
			await dbHelper.clearDatabase();

			const { rows, total } = await DoctorModel.getAllDoctors();
			expect(total).toBe(0);
			expect(rows.length).toBe(0);
		});

		it("should paginate with a stable total", async () => {
			const first = await DoctorModel.getAllDoctors({
				offset: 0,
				limit: 1
			});
			expect(first.total).toBe(2);
			expect(first.rows.length).toBe(1);

			const second = await DoctorModel.getAllDoctors({
				offset: 1,
				limit: 1
			});
			expect(second.total).toBe(2);
			expect(second.rows.length).toBe(1);
			expect(second.rows[0].employee_id).not.toBe(
				first.rows[0].employee_id
			);
		});

		it("should filter by search, doctor type, and shift", async () => {
			const byName = await DoctorModel.getAllDoctors({ search: "Sarah" });
			expect(byName.total).toBe(1);
			expect(byName.rows[0].name).toBe("Dr. Sarah Johnson");

			const referring = await DoctorModel.getAllDoctors({
				doctorType: "referring"
			});
			expect(referring.total).toBe(1);
			expect(referring.rows[0].name).toBe("Dr. Sarah Johnson");

			// Seeded doctors carry no shift; give one a shift so the
			// filter has something to match.
			await query(
				"UPDATE Employee SET shift_type = 'morning' WHERE employee_id = $1",
				[insertedData.employees[0].employee_id]
			);
			const byShift = await DoctorModel.getAllDoctors({
				shiftType: "morning"
			});
			expect(byShift.total).toBe(1);
			expect(byShift.rows[0].name).toBe("Dr. John Smith");
		});

		it("should filter by active flag on the doctor row", async () => {
			const active = await DoctorModel.getAllDoctors({ isActive: true });
			expect(active.total).toBe(2);

			const inactive = await DoctorModel.getAllDoctors({
				isActive: false
			});
			expect(inactive.total).toBe(0);
			expect(inactive.rows.length).toBe(0);
		});

		it("should sort by daily pay ascending with NULLS LAST", async () => {
			const { rows } = await DoctorModel.getAllDoctors({
				sort: "dailyPay",
				dir: "asc"
			});

			expect(Number(rows[0].daily_pay)).toBe(500);
			expect(rows[rows.length - 1].daily_pay).toBeNull();
		});

		it("should sort by name descending", async () => {
			const { rows } = await DoctorModel.getAllDoctors({
				sort: "name",
				dir: "desc"
			});

			expect(rows[0].name).toBe("Dr. Sarah Johnson");
			expect(rows[rows.length - 1].name).toBe("Dr. John Smith");
		});
	});
});
