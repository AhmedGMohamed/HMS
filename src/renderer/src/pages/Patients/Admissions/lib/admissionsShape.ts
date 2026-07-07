/**
 * CamelCase-only admission details shape coercion.
 *
 * The renderer's `api.request()` middleware runs `toCamel()` server-side
 * before data reaches this layer. As such, every interface in this file
 * reads **camelCase keys only** — never snake_case.
 *
 * Helpers here map the flat, top-level `getAdmissionDetails` payload
 * into typed renderer-domain shapes. Note that this endpoint returns
 * `BillDetail` rows enriched with billing arithmetic (`quantity`,
 * `unitPrice`, `totalCost`) and partial joins — distinct from the
 * Assigned-tab endpoints that return raw `ActivePatientService` /
 * `DrugUsage` / `MedicalSupplyUsage` rows. We model them as their own
 * richer types (`AdmissionServiceRow`, `AdmissionDrugRow`,
 * `AdmissionSupplyRow`) rather than reusing the slimmer assigned-tab
 * shapes.
 *
 * The input types below describe the exact form of the payload once
 * it has been camelCased; the output types are the canonical
 * admission-detail renderer-side domain models.
 */

import type {
  AssignedStaff,
  Bill,
  DiscountScope,
  LeaveReason,
  PatientHistory,
  ServiceType,
  UnitConversion,
  VatScope,
} from "@/pages/Patients/types/patient"

import {
  discountScopeFromServer,
  vatScopeFromServer,
} from "@/pages/Patients/lib/billingTransformers"

/* ----------------------------------------------------------------
 * Input types (post-toCamel server payloads)
 * ---------------------------------------------------------------- */

export interface AdmissionDetailsRaw {
  patientHistoryId: number
  patientId: number
  billId: number | null
  pricelistId: number | string | null
  leaveReason: LeaveReason | string | null
  quickCheck: boolean | null
  diagnosis: string | null
  admissionTime: string
  dischargeTime: string | null

  // Flat top-level bill columns (server joins Bill into this payload)
  totalAmount: number | string | null
  paidAmount: number | string | null
  discountType: string
  discount: number | string | null
  administrativeExpenses: number | string | null
  medicalTestsAmount: number | string | null
  vatPercentage: number | string | null
  vatScope: string
  vatScopeCustom: string[] | null
  discountScope: string[] | null

  // Service rows (flat camelCase)
  services: ServiceRowRaw[]
  // Drug rows
  drugs: DrugRowRaw[]
  // Supply rows
  supplies: SupplyRowRaw[]

  servicesTotal: number | string | null
  drugsTotal: number | string | null
  suppliesTotal: number | string | null

  assignedDoctors: DoctorRowRaw[]
  assignedNurses: NurseRowRaw[]
}

export interface ServiceRowRaw {
  billDetailId: number
  quantity: number | string
  unitPrice: number | string
  chargeType: string
  generatedAt: string
  serviceId: number
  serviceName: string
  serviceType: ServiceType
  totalCost: number | string
}

export interface DrugRowRaw {
  billDetailId: number
  quantity: number | string
  unitPrice: number | string
  chargeType: string
  generatedAt: string
  drugId: number
  drugName: string
  manufacturer: string | null
  unitConversion: UnitConversion | string | null
  expiryDate: string | null
  drugShipmentId: number
  totalCost: number | string
}

export interface SupplyRowRaw {
  billDetailId: number
  quantity: number | string
  unitPrice: number | string
  chargeType: string
  generatedAt: string
  supplyId: number
  medicalSupplyName: string
  manufacturer: string | null
  medicalSupplyShipmentId: number
  totalCost: number | string
}

export interface DoctorRowRaw {
  doctorId: number
  doctorName: string
  doctorType: string
}

export interface NurseRowRaw {
  nurseId: number
  nurseName: string
  employeeType: string
}

