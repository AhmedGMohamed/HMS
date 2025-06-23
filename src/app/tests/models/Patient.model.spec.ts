import { PatientModel } from "../../models/Patient.model.js";
import { CreatePatientDTO } from "../../utils/types/patients.js";
import { TestData, dbHelper } from "../helpers/db.helper.js";

describe("PatientModel", () => {
	let patientModel: PatientModel;
	let insertedData: TestData;

	beforeAll(async () => {
		// Ensure we're in test environment
		expect(process.env.NODE_ENV).toBe("test");
	});

	beforeEach(async () => {
		patientModel = new PatientModel();
		// Clear all patient-related data before each test
		await dbHelper.clearDatabase();
		insertedData = await dbHelper.seedDatabase();
	});

	describe("getAllPatients", () => {
		it("should return all patients", async () => {
			// Act
			const result = await patientModel.getAllPatients();

			// Assert
			expect(result.length).toBe(3);
			expect(result).toContain(insertedData.patients[0]);
			expect(result).toContain(insertedData.patients[1]);
		});

		it("should return empty array when no patients exist", async () => {
			await dbHelper.clearDatabase();
			const result = await patientModel.getAllPatients();
			expect(result.length).toBe(0);
		});
	});

	describe("getPatientById", () => {
		it("should return patient by id", async () => {
			// Arrange
			const seededPatient = insertedData.patients[0];

			// Act
			const result = await patientModel.getPatientById(
				seededPatient.patient_id
			);

			// Assert
			expect(result).not.toBeNull();
			expect(result!.name).toBe("John Patient");
			expect(result!.phone).toBe("1234567890");
		});

		it("should return null for non-existent patient", async () => {
			const result = await patientModel.getPatientById(999999);
			expect(result).toBeNull();
		});
	});

	describe("createPatient", () => {
		it("should create a new patient with minimal data", async () => {
			const patientData: CreatePatientDTO = {
				name: "Test Patient",
				gender: "male" as const,
				payment_type: "cash" as const,
				quick_check: false,
				created_by_user_id: insertedData.users[0].user_id
			};

			const result = await patientModel.createPatient(patientData);

			expect(result.name).toBe("Test Patient");
			expect(result.gender).toBe("male");
			expect(result.payment_type).toBe("cash");
			expect(result.quick_check).toBe(false);
		});

		it("should create a patient with full data", async () => {
			const patientData: CreatePatientDTO = {
				name: "Full Data Patient",
				gender: "female" as const,
				phone: "9876543210",
				address: "456 Test St",
				payment_type: "insurance" as const,
				insurance_id: insertedData.insuranceCompanies[0].insurance_id,
				insurance_card_id: "INS123",
				guardian_info: {
					name: "Guardian Name",
					phone: "5555555555",
					address: "789 Guardian St",
					kinship: "Parent"
				},
				quick_check: false
			};

			const result = await patientModel.createPatient(patientData);

			expect(result.name).toBe("Full Data Patient");
			expect(result.insurance_card_id).toBe("INS123");
			expect(result.guardian_info).toEqual(patientData.guardian_info!);
		});
	});

	describe("searchPatients", () => {
		it("should find patients by exact name match", async () => {
			const result = await patientModel.searchPatients("John Patient");
			expect(result.length).toBe(1);
			expect(result[0].name).toBe("John Patient");
		});

		it("should find patients by partial name match", async () => {
			const result = await patientModel.searchPatients("John");
			expect(result.length).toBe(2);
			expect(result[0].name).toBe("John Patient");
		});

		it("should return empty array for no matches", async () => {
			const result = await patientModel.searchPatients("NonExistent");
			expect(result.length).toBe(0);
		});
	});

	describe("getPatientSuggestions", () => {

		it("should return suggestions starting with prefix", async () => {
			const result = await patientModel.getPatientSuggestions("Jo");
			
			expect(result.length).toBe(1); // Should find John using the prefix "Jo"
			expect(result.some((p) => p.name === "John Patient")).toBeTrue();
		});

		it("should return empty array for no matches", async () => {
			const result = await patientModel.getPatientSuggestions("Xyz");
			expect(result.length).toBe(0);
		});
	});

	// Clean up after all tests
	afterAll(async () => {
		await dbHelper.clearDatabase();
	});
});
