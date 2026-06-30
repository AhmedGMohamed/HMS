"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ProfileSectionRow {
  /** Pre-translated label. */
  label: string
  /** Pre-translated or pre-formatted value. */
  value: ReactNode
  /**
   * Optional control (`stack || "row"`). On narrow screens the row
   * stacks its label above its value to avoid `min-width: 180px`
   * breaks. (Legacy CSS used the same.)
   */
  align?: "stack" | "row"
  /** Numeric rows get `tabular-nums`. */
  numeric?: boolean
}

interface ProfileSectionCardProps {
  /** Pre-translated heading. */
  title: string
  /** Tailwind utility invoked as the heading className (e.g. font weight). */
  titleClassName?: string
  rows: ProfileSectionRow[]
  /** Optional footer slot rendered below the rows (e.g. status badges). */
  footer?: ReactNode
  className?: string
}

/**
 * Read-only info-group card used by `<PatientProfilePanel>`.
 *
 * Layout: a section header + a stack of label/value rows. The header
 * adopts the legacy `<h6>` typography with a left border accent so the
 * visual cadence matches `design.md` §7.4 without dragging in a
 * 1k-line `patients.css`.
 *
 * Translation policy: callers pass already-translated strings via
 * the `useTranslation().t(...)` hook. This keeps the theme prop
 * surface pure and avoids an `i18n` provider lookup here.
 */
export function ProfileSectionCard({
  title,
  titleClassName,
  rows,
  footer,
  className,
}: ProfileSectionCardProps) {
  return (
    <section
      className={cn("rounded-md border border-border bg-surface p-4", className)}
      aria-label={title}
    >
      <h6
        className={cn(
          "mb-3 border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase",
          titleClassName,
        )}
      >
        {title}
      </h6>

      <dl className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex min-w-0 flex-col gap-1 border-b border-dashed border-border/60 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-start",
              row.align === "row" && "flex-row items-center",
            )}
          >
            <dt className="min-w-[180px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd
              className={cn(
                "text-sm text-foreground",
                row.numeric && "tabular-nums",
              )}
            >
              {row.value || "—"}
            </dd>
          </div>
        ))}
      </dl>

      {footer ? <div className="mt-3 border-t border-border pt-3">{footer}</div> : null}
    </section>
  )
}
