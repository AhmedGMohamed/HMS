"use client"

/**
 * Doctor distribution chart — Phase 6.11.2.
 *
 * Horizontal bar of patients per doctor, built on the shared `GroupedBarChart`
 * wrapper (plan §4.6): one series, `number` formatting, an `sr` data table for
 * screen readers, and no pie (the legacy doctor chart was a pie that could not
 * be read past five doctors).
 *
 * Two renderings share the chart body:
 *   - `DoctorDistributionSection` — the on-screen card (localized title,
 *     caption and axis labels),
 *   - `DoctorDistributionChart` — the bare chart, mounted inside
 *     `ChartSnapshotSurface` during PDF export with fixed English labels.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 parity), which is why
 * `SNAPSHOT_LABELS` is hardcoded rather than translated.
 */

import { useTranslation } from "react-i18next"

import { GroupedBarChart } from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { resolveLocale } from "@/lib/utils"
import type { StaticLocale } from "@/lib/types-extras"
import { useUIStore } from "@/store/uiStore"

/** A bar: doctor name on the category axis, patient count on the value axis. */
export type DoctorDistributionPoint = {
  doctor: string
  patients: number
}

export interface DoctorDistributionChartProps {
  data: DoctorDistributionPoint[]
  /** Intl locale for axis/tooltip numbers. */
  locale: StaticLocale
  /** Series label shown in the legend, tooltip and `sr` table header. */
  patientLabel: string
  srCaption: string
  xHeader: string
  emptyTitle: string
  emptyDescription?: string
  height?: number
}

export function DoctorDistributionChart({
  data,
  locale,
  patientLabel,
  srCaption,
  xHeader,
  emptyTitle,
  emptyDescription,
  height,
}: DoctorDistributionChartProps) {
  return (
    <GroupedBarChart<DoctorDistributionPoint>
      data={data}
      xKey="doctor"
      series={[{ key: "patients", label: patientLabel }]}
      format="number"
      locale={locale}
      horizontal
      srCaption={srCaption}
      xHeader={xHeader}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      height={height}
      maxCategoryLabelLength={28}
    />
  )
}

/** English labels used by the PDF snapshot live in `doctorChartSnapshot`. */

export interface DoctorDistributionSectionProps {
  data: DoctorDistributionPoint[]
  /**
   * On-screen chart caption. It says "current page" because the chart draws
   * the rows the table is showing; the PDF's distribution table deliberately
   * covers every doctor.
   */
  caption: string
}

export function DoctorDistributionSection({
  data,
  caption,
}: DoctorDistributionSectionProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  /** `resolveLocale` widens to `string`; the chart wants the literal union. */
  const locale = resolveLocale(language) as StaticLocale

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground">
          {t("reports.doctorReports.chartTitle")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <DoctorDistributionChart
          data={data}
          locale={locale}
          patientLabel={t("reports.table.patients")}
          srCaption={t("reports.doctorReports.chartTitle")}
          xHeader={t("reports.table.doctor")}
          emptyTitle={t("reports.emptyState.noDoctorsFound")}
          emptyDescription={t("reports.emptyState.noDoctorsDescription")}
          height={Math.max(220, data.length * 30 + 60)}
        />
      </CardContent>
    </Card>
  )
}
