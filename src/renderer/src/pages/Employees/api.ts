import { api } from "@/lib/api"
import type {
  CreateDoctorPayload,
  CreateEmployeePayload,
  CreatePaymentPayload,
  Doctor,
  DoctorServicePrice,
  Employee,
  EmployeePayment,
  EmployeeType,
  ShiftType,
} from "@/pages/Employees/types/employee"
import type { Service } from "@/pages/_shared/services/types"
import type { PaginatedResponse } from "@/types"

/**
 * Employees module API (Phase 6.7).
 *
 * `lib/api.ts` camelCases responses and snake_cases outgoing bodies
 * automatically. Wire-shape notes live in
 * `pages/Employees/types/employee.ts` (§header) — most importantly the
 * doctor payload mirrors (`basePay` ↔ `dailyPay`,
 * `extraPaymentType` ↔ `paymentCalculation`), which are applied by
 * `buildDoctorPayload` below so no call site can forget them.
 */

/* ---------------------------------- Staff --------------------------------- */

export type EmployeeSortKey = "name" | "hireDate" | "basePay" | "shiftType"

export interface EmployeeListParams {
  page?: number
  pageSize?: number
  type?: EmployeeType | "all"
  search?: string
  isActive?: boolean
  shiftType?: ShiftType | ""
  sort?: EmployeeSortKey
  dir?: "asc" | "desc"
}

/**
 * Paginated `/api/employees` list — the Employees / Nurses tabs.
 *
 * The server always answers with the shared `{ data, total, page,
 * pageSize }` envelope and applies every filter + the sort itself;
 * `type: "all"` is omitted on the wire so the server falls back to its
 * unfiltered branch.
 */
export function listEmployeesPage(params: EmployeeListParams = {}) {
  return api.get<PaginatedResponse<Employee>>("/employees", {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    type: params.type && params.type !== "all" ? params.type : undefined,
    search: params.search?.trim() || undefined,
    isActive: params.isActive,
    shiftType: params.shiftType || undefined,
    sort: params.sort,
    dir: params.dir,
  })
}

export function createEmployee(payload: CreateEmployeePayload) {
  return api.post<Employee>("/employees", payload)
}

export function updateEmployee(id: number, payload: Partial<CreateEmployeePayload>) {
  return api.put<Employee>(`/employees/${id}`, payload)
}

export function deleteEmployee(id: number) {
  return api.delete<void>(`/employees/${id}`)
}

export type DoctorSortKey =
  | "name"
  | "doctorType"
  | "hireDate"
  | "dailyPay"
  | "perPatientPay"
  | "shiftType"

export interface DoctorListParams {
  page?: number
  pageSize?: number
  search?: string
  isActive?: boolean
  shiftType?: ShiftType | ""
  doctorType?: string
  sort?: DoctorSortKey
  dir?: "asc" | "desc"
}

/** Paginated `/api/doctors` list — the Doctors tab (same envelope). */
export function listDoctorsPage(params: DoctorListParams = {}) {
  return api.get<PaginatedResponse<Doctor>>("/doctors", {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    search: params.search?.trim() || undefined,
    isActive: params.isActive,
    shiftType: params.shiftType || undefined,
    doctorType: params.doctorType || undefined,
    sort: params.sort,
    dir: params.dir,
  })
}

/** Unbounded doctor lookup (`?all=true`) for the patient-side pickers. */
export function listAllDoctors() {
  return api
    .get<PaginatedResponse<Doctor>>("/doctors", { all: true })
    .then((res) => res.data)
}

export function createDoctor(payload: CreateDoctorPayload) {
  return api.post<Doctor>("/doctors", payload)
}

export function updateDoctor(id: number, payload: Partial<CreateDoctorPayload>) {
  return api.put<Doctor>(`/doctors/${id}`, payload)
}

export function deleteDoctor(id: number) {
  return api.delete<void>(`/doctors/${id}`)
}

/** Existing per-service price overrides for one doctor (modal pre-fill). */
export function listDoctorServicePrices(doctorId: number) {
  return api.get<DoctorServicePrice[]>(`/doctors/${doctorId}/services/prices`)
}

/* --------------------------------- Payments -------------------------------- */

export interface PendingPaymentFilters {
  /** ISO `yyyy-mm-dd`, inclusive. */
  from?: string
  /** ISO `yyyy-mm-dd`, inclusive. */
  to?: string
  /** Employee-name search. */
  search?: string
}

export type PendingGroupSortKey = "employee" | "oldest" | "newest" | "totalAmount"

export interface PendingGroupListParams extends PendingPaymentFilters {
  page?: number
  pageSize?: number
  sort?: PendingGroupSortKey
  dir?: "asc" | "desc"
}

