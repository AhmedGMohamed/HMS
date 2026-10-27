"use client"

/**
 * Nurse distribution chart — Phase 6.11.3.
 *
 * Horizontal bar of **hours per nurse**, built on the shared `GroupedBarChart`
 * wrapper (plan §4.6): one series, the `hours` value format (axis ticks read
 * `12.5h`, tooltips the exact number), an `sr` data table for screen readers,
 * and no pie.
 *
 * Two renderings share the chart body:
 *   - `NurseDistributionSection` — the on-screen card (localized title, caption
 *     and axis labels),
 *   - `NurseDistributionChart` — the bare chart, mounted inside
 *     `ChartSnapshotSurface` during PDF export with fixed English labels.
 *
 * Exports are English-only (Vault 6.9 / Insurance 6.10 / Doctor 6.11.2
 * parity), which is why `NURSE_SNAPSHOT_LABELS` is hardcoded.
 */

import { useTranslation } from "react-i18next"

import { GroupedBarChart } from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { resolveLocale } from "@/lib/utils"
import type { StaticLocale } from "@/lib/types-extras"
import { useUIStore } from "@/store/uiStore"

/** A bar: nurse name on the category axis, hours on the value axis. */
export type NurseDistributionPoint = {
  nurse: string
  hours: number
}

export interface NurseDistributionChartProps {
  data: NurseDistributionPoint[]
  /** Intl locale for axis/tooltip numbers. */
  locale: StaticLocale
  /** Series label shown in the legend, tooltip and `sr` table header. */
  hoursLabel: string
  srCaption: string
  xHeader: string
  emptyTitle: string
  emptyDescription?: string
  height?: number
}

export function NurseDistributionChart({
  data,
  locale,
  hoursLabel,
  srCaption,
  xHeader,
  emptyTitle,
  emptyDescription,
  height,
}: NurseDistributionChartProps) {
  return (
    <GroupedBarChart<NurseDistributionPoint>
      data={data}
      xKey="nurse"
      series={[{ key: "hours", label: hoursLabel }]}
      format="hours"
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

export interface NurseDistributionSectionProps {
  data: NurseDistributionPoint[]
  /**
   * On-screen chart caption. It says "current page" because the chart draws
   * the rows the table is showing; the PDF's distribution table deliberately
   * covers every nurse.
   */
  caption: string
}

export function NurseDistributionSection({
  data,
  caption,
}: NurseDistributionSectionProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  /** `resolveLocale` widens to `string`; the chart wants the literal union. */
  const locale = resolveLocale(language) as StaticLocale

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground">
          {t("reports.nurseReports.chartTitle")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <NurseDistributionChart
          data={data}
          locale={locale}
          hoursLabel={t("reports.table.hours")}
          srCaption={t("reports.nurseReports.chartTitle")}
          xHeader={t("reports.table.nurse")}
          emptyTitle={t("reports.emptyState.noNursesFound")}
          emptyDescription={t("reports.emptyState.noNursesDescription")}
          height={Math.max(220, data.length * 30 + 60)}
        />
      </CardContent>
    </Card>
  )
}
