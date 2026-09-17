"use client"

import { useTranslation } from "react-i18next"
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CalendarXIcon,
  ClockIcon,
  CopyIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Anomaly } from "@/pages/Clocking/components/anomaly"

interface AnomalyBadgeProps {
  anomaly: Anomaly
  className?: string
}

/**
 * Row-level anomaly badge (§B4 of `phase_6.8_ux_research.md`).
 *
 * All badges follow the established in-repo pattern
 * (`DrugsTable`/`SuppliesTable` low-stock badge): `variant="outline"`,
 * tinted border/bg via alpha, the ICON carries the color and the
 * label stays `text-foreground` — never `text-warning`/`text-success`
 * (both fail 4.5:1 for 12px text; icon+text pairing satisfies
 * "never color alone", design.md §4.1). Icon color at ≤5% tints is
 * redundant decoration paired with the text label (established
 * convention).
 */
export function AnomalyBadge({ anomaly, className }: AnomalyBadgeProps) {
  const { t } = useTranslation()

  const key = `clocking.status.${anomaly.kind}`

  if (anomaly.level === "danger") {
    return (
      <Badge
        variant="destructive"
        className={cn("gap-1 text-foreground", className)}
      >
        {anomaly.kind === "fatigueRisk" ? (
          <AlertTriangleIcon aria-hidden className="size-3 text-destructive" />
        ) : (
          <CalendarXIcon aria-hidden className="size-3 text-destructive" />
        )}
        {t(key)}
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-warning/40 bg-warning/5", className)}
    >
      {anomaly.kind === "extendedShift" ? (
        <ClockIcon aria-hidden className="size-3 text-warning" />
      ) : anomaly.kind === "duplicateActive" ? (
        <CopyIcon aria-hidden className="size-3 text-warning" />
      ) : anomaly.kind === "futureClockIn" ? (
        <CalendarClockIcon aria-hidden className="size-3 text-warning" />
      ) : (
        <CalendarXIcon aria-hidden className="size-3 text-warning" />
      )}
      {t(key)}
    </Badge>
  )
}
