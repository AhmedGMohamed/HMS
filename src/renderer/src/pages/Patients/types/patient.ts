/**
 * Patients module — domain types.
 *
 * Wire-shape types. The boundary `lib/api.ts:request` runs `toCamel`
 * on every response so every field here is camelCase even though
 * the server emits snake_case. Field names match the actual SQL
 * columns/aliases that Express returns — no invented joins, no
 * nested nesting the backend doesn't produce.
 *
 * The legacy `patients.html` + `patients.ts` assumed joined objects
 * for `Service` / `DrugCard` / `MedicalSupply` and used properties
 * like `unitCost` / `totalCost` / `shipmentId` that the live
 * server doesn't emit on the assigned endpoints. T5 reworks the
 * renderer around the actual fields with no adapter layer — every
 * property below is the wire key, post-toCamel.
 *
 * Sections:
 *   1. Enums
 *   2. Patient
 *   3. Admission lifecycle
 *   4. Bill
 *   5. Bill line items — services / drugs / supplies
 *   6. Lookups
 *   7. Staff status panel
 *   8. Detail payload (T7)
 *   9. Bill calculation snapshot
 */

/* ----------------------------------------------------------------
   1. Enums
   ---------------------------------------------------------------- */

export type PaymentType = "cash" | "credit" | "insurance";

export type LeaveReason =
  | "improvement"
  | "death"
  | "transfer"
  | "as_desired";

export type DismissalReason = LeaveReason;

export type Gender = "male" | "female" | "other";

/** Wire type for `Service.service_type` is a free-floating string. */
export type ServiceType = "once" | "hourly" | "daily" | (string & {});

export type EmployeeType = "doctor" | "nurse" | "other";

/* ----------------------------------------------------------------
   2. Patient
   ---------------------------------------------------------------- */

export interface PatientInsurance {
  insuranceId: number | null;
  insuranceCardId: string | null;
  insuranceFormId: string | null;
  /** Default price list used when insurance is the payment method. */
  pricelistId: number | null;
  pricelistName: string | null;
}

export interface PatientGuardian {
  name: string | null;
  phone: string | null;
  nationalId: string | null;
  address: string | null;
}

export interface Patient {
  patientId: number;
  name: string;
  nationalId: string | null;
  gender: Gender | "";
  phone: string | null;
  address: string | null;
  paymentType: PaymentType;
  /** Flattened insurance columns populated by the controller's
   *  LEFT JOIN. `insurance` is duplicated for legacy compat and
   *  drives the Edit-dialog form. */
  insurance: PatientInsurance;
  insuranceCompanyName: string | null;
  /** Guardian columns — server stores inside the JSONB `guardian_info`
   *  column; `toCamel` recurses so the renderer sees a nested object.
   *  When the JSONB is NULL the keys are still present with nulls. */
  guardianInfo: PatientGuardian | null;
  /** DELETED — `PatientProfilePanel` historically read flat
   *  `guardianName` etc. forwarders in case the wire dropped the
   *  JSONB null. The server always returns nested `guardianInfo`,
   *  so these forwarders are gone. Kept references use `guardianInfo`. */
  guardianName: string | null;
  guardianPhone: string | null;
  guardianNationalId: string | null;
  guardianAddress: string | null;
  referringDoctorId: number | null;
  referringDoctorName: string | null;
  pricelistId: number | null;
  isActive: boolean;
  registrationDate: string;
  /** Set when the patient was created via the Quick-Check pathway. */
  isQuickCheck: boolean;
}

/* ----------------------------------------------------------------
   3. Admission lifecycle
   ---------------------------------------------------------------- */

export interface PatientHistory {
  patientHistoryId: number;
  patientId: number;
  billId: number;
  admissionTime: string;
  dischargeTime: string | null;
  leaveReason: LeaveReason | null;
  quickCheck: string | null;
  diagnosis: string | null;
  pricelistId: number | null;
  pricelistName: string | null;
  attendingDoctorIds: number[] | null;
  attendingNurseIds: number[] | null;
  /**Current admission rows */
  attendingDoctors?: string[] | null;
  attendingNurses?: string[] | null;
  /** Joined names — only on `/api/patients/:id/admissions/:hId/details`. */
  assignedDoctors: AssignedStaff[] | null;
  assignedNurses: AssignedStaff[] | null;
}

