"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { DownloadIcon, PrinterIcon, UserIcon } from "lucide-react"

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
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import {
  formatCurrency,
  formatDate,
  resolveLocale,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { calculateFinancials } from "@/pages/Insurance/report/financials"
import { buildPatientReportPdf } from "@/pages/Insurance/print/buildPatientReportPdf"
import {
  exportItemsCsv,
  isoDateSuffix,
} from "@/pages/Insurance/print/exportItemsCsv"
import {
  ReportItemsTable,
  ReportSummaryGrid,
} from "@/pages/Insurance/components/ReportTables"
import { buildItemFooter } from "@/pages/Insurance/report/footerRows"
import type { PatientReportSummary } from "@/pages/Insurance/types/insurance"

export interface PatientReportDetailsModalProps {
  open: boolean
  report: PatientReportSummary | null
  loading: boolean
  error: Error | null
  onClose: () => void
}

/**
 * Per-patient report — on-screen result (Phase 6.10 plan §3).
 *
 * Mirrors the legacy `displayPatientReportDetails`: patient information
 * card, summary grid, then one card per admission with its own item table
 * and financial footer. Exports use the shared PDF shell + CSV writer.
 */
export function PatientReportDetailsModal({
  open,
  report,
  loading,
  error,
  onClose,
}: PatientReportDetailsModalProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)
  const money = (value: number) => formatCurrency(value, locale)

  const [exporting, setExporting] = useState(false)

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

  const genderLabel = report
    ? report.patientInfo.gender === "male"
      ? t("insurance.patient.gender.male")
      : report.patientInfo.gender === "female"
        ? t("insurance.patient.gender.female")
        : t("insurance.patient.gender.other")
    : ""

  const handlePrint = async () => {
    if (!report) return
    setExporting(true)
    try {
      await buildPatientReportPdf({ report, financials, t, language })
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
      fileName: `insurance-patient-${report.patientId}-${isoDateSuffix(
        report.reportPeriod.startDate
      )}_${isoDateSuffix(report.reportPeriod.endDate)}.csv`,
      items: report.items,
      preamble: [
        ["Patient", report.patientName],
        ["Insurance", report.insuranceName],
        [
          "Report Period",
          `${report.reportPeriod.startDate.slice(0, 10)} to ${report.reportPeriod.endDate.slice(0, 10)}`,
        ],
        ["Net Total", String(financials.netTotal)],
        ["Patient Payments", String(report.totalPatientPayments)],
        ["Outstanding", String(financials.netTotal - report.totalPatientPayments)],
        [],
      ],
    })
    toast.success(t("insurance.messages.exportSuccess"))
  }

  const hasData = Boolean(
    report && (report.items.length > 0 || report.admissions.length > 0)
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {report
              ? `${report.patientName} — ${t("insurance.modals.patientReport")}`
              : t("insurance.modals.patientReport")}
          </DialogTitle>
          {period ? <DialogDescription>{period}</DialogDescription> : null}
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pe-1">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("insurance.messages.reportError")}
              </AlertDescription>
            </Alert>
          ) : !report ? null : (
            <>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <UserIcon aria-hidden className="size-4 text-primary" />
                    {t("insurance.fields.patient")}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("insurance.report.patientName")}
                      </dt>
                      <dd className="text-foreground">{report.patientName}</dd>
                    </div>
                    {report.patientInfo.nationalId ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("insurance.patient.nationalId")}
                        </dt>
                        <dd className="text-foreground" dir="ltr">
                          {report.patientInfo.nationalId}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("insurance.patient.gender.label")}
                      </dt>
                      <dd className="text-foreground">{genderLabel}</dd>
                    </div>
                    {report.patientInfo.phone ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("insurance.patient.phone")}
                        </dt>
                        <dd className="text-foreground" dir="ltr">
                          {report.patientInfo.phone}
                        </dd>
                      </div>
                    ) : null}
                    {report.patientInfo.insuranceCardId ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("insurance.patient.insuranceCardId")}
                        </dt>
                        <dd className="text-foreground" dir="ltr">
                          {report.patientInfo.insuranceCardId}
                        </dd>
                      </div>
                    ) : null}
                    {report.patientInfo.insuranceFormId ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("insurance.patient.insuranceFormId")}
                        </dt>
                        <dd className="text-foreground" dir="ltr">
                          {report.patientInfo.insuranceFormId}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("insurance.patient.registration")}
                      </dt>
                      <dd className="text-foreground">
                        {formatDate(
                          new Date(report.patientInfo.registrationDate),
                          language
                        )}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {hasData ? (
                <ReportSummaryGrid
                  financials={financials}
                  totalPatientPayments={report.totalPatientPayments}
                  extra={{
                    label: t("insurance.patient.admission"),
                    value: report.admissions.length,
                  }}
                />
              ) : (
                <EmptyState
                  title={t("insurance.report.noData")}
                  description={t("insurance.messages.patientReportNote")}
                />
              )}

              {report.admissions.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("insurance.patient.admission")}{" "}
                    <span className="text-muted-foreground">
                      ({report.admissions.length})
                    </span>
                  </h3>

                  {report.admissions.map((admission, index) => {
                    const footer = buildItemFooter({
                      items: admission.items,
                      financials: calculateFinancials(admission.items),
                      meta: {
                        discount: admission.discount,
                        discountType: admission.discountType,
                        discountScope: admission.discountScope,
                        vatPercentage: admission.vatPercentage,
                        vatScopeCustom: admission.vatScopeCustom,
                      },
                      t,
                      money,
                      showItemsTotal: true,
                    })

                    return (
                      <section
                        key={admission.patientHistoryId}
                        className="space-y-2 rounded-lg border border-border p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-foreground">
                            {index + 1}.{" "}
                            {t("insurance.patient.admission")}{" "}
                            {formatDate(
                              new Date(admission.admissionTime),
                              language
                            )}
                          </h4>
                          <Badge variant="secondary">
                            Bill ID: {admission.billId}
                          </Badge>
                          {admission.dischargeTime ? (
                            <Badge className="border-success/30 bg-success-light text-success-dark">
                              {t("insurance.report.dischargeDate")}:{" "}
                              {formatDate(
                                new Date(admission.dischargeTime),
                                language
                              )}
                            </Badge>
                          ) : null}
                          {admission.diagnosis ? (
                            <Badge variant="outline">
                              {t("insurance.patient.diagnosis")}:{" "}
                              {admission.diagnosis}
                            </Badge>
                          ) : null}
                        </div>

                        {admission.items.length > 0 ? (
                          <ReportItemsTable
                            items={admission.items}
                            footer={footer}
                            caption={`${report.patientName} — ${t("insurance.patient.admission")} ${index + 1}`}
                          />
                        ) : (
                          <p className="py-3 text-center text-sm text-muted-foreground">
                            {t("insurance.report.noData")}
                          </p>
                        )}
                      </section>
                    )
                  })}
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
            {t("insurance.buttons.printPatientReport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
