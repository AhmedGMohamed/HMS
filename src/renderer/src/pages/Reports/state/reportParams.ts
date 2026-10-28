/**
 * Reports URL contract — Phase 6.11 plan §4.2.
 *
 * Pure functions only (no React) so the parsing/serialization rules can be
 * unit-tested and so the hook stays a thin wrapper.
 *
 * The URL is the source of truth for the *generated* report:
 *
 *   /reports?tab=patients&from=2026-10-01&to=2026-10-27&run=1
 *            &payment_type=insurance&insurance_id=3
 *
 * `run=1` means "these parameters have produced a result"; without it the tab
 * shows the not-generated state. Filter edits live in component state until
 * the user presses Generate, which rewrites the URL — so a stale form can be
 * detected by comparing the draft against the parsed URL parameters.
 *
 * Only the active tab's filters are serialized, which keeps links short and
 * prevents a doctor id from leaking into a payroll URL.
 */

import { currentMonthRange, toDateParam } from "@/lib/dateRange"

import {
  DEFAULT_REPORT_TAB,
  DOCTOR_RELATIONSHIPS,
  REPORT_GROUPINGS,
  isReportTab,
  type DistributionMode,
  type DoctorRelationship,
  type EmployeeTypeFilter,
  type PaymentTypeFilter,
  type ReportDraft,
  type ReportRange,
  type ReportScope,
  type ReportTab,
  type ReportOption,
} from "@/pages/Reports/types/reports"

export const RUN_PARAM = "run"
export const RUN_PARAM_VALUE = "1"

/** URL parameter names (snake_case, matching the API). */
export const PARAM = {
  tab: "tab",
  from: "from",
  to: "to",
  group: "group",
  paymentType: "payment_type",
  insuranceId: "insurance_id",
  search: "search",
  relationship: "relationship",
  scope: "scope",
  doctorId: "doctor_id",
  nurseId: "nurse_id",
  employeeType: "employee_type",
  employeeId: "employee_id",
  distribution: "dist",
} as const

const PAYMENT_TYPES: PaymentTypeFilter[] = ["all", "cash", "credit", "insurance"]
const EMPLOYEE_TYPES: EmployeeTypeFilter[] = ["all", "doctor", "nurse", "other"]
const SCOPES: ReportScope[] = ["all", "specific"]
const DISTRIBUTIONS: DistributionMode[] = ["payment", "gender"]

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/** Default range: first of the current month → today (local calendar). */
export function defaultReportRange(): ReportRange {
  const range = currentMonthRange()
  return { from: toDateParam(range.from), to: toDateParam(range.to) }
}

/**
 * Draft defaults for a tab.
 *
 * `range` is threaded through so switching tabs keeps the date range but
 * clears every tab-specific filter (plan §4.2).
 */
export function defaultDraftForTab(
  tab: ReportTab,
  range: ReportRange = defaultReportRange()
): ReportDraft {
  return {
    range,
    grouping: "day",
    paymentType: "all",
    insuranceId: null,
    search: "",
    relationship: "referred",
    scope: "all",
    doctorId: null,
    nurseId: null,
    employeeType: "all",
    employeeId: null,
    distribution: "payment",
  }
}

/**
 * Does this tab use the group-by control?
 *
 * The legacy page rendered the control on every tab but only Statistics read
 * it; scoping it here is what keeps the UI honest.
 */
export function tabUsesGrouping(tab: ReportTab): boolean {
  return tab === "statistics" || tab === "payments"
}

