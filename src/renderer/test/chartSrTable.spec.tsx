/**
 * Chart accessibility table — Phase 6.11 layout regression guard.
 *
 * `sr-only` sets `height: 1px` + `overflow: hidden`, but a **table box** treats
 * `height` as a minimum and ignores `overflow`: the class has to live on a
 * block wrapper, not on the table. With `grouping=day` over a multi-year range
 * the table grew to ~4,000 rows and added ~80,000 px of empty scroll space
 * below the last card on the statistics tab — the taller the table, the bigger
 * the gap, which is exactly what a data-level assertion would never notice.
 *
 * These specs assert the structure, so the class cannot migrate back onto the
 * table without failing here.
 */

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChartSrTable } from "@/components/charts/ChartShell"

function render(rows: Array<Array<string | number>> = [["2026-01-01", 3]]) {
  return renderToStaticMarkup(
    <ChartSrTable
      caption="Admissions"
      headers={["Period", "Admissions"]}
      rows={rows}
    />
  )
}

describe("ChartSrTable", () => {
  it("puts the sr-only class on a div wrapper, never on the table", () => {
    const html = render()

    expect(html).toContain('<div class="sr-only">')
    // The regression: `<table class="sr-only">` grows to fit its rows.
    expect(html).not.toContain('<table class="sr-only"')
    expect(html).toContain("<table>")
  })

  it("nests the table inside the clipping wrapper", () => {
    const html = render()
    const wrapper = html.indexOf('<div class="sr-only">')
    const table = html.indexOf("<table>")
    const closeWrapper = html.lastIndexOf("</div>")

    expect(wrapper).toBeGreaterThanOrEqual(0)
    expect(table).toBeGreaterThan(wrapper)
    expect(closeWrapper).toBeGreaterThan(table)
  })

  it("keeps every row and the header row addressable", () => {
    const html = render([
      ["2026-01-01", 3],
      ["2026-01-02", 5],
      ["2026-01-03", 0],
    ])

    expect(html.match(/<tr>/g)).toHaveLength(4) // header + three rows
    expect(html).toContain("<caption>Admissions</caption>")
    expect(html).toContain('<th scope="row">2026-01-03</th>')
  })
})
