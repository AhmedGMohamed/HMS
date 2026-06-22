import type { ReactNode } from "react"

/**
 * Top-level page header.
 *
 * Skeleton implementation for Phase 2 bootstrap — Phase 4 will refine this
 * to honour the design.md §6.1 spec (eyebrow label, sticky behaviour,
 * divider, max width, etc.). The current shape (title + optional subtitle
 * + actions slot) covers everything Phase 2 placeholders need.
 */
export interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
