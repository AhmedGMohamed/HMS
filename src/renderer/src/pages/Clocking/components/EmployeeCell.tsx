"use client"

import { useTranslation } from "react-i18next"

import { getInitials, cn } from "@/lib/utils"

interface EmployeeCellProps {
  name?: string | null
  employeeType?: string | null
  className?: string
}

/**
 * Clocking employee identity cell (§B7 of `phase_6.8_ux_research.md`).
 *
 * Static initials disc (no photos in this module — `Avatar` is
 * image-oriented) + name + muted role caption. A missing employee
 * (deleted row / lookup gap) renders a plain "—" without the disc —
 * never a fabricated name.
 */
export function EmployeeCell({ name, employeeType, className }: EmployeeCellProps) {
  const { t } = useTranslation()

  if (!name) {
    return (
      <span className={cn("text-muted-foreground", className)}>—</span>
    )
  }

  const roleKey =
    employeeType === "doctor"
      ? "clocking.role.doctor"
      : employeeType === "nurse"
        ? "clocking.role.nurse"
        : "clocking.role.staff"

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary"
      >
        {getInitials(name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {t(roleKey)}
        </span>
      </span>
    </div>
  )
}
