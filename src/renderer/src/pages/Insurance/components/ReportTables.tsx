"use client"

/**
 * Shared report presentation primitives — Phase 6.10.
 *
 * Both report dialogs (company + per-patient) show the same building
 * blocks, so they live here instead of being duplicated:
 *
 *   - `ReportSummaryGrid` — the legacy `report-summary` chip grid.
 *   - `ReportItemsTable`  — item rows from `ITEM_COLUMNS` plus a
 *                           caller-supplied `<tfoot>` (see
 *                           `report/footerRows.ts` for the row rules).
 */
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import {
  ITEM_COLUMNS,
  itemDisplayName,
} from "@/pages/Insurance/report/itemColumns"
import type { FooterRow } from "@/pages/Insurance/report/footerRows"
import type {
  BillFinancials,
  ReportItem,
} from "@/pages/Insurance/types/insurance"

/* ----------------------------------------------------------------
   Summary grid
   ---------------------------------------------------------------- */

export interface SummaryExtra {
  label: string
  value: string | number
}

export interface ReportSummaryGridProps {
  financials: BillFinancials
  totalPatientPayments: number
  /** Company report: services/drugs split (legacy "S / D" tile). */
  breakdown?: { services: number; drugs: number }
  /** Patient report: appended after the standard seven tiles. */
  extra?: SummaryExtra
}

interface SummaryTileProps {
  label: string
  value: string
  tone?: "default" | "danger" | "success" | "warning" | "muted"
  strong?: boolean
}

function SummaryTile({ label, value, tone = "default", strong }: SummaryTileProps) {
  return (
    <div className="space-y-0.5 rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-sm tabular-nums",
          strong && "font-semibold",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function ReportSummaryGrid({
  financials,
  totalPatientPayments,
  breakdown,
  extra,
}: ReportSummaryGridProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)

  const outstanding = financials.netTotal - totalPatientPayments

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <SummaryTile
        label={t("insurance.report.grossTotal")}
        value={money(financials.grossTotal)}
      />
      <SummaryTile
        label={t("insurance.report.discount")}
        value={`-${money(financials.discountAmount)}`}
        tone="danger"
      />
      <SummaryTile
        label={t("insurance.report.adminExpenses")}
        value={money(financials.adminExpenses)}
        tone="muted"
      />
      <SummaryTile
        label={t("insurance.report.vat")}
        value={money(financials.vatAmount)}
        tone="muted"
      />
      <SummaryTile
        label={t("insurance.report.totalAmount")}
        value={money(financials.netTotal)}
        strong
      />
      <SummaryTile
        label={t("insurance.statistics.patientPaidAmount")}
        value={money(totalPatientPayments)}
      />
      <SummaryTile
        label={t("insurance.statistics.outstandingBalance")}
        value={money(outstanding)}
        tone={outstanding > 0 ? "warning" : "success"}
      />
      {extra ? (
        <SummaryTile label={extra.label} value={String(extra.value)} />
      ) : breakdown ? (
        <SummaryTile
          label={t("insurance.report.servicesDrugs")}
          value={`${money(breakdown.services)} / ${money(breakdown.drugs)}`}
          tone="muted"
        />
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------
   Items table
   ---------------------------------------------------------------- */

export interface ReportItemsTableProps {
  items: ReportItem[]
  footer: FooterRow[]
  /** Visible caption (also the table's accessible name). */
  caption: string
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  service: "border-success/30 bg-success-light text-success-dark",
  supply: "border-transparent bg-primary-light text-primary",
  drug: "border-transparent bg-primary text-primary-foreground",
}

export function ReportItemsTable({
  items,
  footer,
  caption,
}: ReportItemsTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-surface-muted">
          <TableRow className="hover:bg-transparent">
            {ITEM_COLUMNS.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                className={cn(
                  "text-xs font-medium text-muted-foreground uppercase",
                  column.align === "end" && "text-end",
                  column.align === "center" && "text-center"
                )}
              >
                {t(column.labelKey)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={`${item.billId}-${item.itemType}-${index}`}>
              <TableCell className="text-sm">
                {itemDisplayName(item)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize",
                    TYPE_BADGE_CLASS[item.itemType] ?? "bg-muted"
                  )}
                >
                  {item.itemType}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(new Date(item.serviceDate), language)}
              </TableCell>
              <TableCell className="text-center text-sm tabular-nums">
                {item.quantity}
              </TableCell>
              <TableCell className="text-end text-sm tabular-nums">
                {formatCurrency(item.unitPrice, locale)}
              </TableCell>
              <TableCell className="text-end text-sm tabular-nums">
                {formatCurrency(item.totalCost, locale)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-surface-muted/60">
          {footer.map((row, index) => (
            <TableRow
              key={`${row.label}-${index}`}
              className={cn(
                "hover:bg-transparent",
                row.emphasis && "bg-muted/60"
              )}
            >
              <TableCell
                colSpan={ITEM_COLUMNS.length - 1}
                className={cn(
                  "text-xs font-medium",
                  row.emphasis && "font-semibold text-foreground"
                )}
              >
                {row.label}
              </TableCell>
              <TableCell
                className={cn(
                  "text-end text-xs tabular-nums",
                  row.emphasis && "font-semibold",
                  row.tone === "danger" && "text-danger",
                  row.tone === "success" && "text-success",
                  row.tone === "warning" && "text-warning"
                )}
              >
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableFooter>
      </Table>
    </div>
  )
}
