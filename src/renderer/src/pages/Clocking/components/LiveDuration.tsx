"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  computeDurationParts,
  type DurationParts,
} from "@/pages/Clocking/components/duration"
import { useNowTick } from "@/pages/Clocking/hooks/useNowTick"

interface LiveDurationProps {
  /** ISO clock-in timestamp. */
  clockIn: string
  /** ISO clock-out — `null` renders the live (ticking) variant. */
  clockOut: string | null
  /** Show the pulsing "on shift" dot (active rows only). */
  live?: boolean
  className?: string
}

/**
 * Duration cell (§B5 of `phase_6.8_ux_research.md`).
 *
 * Completed rows render a static span; open rows own their 1s tick
 * (shared module interval, never on the page) and prepend a pulsing
 * dot (`bg-success-dark` ≈5:1 — `bg-success` alone fails the 3:1
 * UI-object bar). The dot is decorative (`aria-hidden`); there is
 * deliberately NO `aria-live` here — a ticking live region is an SR
 * denial-of-service, events announce via toasts instead. Reduced
 * motion: the global neutralizer freezes `animate-pulse` to a static
 * dot.
 */
export function LiveDuration({
  clockIn,
  clockOut,
  live = false,
  className,
}: LiveDurationProps) {
  const { t } = useTranslation()
  // Completed rows are static: no subscription, no per-second work.
  const now = useNowTick(clockOut == null)
  const parts: DurationParts = computeDurationParts(clockIn, clockOut, now)

  const formatted =
    parts.hours > 0
      ? t("clocking.duration.hoursMinutes", { hours: parts.hours, minutes: parts.minutes })
      : t("clocking.duration.minutes", { minutes: parts.minutes })

  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      {live ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-success-dark animate-pulse"
        />
      ) : null}
      <span>{formatted}</span>
    </span>
  )
}
