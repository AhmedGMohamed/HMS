"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface EditorialKpiCardProps {
  /** Eyebrow caption above the value (e.g. "Low Stock"). */
  label: string
  /** Pre-formatted numeric, e.g. "24" or "EGP 12,450". */
  value: string | number
  /** Optional contextual line below the value. */
  hint?: ReactNode
  /** Accent treatment; drives the rail colour and hover underline. */
  tone?: "neutral" | "warning" | "primary"
  /** Whether this card represents the currently-active filter. */
  active?: boolean
  loading?: boolean
  onClick?: () => void
  /** Optional icon rendered to the right of the value (RTL: left). */
  icon?: ReactNode
  /** Optional small annotation to the right of the label, e.g. "↗". */
  annotation?: string
  className?: string
}

const TONE_RAIL: Record<NonNullable<EditorialKpiCardProps["tone"]>, string> = {
  neutral: "before:bg-foreground/15 group-hover:before:bg-foreground/60",
  warning: "before:bg-warning group-hover:before:bg-warning",
  primary: "before:bg-primary group-hover:before:bg-primary",
}

const TONE_RULE: Record<NonNullable<EditorialKpiCardProps["tone"]>, string> = {
  neutral: "bg-foreground/10 group-hover:bg-foreground/60",
  warning: "bg-warning/30 group-hover:bg-warning",
  primary: "bg-primary/30 group-hover:bg-primary",
}

const TONE_VALUE: Record<NonNullable<EditorialKpiCardProps["tone"]>, string> = {
  neutral: "text-foreground",
  warning: "text-foreground",
  primary: "text-primary",
}

/**
 * Editorial-medical KPI card (§6.2 aesthetic upgrade).
 *
 * Visual thesis: a clinical readout — large tracked numeral, hairline
 * rule beneath, eyebrow caption above. The left (RTL: right) edge
 * carries a coloured rail that deepens on hover, telegraphing the
 * card's clickability. The active card swaps the rail and rule to a
 * fully-saturated tone and gains a subtle inset tint, so the user
 * always knows which filter is live without a second visual language.
 *
 * The rail uses `before:` with a logical `inline-size` so the
 * composition mirrors cleanly in RTL (design.md §10).
 */
export function EditorialKpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  active = false,
  loading = false,
  onClick,
  icon,
  annotation,
  className,
}: EditorialKpiCardProps) {
  const interactive = Boolean(onClick)
  const Component = interactive ? "button" : "div"

  return (
    <Component
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-pressed={interactive ? active : undefined}
      className={cn(
        "group relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-md",
        "border border-border bg-card ps-7 pe-5 pt-4 pb-4 text-left",
        "transition-[background-color,box-shadow] duration-150",
        "before:absolute before:inset-y-3 before:inset-s-2 before:w-0.75 before:rounded-full",
        "before:transition-colors before:duration-150",
        TONE_RAIL[tone],
        interactive &&
          "cursor-pointer hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active && "bg-primary-light/40 ring-1 ring-inset ring-primary/40",
        className
      )}
    >
      {/* Eyebrow row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {annotation ? (
            <span className="text-[11px] tabular-nums tracking-wide">
              {annotation}
            </span>
          ) : null}
          {icon ? (
            <span
              aria-hidden
              className={cn(
                "transition-colors duration-150",
                active
                  ? "text-primary"
                  : tone === "warning"
                    ? "text-warning"
                    : "text-muted-foreground/80 group-hover:text-foreground"
              )}
            >
              {icon}
            </span>
          ) : null}
        </span>
      </div>

      {/* Hero value */}
      {loading ? (
        <div className="h-10 w-24 animate-pulse rounded-sm bg-muted" />
      ) : (
        <span
          className={cn(
            "block text-[1.75rem] leading-none font-extralight tracking-[-0.02em] tabular-nums",
            TONE_VALUE[tone]
          )}
        >
          {value}
        </span>
      )}

      {/* Hairline rule (subtly thicker on hover / active) */}
      <div
        className={cn(
          "mt-1 h-px transition-all duration-150",
          TONE_RULE[tone],
          active && "h-0.5"
        )}
      />

      {/* Hint / context */}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : (
        <span aria-hidden className="text-xs text-muted-foreground/0">
          &nbsp;
        </span>
      )}
    </Component>
  )
}