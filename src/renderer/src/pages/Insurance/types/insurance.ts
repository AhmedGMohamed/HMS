/**
 * Insurance module — domain types (Phase 6.10).
 *
 * Wire shapes. The boundary `lib/api.ts:request` runs `toCamel` on every
 * response, so every field below is camelCase even though Express emits
 * snake_case. Field names match the SQL columns/aliases the insurance
 * controller + model actually return — no invented joins.
 *
 * Sections:
 *   1. Enums
 *   2. Company
 *   3. Patients
 *   4. Statistics
 *   5. Payments
 *   6. Reports (items, summaries)
 *   7. Request payloads
 *   8. Derived report structures (financials, patient groups)
 */

/* ----------------------------------------------------------------
   1. Enums
   ---------------------------------------------------------------- */

export type Gender = "male" | "female" | "other"

/** `BillDetail` category discriminator produced by the report queries. */
export type ItemType = "service" | "drug" | "supply"

/* ----------------------------------------------------------------
   2. Company
   ---------------------------------------------------------------- */

/**
 * List row (`GET /api/insurance-companies`). The endpoint aggregates
 * `patient_count` per company and deliberately omits `contact_info` /
 * `last_cleared_date` — the detail endpoint is the only source for
 * those two fields (see plan §1.2).
 */
export interface InsuranceCompanySummary {
  insuranceId: number
  name: string
  pricelistId: number | null
  pricelistName: string | null
  patientCount: number
}

/** Full row (`GET /api/insurance-companies/:id`). */
export interface InsuranceCompany extends InsuranceCompanySummary {
  contactInfo: string | null
  /** ISO timestamp; the column is `DATE` but pg serializes it as ISO. */
  lastClearedDate: string | null
}

/* ----------------------------------------------------------------
   3. Patients
   ---------------------------------------------------------------- */

export interface CurrentAdmission {
  patientHistoryId: number
  admissionTime: string
  diagnosis: string | null
  billId: number
  totalAmount: number
  paidAmount: number
  medicalTestsAmount: number
  outstandingAmount: number
}

export interface InsurancePatient {
  patientId: number
  name: string
  nationalId: string | null
  gender: Gender | string
  phone: string | null
  insuranceCardId: string | null
  insuranceFormId: string | null
  paymentType: string
  isActive: boolean
  registrationDate: string
  /** Present only while the patient has an open `PatientHistory` row. */
  currentAdmission?: CurrentAdmission
}

/* ----------------------------------------------------------------
   4. Statistics
   ---------------------------------------------------------------- */

/**
 * `GET /api/insurance-companies/:id/statistics`.
 *
 * Financial fields (`totalBilled` / `totalPaid` / `totalOutstanding`)
 * cover charges **after** `lastClearedDate` only — that is why the UI
 * marks them with an asterisk.
 */
export interface InsuranceStatistics {
  totalPatients: number
  activePatients: number
  totalAdmissions: number
  currentAdmissions: number
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  totalInsurancePayments: number
  netOutstanding: number
  /** 0–100. Insurance payments ÷ total billed. */
  paymentCoveragePercentage: number
}

/* ----------------------------------------------------------------
   5. Payments
   ---------------------------------------------------------------- */

export interface InsurancePayment {
  paymentId: number
  insuranceId: number
  /** `NUMERIC` on the wire — normalized to `number` in `api.ts`. */
  paymentAmount: number
  paymentFrom: string
  paymentTo: string
  addedByUserId: number
  issuedTimestamp: string
  addedByUsername?: string | null
}

/* ----------------------------------------------------------------
   6. Reports
   ---------------------------------------------------------------- */

export interface ReportPeriod {
  startDate: string
  endDate: string
}

/**
 * One grouped `BillDetail` line. The report SQL groups by
 * patient/item/unit-price/day, so `quantity` is already summed and
 * `totalCost` is `SUM(quantity * unit_price)`.
 *
 * Bill-level fields (`discount*`, `vat*`, `administrativeExpenses`,
 * `medicalTestsAmount`, `patientPaidAmount`, `patientTotalAmount`) are
 * denormalized onto every item of that bill — the financial engine
 * groups by `billId` and reads them once per bill.
 */
