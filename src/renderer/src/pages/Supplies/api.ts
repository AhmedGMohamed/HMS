import { api } from "@/lib/api"
import type {
  ActivePatient,
  CreateMedicalSupplyPayload,
  CreateSupplyShipmentPayload,
  DispenseSupplyPayload,
  MedicalSupply,
  MedicalSupplyShipment,
  MedicalSupplyStock,
  PriceList,
  SupplyUsageFilters,
  SupplyUsageSummaryMetrics,
  UpdateMedicalSupplyPayload,
  UpdateSupplyShipmentPayload,
  WarehouseSupplyInventoryItem,
  MedicalSupplyUsageRow,
} from "@/pages/Supplies/types/supply"
import { PaginatedResponse } from "@/types"

/* ----------------------------------------------------------------
   Medical Supply cards
   ---------------------------------------------------------------- */

export function listSupplies(params?: {
  q?: string
  page?: number
  pageSize?: number
}) {
  return api.get<PaginatedResponse<MedicalSupply>>("/pharmacy/medical-supplies", {
    q: params?.q || undefined,
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 100,
  })
}

export function getSupply(id: number) {
  return api.get<MedicalSupply>(`/pharmacy/medical-supplies/${id}`)
}

export function createSupply(payload: CreateMedicalSupplyPayload) {
  return api.post<MedicalSupply>("/pharmacy/medical-supplies", payload)
}

export function updateSupply(id: number, payload: UpdateMedicalSupplyPayload) {
  return api.put<MedicalSupply>(`/pharmacy/medical-supplies/${id}`, payload)
}

export function deleteSupply(id: number) {
  return api.delete<void>(`/pharmacy/medical-supplies/${id}`)
}

export function getLowStockSupplies() {
  return api.get<MedicalSupplyStock[]>(
    "/pharmacy/medical-supplies/monitor/low-stock"
  )
}

/* ----------------------------------------------------------------
   Supply Shipments
   ---------------------------------------------------------------- */

export function listSupplyShipments(supplyId: number) {
  return api.get<MedicalSupplyShipment[]>(
    `/pharmacy/medical-supply-shipments/supply/${supplyId}`
  )
}

export function listWarehouseSupplyShipments(warehouseId: number) {
  return api.get<WarehouseSupplyInventoryItem[]>(
    `/pharmacy/medical-supply-shipments/warehouse/${warehouseId}`
  )
}

export function createSupplyShipment(payload: CreateSupplyShipmentPayload) {
  return api.post<MedicalSupplyShipment>(
    "/pharmacy/medical-supply-shipments",
    payload
  )
}

export function updateSupplyShipment(
  id: number,
  payload: UpdateSupplyShipmentPayload
) {
  return api.put<MedicalSupplyShipment>(
    `/pharmacy/medical-supply-shipments/${id}`,
    payload
  )
}

export function deleteSupplyShipment(id: number) {
  return api.delete<void>(`/pharmacy/medical-supply-shipments/${id}`)
}

/* ----------------------------------------------------------------
   Inpatient Dispensing & Usage History
   ---------------------------------------------------------------- */

/**
 * Patient-side dispense path. Used by `<DispenseSupplyModal>` to
 * write a `MedicalSupplyUsage` row, a `MedicalSupplyTransaction` row,
 * and a `BillDetail` row in the same transaction (server-side).
 *
 * The endpoint requires an active admission — the renderer fetches
 * the patient from `/api/patients/active` which is filtered to
 * currently-admitted patients on the backend.
 */
export function dispenseSupplyToPatient(
  patientId: number,
  payload: Omit<DispenseSupplyPayload, "patientHistoryId">
) {
  return api.post<{ usageId: number }>(
    `/pharmacy/medical-supply-usages/patient/${patientId}`,
    payload
  )
}

export function listSupplyUsageHistory(filters?: SupplyUsageFilters) {
  // Backend returns a `PaginatedResponse<T>` envelope
  // (`{ data, total, page, pageSize }` — see `src/app/utils/pagination.ts`).
  // Unwrap here so callers receive a flat `MedicalSupplyUsageRow[]`.
  return api
    .get<PaginatedResponse<MedicalSupplyUsageRow>
    >("/pharmacy/medical-supply-usages/history", {
      startDate: filters?.startDate || undefined,
      endDate: filters?.endDate || undefined,
      patientId: filters?.patientId,
      supplyId: filters?.supplyId,
      isActive:
        filters?.isActive === undefined ? undefined : filters.isActive,
      search: filters?.search || undefined,
      limit: filters?.limit,
      offset: filters?.offset,
    })
    .then((res) => (res.data))
}

export function getSupplyUsageSummary() {
  return api.get<SupplyUsageSummaryMetrics>(
    "/pharmacy/medical-supply-usages/summary"
  )
}

/* ----------------------------------------------------------------
   Shared lookups
   ---------------------------------------------------------------- */

export function listPriceLists() {
  return api
    .get<PriceList[] | PaginatedResponse<PriceList>>("/price-lists")
    .then((res) => (Array.isArray(res) ? res : res.data))
}

export function getActivePatients() {
  return api.get<ActivePatient[]>("/patients/active")
}
