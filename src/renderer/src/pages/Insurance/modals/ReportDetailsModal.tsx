"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { DownloadIcon, PrinterIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/EmptyState"
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  resolveLocale,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { calculateFinancials } from "@/pages/Insurance/report/financials"
import { groupItemsByPatient } from "@/pages/Insurance/report/groupItemsByPatient"
import { buildCompanyReportPdf } from "@/pages/Insurance/print/buildCompanyReportPdf"
import { exportItemsCsv, isoDateSuffix } from "@/pages/Insurance/print/exportItemsCsv"
import {
  ReportItemsTable,
  ReportSummaryGrid,
} from "@/pages/Insurance/components/ReportTables"
import { buildItemFooter } from "@/pages/Insurance/report/footerRows"
import type { InsuranceReportSummary } from "@/pages/Insurance/types/insurance"

export interface ReportDetailsModalProps {
  open: boolean
  report: InsuranceReportSummary | null
  loading: boolean
  error: Error | null
  onClose: () => void
}

/**
 * Company insurance report — on-screen result (Phase 6.10 plan §3).
 *
 * Renders the legacy grouped ledger: a summary grid, then one numbered
 * card per patient with the item table and its financial footer
 * (medical tests, scoped discount, admin expenses, scoped VAT, net total,
 * patient paid, outstanding), then the cleared-payments table when the
 * period contains payments. Exports go through the shared PDF shell and
 * the CSV writer — both English-only.
 */
