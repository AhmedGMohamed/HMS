"use client"

/**
 * Report tab shell — Phase 6.11 plan §4.5.
 *
 * One layout for all six tabs: heading + Generate + exports, the filter card
 * slot, the stale-notice strip, the body and a generated-metadata footer.
 *
 * Export buttons are rendered from the handlers, not from permission checks,
 * so a tab only shows "Export PDF" if it can actually export — and the caller
 * passes `exportDisabled` + a reason when the user lacks `manage_reports`
 * (the server enforces the same rule, this is the affordance).
 */

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { DownloadIcon, FileSpreadsheetIcon, Loader2Icon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface ReportShellProps {
  title: string
  description?: string
  /** Filters card content (already wrapped by the caller's card). */
  filters?: ReactNode
  /** Primary Generate action. */
  onGenerate: () => void
  generateLabel?: string
  /** Disables Generate while a request is in flight. */
  generating?: boolean
  /** Renders an "Export PDF" button when provided. */
  onExportPdf?: () => void
  /** Renders an "Export CSV" button when provided. */
  onExportCsv?: () => void
  /** Disables the export buttons (e.g. no data / missing permission). */
  exportDisabled?: boolean
  /** Explanation shown in a tooltip when exports are disabled. */
  exportDisabledReason?: string
  /** Export currently running. */
  exporting?: "pdf" | "csv" | null
  /** `true` when the form changed after the last Generate. */
  stale?: boolean
  /** Metadata strip (generated-at, range, record count). */
  meta?: ReactNode
  /** Validation message for the filter card. */
  validationError?: string | null
  children: ReactNode
  className?: string
}

export function ReportShell({
  title,
  description,
  filters,
  onGenerate,
  generateLabel,
  generating = false,
  onExportPdf,
  onExportCsv,
  exportDisabled = false,
  exportDisabledReason,
  exporting = null,
  stale = false,
  meta,
  validationError,
  children,
  className,
}: ReportShellProps) {
  const { t } = useTranslation()

  const withDisabledTooltip = (button: ReactNode) => {
    if (!exportDisabled || !exportDisabledReason) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{exportDisabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onExportCsv ? (
            withDisabledTooltip(
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportCsv}
                disabled={exportDisabled || exporting !== null}
              >
                {exporting === "csv" ? (
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheetIcon aria-hidden className="size-4" />
                )}
                {t("reports.actions.exportCsv")}
              </Button>
            )
          ) : null}

          {onExportPdf ? (
            withDisabledTooltip(
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportPdf}
                disabled={exportDisabled || exporting !== null}
              >
                {exporting === "pdf" ? (
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                ) : (
                  <DownloadIcon aria-hidden className="size-4" />
                )}
                {t("reports.actions.exportPdf")}
              </Button>
            )
          ) : null}

          <Button type="button" size="sm" onClick={onGenerate} disabled={generating}>
            {generating ? (
              <Loader2Icon aria-hidden className="size-4 animate-spin" />
            ) : (
              <PlayIcon aria-hidden className="size-4" />
            )}
            {generateLabel ?? t("reports.actions.generate")}
          </Button>
        </div>
      </div>

      {filters ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("reports.filters.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-end gap-4">
              {filters}
            </div>
            {validationError ? (
              <p className="mt-3 text-xs text-danger" role="alert">
                {validationError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {stale ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning-light px-3 py-2 text-xs text-text-primary"
        >
          {t("reports.state.stale")}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">{children}</div>

      {meta ? (
        <div className="border-t border-border pt-2 text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  )
}
