import type { ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /**
   * Optional eyebrow label rendered above the title in
   * `text-xs uppercase tracking-wide text-muted-foreground`.
   * Used to surface a page-section kicker (e.g. "HMS — Administration").
   */
  eyebrow?: string
  actions?: ReactNode
}

/**
 * Top-level page header (one `<h1>` per page — design.md §8).
 *
 * Skeleton implementation from Phase 2 was extended in Phase 4 to add a
 * non-breaking `eyebrow` slot. The composite layout (eyebrow → h1 →
 * subtitle → actions row) was already implied by the design contract; we
 * just made it explicit at the type level so callers don't reach for
 * extra wrapper divs.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
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
