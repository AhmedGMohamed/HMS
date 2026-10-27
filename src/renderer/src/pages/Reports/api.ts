/**
 * Reports v2 data layer — Phase 6.11.
 *
 * Every call targets the additive `/api/reports/v2/*` namespace; the legacy
 * `/api/reports/*` endpoints are untouched and keep serving the legacy HTML
 * page until Phase 7.
 *
 * Conventions:
 *   - Query params are snake_case (Express reads `req.query.start_date`);
 *     bodies/responses are camelCased by `lib/api`.
 *   - Money fields are already `number` server-side (the models coerce
 *     Postgres `NUMERIC` strings), so no normalizer is needed here.
 *   - `all` is never sent: the server treats an absent filter as "no filter",
 *     which keeps the cache key for "all payment types" identical to a plain
 *     report.
 */

import { api } from "@/lib/api"
import type {
  PatientQueryFilters,
  PatientQueryPaging,
  PatientReportDetail,
  PatientReportExportPayload,
  PatientReportListPayload,
  PatientSortColumn,
} from "@/pages/Reports/types/patientReport"
import { PATIENT_SORT_COLUMNS, isPatientSortColumn } from "@/pages/Reports/types/patientReport"
import type { ReportOptions } from "@/pages/Reports/types/reports"

/** `GET /api/reports/v2/options` — all picker lists in one round trip. */
export function getReportOptions(): Promise<ReportOptions> {
  return api.get<ReportOptions>("/reports/v2/options")
}

/* ------------------------------------------------------------------ */
/* Patient report                                                      */
/* ------------------------------------------------------------------ */

/** Shared filter → query mapping for the list and export endpoints. */
function patientParams(filters: PatientQueryFilters) {
  const paymentType =
    filters.paymentType && filters.paymentType !== "all"
      ? filters.paymentType
      : undefined

  return {
    start_date: filters.range.from,
    end_date: filters.range.to,
    payment_type: paymentType,
    // The server only honours `insurance_id` when the payment type is
    // insurance; sending it otherwise would be silently ignored, but not
    // sending it keeps URLs and logs honest.
    insurance_id:
      paymentType === "insurance" && filters.insuranceId
        ? filters.insuranceId
        : undefined,
    search: filters.search.trim() || undefined,
  }
}

/** Maps a table column id to the server's sort key (never interpolated). */
function sortParam(paging: PatientQueryPaging): {
  sort?: string
  dir?: "asc" | "desc"
} {
  const columnId = paging.sort?.columnId
  if (!columnId || !isPatientSortColumn(columnId)) return {}
  return {
    sort: PATIENT_SORT_COLUMNS[columnId as PatientSortColumn],
    dir: paging.sort?.direction ?? "asc",
  }
}

/** `GET /api/reports/v2/patients` — one page + the whole-set summary. */
export function getPatients(
  filters: PatientQueryFilters,
  paging: PatientQueryPaging
): Promise<PatientReportListPayload> {
  return api.get<PatientReportListPayload>("/reports/v2/patients", {
    ...patientParams(filters),
    page: paging.page,
    page_size: paging.pageSize,
    ...sortParam(paging),
  })
}

/** `GET /api/reports/v2/patients/:patientId` — patient + admissions. */
export function getPatientDetail(
  patientId: number,
  range: PatientQueryFilters["range"]
): Promise<PatientReportDetail> {
  return api.get<PatientReportDetail>(`/reports/v2/patients/${patientId}`, {
    start_date: range.from,
    end_date: range.to,
  })
}

/**
 * `GET /api/reports/v2/patients/export` — every matching patient.
 *
 * Exports always re-fetch with the **generated** parameters (never the
 * paginated list, never the current form state), so what is downloaded is
 * always what the report describes.
 */
export function exportPatients(
  filters: PatientQueryFilters,
  paging: PatientQueryPaging
): Promise<PatientReportExportPayload> {
  return api.get<PatientReportExportPayload>("/reports/v2/patients/export", {
    ...patientParams(filters),
    ...sortParam(paging),
  })
}