export interface AssignedStaff {
  doctorId?: number;
  nurseId?: number;
  employeeId: number;
  name: string;
  employeeType: EmployeeType;
}

/* ----------------------------------------------------------------
   4. Bill
   ---------------------------------------------------------------- */

export interface Bill {
  billId: number;
  billDetails: BillDetail[];
  patientHistoryId: number;
  totalAmount: number;
  paidAmount: number;
  discountType: "percentage" | "fixed";
  discount: number;
  discountScope: DiscountScope;
  administrativeExpenses: number;
  medicalTestsAmount: number;
  vatPercentage: number;
  vatScope: VatScope;
  /** `Bill.vat_scope_custom` (JSONB array) drives the multi-scope UI. */
  vatScopeCustom: VatScope;
  paidAt: string | null;
}

export interface BillDetail {
  billDetailId: number;
  chargeType: "service" | "drug" | "supply";
  drugName: string | null;
  drugShipmentId: number | null;
  generatedAt: string;
  medicalSupplyName: string | null;
  medicalSupplyShipmentId: number | null;
  quantity: number;
  saleType: "admitted" | "outside" | "check";
  serviceId: number | null;
  serviceName: string | null;
  unitPrice: number;
}

export interface DiscountScope {
  onServices: boolean;
  onDrugs: boolean;
  onSupplies: boolean;
  onTests: boolean;
}

export type VatScope = DiscountScope;

/* ----------------------------------------------------------------
   5. Bill line items — services / drugs / supplies
   ---------------------------------------------------------------- */

/** `unit_conversion` SQL emits `{ratio, larger, smaller}` — flat keys. */
export interface UnitConversion {
  larger: string;
  smaller: string;
  ratio: number;
}

/**
 * `/api/services` envelope. The server joins `Service` with its
 * `prices[]` (ServicePrice) and `drugs[]` (ServiceDrug joined with
 * `DrugCard` for `drug_name`). After toCamel: pricing structures are
 * flat arrays on the row.
 */
export interface Service {
  serviceId: number;
  name: string;
  serviceType: ServiceType;
  /** Server `auto_renew` → boolean. */
  autoRenew: boolean;
  /** Server `auto_add_on_admission` → boolean. */
  autoAddOnAdmission: boolean;
  prices: ServicePriceEntry[];
  drugs: ServiceDrugWithName[] | null;
}

export interface ServicePriceEntry {
  pricelistId: number;
  price: number;
  requiresPrepayment: boolean;
  prepaymentType: string | null;
  prepaymentAmount: number | null;
}

export interface ServiceDrugWithName {
  /** ServiceDrug.service_id */
  serviceId: number;
  /** ServiceDrug.drug_id */
  drugId: number;
  /** DrugCard.name join */
  name: string;
}

/**
 * `/api/patients/:id/admissions/current/services` envelope. The
 * `ActivePatientService` core fields plus the joined `Service.name`
 * and `Service.service_type` (aliased flat). No nested `Service`
 * object — wire confirms there isn't one.
 */
export interface ActivePatientService {
  activeServiceId: number;
  patientId: number;
  serviceId: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastRenewed: string | null;
  patientHistoryId: number;
  /** `Service.name` join — flat. */
  name: string;
  /** `Service.service_type` join — flat. */
  serviceType: ServiceType;
}

/**
 * `/api/pharmacy/drugs/cards` paginated envelope element. The server
 * SELECTs `*` from `DrugCard`; its `unit_conversion` JSONB column is
 * returned as a nested object (after toCamel: `larger`/`smaller`).
 */
export interface DrugCard {
  drugId: number;
  name: string;
  manufacturer: string | null;
  provider: string | null;
  isObligatoryContinuous: boolean;
  saleQuantity: number;
  frequency: string | null;
  minStockAlert: number | null;
  maxDaysExpiryAlert: number | null;
  unitConversion: UnitConversion;
  createdByUserId: number;
}

/**
 * `/api/pharmacy/drugs/shipments/drug/:drugId` envelope — wire emits
 * `ds.*` plus drug_name, warehouse_name, unit_conversion,
 * quantity_in_larger_unit, prices[].
 */
