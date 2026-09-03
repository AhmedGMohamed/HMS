"use client"

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AssignedItemRowProps {
  /** Pre-translated name rendered as the row title. */
  name: string
  /** Optional secondary badge (e.g. service type, drug-supply co-badge). */
  badge?: ReactNode
  /** Quantity label + value pair rendered inline. Both pre-translated. */
  quantityLabel?: string
  quantityValue?: string
  /** Remaining label + value (drugs/supplies only). */
  remainingLabel?: string
  remainingValue?: string
  /** Status badge — pre-translated string AND a `variant`. Hidden if statusLabel is null. */
  statusLabel?: string | null
  statusVariant?: "default" | "secondary" | "destructive"
  /** Pre-translated footer hint (e.g. "Last administered 2h ago"). */
  footerHint?: string
  /** Pre-translated "View" button label. */
  viewLabel: string
  onView: () => void
  className?: string
}

/**
 * One row in the assigned panel body — replaces the legacy
 * `.assigned-item` Bootstrap card. Translations are passed in already
 * translated (callers own the `t()` round-trip).
 */
export function AssignedItemRow({
  name,
  badge,
  quantityLabel,
  quantityValue,
  remainingLabel,
  remainingValue,
  statusLabel,
  statusVariant = "secondary",
  footerHint,
  viewLabel,
  onView,
  className,
}: AssignedItemRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-dashed border-border/60 pb-3 last:border-b-0 last:pb-0 last:mb-0",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-sm text-foreground">
              {name}
            </span>
            {badge}
            {statusLabel ? (
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            ) : null}
          </div>
          {(quantityValue || remainingValue) ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {quantityValue ? (
                <span className="tabular-nums">
                  {quantityLabel}: {quantityValue}
                </span>
              ) : null}
              {remainingValue ? (
                <span className="tabular-nums">
                  {remainingLabel}: {remainingValue}
                </span>
              ) : null}
            </div>
          ) : null}
          {footerHint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{footerHint}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onView}
          aria-label={`${viewLabel} ${name}`}
        >
          {viewLabel}
        </Button>
      </div>
    </div>
  )
}
