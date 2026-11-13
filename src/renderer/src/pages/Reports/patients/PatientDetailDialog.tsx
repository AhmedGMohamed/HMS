"use client"

/**
 * Patient report detail dialog — Phase 6.11.1.
 *
 * Opens from a row click (or the "View" action) and fetches
 * `/api/reports/patients/:id` for the **generated** range, so the detail
 * always describes the same period as the list behind it. The dialog owns its
 * own request because the list payload deliberately carries no admission
 * data (one query per page, not one per row).
 *
 * Layout mirrors the 6.10 insurance report dialog: identity card, KPI strip,
 * then one `AdmissionSection` per admission (newest first, as the server
 * returns them).
 */

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircleIcon, PrinterIcon, UserIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { ReportKpiStrip } from "@/pages/Reports/components/ReportKpiStrip"
import { PaymentTypeBadge, GenderBadge } from "@/pages/Reports/components/StatusBadges"
import { AdmissionSection } from "@/pages/Reports/patients/AdmissionSection"
import { getPatientDetail } from "@/pages/Reports/api"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type {
  PatientReportAdmission,
  PatientReportDetail,
} from "@/pages/Reports/types/patientReport"
import type { ReportRange } from "@/pages/Reports/types/reports"

export interface PatientDetailDialogProps {
  open: boolean
  patientId: number | null
  /** Generated range (never the draft). */
  range: ReportRange
  onClose: () => void
  /** When `false`, the print buttons are not rendered at all. */
  canExport: boolean
  onPrintPatient: (detail: PatientReportDetail) => Promise<void>
  onPrintAdmission: (
    detail: PatientReportDetail,
    admission: PatientReportAdmission
  ) => Promise<void>
}

interface DetailState {
  /** Patient id + period the payload belongs to. */
  key: string
  payload: PatientReportDetail | null
  error: Error | null
}

