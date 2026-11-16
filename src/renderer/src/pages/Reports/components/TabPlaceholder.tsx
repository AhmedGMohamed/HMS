"use client"

/**
 * Transitional tab body — Phase 6.11.0.
 *
 * Subphase 6.11.0 ships the page shell, URL state and the `/options` endpoint.
 * Each per-report subphase replaces this placeholder with its real tab
 * (filters + KPI strip + table + detail dialog + exports). Until then the tab
 * still behaves correctly: it renders the date-range controls, validates them,
 * commits the URL on Generate and reports the generated/not-generated state.
 *
 * Remove this component once 6.11.6 lands.
 */

import { useTranslation } from "react-i18next"

import { DateRangeField } from "@/pages/Reports/components/DateRangeField"
import { GroupByField } from "@/pages/Reports/components/GroupByField"
import { ReportShell } from "@/pages/Reports/components/ReportShell"
import { ReportState } from "@/pages/Reports/components/ReportState"
import type { ReportDraft, ReportRange } from "@/pages/Reports/types/reports"

export interface TabPlaceholderProps {
  title: string
  description: string
  /** Mount the group-by control (statistics + payroll only). */
  usesGrouping: boolean
  draft: ReportDraft
  onRangeChange: (range: ReportRange) => void
  onGroupingChange: (grouping: ReportDraft["grouping"]) => void
  onGenerate: () => void
  isGenerated: boolean
  isStale: boolean
  validationError?: string | null
  /** Rendered instead of the body (permission denial). */
  blocked?: boolean
}

export function TabPlaceholder({
  title,
  description,
  usesGrouping,
  draft,
  onRangeChange,
  onGroupingChange,
  onGenerate,
  isGenerated,
  isStale,
  validationError,
  blocked = false,
}: TabPlaceholderProps) {
  const { t } = useTranslation()

  if (blocked) {
    return (
      <ReportState
        kind="error"
        title={t("reports.state.permissionTitle")}
        description={t("reports.state.permissionDescription")}
      />
    )
  }

  return (
    <ReportShell
      title={title}
      description={description}
      onGenerate={onGenerate}
      stale={isStale}
      validationError={validationError}
      filters={
        <>
          <DateRangeField value={draft.range} onChange={onRangeChange} />
          {usesGrouping ? (
            <GroupByField value={draft.grouping} onChange={onGroupingChange} />
          ) : null}
        </>
      }
    >
      {isGenerated ? (
        <ReportState
          kind="empty"
          title={t("reports.state.pendingTitle")}
          description={t("reports.state.pendingDescription")}
        />
      ) : (
        <ReportState kind="not-generated" onGenerate={onGenerate} />
      )}
    </ReportShell>
  )
}
