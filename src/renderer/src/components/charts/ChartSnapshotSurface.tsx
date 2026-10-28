"use client"

/**
 * Off-screen English render surface used to rasterize charts into PDFs —
 * Phase 6.11 plan §4.6.
 *
 * Reports PDFs are English-only (Vault 6.9 / Insurance 6.10 parity), but the
 * on-screen chart may be in Arabic, inside an RTL page, or narrower than the
 * PDF column. Instead of exporting what the user sees, the export flow mounts
 * a second, hidden copy of the same chart at a fixed size with English labels
 * and `dir="ltr"`, then captures it with `html-to-image`.
 *
 * The surface is `position: fixed` + `left: -10000px` (not `display: none` or
 * `visibility: hidden`, both of which produce blank captures) and
 * `aria-hidden`, so it is invisible, unreachable by keyboard, and ignored by
 * assistive tech. Each chart is tagged with `data-chart-snapshot-key` so the
 * capture helper can find it by name.
 *
 * The surface also provides `ChartAnimationContext = false`. Without that the
 * captured copy runs Recharts' ~1.5s entry animation and the bitmap (taken two
 * frames after mount) contains the axes and no series at all.
 */

import type { ReactNode } from "react"

import { ChartAnimationContext } from "./chartAnimation"

export interface ChartSnapshotSurfaceProps {
  /** Mount only while an export is running. */
  active: boolean
  children: ReactNode
  width?: number
  height?: number
}

/** Fixed capture width in CSS px (×`pixelRatio` for the actual bitmap). */
export const SNAPSHOT_WIDTH = 900

export function ChartSnapshotSurface({
  active,
  children,
  width = SNAPSHOT_WIDTH,
  height = 420,
}: ChartSnapshotSurfaceProps) {
  if (!active) return null

  return (
    <ChartAnimationContext.Provider value={false}>
      <div
        aria-hidden="true"
        data-chart-snapshot-surface=""
        dir="ltr"
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          width,
          height,
          background: "#ffffff",
          pointerEvents: "none",
          zIndex: -1,
          padding: 12,
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </ChartAnimationContext.Provider>
  )
}

/**
 * Marks a single chart for capture. Wrap the chart inside the surface:
 *
 *   <ChartSnapshotSurface active>
 *     <ChartSnapshotSlot name="revenue">
 *       <GroupedBarChart … locale="en-US" />
 *     </ChartSnapshotSlot>
 *   </ChartSnapshotSurface>
 */
export function ChartSnapshotSlot({
  name,
  children,
}: {
  name: string
  children: ReactNode
}) {
  return (
    <div data-chart-snapshot-key={name} style={{ width: "100%", height: "100%" }}>
      {children}
    </div>
  )
}