export function PatientDetailDialog({
  open,
  patientId,
  range,
  onClose,
  canExport,
  onPrintPatient,
  onPrintAdmission,
}: PatientDetailDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

  const [state, setState] = useState<DetailState | null>(null)
  const [nonce, setNonce] = useState(0)
  const [printing, setPrinting] = useState<"patient" | number | null>(null)

  /**
   * Request identity: patient **and** period. Reopening the same patient in
   * the same period re-uses the loaded detail (no round trip); changing
   * either one fetches again.
   */
  const requestKey =
    open && patientId !== null ? `${patientId}|${range.from}|${range.to}` : null

  useEffect(() => {
    if (!requestKey || patientId === null) return

    let cancelled = false
    const key = requestKey

    getPatientDetail(patientId, range)
      .then((payload) => {
        if (cancelled) return
        setState({ key, payload, error: null })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({
          key,
          payload: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        })
      })

    return () => {
      cancelled = true
    }
    // `range`/`patientId` are fully described by `requestKey`; adding them
    // would re-run the effect on every render that rebuilds the range object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, nonce])

  // A different patient (or a closed dialog) must not show the previous
  // patient's data for a frame, so everything below is keyed, not stored.
  const current = requestKey !== null && state?.key === requestKey ? state : null
  const payload = current?.payload ?? null
  const loading = requestKey !== null && current === null
  const error = current?.error ?? null

  const retry = () => {
    setState(null)
    setNonce((value) => value + 1)
  }

  const handlePrintPatient = async () => {
    if (!payload) return
    setPrinting("patient")
    try {
      await onPrintPatient(payload)
    } finally {
      setPrinting(null)
    }
  }

  const handlePrintAdmission = async (admission: PatientReportAdmission) => {
    if (!payload) return
    setPrinting(admission.patientHistoryId)
    try {
      await onPrintAdmission(payload, admission)
    } finally {
      setPrinting(null)
    }
  }

  const patient = payload?.patient ?? null
  const period = t("reports.state.range", {
    from: formatDate(new Date(`${range.from}T00:00:00`), language),
    to: formatDate(new Date(`${range.to}T00:00:00`), language),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {patient ? patient.patientName : t("reports.detail.title")}
          </DialogTitle>
          <DialogDescription>{period}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pe-1">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden />
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{t("reports.state.detailError")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retry}
                >
                  {t("reports.actions.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : !patient ? null : (
            <>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <UserIcon aria-hidden className="size-4 text-primary" />
                    {t("reports.detail.identity")}
                  </p>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
                    <Info label={t("reports.patientCard.id")}>
                      <span dir="ltr" className="tabular-nums">
                        {patient.patientId}
                      </span>
                    </Info>
                    <Info label={t("reports.patientCard.nationalId")}>
                      {patient.nationalId ? (
                        <span dir="ltr">{patient.nationalId}</span>
                      ) : (
                        "—"
                      )}
                    </Info>
                    <Info label={t("reports.patientCard.age")}>
                      {patient.age === null ? (
                        "—"
                      ) : (
                        <>
                          <span className="tabular-nums" dir="ltr">
                            {patient.age}
                          </span>{" "}
                          {t("reports.patientCard.years")}
                          {patient.birthDate ? (
                            <span className="block text-xs text-muted-foreground">
                              {t("reports.patientCard.born")}{" "}
                              <span dir="ltr">
                                {formatDate(
                                  new Date(`${patient.birthDate}T00:00:00`),
                                  language
                                )}
                              </span>
                            </span>
                          ) : null}
                        </>
                      )}
                    </Info>
                    <Info label={t("reports.table.gender")}>
                      <GenderBadge value={patient.gender} />
                    </Info>
                    <Info label={t("reports.patientCard.phone")}>
                      {patient.phone ? (
                        <span dir="ltr">{patient.phone}</span>
                      ) : (
                        "—"
                      )}
                    </Info>
                    <Info label={t("reports.patientCard.address")}>
                      {patient.address || "—"}
                    </Info>
                    <Info label={t("reports.table.paymentType")}>
                      <PaymentTypeBadge value={patient.paymentType} />
                    </Info>
                    <Info label={t("reports.patientCard.insurance")}>
                      {patient.insuranceCompany || "—"}
                      {patient.insuranceCardId ? (
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {t("reports.detail.card")}: {patient.insuranceCardId}
                        </span>
                      ) : null}
                      {patient.insuranceFormId ? (
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {t("reports.detail.form")}: {patient.insuranceFormId}
                        </span>
                      ) : null}
                    </Info>
                    <Info label={t("reports.patientCard.referringDoctor")}>
                      {patient.referringDoctorName || "—"}
                    </Info>
                  </dl>
                </CardContent>
              </Card>

              <ReportKpiStrip
                items={[
                  {
                    key: "admissions",
                    label: t("reports.summary.admissions"),
                    value: String(patient.admissionsCount),
                  },
                  {
                    key: "billed",
                    label: t("reports.summary.totalBill"),
                    value: money(patient.totalBilled),
                  },
                  {
                    key: "paid",
                    label: t("reports.summary.totalPaid"),
                    value: money(patient.totalPaid),
                  },
                  {
                    key: "outstanding",
                    label: t("reports.summary.totalOutstanding"),
                    value: money(patient.totalOutstanding),
                    tone: patient.totalOutstanding > 0 ? "warning" : "neutral",
                  },
                ]}
              />

              {payload && payload.admissions.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("reports.patientCard.admissionHistory")}{" "}
                    <span className="text-muted-foreground">
                      ({payload.admissions.length})
                    </span>
                  </h3>

                  {payload.admissions.map((admission, index) => (
                    <AdmissionSection
                      key={admission.patientHistoryId}
                      admission={admission}
                      index={index + 1}
                      onPrint={
                        canExport
                          ? () => handlePrintAdmission(admission)
                          : undefined
                      }
                      printing={printing === admission.patientHistoryId}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t("reports.patientCard.noAdmissions")}
                  description={t("reports.detail.noAdmissionsDescription")}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {canExport ? (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrintPatient}
              disabled={!payload || printing !== null}
            >
              <PrinterIcon aria-hidden className="size-4" />
              {t("reports.actions.printPatient")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("reports.actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Info({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  )
}
