import type { ReactNode } from "react"
import { Inbox } from "lucide-react"

/**
 * Skeleton implementation for Phase 2 placeholders.
 *
 * Phase 4 will extend this with SVG illustrations, primary-action
 * affordances, and the design.md §6 density rules. The current minimal
 * shape (icon + title + description + optional action) is enough for
 * 14+ module placeholders to compile and run.
 */
export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted/40 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