/** Resets the tab-specific filters while keeping the date range. */
export function resetTabSpecificFilters(
  draft: ReportDraft,
  tab: ReportTab
): ReportDraft {
  return defaultDraftForTab(tab, draft.range)
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function readInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  if (!value) return fallback
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function isValidDateParam(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Reads the active tab (`patients` when absent/invalid). */
export function parseTab(params: URLSearchParams): ReportTab {
  const raw = params.get(PARAM.tab)
  return isReportTab(raw) ? raw : DEFAULT_REPORT_TAB
}

/** True when the URL asks the tab to show generated results. */
export function parseRun(params: URLSearchParams): boolean {
  return params.get(RUN_PARAM) === RUN_PARAM_VALUE
}

/**
 * Builds the generated-parameter snapshot from the URL.
 *
 * Returns `null` when `run` is absent: the tab then renders its
 * not-generated state even if filter params are present in the link.
 */
export function parseGeneratedParams(
  params: URLSearchParams,
  tab: ReportTab
): ReportDraft | null {
  if (!parseRun(params)) return null

  const defaults = defaultDraftForTab(tab)
  const from = params.get(PARAM.from)
  const to = params.get(PARAM.to)

  return {
    ...defaults,
    range: {
      from: isValidDateParam(from) ? from : defaults.range.from,
      to: isValidDateParam(to) ? to : defaults.range.to,
    },
    grouping: readEnum(params.get(PARAM.group), REPORT_GROUPINGS, defaults.grouping),
    paymentType: readEnum(
      params.get(PARAM.paymentType),
      PAYMENT_TYPES,
      defaults.paymentType
    ),
    insuranceId: readInt(params.get(PARAM.insuranceId)),
    search: params.get(PARAM.search)?.trim() ?? "",
    relationship: readEnum(
      params.get(PARAM.relationship),
      DOCTOR_RELATIONSHIPS,
      defaults.relationship
    ),
    scope: readEnum(params.get(PARAM.scope), SCOPES, defaults.scope),
    doctorId: readInt(params.get(PARAM.doctorId)),
    nurseId: readInt(params.get(PARAM.nurseId)),
    employeeType: readEnum(
      params.get(PARAM.employeeType),
      EMPLOYEE_TYPES,
      defaults.employeeType
    ),
    employeeId: readInt(params.get(PARAM.employeeId)),
    distribution: readEnum(
      params.get(PARAM.distribution),
      DISTRIBUTIONS,
      defaults.distribution
    ),
  }
}

/**
 * Builds the draft the form should start with.
 *
 * When a report has been generated the form mirrors it; otherwise the URL's
 * `from`/`to` (if any) seed the range and everything else is default.
 */
export function parseDraft(params: URLSearchParams, tab: ReportTab): ReportDraft {
  const generated = parseGeneratedParams(params, tab)
  if (generated) return generated

  const defaults = defaultDraftForTab(tab)
  const from = params.get(PARAM.from)
  const to = params.get(PARAM.to)
  return {
    ...defaults,
    range: {
      from: isValidDateParam(from) ? from : defaults.range.from,
      to: isValidDateParam(to) ? to : defaults.range.to,
    },
    grouping: readEnum(params.get(PARAM.group), REPORT_GROUPINGS, defaults.grouping),
  }
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Serializes the parameters for `tab`.
 *
 * `run` is intentional: the same function produces both the URL query (with
 * `run=1` after Generate) and the session-cache key / staleness comparison
 * (without it).
 */
export function serializeReportParams(
  draft: ReportDraft,
  tab: ReportTab,
  options: { run?: boolean } = {}
): URLSearchParams {
  const params = new URLSearchParams()
  params.set(PARAM.tab, tab)
  params.set(PARAM.from, draft.range.from)
  params.set(PARAM.to, draft.range.to)

  if (tabUsesGrouping(tab)) {
    params.set(PARAM.group, draft.grouping)
  }

  switch (tab) {
    case "patients":
      if (draft.paymentType !== "all") {
        params.set(PARAM.paymentType, draft.paymentType)
      }
      if (draft.paymentType === "insurance" && draft.insuranceId) {
        params.set(PARAM.insuranceId, String(draft.insuranceId))
      }
      if (draft.search.trim()) params.set(PARAM.search, draft.search.trim())
      break

    case "doctors":
      params.set(PARAM.relationship, draft.relationship)
      params.set(PARAM.scope, draft.scope)
      if (draft.scope === "specific" && draft.doctorId) {
        params.set(PARAM.doctorId, String(draft.doctorId))
      }
      if (draft.search.trim()) params.set(PARAM.search, draft.search.trim())
      break

    case "nurses":
      params.set(PARAM.scope, draft.scope)
      if (draft.scope === "specific" && draft.nurseId) {
        params.set(PARAM.nurseId, String(draft.nurseId))
      }
      if (draft.search.trim()) params.set(PARAM.search, draft.search.trim())
      break

    case "statistics":
      params.set(PARAM.distribution, draft.distribution)
      break

    case "payments":
    case "clock-ins":
      if (draft.employeeType !== "all") {
        params.set(PARAM.employeeType, draft.employeeType)
      }
      if (draft.employeeId) params.set(PARAM.employeeId, String(draft.employeeId))
      if (draft.search.trim()) params.set(PARAM.search, draft.search.trim())
      break
  }

  if (options.run) params.set(RUN_PARAM, RUN_PARAM_VALUE)
  return params
}

/** Stable cache key / staleness token for a set of parameters. */
export function reportParamsKey(draft: ReportDraft, tab: ReportTab): string {
  const params = serializeReportParams(draft, tab)
  // `dist` (the statistics donut's split) is a **view** parameter: the payload
  // already carries both splits, so switching it neither invalidates the result
  // nor re-keys the session cache. Keeping it out of the key is what stops the
  // "filters changed, regenerate" banner appearing on a pure redraw.
  params.delete(PARAM.distribution)
  return params.toString()
}

/** True when the form has changed since the report was generated. */
export function isDraftStale(
  draft: ReportDraft,
  generated: ReportDraft | null,
  tab: ReportTab
): boolean {
  if (!generated) return false
  return reportParamsKey(draft, tab) !== reportParamsKey(generated, tab)
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns an i18n key for the first invalid field, or `null`.
 *
 * The message key lives under `reports.validation.*` and is translated by
 * the caller (this module stays free of i18n).
 */
export function validateDraft(draft: ReportDraft, tab: ReportTab): string | null {
  if (draft.range.from > draft.range.to) {
    return "reports.validation.endBeforeStart"
  }

  if (tab === "doctors" && draft.scope === "specific" && !draft.doctorId) {
    return "reports.validation.selectDoctor"
  }

  if (tab === "nurses" && draft.scope === "specific" && !draft.nurseId) {
    return "reports.validation.selectNurse"
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Select helpers                                                      */
/* ------------------------------------------------------------------ */

/** Doctors eligible for a relationship (the picker filters by doctor type). */
export function doctorsForRelationship(
  doctors: ReportOption[],
  relationship: DoctorRelationship
): ReportOption[] {
  switch (relationship) {
    case "referred":
      return doctors.filter(
        (doctor) => doctor.doctorType === "referring" || doctor.doctorType === null
      )
    case "supervised":
      return doctors.filter((doctor) => doctor.doctorType === "supervising")
    case "attended":
    default:
      // Attending reports cover everyone who actually saw the patient:
      // attending + outside + supervising doctors (plus rows whose
      // doctor_type predates the enum and came back null).
      return doctors.filter((doctor) => {
        const type = doctor.doctorType ?? null
        return (
          type === null ||
          type === "attending" ||
          type === "outside" ||
          type === "supervising"
        )
      })
  }
}
