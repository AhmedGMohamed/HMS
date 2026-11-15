/**
 * Charts barrel — compatibility surface for the route imports that exist today.
 *
 * Importing ANY symbol from this barrel pulls every chart wrapper (and with
 * them `recharts`) into the importing chunk. Route code should import the
 * specific chart module directly:
 *
 *   import { GroupedBarChart } from "@/components/charts/GroupedBarChart"
 *
 * or lazy-load it (`lazy(() => import("./GroupedBarChart"))`) so routes that
 * never draw a chart do not pay for the chart bundle. Recharts-free helpers
 * (`ChartSrTable`, `ChartEmpty`, formatters, palette) should also be imported
 * from their own modules.
 *
 * Re-exports below are kept so existing pages compile; converting those pages
 * to direct/lazy imports is page-package work, not a Phase 1 change.
 */
export { RevenueLineChart } from "./RevenueLineChart"
export type {
  RevenueLineChartProps,
  RevenueLineChartPoint,
} from "./RevenueLineChart"
export { PatientServicesDonut } from "./PatientServicesDonut"
export type {
  PatientServicesDonutProps,
  PatientServicesDonutSlice,
} from "./PatientServicesDonut"
export { StatTileSkeleton } from "./StatTileSkeleton"
export type { StatTileSkeletonProps } from "./StatTileSkeleton"
export { useChartConfig } from "./useChartConfig"
export type { ChartConfigEntry } from "./useChartConfig"

/* ------------------------------------------------------------------ */
/* Phase 6.11 — Reports chart wrappers                                 */
/* ------------------------------------------------------------------ */

export { MultiLineChart } from "./MultiLineChart"
export type { MultiLineChartProps } from "./MultiLineChart"
export { GroupedBarChart } from "./GroupedBarChart"
export type { GroupedBarChartProps } from "./GroupedBarChart"
export { DualAxisComposedChart } from "./DualAxisComposedChart"
export type { DualAxisComposedChartProps } from "./DualAxisComposedChart"
export { DistributionDonutChart } from "./DistributionDonutChart"
export type {
  DistributionDonutChartProps,
  DistributionSlice,
} from "./DistributionDonutChart"
export {
  ChartSnapshotSlot,
  ChartSnapshotSurface,
  SNAPSHOT_WIDTH,
} from "./ChartSnapshotSurface"
export type { ChartSnapshotSurfaceProps } from "./ChartSnapshotSurface"
export { CHART_PALETTE, seriesColor } from "./chartPalette"
export type { ChartSeries } from "./chartPalette"
export { createChartFormatter } from "./chartFormat"
export type { ChartFormatter, ChartValueFormat } from "./chartFormat"
export { ChartEmpty, ChartSrTable } from "./ChartShell"
export type { ChartEmptyProps, ChartSrTableProps } from "./ChartShell"
