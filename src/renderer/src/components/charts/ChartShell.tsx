/**
 * Shared chrome for the Reports chart wrappers — Phase 6.11.
 *
 * Every wrapper needs the same three things around its Recharts canvas:
 * a screen-reader data table (design.md §7.4 / §6.8), a translated empty
 * state (never a blank axis frame), and a skeleton of the right size while
 * data resolves. Keeping them here avoids five near-identical copies.
 */

import { EmptyState } from "@/components/common/EmptyState"

export interface ChartSrTableProps {
  /** Table caption — describe the chart, not the UI. */
  caption: string
  /** Column headers: first is the x category, then one per series. */
  headers: string[]
  /** Pre-formatted cell values. */
  rows: Array<Array<string | number>>
}

/**
 * `sr-only` tabular equivalent of a chart.
 *
 * The table is intentionally always rendered (not behind a disclosure):
 * assistive tech reads it in place of the canvas, and sighted users never
 * see it.
 */
export function ChartSrTable({ caption, headers, rows }: ChartSrTableProps) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={`${header}-${index}`} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => {
              const content = String(cell)
              return cellIndex === 0 ? (
                <th key={cellIndex} scope="row">
                  {content}
                </th>
              ) : (
                <td key={cellIndex}>{content}</td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export interface ChartEmptyProps {
  title: string
  description?: string
  className?: string
}

/** Empty-data state shared by every chart wrapper. */
export function ChartEmpty({ title, description, className }: ChartEmptyProps) {
  return (
    <div className={className}>
      <EmptyState title={title} description={description} />
    </div>
  )
}

/**
 * RTL note: charts keep a left-to-right time/value axis even in the Arabic
 * UI (reversing an axis is unreadable), so every wrapper mounts its canvas
 * inside `dir="ltr"`. Labels stay localized via the caller's props.
 */
export const CHART_DIRECTION = "ltr" as const
