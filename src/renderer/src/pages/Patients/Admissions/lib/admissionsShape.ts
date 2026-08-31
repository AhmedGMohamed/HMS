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
  UnitConversion,
  VatScope,
  AdmissionDetails,
  AdmissionServiceRow,
  AdmissionDrugRow,
  AdmissionSupplyRow,
  AdmissionDoctorRow,
  AdmissionNurseRow
} from "@/pages/Patients/types/patient"

import {
  discountScopeFromServer,
  vatScopeFromServer,
} from "@/pages/Patients/lib/billingTransformers"

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
  raw: AdmissionDetails,
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
    assignedDoctors: coerceStaffRows<AdmissionDoctorRow>(
      raw.assignedDoctors,
      "doctor"
    ),
    assignedNurses: coerceStaffRows<AdmissionNurseRow>(
      raw.assignedNurses,
      "nurse"
    ),
  }
}

export function coerceBill(raw: AdmissionDetails): Bill {
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

export interface CoerceServiceRowContext {
  patientId: number
  patientHistoryId: number
  dischargeTime: string | null
}

export function coerceServiceRow(
  raw: AdmissionServiceRow,
  ctx: CoerceServiceRowContext
): AdmissionServiceRow & {patientId: number, patientHistoryId: number} {
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
    endDate: ctx.dischargeTime,
  }
}

export interface CoerceDrugRowContext {
  patientId: number
  patientHistoryId: number
}

export function coerceDrugRow(
  raw: AdmissionDrugRow,
  ctx: CoerceDrugRowContext
): AdmissionDrugRow & { patientId: number, patientHistoryId: number } {
  return {
    billDetailId: raw.billDetailId,
    drugId: raw.drugId,
    patientId: ctx.patientId,
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
  raw: AdmissionSupplyRow,
  ctx: CoerceSupplyRowContext
): AdmissionSupplyRow & { patientId: number, patientHistoryId: number } {
  return {
    billDetailId: raw.billDetailId,
    supplyId: raw.supplyId,
    patientId: ctx.patientId,
    patientHistoryId: ctx.patientHistoryId,
    medicalSupplyName: raw.medicalSupplyName,
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
    const r = row as unknown as AdmissionDoctorRow
    console.log(r)
    return {
      doctorId: r.doctorId,
      employeeId: r.doctorId,
      name: r.doctorName,
      employeeType: "doctor",
    }
  }
  const r = row as unknown as AdmissionNurseRow
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
  raw: AdmissionDetails,
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
    assignedDoctors: coerceStaffRows<AdmissionDoctorRow>(raw.assignedDoctors, "doctor"),
    assignedNurses: coerceStaffRows<AdmissionNurseRow>(raw.assignedNurses, "nurse"),
  }
}