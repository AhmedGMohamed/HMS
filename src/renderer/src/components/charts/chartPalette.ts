/**
 * Chart series palette — Phase 6.11.
 *
 * Charts on the Reports page plot up to five series at once and must stay
 * on the design-token palette (design.md §4.1). `--chart-1…5` are the
 * semantic chart tokens; the remaining slots fall back to the healthcare
 * primitives that are *not* overridden by the shadcn surface block
 * (`--color-secondary` and `--color-accent` are, so they are unsafe here).
 *
 * Always reference the CSS variables — never a raw hex — so the palette
 * follows the token file and the PDF snapshot inherits the same colours
 * after `html-to-image` inlines them.
 */

export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--color-warning)",
  "var(--color-info)",
  "var(--color-text-tertiary)",
] as const

/** Colour for series `index` (wraps around the palette). */
export function seriesColor(index: number): string {
  return CHART_PALETTE[Math.abs(index) % CHART_PALETTE.length]
}

/** One plotted series — shared by the line/bar/composed wrappers. */
export interface ChartSeries {
  /** Key on each data point. */
  key: string
  /** Legend + tooltip label (already localized by the caller). */
  label: string
  /** Optional override; defaults to the palette slot for its index. */
  color?: string
  /** Render as a dashed stroke (e.g. a derived "net change" series). */
  dashed?: boolean
  /** Fill the area under a line series. */
  fill?: boolean
}
