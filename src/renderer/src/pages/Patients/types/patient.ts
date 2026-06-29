/**
 * Patients module — domain types.
 *
 * These mirror the snake_case server responses that flow through the
 * `lib/api.ts` boundary (which camel-cases them via `caseKeys.toCamel`).
 * Every domain property here is **camelCase** — the legacy code's
 * `patient_id` / `national_id` / `payment_type` show up here as
 * `patientId` / `nationalId` / `paymentType`.
 *
 * Sub-shapes are exported individually so pages can import only what
 * they need: detail pages import `Patient`, billing flows import
 * `Bill` / `BillDetail`, etc. The big `*WithInsurance` and
 * `*WithStaff` aliases are reserved for the server's "enriched"
 * rows — every Patient emitted by `/api/patients` already carries
 * `insuranceCompanyName` because the controller joins it.
 *
 * NOTE: the legacy code base uses **column-naming drift** — some
 * endpoints return `attending_doctor_ids` (number[]) while others
 * return `attending_doctors` (object array). Adapters in
 * `adapters/patient.ts` normalize once so feature code only ever
 * sees one shape.
 */

/* ----------------------------------------------------------------
   Enums
   ---------------------------------------------------------------- */

export type PaymentType = "cash" | "credit" | "insurance";
export type LeaveReason =
  | "improvement"
  | "death"
  | "transfer"
  | "as_desired";
export type DismissalReason = LeaveReason;
export type Gender = "male" | "female" | "other";
export type ServiceType =
  | "once"
  | "hourly"
  | "daily";
export type EmployeeType = "doctor" | "nurse" | "other";

/* ----------------------------------------------------------------
   Patient
   ---------------------------------------------------------------- */

export interface PatientInsurance {
  insuranceId: number | null;
  insuranceCardId: string | null;
  insuranceFormId: string | null;
  /** Default price list used when insurance is the payment method. */
  priceListId: number | null;
  priceListName: string | null;
}

export interface Patient {
  patientId: number;
  name: string;
  nationalId: string | null;
  gender: Gender | "";
  phone: string | null;
  address: string | null;
  paymentType: PaymentType;
  /**
   * Flattened insurance columns populated by the controller's
   * `LEFT JOIN InsuranceCompany`. `insuranceCompanyName` is duplicated
   * on its own for the legacy list endpoint; `insurance` carries the
   * structured per-patient fields.
   */
  insurance: PatientInsurance;
  insuranceCompanyName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianNationalId: string | null;
  guardianAddress: string | null;
  referringDoctorId: number | null;
  referringDoctorName: string | null;
  pricelistId: number | null;
  /**
   * Server keeps `is_active` as the admission lens. The legacy code
   * mixes `is_active = "currently admitted"` with `registration_date`,
   * so the front-end renders one "admission status" from this flag.
   */
  isActive: boolean;
  registrationDate: string;
  /** True when patient payload was created via "Quick Check" pathway */
  isQuickCheck: boolean;
}

/* ----------------------------------------------------------------
   Admission lifecycle
   ---------------------------------------------------------------- */

export interface PatientHistory {
  patientHistoryId: number;
  patientId: number;
  admissionTime: string;
  dischargeTime: string | null;
  leaveReason: LeaveReason | null;
  quickCheck: string | null;
  diagnosis: string | null;
  pricelistId: number | null;
  priceListName: string | null;
  attendingDoctorIds: number[];
  attendingNurseIds: number[];
  /** Joined names — only on enriched views (`/{id}/admissions/:hId/details`). */
  assignedDoctors: AssignedStaff[];
  assignedNurses: AssignedStaff[];
}

export interface AssignedStaff {
  doctorId?: number;
  nurseId?: number;
  employeeId: number;
  name: string;
  employeeType: EmployeeType;
}

/* ----------------------------------------------------------------
   Bill
   ---------------------------------------------------------------- */

export interface Bill {
  billId: number;
  patientHistoryId: number;
  totalAmount: number;
  paidAmount: number;
  discountType: "percent" | "fixed";
  discount: number;
  discountScope: DiscountScope;
  administrativeExpenses: number;
  medicalTestsAmount: number;
  vatPercentage: number;
  vatScope: VatScope;
  paidAt: string | null;
}

