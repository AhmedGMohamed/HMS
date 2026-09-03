import { api } from "@/lib/api"
import type {
  ActivePatient,
  AddDrugToPatientPayload,
  CreateDrugCardPayload,
  CreateShipmentPayload,
  CreateTransactionPayload,
  CreateWarehousePayload,
  DrugCard,
  DrugExpiry,
  DrugShipment,
  DrugStock,
  DrugTransaction,
  DrugUsageResult,
  PriceList,
  TransactionFilters,
  TransactionSummary,
  UpdateDrugCardPayload,
  UpdateShipmentPayload,
  UpdateWarehousePayload,
  Warehouse,
  WarehouseWithStats,
} from "@/pages/Drugs/types/drug"
import { PaginatedResponse } from "@/types";

/* ----------------------------------------------------------------
   Drug cards
   ---------------------------------------------------------------- */

export function listDrugCards(params?: { q?: string; page?: number; pageSize?: number }) {
  return api.get<PaginatedResponse<DrugCard>>("/pharmacy/drugs/cards", {
    q: params?.q || undefined,
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 100,
  })
}

export function getDrugCard(id: number) {
  return api.get<DrugCard>(`/pharmacy/drugs/cards/${id}`)
}

export function createDrugCard(payload: CreateDrugCardPayload) {
  return api.post<DrugCard>("/pharmacy/drugs/cards", payload)
}

export function updateDrugCard(id: number, payload: UpdateDrugCardPayload) {
  return api.put<DrugCard>(`/pharmacy/drugs/cards/${id}`, payload)
}

export function deleteDrugCard(id: number) {
  return api.delete<void>(`/pharmacy/drugs/cards/${id}`)
}

export function getLowStockDrugs() {
  return api.get<DrugStock[]>("/pharmacy/drugs/cards/monitor/low-stock")
}

export function getNearExpiryDrugs() {
  return api.get<DrugExpiry[]>("/pharmacy/drugs/cards/monitor/near-expiry")
}

/* ----------------------------------------------------------------
   Shipments
   ---------------------------------------------------------------- */

export function listDrugShipments(drugId: number) {
  return api.get<DrugShipment[]>(`/pharmacy/drugs/shipments/drug/${drugId}`)
}

export function getShipment(id: number) {
  return api.get<DrugShipment>(`/pharmacy/drugs/shipments/${id}`)
}

export function createShipment(payload: CreateShipmentPayload) {
  return api.post<DrugShipment>("/pharmacy/drugs/shipments", payload)
}

export function updateShipment(id: number, payload: UpdateShipmentPayload) {
  return api.put<DrugShipment>(`/pharmacy/drugs/shipments/${id}`, payload)
}

export function deleteShipment(id: number) {
  return api.delete<void>(`/pharmacy/drugs/shipments/${id}`)
}

export function listShipmentsByWarehouse(warehouseId: number) {
  return api.get<DrugShipment[]>(
    `/pharmacy/drugs/shipments/warehouse/${warehouseId}`
  )
}

/* ----------------------------------------------------------------
   Transactions
   ---------------------------------------------------------------- */

export function createTransaction(payload: CreateTransactionPayload) {
  return api.post<DrugTransaction>("/pharmacy/drugs/transactions", payload)
}

/**
 * Patient-side sell path. Used when `transactionType` is `patient`
 * or `check` — the server writes a `BillDetail` row (sale_type =
 * 'admitted') in addition to the `DrugUsage` row, so the charge
 * appears on the patient's active admission bill. The same shipment
 * stock is decremented server-side.
 *
 * Requires an active admission — the server rejects with "Patient is
 * not currently admitted" if the `patient_history_id` is closed. The
 * picker on the Sell modal therefore only lists currently-admitted
 * patients (`/api/patients/active` is filtered on the backend by an
 * `is_active = true AND discharge_time IS NULL` join).
 */
export function addDrugToPatient(
  patientId: number,
  payload: AddDrugToPatientPayload
) {
  return api.post<DrugUsageResult>(`/patients/${patientId}/drugs`, payload)
}

export function listTransactions(filters?: TransactionFilters) {
  return api.get<DrugTransaction[]>("/pharmacy/drugs/transactions/search/filtered", {
    startDate: filters?.startDate || undefined,
    endDate: filters?.endDate || undefined,
    transactionType: filters?.transactionType || undefined,
    drugId: filters?.drugId,
    warehouseId: filters?.warehouseId,
  })
}

export function getTransactionSummary(filters?: TransactionFilters) {
  return api.get<TransactionSummary>("/pharmacy/drugs/transactions/reports/summary", {
    startDate: filters?.startDate || undefined,
    endDate: filters?.endDate || undefined,
    transactionType: filters?.transactionType || undefined,
    drugId: filters?.drugId,
    warehouseId: filters?.warehouseId,
  })
}

/* ----------------------------------------------------------------
   Warehouses
   ---------------------------------------------------------------- */

export function listWarehouses() {
  return api.get<WarehouseWithStats[]>("/warehouse")
}

export function getWarehouse(id: number) {
  return api.get<WarehouseWithStats>(`/warehouse/${id}`)
}

export function createWarehouse(payload: CreateWarehousePayload) {
  return api.post<{ message: string; warehouse: Warehouse }>("/warehouse", payload)
}

export function updateWarehouse(id: number, payload: UpdateWarehousePayload) {
  return api.put<{ message: string; warehouse: Warehouse }>(`/warehouse/${id}`, payload)
}

export function deleteWarehouse(id: number) {
  return api.delete<{ message: string }>(`/warehouse/${id}`)
}

/* ----------------------------------------------------------------
   Lookups
   ---------------------------------------------------------------- */

export function listPriceLists() {
  return api
    .get<PriceList[] | PaginatedResponse<PriceList>>("/price-lists")
    .then((res) => (Array.isArray(res) ? res : res.data))
}

export function getDefaultPriceList() {
  return api.get<PriceList>("/price-lists/default")
}

export function getActivePatients() {
  return api.get<ActivePatient[]>("/patients/active")
}