/**
 * One row of the pending-payments queue: an employee plus the aggregate
 * over their unpaid system payments. The individual payments are NOT
 * embedded — expanding a row fetches them on demand via
 * `listPendingPaymentsForEmployee`.
 */
export interface PendingPaymentGroup {
  employeeId: number
  employeeName: string
  paymentCount: number
  oldestIssuedAt: string
  newestIssuedAt: string
  totalAmount: number
}

export interface PendingPaymentStats {
  pendingCount: number
  employeeCount: number
}

/** Paginated grouped pending-payments queue (one row per employee). */
export function listPendingPaymentGroups(params: PendingGroupListParams = {}) {
  return api.get<PaginatedResponse<PendingPaymentGroup>>(
    "/employee-payments/pending",
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      from: params.from || undefined,
      to: params.to || undefined,
      search: params.search?.trim() || undefined,
      sort: params.sort,
      dir: params.dir,
    }
  )
}

/** KPI figures for the whole (filtered) queue, not just the current page. */
export function listPendingPaymentStats(filters: PendingPaymentFilters = {}) {
  return api.get<PendingPaymentStats>("/employee-payments/pending/stats", {
    from: filters.from || undefined,
    to: filters.to || undefined,
    search: filters.search?.trim() || undefined,
  })
}

/** One employee's pending payments (expanded row) — oldest first. */
export function listPendingPaymentsForEmployee(
  employeeId: number,
  filters: PendingPaymentFilters = {}
) {
  return api.get<EmployeePayment[]>(
    `/employee-payments/pending/employee/${employeeId}`,
    {
      from: filters.from || undefined,
      to: filters.to || undefined,
    }
  )
}

/** Bulk-settle every pending payment of one employee. */
export function markPendingPaymentsPaid(employeeId: number) {
  return api.put<{ updated: number }>(
    `/employee-payments/pending/employee/${employeeId}/paid`
  )
}

/** Bulk-void every pending payment of one employee. */
export function voidPendingPayments(employeeId: number) {
  return api.put<{ updated: number }>(
    `/employee-payments/pending/employee/${employeeId}/void`
  )
}

/** All payments (pending, paid and voided) of one employee, newest first. */
export function listPaymentsByEmployee(employeeId: number) {
  return api.get<EmployeePayment[]>(`/employee-payments/employee/${employeeId}`)
}

export function createPayment(payload: CreatePaymentPayload) {
  return api.post<EmployeePayment>("/employee-payments", payload)
}

export function markPaymentPaid(id: number) {
  return api.put<EmployeePayment>(`/employee-payments/${id}/paid`)
}

export function voidPayment(id: number) {
  return api.put<EmployeePayment>(`/employee-payments/${id}/void`)
}

/* ------------------------------ Lookups / reuse ---------------------------- */

/** Service list for the doctor service-prices grid — reuses the
 *  Services module's client (do not re-implement). */
export function listServices() {
  return api
    .get<PaginatedResponse<Service>>("/services", { all: true })
    .then((res) => res.data)
}

/** `GET /api/users/name/:id` responds with a bare JSON string. */
export function getUserName(id: number) {
  return api.get<string>(`/users/name/${id}`)
}

/**
 * Resolve `paid_by` usernames for a set of user ids.
 *
 * The backend has no batch endpoint; callers pass the unique ids and
 * this resolves them in parallel. Failures resolve to `null` so one
 * bad id can't blank the whole column. Callers cache the resolved map
 * for the lifetime of their component.
 */
export async function resolveUserNames(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
  const entries = await Promise.all(
    unique.map(async (id): Promise<[number, string | null]> => {
      try {
        return [id, await getUserName(id)]
      } catch {
        return [id, null]
      }
    })
  )
  const map = new Map<number, string>()
  for (const [id, name] of entries) {
    if (name) map.set(id, name)
  }
  return map
}

/* ----------------------------- Payload builders ---------------------------- */

/**
 * Applies the doctor payload mirrors (see type-header note): the
 * Employee row reads `basePay`/`extraPaymentType` while the Doctor row
 * reads `dailyPay`/`paymentCalculation` — both must be present with
 * the same value.
 */
export function buildDoctorPayload(
  payload: Omit<CreateDoctorPayload, "basePay" | "extraPaymentType">
): CreateDoctorPayload {
  const extraPaymentType =
    payload.paymentCalculation === "fixed"
      ? "none"
      : payload.paymentCalculation

  return {
    ...payload,
    basePay: payload.dailyPay,
    extraPaymentType,
  }
}