export interface ReportItem {
  patientId: number
  patientName: string
  insuranceCardId: string | null
  insuranceFormId: string | null
  admissionTime: string
  dischargeTime: string | null
  billId: number
  serviceId?: number | null
  serviceName?: string | null
  drugShipmentId?: number | null
  drugName?: string | null
  medicalSupplyShipmentId?: number | null
  medicalSupplyName?: string | null
  itemType: ItemType | string
  quantity: number
  unitPrice: number
  totalCost: number
  serviceDate: string
  saleType?: string | null
  patientPaidAmount: number
  patientTotalAmount: number
  medicalTestsAmount: number
  discount: number
  discountType: string | null
  discountScope: string[] | null
  vatPercentage: number
  vatScopeCustom: string[] | null
  administrativeExpenses: number
}

/** `POST /api/insurance-companies/:id/reports`. */
export interface InsuranceReportSummary {
  insuranceId: number
  insuranceName: string
  reportPeriod: ReportPeriod
  lastClearedDate: string | null
  totalServicesCost: number
  totalDrugsCost: number
  totalSuppliesCost: number
  totalMedicalTestsCost: number
  totalCost: number
  totalPatientPayments: number
  outstandingAmount: number
  patientCount: number
  items: ReportItem[]
  clearedPayments: InsurancePayment[]
}

export interface PatientInfo {
  nationalId: string | null
  gender: string
  phone: string | null
  insuranceCardId: string | null
  insuranceFormId: string | null
  registrationDate: string
}

/**
 * Admission block of a patient report. Unlike `ReportItem`, the bill
 * fields live on the admission (the controller fetches items per
 * admission and enriches them before running the financial engine).
 */
export interface PatientReportAdmission {
  patientHistoryId: number
  admissionTime: string
  dischargeTime: string | null
  diagnosis: string | null
  billId: number
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  medicalTestsAmount: number
  discount: number
  discountType: string | null
  discountScope: string[] | null
  vatPercentage: number
  vatScopeCustom: string[] | null
  administrativeExpenses: number
  items: ReportItem[]
}

/** `POST /api/insurance-companies/:id/patients/:patientId/reports`. */
export interface PatientReportSummary {
  insuranceId: number
  insuranceName: string
  patientId: number
  patientName: string
  patientInfo: PatientInfo
  reportPeriod: ReportPeriod
  lastClearedDate: string | null
  admissions: PatientReportAdmission[]
  totalServicesCost: number
  totalDrugsCost: number
  totalSuppliesCost: number
  totalMedicalTestsCost: number
  totalCost: number
  totalPatientPayments: number
  outstandingAmount: number
  items: ReportItem[]
}

/* ----------------------------------------------------------------
   7. Request payloads (camelCase — `lib/api.ts` snake_cases them)
   ---------------------------------------------------------------- */

export interface CompanyPayload {
  name: string
  contactInfo: string | null
  pricelistId: number | null
}

export interface PaymentPayload {
  paymentAmount: number
  paymentFrom: string
  paymentTo: string
}

export interface ReportPayload {
  startDate: string
  endDate: string
  includeDrugs: boolean
  includeClearedItems: boolean
}

/* ----------------------------------------------------------------
   8. Derived report structures
   ---------------------------------------------------------------- */

/**
 * Ported `BillFinancials` from the legacy `calculateFinancials` —
 * per-bill scoped discount/VAT math identical to `Bill.model.ts`.
 */
export interface BillFinancials {
  grossTotal: number
  discountAmount: number
  vatAmount: number
  adminExpenses: number
  medicalTestsTotal: number
  netTotal: number
}

/**
 * One patient group inside the company report (ported
 * `groupItemsByPatient`). `patientPaid` / `patientTotal` are the
 * **maximum** across the group's bills — legacy parity.
 */
export interface PatientItemGroup {
  items: ReportItem[]
  totalCost: number
  patientPaid: number
  patientTotal: number
  medicalTestsAmount: number
}