export function ReportDetailsModal({
  open,
  report,
  loading,
  error,
  onClose,
}: ReportDetailsModalProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)

  const [exporting, setExporting] = useState(false)

  const groups = useMemo(
    () => (report ? groupItemsByPatient(report.items) : {}),
    [report]
  )
  const financials = useMemo(
    () => calculateFinancials(report?.items ?? []),
    [report]
  )

  const period = report
    ? `${formatDate(new Date(report.reportPeriod.startDate), language)} — ${formatDate(
        new Date(report.reportPeriod.endDate),
        language
      )}`
    : undefined

  const handlePrint = async () => {
    if (!report) return
    setExporting(true)
    try {
      await buildCompanyReportPdf({ report, groups, financials, t, language })
    } catch {
      toast.error(t("insurance.messages.reportError"), {
        duration: Number.POSITIVE_INFINITY,
      })
    } finally {
      setExporting(false)
    }
  }

  const handleCsv = () => {
    if (!report) return
    exportItemsCsv({
      fileName: `insurance-report-${report.insuranceId}-${isoDateSuffix(
        report.reportPeriod.startDate
      )}_${isoDateSuffix(report.reportPeriod.endDate)}.csv`,
      items: report.items,
      preamble: [
        ["Insurance", report.insuranceName],
        [
          "Report Period",
          `${report.reportPeriod.startDate.slice(0, 10)} to ${report.reportPeriod.endDate.slice(0, 10)}`,
        ],
        ["Gross Total", String(financials.grossTotal)],
        ["Discount", String(financials.discountAmount)],
        ["Administrative Expenses", String(financials.adminExpenses)],
        ["VAT", String(financials.vatAmount)],
        ["Net Total", String(financials.netTotal)],
        ["Patient Payments", String(report.totalPatientPayments)],
        ["Outstanding", String(financials.netTotal - report.totalPatientPayments)],
        [],
      ],
    })
    toast.success(t("insurance.messages.exportSuccess"))
  }

  const hasData = Boolean(report && report.items.length > 0)
  const patientKeys = Object.keys(groups)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {report
              ? `${report.insuranceName} — ${t("insurance.modals.insuranceReport")}`
              : t("insurance.modals.insuranceReport")}
          </DialogTitle>
          {period ? <DialogDescription>{period}</DialogDescription> : null}
        </DialogHeader>

        <div
          role="region"
          aria-label={t("insurance.modals.insuranceReport")}
          tabIndex={0}
          className="max-h-[68vh] space-y-5 overflow-y-auto pe-1 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("insurance.messages.reportError")}
              </AlertDescription>
            </Alert>
          ) : !report ? null : !hasData ? (
            <EmptyState
              title={t("insurance.report.noData")}
              description={t("insurance.messages.reportNote")}
            />
          ) : (
            <>
              <ReportSummaryGrid
                financials={financials}
                totalPatientPayments={report.totalPatientPayments}
                breakdown={{
                  services: report.totalServicesCost,
                  drugs: report.totalDrugsCost,
                }}
              />

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">
                  {t("insurance.report.patientName")}{" "}
                  <span className="text-muted-foreground">
                    ({patientKeys.length} · {report.items.length})
                  </span>
                </h3>

                {patientKeys.map((patientKey, index) => {
                  const group = groups[patientKey]
                  const patientName = group.patientName
                  const sample = group.items[0]
                  const meta = {
                    discount: sample?.discount ?? 0,
                    discountType: sample?.discountType ?? null,
                    discountScope: sample?.discountScope ?? null,
                    vatPercentage: sample?.vatPercentage ?? 0,
                    vatScopeCustom: sample?.vatScopeCustom ?? null,
                  }
                  const footer = buildItemFooter({
                    items: group.items,
                    financials: calculateFinancials(group.items),
                    meta,
                    t,
                    money,
                    patientPaid: group.patientPaid,
                  })
                  /* `new Date("")` is Invalid Date and `Intl.format`
                     throws on it — guard so a row without an admission
                     timestamp cannot blank the whole report. */
                  const admissionTime = sample?.admissionTime
                    ? new Date(sample.admissionTime)
                    : null
                  const admissionLabel =
                    admissionTime && !Number.isNaN(admissionTime.getTime())
                      ? formatDate(admissionTime, language)
                      : null

                  return (
                    <section
                      key={patientKey}
                      className="space-y-2 rounded-lg border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium text-foreground">
                          {index + 1}. {patientName}
                        </h4>
                        {sample?.insuranceCardId ? (
                          <Badge variant="secondary">
                            {t("insurance.patient.insuranceCardId")}:{" "}
                            {sample.insuranceCardId}
                          </Badge>
                        ) : null}
                        {sample?.insuranceFormId ? (
                          <Badge variant="outline">
                            {t("insurance.patient.insuranceFormId")}:{" "}
                            {sample.insuranceFormId}
                          </Badge>
                        ) : null}
                        {admissionLabel ? (
                          <Badge variant="secondary">
                            {t("insurance.patient.admission")}:{" "}
                            {admissionLabel}
                          </Badge>
                        ) : null}
                        {sample?.dischargeTime ? (
                          <Badge className="border-success/30 bg-success-light text-success-dark">
                            {t("insurance.report.dischargeDate")}:{" "}
                            {formatDate(
                              new Date(sample.dischargeTime),
                              language
                            )}
                          </Badge>
                        ) : null}
                      </div>

                      <ReportItemsTable
                        items={group.items}
                        footer={footer}
                        caption={`${patientName} — ${t("insurance.report.itemName")}`}
                      />
                    </section>
                  )
                })}
              </div>

              {report.clearedPayments.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("insurance.modals.paymentHistory")}{" "}
                    <span className="text-muted-foreground">
                      ({report.clearedPayments.length})
                    </span>
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader className="bg-surface-muted">
                        <TableRow className="hover:bg-transparent">
                          <TableHead scope="col">
                            {t("insurance.paymentHistory.paymentAmount")}
                          </TableHead>
                          <TableHead scope="col">
                            {t("insurance.fields.paymentPeriodFrom")}
                          </TableHead>
                          <TableHead scope="col">
                            {t("insurance.fields.paymentPeriodTo")}
                          </TableHead>
                          <TableHead scope="col">
                            {t("insurance.paymentHistory.paymentDate")}
                          </TableHead>
                          <TableHead scope="col">
                            {t("insurance.paymentHistory.recordedBy")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.clearedPayments.map((payment) => (
                          <TableRow key={payment.paymentId}>
                            <TableCell className="tabular-nums">
                              {money(payment.paymentAmount)}
                            </TableCell>
                            <TableCell>
                              {formatDate(
                                new Date(payment.paymentFrom),
                                language
                              )}
                            </TableCell>
                            <TableCell>
                              {formatDate(new Date(payment.paymentTo), language)}
                            </TableCell>
                            <TableCell>
                              {formatDateTime(
                                new Date(payment.issuedTimestamp),
                                language
                              )}
                            </TableCell>
                            <TableCell>
                              {payment.addedByUsername ?? "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCsv}
            disabled={!hasData || exporting}
          >
            <DownloadIcon aria-hidden className="me-1.5 size-4" />
            {t("insurance.report.exportCsv")}
          </Button>
          <Button
            type="button"
            onClick={() => void handlePrint()}
            disabled={!hasData || exporting}
          >
            <PrinterIcon aria-hidden className="me-1.5 size-4" />
            {t("insurance.buttons.printReport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