export interface DrugShipment {
  shipmentId: number;
  drugId: number;
  warehouseId: number;
  /** `DrugShipment.quantity` (current stock) */
  quantity: number;
  /** `DrugShipment.unit_cost` — not selected in this query, will be
   *  added back via the prices[] join if needed. */
  unitCost: number | null;
  expiryDate: string | null;
  drugName: string;
  warehouseName: string;
  /** Flattened from `DrugCard.unit_conversion` JSONB. */
  unitConversion: UnitConversion;
  /** Server-computed: `quantity / ratio` (cast to int). */
  quantityInLargerUnit: number;
  /** Server-aggregated prices: `Select DISTINCT pricelist_id, price,
   *  requires_prepayment, prepayment_type, prepayment_amount` plus
   *  joined `pricelist.name`. */
  prices: DrugShipmentPrice[];
}

export interface DrugShipmentPrice {
  pricelistId: number;
  price: number;
  requiresPrepayment: boolean;
  prepaymentType: string | null;
  prepaymentAmount: number | null;
}

/**
 * `/api/patients/:id/admissions/current/drugs` envelope. The server's
 * SELECT: `du.*, dc.name as drug_name, dc.unit_conversion,
 * dt.quantity as initial_quantity, dt.timestamp as start_date`.
 * No `unit_price` / `total_cost` columns are emitted.
 */
export interface DrugUsage {
  /** `DrugUsage.usage_id` — aliased. */
  usageId: number;
  patientId: number;
  drugId: number;
  transactionId: number;
  patientHistoryId: number;
  remainingQuantity: number;
  lastAdministered: string | null;
  /** Flattened from `DrugCard.name`. */
  drugName: string;
  /** Flattened from `DrugCard.unit_conversion` JSONB. */
  unitConversion: UnitConversion;
  /** `DrugTransaction.quantity` join. */
  initialQuantity: number;
  /** `DrugTransaction.timestamp` join. */
  startDate: string | null;
}

/**
 * `/api/pharmacy/medical-supplies` paginated envelope element.
 * SELECT: `* from MedicalSupply`. Wire does not include
 * `unit_conversion` because supplies have none.
 */
export interface MedicalSupply {
  supplyId: number;
  name: string;
  manufacturer: string | null;
  provider: string | null;
  isObligatoryContinuous: boolean;
  saleQuantity: number;
  frequency: string | null;
  minStockAlert: number;
  createdByUserId: number;
}

/**
 * `/api/pharmacy/medical-supply-usages/available-shipments/:supplyId`
 * envelope. Wire returns `shipment_id, warehouse_name, quantity,
 * buy_price, prices[], expiry_date`.
 */
export interface MedicalSupplyShipment {
  shipmentId: number;
  warehouseName: string;
  quantity: number;
  /** Server `MedicalSupplyShipment.buy_price`. */
  buyPrice: number;
  expiryDate: string | null;
  prices: MedicalSupplyShipmentPrice[];
}

export interface MedicalSupplyShipmentPrice {
  pricelistName: string;
  pricelistId: number;
  price: number;
  requiresPrepayment: boolean;
  prepaymentType: string | null;
  prepaymentAmount: number | null;
}

/**
 * `/api/pharmacy/medical-supply-usages/patient-history/:patientId`
 * envelope. Wire emits `usage_id, patient_id, patient_name,
 * supply_id, supply_name, transaction_id, initial_quantity,
 * remaining_quantity, start_date, last_administered, is_active`.
 */
export interface MedicalSupplyUsage {
  usageId: number;
  patientId: number;
  patientName: string;
  supplyId: number;
  supplyName: string;
  transactionId: number;
  initialQuantity: number;
  remainingQuantity: number;
  startDate: string | null;
  lastAdministered: string | null;
  /** Server-computed `remaining_quantity > 0`. */
  isActive: boolean;
}

/* ----------------------------------------------------------------
   6. Lookups
   ---------------------------------------------------------------- */

export interface Employee {
  employeeId: number;
  employeeType: "doctor" | "nurse" | "other";
  name: string;
  isActive: boolean;
  isFacilityEmployee: boolean;
  hireDate: string;
  phone: string | null;
}

