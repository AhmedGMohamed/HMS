"use client"

/**
 * One admission inside the patient detail — Phase 6.11.1.
 *
 * Layout, top → bottom (parity with the legacy patient card):
 *   1. heading: index, admission timestamp, active/discharged badge, stay length,
 *   2. meta line: bill id, diagnosis, leave reason,
 *   3. financial grid: category totals, discount, admin, VAT, final, paid,
 *      outstanding,
 *   4. billed items, service date as a column,
 *   5. daily staff assignments,
 *   6. "Print admission" (rendered only when the caller can export).
 *
 * Money semantics: `finalTotal` is the stored `Bill.total_amount` and is
 * authoritative; the category rows exist to explain it, never to replace it.
 * The service/drug/supply split is summed from the returned items because the
 * server computed `baseTotal` from exactly those items.
 */

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate, resolveLocale } from "@/lib/utils"
import { AdmissionItemsTable } from "@/pages/Reports/patients/AdmissionItemsTable"
import { DailyStaffTable } from "@/pages/Reports/patients/DailyStaffTable"
import { AdmissionStatusBadge } from "@/pages/Reports/components/StatusBadges"
import { useUIStore } from "@/store/uiStore"
import type { PatientReportAdmission } from "@/pages/Reports/types/patientReport"

export interface AdmissionSectionProps {
  admission: PatientReportAdmission
  /** 1-based ordinal for the heading. */
  index: number
  /** Rendered only when the user may export. */
  onPrint?: () => void
  printing?: boolean
}

interface FinancialRow {
  key: string
  label: string
  value: string
  tone?: "danger" | "success" | "warning"
  emphasis?: boolean
}

export function AdmissionSection({
  admission,
  index,
  onPrint,
  printing = false,
}: AdmissionSectionProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const money = (value: number) => formatCurrency(value, resolveLocale(language))

  const categoryTotals = useMemo(() => {
    const totals = { service: 0, drug: 0, supply: 0 }
    for (const group of admission.itemsByDate) {
      for (const item of group.items) {
        if (item.itemType === "service") totals.service += item.totalPrice
        else if (item.itemType === "drug") totals.drug += item.totalPrice
        else totals.supply += item.totalPrice
      }
    }
    return totals
  }, [admission.itemsByDate])

  const rows: FinancialRow[] = [
    {
      key: "services",
      label: t("reports.admissionCard.services"),
      value: money(categoryTotals.service),
    },
    {
      key: "drugs",
      label: t("reports.admissionCard.drugs"),
      value: money(categoryTotals.drug),
    },
    {
      key: "supplies",
      label: t("reports.admissionCard.supplies"),
      value: money(categoryTotals.supply),
    },
    {
      key: "tests",
      label: t("reports.admissionCard.medicalTests"),
      value: money(admission.medicalTestsAmount),
    },
    {
      key: "base",
      label: t("reports.detail.baseTotal"),
      value: money(admission.baseTotal),
      emphasis: true,
    },
  ]

  if (admission.calculatedDiscount > 0) {
    const scope = admission.discountScope.join(" / ")
    const percent =
      admission.discountType === "percentage" ? `${admission.discount}% ` : ""
    rows.push({
      key: "discount",
      label: `${percent}${t("reports.admissionCard.discount")}${scope ? ` (${scope})` : ""}`,
      value: `-${money(admission.calculatedDiscount)}`,
      tone: "danger",
    })
  }

  if (admission.administrativeExpenses > 0) {
    rows.push({
      key: "admin",
      label: t("reports.admissionCard.adminExpenses"),
      value: money(admission.administrativeExpenses),
    })
  }

  if (admission.calculatedVat > 0) {
    const scope = admission.vatScopeCustom.join(" / ")
    rows.push({
      key: "vat",
      label: `${admission.vatPercentage}% ${t("reports.admissionCard.vat")}${scope ? ` (${scope})` : ""}`,
      value: money(admission.calculatedVat),
    })
  }

  rows.push(
    {
      key: "final",
      label: t("reports.detail.finalTotal"),
      value: money(admission.finalTotal),
      emphasis: true,
    },
    {
      key: "paid",
      label: t("reports.admissionCard.paid"),
      value: money(admission.paidAmount),
      tone: "success",
    },
    {
      key: "outstanding",
      label: t("reports.admissionCard.outstanding"),
      value: money(admission.outstandingAmount),
      tone: admission.outstandingAmount > 0 ? "warning" : "success",
      emphasis: admission.outstandingAmount > 0,
    }
  )

  const admissionLabel = admission.admissionTime
    ? formatDate(new Date(admission.admissionTime), language)
    : "—"
  const dischargeLabel = admission.dischargeTime
    ? formatDate(new Date(admission.dischargeTime), language)
    : null

  const meta = [
    admission.billId
      ? t("reports.detail.billId", { id: admission.billId })
      : t("reports.detail.noBill"),
    admission.diagnosis
      ? `${t("reports.admissionCard.diagnosis")}: ${admission.diagnosis}`
      : null,
    admission.leaveReason
      ? `${t("reports.detail.leaveReason")}: ${admission.leaveReason}`
      : null,
  ].filter(Boolean) as string[]

  const toneClass = (tone: FinancialRow["tone"]) => {
    switch (tone) {
      case "danger":
        return "text-danger"
      case "success":
        return "text-success-dark"
      case "warning":
        return "text-warning"
      default:
        return "text-foreground"
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="font-medium text-foreground">
            {t("reports.detail.admissionHeading", {
              index,
              date: admissionLabel,
            })}
          </h4>
          <p className="text-xs text-muted-foreground">{meta.join("  ·  ")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AdmissionStatusBadge active={admission.dischargeTime === null} />
          <span className="text-xs text-text-secondary">
            {dischargeLabel
              ? t("reports.detail.dischargedOn", { date: dischargeLabel })
              : t("reports.detail.currentlyAdmitted")}
          </span>
          {admission.lengthOfStayDays > 0 ? (
            <span className="text-xs text-text-tertiary">
              {t("reports.detail.lengthOfStay", {
                count: admission.lengthOfStayDays,
              })}
            </span>
          ) : null}
          {onPrint ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrint}
              disabled={printing}
            >
              <PrinterIcon aria-hidden className="size-4" />
              {t("reports.actions.printAdmission")}
            </Button>
          ) : null}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-surface-muted px-3 py-2.5 text-sm md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd
              className={`tabular-nums ${toneClass(row.tone)} ${
                row.emphasis ? "font-semibold" : ""
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h5 className="text-xs font-medium text-text-secondary">
          {t("reports.detail.billedItems")}
        </h5>
        <AdmissionItemsTable groups={admission.itemsByDate} />
      </div>

      <div className="flex flex-col gap-2">
        <h5 className="text-xs font-medium text-text-secondary">
          {t("reports.admissionCard.dailyStaff")}
        </h5>
        <DailyStaffTable days={admission.dailyStaff} />
      </div>
    </section>
  )
}
