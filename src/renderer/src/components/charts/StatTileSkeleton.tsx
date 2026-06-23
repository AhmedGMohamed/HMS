import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface StatTileSkeletonProps {
  /** Approximate chart aspect — defaults to `aspect-video` (matches ChartContainer). */
  aspect?: "video" | "square" | "wide"
  className?: string
}

/**
 * Render-time skeleton for chart wrappers.
 *
 * Recharts is heavy (~100KB gz) and we render it lazily. To prevent
 * Cumulative Layout Shift when the chart arrives, callers swap a
 * `<StatTileSkeleton>` of the same dimensions for the chart until the
 * underlying data resolves (design.md §6.8: "skeleton placeholder takes
 * the chart's exact box dimensions, no CLS").
 *
 * Aspect options match the chart container shapes used in the
 * `RevenueLineChart` (video, 16:9) and `PatientServicesDonut` (square)
 * wrappers.
 */
export function StatTileSkeleton({
  aspect = "video",
  className,
}: StatTileSkeletonProps) {
  const aspectClass =
    aspect === "square"
      ? "aspect-square"
      : aspect === "wide"
        ? "aspect-[21/9]"
        : "aspect-video"

  return (
    <div
      role="status"
      aria-label="Loading chart"
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4",
        aspectClass,
        className
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <div className="flex flex-1 items-center justify-center gap-4">
        <Skeleton className="h-3/4 w-3/4" />
      </div>
      <div className="flex justify-center gap-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}