/* ----------------------------------------------------------------
 * Coercion helpers — every function takes a camelCase input, every
 * output is the canonical renderer domain type.
 * ---------------------------------------------------------------- */

/**
 * Parse a Postgres DECIMAL/number-shaped value (often `'10.00'`) into a
 * JavaScript `number`. Returns `0` when the value is missing or
 * non-numeric — strict-coercion semantics (Q3).
 */
export function parseDec(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Allow nullable integer columns; distinct from `parseDec` because
 * bill IDs etc. are *not financial* — zero here would be misleading.
 */
export function parseIntOrNull(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function toLeaveReason(value: unknown): LeaveReason | null {
  if (!value || typeof value !== "string") return null
  if (
    value === "improvement" ||
    value === "death" ||
    value === "transfer" ||
    value === "as_desired"
  ) {
    return value as LeaveReason
  }
  return null
}

/**
 * Convert a `unitConversion` field that arrives as either:
 *  - a parsed JSON object `{largerUnit, smallerUnit, ratio}`
 *  - a JSON-encoded string
 *  - `null`
 * Falls through `undefined` for missing/invalid input so renderers
 * can render a dash placeholder without conditional null checks.
 */
export function parseUnitConversion(
  value: UnitConversion | string | null | undefined
): UnitConversion | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (
        parsed &&
        typeof parsed.larger === "string" &&
        typeof parsed.smaller === "string"
      ) {
        return {
          larger: parsed.larger,
          smaller: parsed.smaller,
          ratio:
            typeof parsed.ratio === "number"
              ? parsed.ratio
              : Number(parsed.ratio) || 1,
        }
      }
      return undefined
    } catch {
      return undefined
    }
  }
  return value
}

/* ----------------------------------------------------------------
 * Top-level hydration helpers
 * ---------------------------------------------------------------- */

export interface CoercePatientHistoryContext {
  patientId: number
}

export function coercePatientHistory(
  raw: AdmissionDetailsRaw,
  ctx: CoercePatientHistoryContext
): PatientHistory {
  return {
    patientHistoryId: raw.patientHistoryId,
    patientId: ctx.patientId,
    billId: raw.billId ?? raw.patientHistoryId,
    admissionTime: raw.admissionTime,
    dischargeTime: raw.dischargeTime,
    leaveReason: toLeaveReason(raw.leaveReason),
    quickCheck: raw.quickCheck === null ? null : String(raw.quickCheck),
    diagnosis: raw.diagnosis,
    pricelistId: parseIntOrNull(raw.pricelistId),
    pricelistName: null,
    attendingDoctorIds: null,
    attendingNurseIds: null,
    assignedDoctors: coerceStaffRows<DoctorRowRaw>(
      raw.assignedDoctors,
      "doctor"
    ),
    assignedNurses: coerceStaffRows<NurseRowRaw>(
      raw.assignedNurses,
      "nurse"
    ),
  }
}

export function coerceBill(raw: AdmissionDetailsRaw): Bill {
  const discountScope: DiscountScope = discountScopeFromServer(
    raw.discountScope
  )
  const vatScopeCustom: VatScope = vatScopeFromServer(raw.vatScopeCustom)
  const vatScope: VatScope = vatScopeFromServer(raw.vatScopeCustom)

  // `quickCheck` is boolean false for the sample payload, so we cast null→false
  // to satisfy the string|nullable `Bill.discountType` contract.
  const _disc = discountScope // appease tsc-noUnusedLocals for the placeholder
  void _disc

  return {
    billId: raw.billId ?? raw.patientHistoryId,
    billDetails: [],
    patientHistoryId: raw.patientHistoryId,
    totalAmount: parseDec(raw.totalAmount),
    paidAmount: parseDec(raw.paidAmount),
    discountType:
      raw.discountType === "percentage" ? "percentage" : "fixed",
    discount: parseDec(raw.discount),
    discountScope,
    vatPercentage: parseDec(raw.vatPercentage),
    vatScope,
    vatScopeCustom,
    administrativeExpenses: parseDec(raw.administrativeExpenses),
    medicalTestsAmount: parseDec(raw.medicalTestsAmount),
    paidAt: null,
  }
}

