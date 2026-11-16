"use client"

/**
 * Report body states — Phase 6.11 plan §4.5.
 *
 * Four explicit states so no tab ever shows a spinner-only panel or a blank
 * area:
 *   - `not-generated` — the tab has never run for the current parameters,
 *   - `loading`       — skeletons sized like the eventual content (no CLS),
 *   - `error`         — message + Retry (and the raw status when 403),
 *   - `empty`         — the query succeeded but matched nothing.
 *
 * The visual grammar is `<EmptyState>`; only the actions differ.
 */

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangleIcon,
  FileSearchIcon,
  InboxIcon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type ReportStateKind = "not-generated" | "loading" | "error" | "empty"

export interface ReportStateProps {
  kind: ReportStateKind
  /** Runs the report (not-generated state). */
  onGenerate?: () => void
  /** Retries after an error. */
  onRetry?: () => void
  /** Overrides for the default copy (already translated by the caller). */
  title?: string
  description?: string
  /** Skeleton layout to use while `kind === "loading"`. */
  skeleton?: ReactNode
  className?: string
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}

export function ReportState({
  kind,
  onGenerate,
  onRetry,
  title,
  description,
  skeleton,
  className,
}: ReportStateProps) {
  const { t } = useTranslation()

  if (kind === "loading") {
    return <div className={className}>{skeleton ?? <DefaultSkeleton />}</div>
  }

  if (kind === "not-generated") {
    return (
      <EmptyState
        className={cn("py-12", className)}
        icon={<FileSearchIcon aria-hidden className="size-6" />}
        title={title ?? t("reports.state.notGeneratedTitle")}
        description={description ?? t("reports.state.notGeneratedDescription")}
        action={
          onGenerate ? (
            <Button type="button" size="sm" onClick={onGenerate}>
              <PlayIcon aria-hidden className="size-4" />
              {t("reports.actions.generate")}
            </Button>
          ) : null
        }
      />
    )
  }

  if (kind === "error") {
    return (
      <EmptyState
        className={cn("py-12", className)}
        icon={<AlertTriangleIcon aria-hidden className="size-6" />}
        title={title ?? t("reports.state.errorTitle")}
        description={description ?? t("reports.state.errorDescription")}
        action={
          onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCwIcon aria-hidden className="size-4" />
              {t("reports.actions.retry")}
            </Button>
          ) : null
        }
      />
    )
  }

  return (
    <EmptyState
      className={cn("py-12", className)}
      icon={<InboxIcon aria-hidden className="size-6" />}
      title={title ?? t("reports.state.emptyTitle")}
      description={description ?? t("reports.state.emptyDescription")}
    />
  )
}
