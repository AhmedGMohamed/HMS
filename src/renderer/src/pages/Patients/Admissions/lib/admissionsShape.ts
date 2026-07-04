/**
 * CamelCase-only admission details shape coercion.
 *
 * The renderer's `api.request()` middleware runs `toCamel()` server-side
 * before data reaches this layer. As such, every interface in this file
 * reads **camelCase keys only** — never snake_case.
 *
 * Helpers here map the flat, top-level `getAdmissionDetails` payload
 * into the typed renderer domain shapes (`PatientHistory`, `Bill`,
 * `ActivePatientService`, `DrugUsage`, `MedicalSupplyUsage`,
 * `AssignedStaff`). The input types below describe the exact form of
 * the payload once it has been camelCased; the output types are the
 * canonical renderer-side domain models, unchanged from T1.
 */

import type {
  ActivePatientService,
  AssignedStaff,
  Bill,
  DiscountScope,
  DrugCard,
  DrugUsage,
  LeaveReason,
  MedicalSupply,
  MedicalSupplyUsage,
  PatientHistory,
  Service,
  ServiceType,
  UnitConversion,
  VatScope,
} from "@/pages/Patients/types/patient"

import {
  discountScopeFromServer,
  vatScopeFromServer,
} from "@/pages/Patients/Billing/lib/billingTransformers"

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
        typeof parsed.largerUnit === "string" &&
        typeof parsed.smallerUnit === "string"
      ) {
        return {
          largerUnit: parsed.largerUnit,
          smallerUnit: parsed.smallerUnit,
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
      raw.discountType === "percentage" ? "percent" : "fixed",
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
 * ---------------------------------------------------------------- */

export interface CoerceServiceRowContext {
  patientId: number
  patientHistoryId: number
  dischargeTime: string | null
}

export function coerceServiceRow(
  raw: ServiceRowRaw,
  ctx: CoerceServiceRowContext
): ActivePatientService {
  const service: Service = {
    serviceId: raw.serviceId,
    name: raw.serviceName,
    serviceType: raw.serviceType,
    prices: [],
    drugs: null,
  }
  return {
    activeServiceId: raw.billDetailId,
    serviceId: raw.serviceId,
    patientId: ctx.patientId,
    patientHistoryId: ctx.patientHistoryId,
    startDate: raw.generatedAt,
    endDate: ctx.dischargeTime,
    isActive: false,
    quantity: parseDec(raw.quantity),
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    service,
    chargeTypes: raw.serviceType ? String(raw.serviceType) : undefined,
  }
}

export interface CoerceDrugRowContext {
  patientId: number
  patientHistoryId: number
}

export function coerceDrugRow(
  raw: DrugRowRaw,
  ctx: CoerceDrugRowContext
): DrugUsage {
  const drug: DrugCard = {
    drugId: raw.drugId,
    name: raw.drugName,
    manufacturer: raw.manufacturer,
    unitConversion: parseUnitConversion(raw.unitConversion),
  }
  const quantity = parseDec(raw.quantity)
  return {
    drugUsageId: raw.billDetailId,
    drugId: raw.drugId,
    shipmentId: raw.drugShipmentId,
    patientHistoryId: ctx.patientHistoryId,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    startDate: raw.generatedAt,
    lastAdministered: raw.generatedAt,
    drug,
  }
}

export interface CoerceSupplyRowContext {
  patientId: number
  patientHistoryId: number
}

export function coerceSupplyRow(
  raw: SupplyRowRaw,
  ctx: CoerceSupplyRowContext
): MedicalSupplyUsage {
  const supply: MedicalSupply = {
    supplyId: raw.supplyId,
    name: raw.medicalSupplyName,
    manufacturer: raw.manufacturer,
    provider: null,
  }
  const quantity = parseDec(raw.quantity)
  return {
    supplyUsageId: raw.billDetailId,
    supplyId: raw.supplyId,
    shipmentId: raw.medicalSupplyShipmentId,
    patientHistoryId: ctx.patientHistoryId,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitPrice: parseDec(raw.unitPrice),
    totalCost: parseDec(raw.totalCost),
    startDate: raw.generatedAt,
    supply,
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
  services: ActivePatientService[]
  drugs: DrugUsage[]
  supplies: MedicalSupplyUsage[]
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