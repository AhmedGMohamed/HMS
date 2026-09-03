"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { PrinterIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { Patient, Bill, BillDetail } from "@/pages/Patients/types/patient"
import { formatCurrency } from "@/pages/Patients/lib/admissions/admissionFormat"
import {
  formatPrintDate,
  type PrintItemRow,
} from "@/pages/Patients/lib/print/groupPrintBillItems"
import { buildPrintPreview } from "@/pages/Patients/lib/print/buildPrintPreview"
import { useUIStore } from "@/store/uiStore"

interface PrintBillConfirmDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patient: Patient | null
  bill: Bill | null
  billDetails: BillDetail[]
  printing?: boolean
  onConfirm: () => void
}

const MAX_ROWS = 8

/**
 * Pre-print confirmation. Mirrors the pdfmake body (same
 * `buildPrintPreview` source-of-truth) so the rows the user sees
 * here are exactly what the PDF will print — grouped by
 * `(kind × id × unitPrice × day)`, sorted chronological, with
 * the same discount/VAT/admin/tests/total/paid/balance summary.
 *
 * "Edit before printing" is intentionally absent (audit/fraud
 * surface per product direction).
 */
export function PrintBillConfirmDialog({
  open,
  onOpenChange,
  patient,
  bill,
  billDetails,
  printing = false,
  onConfirm,
}: PrintBillConfirmDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) as "en" | "ar"

  // Single shared derivation: grouping + scope coercion + recalc.
  // `preview` restructures both the rows and `snapshot`; same
  // struct feeds the pdfmake body in `printBill.ts`.
  const preview = useMemo(() => {
    if (!bill) return null
    return buildPrintPreview(bill, billDetails)
  }, [bill, billDetails])

  if (!patient || !bill || !preview) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("patients.modals.printBillConfirm")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {t("patients.messages.printBillMissing")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const { snapshot, rows } = preview
  const normalizedBill = preview.bill

  const medicalTests = Number(normalizedBill.medicalTestsAmount ?? 0)
  const administrativeExpenses = Number(
    normalizedBill.administrativeExpenses ?? 0
  )
  const discount = Number(normalizedBill.discount ?? 0)
  const discountType =
    normalizedBill.discountType === "percentage" ? "percentage" : "fixed"
  const vatPercentage = Number(normalizedBill.vatPercentage ?? 0)
  const paid = Number(normalizedBill.paidAmount ?? 0)

  const translatedDiscountScopeArr = []
  preview.discountScopeArr.length === 4 ?
    translatedDiscountScopeArr.push(t("patients.billing.scope.all")) :
    preview.discountScopeArr.forEach(v => translatedDiscountScopeArr.push(t(`patients.billing.scope.${v}`)))
  const discountScopeStr = translatedDiscountScopeArr.join(t("patients.billingPrint.scopeSeparator"))


  const translatedVatScopeArr = []
  preview.vatScopeArr.length === 4 ?
    translatedVatScopeArr.push(t("patients.billing.scope.all")) :
    preview.vatScopeArr.forEach(v => translatedVatScopeArr.push(t(`patients.billing.scope.${v}`)))
  const vatScopeStr = translatedVatScopeArr.join(t("patients.billingPrint.scopeSeparator"))

  const subtotal =
    snapshot.servicesTotal +
    snapshot.drugsTotal +
    snapshot.suppliesTotal

  const visibleRows = rows.slice(0, MAX_ROWS)
  const remainingCount = Math.max(0, rows.length - MAX_ROWS)

  const balanceColor =
    snapshot.balance > 0
      ? "text-destructive"
      : "text-emerald-600 dark:text-emerald-400"

  function resolveTypeLabel(kind: PrintItemRow["kind"]): string {
    if (kind === "service") return t("patients.billingPrint.typeService")
    if (kind === "drug") return t("patients.billingPrint.typeDrug")
    if (kind === "supply") return t("patients.billingPrint.typeSupply")
    return t("patients.billingPrint.typeUnknown")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("patients.modals.printBillConfirm")}
          </DialogTitle>
          <DialogDescription>
            {patient.name} · #{bill.billId}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {t("patients.help.printBillIntro")}
          </p>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">
                    {t("patients.billingPrint.description")}
                  </TableHead>
                  <TableHead className="text-xs">
                    {t("patients.billingPrint.date")}
                  </TableHead>
                  <TableHead className="text-xs">
                    {t("patients.billingPrint.type")}
                  </TableHead>
                  <TableHead className="text-end text-xs">
                    {t("patients.billingPrint.quantity")}
                  </TableHead>
                  <TableHead className="text-end text-xs">
                    {t("patients.billingPrint.unitPrice")}
                  </TableHead>
                  <TableHead className="text-end text-xs">
                    {t("patients.billingPrint.total")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground italic text-sm"
                    >
                      {t("patients.billingPrint.unknownItem")}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow key={`${row.kind}-${row.itemId ?? 0}-${row.date}`}>
                      <TableCell className="text-sm">
                        {row.description ||
                          t("patients.billingPrint.unknownItem")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {formatPrintDate(row.date, language)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {resolveTypeLabel(row.kind)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-sm">
                        {row.quantity}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-sm">
                        {formatCurrency(row.unitPrice, language)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-sm font-medium">
                        {formatCurrency(
                          row.quantity * row.unitPrice,
                          language
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {remainingCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("patients.print.overNotice", { count: remainingCount })}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
            {/* Subtotal */}
            <SummaryRow
              label={t("patients.billingPrint.subtotal")}
              value={formatCurrency(subtotal, language)}
            />
            {/* Discount (only when present) */}
            {discount > 0 ? (
              <SummaryRow
                label={
                  discountScopeStr
                    ? `${t("patients.billingPrint.discount")} (${discountScopeStr})`
                    : t("patients.billingPrint.discount")
                }
                value={
                  discountType === "percentage"
                    ? `${formatCurrency(snapshot.discountAmount, language)} (${formatCurrency(discount, language, false)}%)`
                    : formatCurrency(snapshot.discountAmount, language)
                }
                valueClassName="text-destructive"
              />
            ) : null}
            {/* Administrative */}
            <SummaryRow
              label={t("patients.billingPrint.admin")}
              value={formatCurrency(administrativeExpenses, language)}
            />
            {/* Medical Tests */}
            <SummaryRow
              label={t("patients.billingPrint.medicalTests")}
              value={formatCurrency(medicalTests, language)}
            />
            {/* VAT */}
            <SummaryRow
              label={
                vatScopeStr
                  ? `${vatPercentage}% ${t("patients.billingPrint.vat")} (${vatScopeStr})`
                  : `${vatPercentage}% ${t("patients.billingPrint.vat")}`
              }
              value={formatCurrency(snapshot.vatAmount, language)}
            />
            {/* Total — emphasised */}
            <SummaryRow
              label={t("patients.billingPrint.totalRow")}
              value={formatCurrency(snapshot.totalFee, language)}
              className="border-t pt-2 font-semibold"
            />
            {/* Paid */}
            <SummaryRow
              label={t("patients.billingPrint.paidRow")}
              value={formatCurrency(paid, language)}
              valueClassName="text-emerald-600 dark:text-emerald-400"
            />
            {/* Balance */}
            <SummaryRow
              label={t("patients.billingPrint.balance")}
              value={formatCurrency(Math.abs(snapshot.balance), language)}
              valueClassName={balanceColor}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onConfirm}
            disabled={printing}
          >
            {printing ? (
              <Spinner aria-hidden className="me-1.5 size-3" />
            ) : (
              <PrinterIcon aria-hidden className="me-1.5 size-4" />
            )}
            {t("patients.buttons.printBill")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------
 * Internal: small layout primitive that keeps the summary panel's
 * label/value pairs aligned without a CSS grid leak.
 * ---------------------------------------------------------------- */
function SummaryRow({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string
  value: string
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${className ?? ""}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`tabular-nums text-sm ${valueClassName ?? ""}`}>
        {value}
      </span>
    </div>
  )
}
