"use client"

import { useTranslation } from "react-i18next"
import {
  CalendarXIcon,
  ClockIcon,
  LogOutIcon,
} from "lucide-react"

import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatNumber } from "@/lib/utils"

interface ClockingKpiStripProps {
  activeCount: number
  missingCount: number
  over12hCount: number
  /** Whether the missing-clock-out filter chip is currently engaged. */
  missingFilterActive: boolean
  loading?: boolean
  /** Reset the Active-tab filter (on-shift card, "all" pattern). */
  onResetFilter: () => void
  /** Toggle the Active-tab missing-only filter (missing card). */
  onToggleMissingOnly: () => void
}

/**
 * Clocking KPI strip (§B2 of `phase_6.8_ux_research.md`).
 *
 * Three metrics, all derived client-side from the single clock-ins
 * payload (reverses plan A20 — see `phase_6.8_plan.md` §1.3):
 *  - On shift now       → neutral, click resets the Active filter
 *  - Missing clock-out  → warning when > 0, click toggles the filter
 *  - Shifts over 12h    → danger, read-only (a live-decaying set is
 *                         confusing as a filter target)
 *
 * Grid `grid-cols-1 sm:grid-cols-3` — 3-up from `sm` (768px), where
 * each card is ≈200px wide (comfortable, matches the Supplies strip
 * rhythm).
 */
export function ClockingKpiStrip({
  activeCount,
  missingCount,
  over12hCount,
  missingFilterActive,
  loading = false,
  onResetFilter,
  onToggleMissingOnly,
}: ClockingKpiStripProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <EditorialKpiCard
        label={t("clocking.kpi.onShift")}
        value={formatNumber(activeCount)}
        hint={t("clocking.kpi.onShiftHint")}
        tone="neutral"
        active={!missingFilterActive}
        loading={loading}
        onClick={onResetFilter}
        icon={<LogOutIcon aria-hidden className="size-4 rotate-180" />}
      />
      <EditorialKpiCard
        label={t("clocking.kpi.missingClockOut")}
        value={formatNumber(missingCount)}
        hint={
          missingCount > 0
            ? t("clocking.kpi.missingClockOutHintActive")
            : t("clocking.kpi.missingClockOutHintCalm")
        }
        tone={missingCount > 0 ? "warning" : "neutral"}
        active={missingFilterActive}
        loading={loading}
        onClick={onToggleMissingOnly}
        icon={<CalendarXIcon aria-hidden className="size-4" />}
        annotation={missingCount > 0 ? "!" : undefined}
      />
      <EditorialKpiCard
        label={t("clocking.kpi.over12h")}
        value={formatNumber(over12hCount)}
        hint={
          over12hCount > 0
            ? t("clocking.kpi.over12hHint")
            : t("clocking.kpi.over12hHintCalm")
        }
        tone={over12hCount > 0 ? "danger" : "neutral"}
        loading={loading}
        icon={<ClockIcon aria-hidden className="size-4" />}
        annotation={over12hCount > 0 ? "!" : undefined}
      />
    </div>
  )
}
