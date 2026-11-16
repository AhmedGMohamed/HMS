/**
 * Per-tab presentation metadata — Phase 6.11.
 *
 * Lives outside the component files so `react-refresh` keeps Fast Refresh
 * working (a component module may only export components).
 */

import type { ReportTab } from "@/pages/Reports/types/reports"

export interface ReportTabMeta {
  /** i18n key for the tab label (also used as the tab heading). */
  labelKey: string
  /** i18n key for the one-line description under the heading. */
  descriptionKey: string
  /** Whether the tab mounts the group-by control. */
  usesGrouping: boolean
}

export const TAB_META: Record<ReportTab, ReportTabMeta> = {
  patients: {
    labelKey: "reports.tabs.patientReports",
    descriptionKey: "reports.page.descriptions.patients",
    usesGrouping: false,
  },
  doctors: {
    labelKey: "reports.tabs.doctorReports",
    descriptionKey: "reports.page.descriptions.doctors",
    usesGrouping: false,
  },
  nurses: {
    labelKey: "reports.tabs.nurseReports",
    descriptionKey: "reports.page.descriptions.nurses",
    usesGrouping: false,
  },
  statistics: {
    labelKey: "reports.tabs.statistics",
    descriptionKey: "reports.page.descriptions.statistics",
    usesGrouping: true,
  },
  payments: {
    labelKey: "reports.tabs.employeePayments",
    descriptionKey: "reports.page.descriptions.payments",
    usesGrouping: true,
  },
  "clock-ins": {
    labelKey: "reports.tabs.clockInReports",
    descriptionKey: "reports.page.descriptions.clockIns",
    usesGrouping: false,
  },
}
