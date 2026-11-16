import type { ReactNode } from "react"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  title: string
  description?: string
  /** Optional icon node. Falls back to nothing — the Empty primitive
   * provides its own centred layout when no media is given. */
  icon?: ReactNode
  /** Optional action affordance (CTA button, link, etc.). */
  action?: ReactNode
  /**
   * Announcement semantics. `"status"` (default) announces empty/no-result
   * surfaces politely; `"alert"` is for error surfaces; `"off"` drops the
   * live region for purely decorative in-card empties.
   */
  live?: "status" | "alert" | "off"
  className?: string
}

/**
 * Inline empty-state used by DataTable, charts, and module placeholders.
 *
 * Phase 4 migration: swapped the bespoke div rectangle for the shadcn
 * `<Empty>` primitives (`Empty/EmptyHeader/EmptyMedia/EmptyTitle/
 * EmptyDescription/EmptyContent`). The public contract (title /
 * description / icon / action) is preserved so the 14 module placeholders
 * keep compiling without a caller migration.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  live = "status",
  className,
}: EmptyStateProps) {
  /* A persistent empty surface is not a landmark: `role="region"` without a
     name was the defect. `status`/`alert` announce once on mount; `off`
     keeps decorative in-card empties silent. */
  const liveRole =
    live === "off" ? undefined : live === "alert" ? "alert" : "status"
  const livePoliteness =
    live === "off" ? undefined : live === "alert" ? "assertive" : "polite"

  return (
    <Empty
      role={liveRole}
      aria-live={livePoliteness}
      aria-label={live === "off" ? undefined : title}
      className={cn(
        "border-dashed border-border bg-surface-muted/40",
        className
      )}
    >
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
