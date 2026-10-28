/**
 * Chart entry-animation switch — Phase 6.11.
 *
 * Recharts animates series in over ~1.5s by default. That is right on screen
 * and wrong in a PDF: the export mounts a hidden copy of the chart and captures
 * it a couple of frames later, so a bitmap taken at t≈30ms contains the axes
 * and nothing else. The wrappers therefore read this context and pass
 * `isAnimationActive={false}` whenever a capture could be in flight.
 *
 * The default is `true`, so a chart rendered anywhere else (a tab, the
 * dashboard) keeps its animation and no call site has to think about it.
 * `ChartSnapshotSurface` provides `false`.
 */

import { createContext, useContext } from "react"

export const ChartAnimationContext = createContext(true)

/** `false` inside a snapshot surface, `true` everywhere else. */
export function useChartAnimation(): boolean {
  return useContext(ChartAnimationContext)
}