export interface Doctor extends Employee {
  doctorType?: "attending" | "referring" | "supervising" | (string & {});
  employeeType: "doctor";
}

export interface Nurse extends Employee {
  employeeType: "nurse";
}

export interface InsuranceCompany {
  insuranceId: number;
  name: string;
  contactInfo: string | null;
  pricelistId: number;
  pricelistName: string;
}

export interface PriceList {
  /** `PriceList.pricelist_id` column — post-toCamel stays `pricelistId`
   *  (the source is a single snake-segment "pricelist", not "priceList"). */
  pricelistId: number;
  name: string;
  isDefault: boolean;
}

/* ----------------------------------------------------------------
   7. Staff status panel — clock-in + assignment summary
   ---------------------------------------------------------------- */

export interface ClockedInStaff {
  employeeId: number;
  employeeType: EmployeeType;
  name: string;
  clockInTime: string;
  assignedPatientIds: number[];
  available: boolean;
}

/**
 * T9.2 wire shape for `GET /api/clock-ins/clocked-in`. The
 * `/api/clock-ins/clocked-in` endpoint SELECTs `EmployeeClockIn.*`
 * joined to `Employee.shift_start_time / shift_end_time`. It does
 * *not* include name or employee_type — the renderer joins against
 * `listDoctors()` / `listAvailableNurses()` in
 * `staffStatus/enrichClockedIn.ts` to derive them. The flat row is
 * camelCased by `toCamel` at the api.ts boundary.
 */
export interface ClockedInEmployeeRow {
  clockId: number;
  employeeId: number;
  clockIn: string;
  /** Server emits `null` while still on duty. */
  clockOut: string | null;
  payDeduction: number;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}

/**
 * T9.2 wire shape for `GET /api/patients/admissions/current` (the
 * "with staff" overlay). Server SELECTs flat:
 *   `patient_id, patient_name, patient_history_id, diagnosis,
 *    admission_time, quick_check, attending_doctor_ids, attending_doctors,
 *    doctor_types, attending_nurse_ids, attending_nurses`.
 * Note `attending_doctors`/`attending_nurses` are parallel arrays of
 * *names* — not nested staff objects. The detail-by-id endpoint is
 * the only one that returns nested `assignedDoctors / assignedNurses`
 * with ids (T7 shape).
 *
 * The previous `PatientAssignment` (with `doctors: ClockedInStaff[]`
 * / `nurseIds: number[]`) was a misread of the wire — only the
 * legacy in-memory shape had nested arrays. Removed in T9.2; the
 * `AssignmentSummary` interface in `enrichClockedIn.ts` is the
 * renderer-shape counterpart.
 */
export interface CurrentAdmissionWithStaffRow {
  patientId: number;
  patientName: string;
  patientHistoryId: number;
  diagnosis: string | null;
  admissionTime: string;
  quickCheck: boolean;
  attendingDoctorIds: number[];
  attendingDoctors: string[];
  doctorTypes: string[];
  attendingNurseIds: number[];
  attendingNurses: string[];
}

/* ----------------------------------------------------------------
   8. Detail payload (T7 — `/admissions/:historyId/details`)
   ---------------------------------------------------------------- */

export interface AdmissionDetails {
  patient: Patient;
  admission: PatientHistory;
  bill: Bill;
  services: ActivePatientService[];
  drugs: DrugUsage[];
  supplies: MedicalSupplyUsage[];
  servicesTotal: number;
  drugsTotal: number;
  suppliesTotal: number;
}

/* ----------------------------------------------------------------
   9. Bill calculation snapshot — derived client-side from `Bill + lines`
   ---------------------------------------------------------------- */

export interface BillingSnapshot {
  servicesTotal: number;
  drugsTotal: number;
  suppliesTotal: number;
  medicalTestsAmount: number;
  discountAmount: number;
  vatAmount: number;
  administrativeExpenses: number;
  totalAfterDiscount: number;
  totalFee: number;
  paidAmount: number;
  balance: number;
  /** Legacy label — positive balance the facility is owed. */
  remainingFacility: number;
  /** Legacy label — negative balance displayed as positive (overpayment). */
  remainingPatient: number;
}
