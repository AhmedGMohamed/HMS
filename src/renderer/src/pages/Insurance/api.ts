import { api } from "@/lib/api"
import type { PaginatedResponse } from "@/types"
import type {
  CompanyPayload,
  InsuranceCompany,
  InsuranceCompanySummary,
  InsurancePatient,
  InsurancePayment,
  InsuranceReportSummary,
  InsuranceStatistics,
  PatientReportSummary,
  PaymentPayload,
  ReportPayload,
} from "@/pages/Insurance/types/insurance"

/**
 * Insurance module API — Phase 6.10.
 *
 * Two response envelopes are in play on this router:
 *   - `GET /insurance-companies` returns the shared `PaginatedResponse`
 *     envelope (`data`/`total`/`page`/`pageSize`) built by `buildPage`.
 *   - Every other endpoint returns `{ success, data, message }`, so the
 *     wrappers below unwrap `.data` and the page never sees the envelope.
 *
 * `lib/api.ts` camelCases responses and snake_cases outgoing bodies, so
 * `paymentAmount` here maps to `payment_amount` on the wire.
 */

interface Envelope<T> {
  success: boolean
  data: T
  message?: string
}

/**
 * `NUMERIC` columns reach the renderer as strings on the payments
 * endpoints (the model does not coerce them — unlike report items).
 * Normalizing here keeps every consumer free of `Number()` calls.
 */
function normalizePayment(payment: InsurancePayment): InsurancePayment {
  return {
    ...payment,
    paymentAmount: Number(payment.paymentAmount) || 0,
  }
}

/* ----------------------------------------------------------------
   Companies
   ---------------------------------------------------------------- */

export interface ListCompaniesParams {
  page: number
  pageSize: number
  /** Server-side name search (`ILIKE %q%`); omit for no filter. */
  q?: string
}

export function listCompanies(params: ListCompaniesParams) {
  return api.get<PaginatedResponse<InsuranceCompanySummary>>(
    "/insurance-companies",
    { page: params.page, pageSize: params.pageSize, q: params.q }
  )
}

export function getCompany(companyId: number) {
  return api
    .get<Envelope<InsuranceCompany>>(`/insurance-companies/${companyId}`)
    .then((res) => res.data)
}

export function createCompany(payload: CompanyPayload) {
  return api
    .post<Envelope<InsuranceCompany>>("/insurance-companies", payload)
    .then((res) => res.data)
}

export function updateCompany(companyId: number, payload: CompanyPayload) {
  return api
    .put<Envelope<InsuranceCompany>>(`/insurance-companies/${companyId}`, payload)
    .then((res) => res.data)
}

/* ----------------------------------------------------------------
   Patients
   ---------------------------------------------------------------- */

export function listCompanyPatients(companyId: number) {
  return api
    .get<Envelope<InsurancePatient[]>>(
      `/insurance-companies/${companyId}/patients`
    )
    .then((res) => res.data ?? [])
}

/* ----------------------------------------------------------------
   Statistics
   ---------------------------------------------------------------- */

export function getCompanyStatistics(companyId: number) {
  return api
    .get<Envelope<InsuranceStatistics>>(
      `/insurance-companies/${companyId}/statistics`
    )
    .then((res) => {
      const stats = res.data
      return {
        totalPatients: Number(stats.totalPatients) || 0,
        activePatients: Number(stats.activePatients) || 0,
        totalAdmissions: Number(stats.totalAdmissions) || 0,
        currentAdmissions: Number(stats.currentAdmissions) || 0,
        totalBilled: Number(stats.totalBilled) || 0,
        totalPaid: Number(stats.totalPaid) || 0,
        totalOutstanding: Number(stats.totalOutstanding) || 0,
        totalInsurancePayments: Number(stats.totalInsurancePayments) || 0,
        netOutstanding: Number(stats.netOutstanding) || 0,
        paymentCoveragePercentage:
          Number(stats.paymentCoveragePercentage) || 0,
      } satisfies InsuranceStatistics
    })
}

/* ----------------------------------------------------------------
   Payments
   ---------------------------------------------------------------- */

export function listCompanyPayments(companyId: number) {
  return api
    .get<Envelope<InsurancePayment[]>>(
      `/insurance-companies/${companyId}/payments`
    )
    .then((res) => (res.data ?? []).map(normalizePayment))
}

export function createPayment(companyId: number, payload: PaymentPayload) {
  return api
    .post<Envelope<InsurancePayment>>(
      `/insurance-companies/${companyId}/payments`,
      payload
    )
    .then((res) => normalizePayment(res.data))
}

/* ----------------------------------------------------------------
   Clear outstanding balance
   ---------------------------------------------------------------- */

export function clearBalance(companyId: number, clearDate: string) {
  return api
    .post<Envelope<InsuranceCompany>>(
      `/insurance-companies/${companyId}/clear-balance`,
      { clearDate }
    )
    .then((res) => res.data)
}

/* ----------------------------------------------------------------
   Reports
   ---------------------------------------------------------------- */

export function generateCompanyReport(
  companyId: number,
  payload: ReportPayload
) {
  return api
    .post<Envelope<InsuranceReportSummary>>(
      `/insurance-companies/${companyId}/reports`,
      payload
    )
    .then((res) => ({
      ...res.data,
      clearedPayments: (res.data.clearedPayments ?? []).map(normalizePayment),
    }))
}

export function generatePatientReport(
  companyId: number,
  patientId: number,
  payload: ReportPayload
) {
  return api
    .post<Envelope<PatientReportSummary>>(
      `/insurance-companies/${companyId}/patients/${patientId}/reports`,
      payload
    )
    .then((res) => res.data)
}