export interface DiscountScope {
  onServices: boolean;
  onDrugs: boolean;
  onSupplies: boolean;
  onTests: boolean;
}

export interface VatScope {
  onServices: boolean;
  onDrugs: boolean;
  onSupplies: boolean;
  onTests: boolean;
}

/* ----------------------------------------------------------------
   Bill line items — services / drugs / supplies
   ---------------------------------------------------------------- */

export interface Service {
  serviceId: number;
  name: string;
  /**
   * Booleans only on enriched payloads (e.g. `/api/services` returns
   * them; legacy `Service` rows on auto-add endpoints sometimes omit).
   */
  type?: ServiceType;
  autoAddOnAdmission?: boolean;
  autoRenew?: boolean;
  defaultPrice?: number;
}

export interface ActivePatientService {
  activeServiceId: number;
  serviceId: number;
  patientId: number;
  patientHistoryId: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  service?: Service;
  /** Charge types concatenated by legacy (e.g. "Daily,Hourly") — pre-grouped. */
  chargeTypes?: string;
}

export interface DrugCard {
  drugId: number;
  name: string;
  manufacturer: string | null;
  unitConversion?: UnitConversion;
}

export interface UnitConversion {
  largerUnit: string;
  smallerUnit: string;
  ratio: number;
}

export interface DrugShipment {
  shipmentId: number;
  drugId: number;
  quantity: number;
  remainingQuantity: number;
  unitCost: number;
  expiryDate: string | null;
}

export interface DrugUsage {
  drugUsageId: number;
  drugId: number;
  shipmentId: number;
  patientHistoryId: number;
  initialQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  totalCost: number;
  startDate: string | null;
  lastAdministered: string | null;
  drug?: DrugCard;
}

export interface MedicalSupply {
  supplyId: number;
  name: string;
  manufacturer: string | null;
  provider: string | null;
  unitConversion?: UnitConversion;
}

export interface MedicalSupplyShipment {
  shipmentId: number;
  supplyId: number;
  quantity: number;
  remainingQuantity: number;
  unitCost: number;
  expiryDate: string | null;
}

export interface MedicalSupplyUsage {
  supplyUsageId: number;
  supplyId: number;
  shipmentId: number;
  patientHistoryId: number;
  initialQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  totalCost: number;
  startDate: string | null;
  supply?: MedicalSupply;
}

/* ----------------------------------------------------------------
   Lookups
   ---------------------------------------------------------------- */

export interface Doctor {
  doctorId: number;
  name: string;
  doctorType?: "attending" | "referring" | "supervising" | string;
  specialization?: string;
  isAvailable?: boolean;
}

export interface Nurse {
  nurseId: number;
  name: string;
  isAvailable?: boolean;
}

export interface InsuranceCompany {
  insuranceId: number;
  name: string;
  contactInfo: string | null;
  pricelistId: number;
  priceListName: string;
}

export interface PriceList {
  priceListId: number;
  name: string;
  isDefault: boolean;
}

export interface ServicePrice {
  serviceId: number;
  priceListId: number;
  price: number;
}

/* ----------------------------------------------------------------
   Staff status panel — clock-in + assignment summary
   ---------------------------------------------------------------- */

export interface ClockedInStaff {
  employeeId: number;
  employeeType: EmployeeType;
  name: string;
  clockInTime: string;
  /** Patient history ids where this employee is documented as assigned. */
  assignedPatientIds: number[];
  /** Convenience pre-computed by the API → caller may treat as a hint. */
  available: boolean;
}

export interface PatientAssignment {
  patientHistoryId: number;
  patientId: number;
  patientName: string;
  admissionTime: string;
  doctorIds: number[];
  nurseIds: number[];
  doctors: ClockedInStaff[];
  nurses: ClockedInStaff[];
}

/* ----------------------------------------------------------------
   Detail payload (the `/{id}/admissions/:historyId/details` endpoint)
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
   Bill calculation snapshot — derived client-side from `Bill + lines`
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
}