/* ----------------------------------------------------------------
 * Row hydrators
 * ----------------------------------------------------------------
 *
 * The admission-details endpoint returns `BillDetail` rows enriched
 * with billing arithmetic and partial joins — a *richer* shape than
 * the Assigned-tab endpoints' flat `ActivePatientService` /
 * `DrugUsage` / `MedicalSupplyUsage` rows. We model those rows as
 * their own types so the coerce / grouping code stops fighting the
 * assigned-tab types. The line-item consumer (`AdmissionDetailsDialog`)
 * reads only the `.quantity`, `.unitPrice`, `.totalCost` fields
 * surfaced here.
 */

/**
 * Per-admission service row. Mirrors the `ServiceRowRaw` SQL join —
 * the bill-detail columns (id, price breakdown, charge type) plus the
 * minimal `Service` metadata (name, type) the endpoint joins flat.
 */
export interface AdmissionServiceRow {
  /** `BillDetail.bill_detail_id` — the row's primary key. */
  billDetailId: number
  serviceId: number
  patientId: number
  patientHistoryId: number
  serviceName: string
  serviceType: ServiceType
  /** Quantity billed for this row — differs per service-type. */
  quantity: number
  unitPrice: number
  /** `quantity * unitPrice` recomputed client-side (server-emitted). */
  totalCost: number
  /** `BillDetail.generated_at`. */
  generatedAt: string
  chargeType: string
  /** Past admission — always `false`; kept for callers that branch
   *  on "is this row still actively being billed". */
  isActive: false
  /** `PatientHistory.discharge_time` (forwarded via CoerceServiceRowContext). */
  endDate: string | null
}

/**
 * Per-admission drug row. Mirrors `DrugRowRaw` — adds `unitPrice`,
 * `totalCost`, `drugShipmentId`, plus the partial `DrugCard` join
 * (`drug_name`, `manufacturer`, `unit_conversion`, `expiry_date`)
 * the endpoint's SQL selects.
 */
export interface AdmissionDrugRow {
  billDetailId: number
  drugId: number
  patientHistoryId: number
  drugName: string
  manufacturer: string | null
  /** Parsed from the `DrugCard.unit_conversion` JSONB column. May
   *  be `null` when the column was missing/invalid. */
  unitConversion: UnitConversion | null
  expiryDate: string | null
  drugShipmentId: number
  quantity: number
  unitPrice: number
  totalCost: number
  generatedAt: string
  chargeType: string
}

/**
 * Per-admission medical-supply row. Mirrors `SupplyRowRaw` — same
 * shape minus `unitConversion` (supplies have none).
 */
export interface AdmissionSupplyRow {
  billDetailId: number
  supplyId: number
  patientHistoryId: number
  supplyName: string
  manufacturer: string | null
  medicalSupplyShipmentId: number
  quantity: number
  unitPrice: number
  totalCost: number
  generatedAt: string
  chargeType: string
}

export interface CoerceServiceRowContext {
  patientId: number
  patientHistoryId: number
  dischargeTime: string | null
}

export function coerceServiceRow(
  raw: ServiceRowRaw,
  ctx: CoerceServiceRowContext
): AdmissionServiceRow {
  return {
    billDetailId: raw.billDetailId,
    serviceId: raw.serviceId,
    patientId: ctx.patientId,
    patientHistoryId: ctx.patientHistoryId,
    serviceName: raw.serviceName,
    serviceType: raw.serviceType,
    quantity: parseDec(raw.quantity),
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    generatedAt: raw.generatedAt,
    chargeType: raw.chargeType,
    isActive: false,
    endDate: ctx.dischargeTime,
  }
}

export interface CoerceDrugRowContext {
  patientId: number
  patientHistoryId: number
}

