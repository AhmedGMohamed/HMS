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
  className,
}: EmptyStateProps) {
  return (
    <Empty
      role="region"
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
