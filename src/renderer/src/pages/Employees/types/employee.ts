/**
 * Employees module — shared domain types (Phase 6.7).
 *
 * Wire-shape types for `/api/employees`, `/api/doctors`,
 * `/api/employee-payments` and `/api/doctors/:id/services/prices`.
 * The boundary in `lib/api.ts:request` runs `toCamel` on every
 * response, so every field here is camelCase even though the server
 * emits snake_case.
 *
 * ⚠️ Doctor payload mirrors (required by `Doctor.model` — see
 * `phase_6.7-employees.md` §1.1): a doctor create/update must send
 * BOTH `dailyPay` and `basePay` (same value) and BOTH
 * `paymentCalculation` and `extraPaymentType` (same value) because
 * the model writes the Employee row from the base fields and the
 * Doctor row from the doctor-specific ones. This is the wire
 * contract, not a bug — see `buildDoctorPayload` in `api.ts`.
 */

export type EmployeeType = "doctor" | "nurse" | "other"
export type StaffType = Extract<EmployeeType, "nurse" | "other">
export type ExtraPaymentType = "none" | "per_patient" | "income"
export type PerPatientPaymentType = "fixed" | "percentage"
export type PercentageScope = "before_deductions" | "after_deductions"
export type ShiftType = "morning" | "night"
export type PaymentCalculation = "fixed" | "per_patient" | "both"
export type DoctorType = "attending" | "supervising" | "referring" | "outside"
export type ManualPaymentType = "manual" | "bonus" | "overtime"

/** `/api/employees` element (nurse or other staff; doctors are a
 *  separate join-backed endpoint because they carry Doctor-table
 *  fields the flat employee list does not include). */
export interface Employee {
  employeeId: number
  name: string
  phone?: string | null
  isFacilityEmployee: boolean
  /** `?? true` normalized at the boundary — column is nullable. */
  isActive: boolean
  hireDate: string
  employeeType: EmployeeType
  basePay?: number | null
  extraAmount?: number | null
  extraPaymentType?: ExtraPaymentType | null
  perPatientPaymentType?: PerPatientPaymentType | null
  percentageScope?: PercentageScope | null
  needClockIn: boolean
  shiftType?: ShiftType | null
  /** `"HH:mm"` time strings. */
  shiftStartTime?: string | null
  shiftEndTime?: string | null
}

/** `/api/doctors` element — Employee row joined with the Doctor row. */
export interface Doctor extends Omit<Employee, "employeeType"> {
  employeeType: "doctor"
  doctorType: DoctorType
  dailyPay?: number | null
  perPatientPay?: number | null
  paymentCalculation?: PaymentCalculation | null
  referralBonus?: number | null
}

/** `/api/employee-payments` element. */
export interface EmployeePayment {
  paymentId: number
  employeeId: number
  paymentAmount: number
  extraPaymentType?: ExtraPaymentType | null
  /** Manual types: manual|bonus|overtime. System rows may carry other
   *  labels (service, referral, …) — always rendered via i18n lookup
   *  with a fallback. */
  paymentType: string
  percentageScope?: PercentageScope | null
  extraAmount?: number | null
  isPaid: boolean
  isVoid: boolean
  issuedTimestamp: string
  paidTimestamp?: string | null
  paidByUserId?: number | null
}

/** `/api/doctors/:id/services/prices` element. */
export interface DoctorServicePrice {
  doctorId: number
  serviceId: number
  serviceName: string
  price: number
}

/** One `servicePrices[]` entry on doctor create/update payloads.
 *  `price: null` removes the override (Phase 6.7 backend change). */
export interface DoctorServicePriceEntry {
  serviceId: number
  price: number | null
}

/** POST /api/employees body (nurse/other). */
export interface CreateEmployeePayload {
  name: string
  phone?: string
  isFacilityEmployee: boolean
  hireDate: string
  employeeType: StaffType
  isActive?: boolean
  basePay?: number
  extraAmount?: number
  extraPaymentType?: ExtraPaymentType
  perPatientPaymentType?: PerPatientPaymentType
  percentageScope?: PercentageScope
  needClockIn: boolean
  shiftType?: ShiftType
  shiftStartTime?: string
  shiftEndTime?: string
}

/** POST/PUT /api/doctors body. The `basePay`/`extraPaymentType`
 *  mirrors are added by `buildDoctorPayload`. */
export interface CreateDoctorPayload
  extends Omit<CreateEmployeePayload, "employeeType"> {
  employeeType: "doctor"
  doctorType: DoctorType
  dailyPay?: number
  perPatientPay?: number
  paymentCalculation?: PaymentCalculation
  referralBonus?: number
  servicePrices?: DoctorServicePriceEntry[]
}

/** POST /api/employee-payments body. */
export interface CreatePaymentPayload {
  employeeId: number
  paymentAmount: number
  paymentType: ManualPaymentType
  extraPaymentType?: ExtraPaymentType
  extraAmount?: number
  percentageScope?: PercentageScope
}
