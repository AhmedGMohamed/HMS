"use client"

import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface StatCardProps {
  /** Eyebrow label (e.g. "Active Patients"). */
  label: string
  /** Pre-formatted KPI value (e.g. "24", "EGP 12,450", "12.4k"). */
  value: string | number
  /** Optional delta pill — direction drives colour + arrow. */
  delta?: {
    /** Numeric magnitude (positive or negative). */
    value: number
    /** Pre-formatted suffix (e.g. "+12.5%", "-3.2%"). */
    formatted?: string
    direction: "up" | "down"
  }
  icon?: ReactNode
  loading?: boolean
  /** When set, the card becomes a navigable `<Link>` (Decision §Q3). */
  href?: string
  /** When set, the card becomes a button-like surface (no navigation). */
  onClick?: () => void
  /** Optional accent ring; default is neutral. */
  emphasis?: "default" | "warning" | "success"
  /**
   * Optional insight/contextual line rendered in a muted footer beneath
   * the value. Accepts string or ReactNode (for inline links/buttons).
   */
  footer?: ReactNode
  className?: string
}

/**
 * KPI tile used by the dashboard and per-module stats grids.
 *
 * Inert by default (Decision §Q3: explicit `href` only). When `href` is
 * passed the card renders a `<Link>` with hover lift; when `onClick` is
 * passed it renders as a `<button>` for keyboardable affordance without
 * leaving the page (e.g. opening a modal). Otherwise it's a plain `<div>`.
 *
 * Delta pill semantics: `direction: 'up'` always uses a positive badge
 * colour → `<ArrowUp>` icon; `direction: 'down'` uses the destructive
 * variant → `<ArrowDown>` icon. Colour is **paired with the icon** so
 * colourblind users still get the direction (design.md §8).
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  loading = false,
  href,
  onClick,
  emphasis = "default",
  footer,
  className,
}: StatCardProps) {
  const ringClass =
    emphasis === "warning"
      ? "ring-1 ring-warning/40"
      : emphasis === "success"
        ? "ring-1 ring-success/40"
        : "ring-1 ring-foreground/10"

  const body = (
    <Card
      className={cn(
        "flex h-full flex-col gap-3 transition-shadow",
        (href || onClick) &&
          "cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        ringClass,
        className
      )}
    >
      <CardHeader className="gap-0 px-4 pt-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon ? (
            <span className="text-muted-foreground/80" aria-hidden>
              {icon}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-24 mt-1" />
        ) : (
          <span className="block text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </span>
        )}
        {delta && !loading ? (
          <Badge
            variant={delta.direction === "up" ? "default" : "destructive"}
            className="mt-2 gap-1"
            aria-label={
              delta.formatted
                ? `${delta.formatted} ${delta.direction === "up" ? "increase" : "decrease"}`
                : undefined
            }
          >
            {delta.direction === "up" ? (
              <ArrowUpIcon aria-hidden className="size-3" />
            ) : (
              <ArrowDownIcon aria-hidden className="size-3" />
            )}
            <span className="tabular-nums">{delta.formatted ?? delta.value}</span>
          </Badge>
        ) : null}
      </CardContent>
      {footer ? (
        <CardFooter className="px-4 pb-3 pt-1">
          {loading ? (
            <Skeleton className="h-3 w-32" />
          ) : (
            <span className="text-xs text-muted-foreground">{footer}</span>
          )}
        </CardFooter>
      ) : null}
    </Card>
  )

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-lg focus-visible:outline-hidden"
        aria-label={typeof label === "string" ? `${label}: ${value}` : undefined}
      >
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-lg text-left focus-visible:outline-hidden"
        aria-label={typeof label === "string" ? `${label}: ${value}` : undefined}
      >
        {body}
      </button>
    )
  }
  return body
}