export function coerceDrugRow(
  raw: DrugRowRaw,
  ctx: CoerceDrugRowContext
): AdmissionDrugRow {
  return {
    billDetailId: raw.billDetailId,
    drugId: raw.drugId,
    patientHistoryId: ctx.patientHistoryId,
    drugName: raw.drugName,
    manufacturer: raw.manufacturer,
    unitConversion: parseUnitConversion(raw.unitConversion) ?? null,
    expiryDate: raw.expiryDate,
    drugShipmentId: raw.drugShipmentId,
    quantity: parseDec(raw.quantity),
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    generatedAt: raw.generatedAt,
    chargeType: raw.chargeType,
  }
}

export interface CoerceSupplyRowContext {
  patientId: number
  patientHistoryId: number
}

export function coerceSupplyRow(
  raw: SupplyRowRaw,
  ctx: CoerceSupplyRowContext
): AdmissionSupplyRow {
  return {
    billDetailId: raw.billDetailId,
    supplyId: raw.supplyId,
    patientHistoryId: ctx.patientHistoryId,
    supplyName: raw.medicalSupplyName,
    manufacturer: raw.manufacturer,
    medicalSupplyShipmentId: raw.medicalSupplyShipmentId,
    quantity: parseDec(raw.quantity),
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    generatedAt: raw.generatedAt,
    chargeType: raw.chargeType,
  }
}

/* ----------------------------------------------------------------
 * Staff row hydrator
 * ---------------------------------------------------------------- */

export function coerceStaffRows<TRaw extends { doctorId?: number; nurseId?: number }>(
  rows: ReadonlyArray<TRaw>,
  role: "doctor" | "nurse"
): AssignedStaff[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => coerceStaffRow(row, role))
}

export function coerceStaffRow<
  TRaw extends { doctorId?: number; nurseId?: number },
>(
  row: TRaw,
  role: "doctor" | "nurse"
): AssignedStaff {
  if (role === "doctor") {
    const r = row as unknown as DoctorRowRaw
    return {
      doctorId: r.doctorId,
      employeeId: r.doctorId,
      name: r.doctorName,
      employeeType: "doctor",
    }
  }
  const r = row as unknown as NurseRowRaw
  return {
    nurseId: r.nurseId,
    employeeId: r.nurseId,
    name: r.nurseName,
    employeeType: "nurse",
  }
}

/* ----------------------------------------------------------------
 * Top-level facade — given raw + patientId, build hydrated shapes
 * ---------------------------------------------------------------- */

export interface HydratedAdmissionDetails {
  admission: PatientHistory
  bill: Bill
  services: AdmissionServiceRow[]
  drugs: AdmissionDrugRow[]
  supplies: AdmissionSupplyRow[]
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
  assignedDoctors: AssignedStaff[]
  assignedNurses: AssignedStaff[]
}

export function hydrateAdmissionDetails(
  raw: AdmissionDetailsRaw,
  patientId: number
): HydratedAdmissionDetails {
  const patientHistoryId = raw.patientHistoryId
  const dischargeTime = raw.dischargeTime ?? null

  return {
    admission: coercePatientHistory(raw, { patientId }),
    bill: coerceBill(raw),
    services: raw.services.map((s) =>
      coerceServiceRow(s, { patientId, patientHistoryId, dischargeTime })
    ),
    drugs: raw.drugs.map((d) =>
      coerceDrugRow(d, { patientId, patientHistoryId })
    ),
    supplies: raw.supplies.map((s) =>
      coerceSupplyRow(s, { patientId, patientHistoryId })
    ),
    servicesTotal: parseDec(raw.servicesTotal),
    drugsTotal: parseDec(raw.drugsTotal),
    suppliesTotal: parseDec(raw.suppliesTotal),
    assignedDoctors: coerceStaffRows<DoctorRowRaw>(raw.assignedDoctors, "doctor"),
    assignedNurses: coerceStaffRows<NurseRowRaw>(raw.assignedNurses, "nurse"),
  }
}