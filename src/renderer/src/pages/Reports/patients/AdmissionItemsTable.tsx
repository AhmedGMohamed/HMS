"use client"

/**
 * Billed items for one admission — Phase 6.11.1.
 *
 * The service date is a **column**, not a heading row. The first draft grouped
 * the lines under a "Items on 3/1/2026" caption; that reads nicely on screen
 * but does not survive a page break, cannot be sorted on paper, and cannot be
 * exported to CSV one-row-per-item. A flat table with a date column is the
 * same shape as the PDF and the CSV, so the three never disagree.
 *
 * The day total is still shown, but as a subtotal row and only for dates with
 * more than one line — a single line already states its own date and amount.
 * `dateTotal` comes from the server (sum of that day's line totals) rather
 * than being recomputed, so a rounding difference between client and Postgres
 * can never appear.
 */

import { Fragment } from "react"
import { useTranslation } from "react-i18next"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { ItemTypeBadge } from "@/pages/Reports/components/StatusBadges"
import { useUIStore } from "@/store/uiStore"
import type { PatientReportItemGroup } from "@/pages/Reports/types/patientReport"

export interface AdmissionItemsTableProps {
  groups: PatientReportItemGroup[]
}

export function AdmissionItemsTable({ groups }: AdmissionItemsTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

  const hasItems = groups.some((group) => group.items.length > 0)

  if (!hasItems) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {t("reports.detail.noItems")}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader className="bg-surface-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28">
              {t("reports.table.serviceDate")}
            </TableHead>
            <TableHead>{t("reports.table.itemName")}</TableHead>
            <TableHead className="w-28">{t("reports.table.itemType")}</TableHead>
            <TableHead className="w-16 text-end">
              {t("reports.table.quantity")}
            </TableHead>
            <TableHead className="w-28 text-end">
              {t("reports.table.unitPrice")}
            </TableHead>
            <TableHead className="w-28 text-end">
              {t("reports.table.totalPrice")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.serviceDate}>
              {group.items.map((item) => (
                <TableRow key={`${group.serviceDate}:${item.itemType}:${item.itemName}`}>
                  <TableCell className="whitespace-nowrap text-text-secondary">
                    {formatDate(
                      new Date(`${group.serviceDate}T00:00:00`),
                      language
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{item.itemName}</TableCell>
                  <TableCell>
                    <ItemTypeBadge value={item.itemType} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {money(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {money(item.totalPrice)}
                  </TableCell>
                </TableRow>
              ))}

              {/* One-line days need no subtotal: the line already says it. */}
              {group.items.length > 1 ? (
                <TableRow className="bg-surface-muted hover:bg-surface-muted">
                  <TableCell className="text-xs text-text-secondary">
                    {formatDate(
                      new Date(`${group.serviceDate}T00:00:00`),
                      language
                    )}
                  </TableCell>
                  <TableCell
                    colSpan={4}
                    className="text-end text-xs font-medium"
                  >
                    {t("reports.detail.dateTotal")}
                  </TableCell>
                  <TableCell className="text-end text-xs font-semibold tabular-nums">
                    {money(group.dateTotal)}
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
