import { api } from "@/lib/api"
import type {
  CreateDoctorPayload,
  CreateEmployeePayload,
  CreatePaymentPayload,
  Doctor,
  DoctorServicePrice,
  Employee,
  EmployeePayment,
} from "@/pages/Employees/types/employee"
import type { Service } from "@/pages/_shared/services/types"

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

/** All employees (nurses + others; the flat list has no doctor-table
 *  fields — use `listDoctors` for the Doctors tab). */
export function listEmployees() {
  return api.get<Employee[]>("/employees")
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

export function listDoctors() {
  return api.get<Doctor[]>("/doctors")
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

/** ALL payments in one request (Phase 6.7 — replaces the legacy N+1
 *  per-employee fan-out). Grouping/filtering happens client-side. */
export function listAllPayments() {
  return api.get<EmployeePayment[]>("/employee-payments")
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
  return api.get<Service[]>("/services")
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
 * bad id can't blank the whole column. Hook-level caching lives in
 * `useEmployeePayments`.
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
  return {
    ...payload,
    basePay: payload.dailyPay,
    extraPaymentType: payload.paymentCalculation,
  }
}
