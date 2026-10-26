"use client"

import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"

import type { PastAdmissionSummary } from "@/pages/Patients/hooks/admissions/usePastAdmissions"
import { dismissalBadgeVariant } from "@/pages/Patients/lib/admissions/dismissalBadgeVariant"
import {
  formatCurrency,
  formatShortDate,
} from "@/pages/Patients/lib/admissions/admissionFormat"
import { useUIStore } from "@/store/uiStore"

interface PastAdmissionCardProps {
  admission: PastAdmissionSummary
  onClick: () => void
}

/**
 * Tappable card mirroring the legacy `admission-card` markup. Header
 * (date range + admission id + dismissal-reason pill); body shows
 * 4-stat grid (services, drugs, total, balance), staff pills, and
 * optional diagnosis snippet. Whole card is clickable to open the
 * details dialog.
 */
export function PastAdmissionCard({
  admission,
  onClick,
}: PastAdmissionCardProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) as "en" | "ar"
  const dismissal = dismissalBadgeVariant(admission.leaveReason)
  const balance = (admission.totalAmount || 0) - (admission.paidAmount || 0)
  const balanceIsOwed = balance > 0
  const quickCheck = admission.quickCheck === true

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full rounded-lg border border-border bg-card text-start shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label={`${t("patients.modals.admissionDetails")} #${admission.patientHistoryId}`}
    >
      <div className="border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tracking-wide text-primary">
            {formatShortDate(admission.admissionTime, language)} —{" "}
            {formatShortDate(admission.dischargeTime, language)}
          </span>
          {quickCheck ? (
            <Badge variant="secondary">
              {t("patients.messages.quickCheckBadge")}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("patients.messages.admissionId")}: #{admission.patientHistoryId}
          </span>
          <Badge variant={dismissal.variant} className={dismissal.className}>
            {t(dismissal.labelKey)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat
            label={t("patients.messages.servicesUsed")}
            value={String(admission.totalServicesCount || 0)}
            tabular
          />
          <Stat
            label={t("patients.messages.drugsUsed")}
            value={String(admission.totalDrugsCount || 0)}
            tabular
          />
          <Stat
            label={t("patients.messages.suppliesUsed")}
            value={String(admission.totalSuppliesCount || 0)}
            tabular
          />
          <Stat
            label={t("patients.messages.totalOwed")}
            value={formatCurrency(admission.totalAmount || 0, language)}
          />
          <Stat
            label={t("patients.billing.balance")}
            value={
              <>
                {formatCurrency(Math.abs(balance), language)}{" "}
                <span
                  className={
                    balanceIsOwed
                      ? "text-destructive text-xs"
                      : "text-emerald-600 text-xs dark:text-emerald-400"
                  }
                >
                  {balanceIsOwed
                    ? t("patients.messages.due")
                    : t("patients.messages.credit")}
                </span>
              </>
            }
            valueClassName={
              balanceIsOwed ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            }
          />
        </div>

        {(admission.assignedDoctors.length > 0 ||
          admission.assignedNurses.length > 0) ? (
          <div className="flex flex-col gap-1.5 text-xs">
            {admission.assignedDoctors.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground me-1">
                  {t("patients.messages.assignedDoctors")}:
                </span>
                {admission.assignedDoctors.map((name, i) => (
                  <span
                    key={`${admission.patientHistoryId}-doc-${i}-${name}`}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
            {admission.assignedNurses.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground me-1">
                  {t("patients.messages.assignedNurses")}:
                </span>
                {admission.assignedNurses.map((name, i) => (
                  <span
                    key={`${admission.patientHistoryId}-nur-${i}-${name}`}
                    className="rounded-full bg-secondary/50 px-2 py-0.5 text-[11px]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {admission.diagnosis ? (
          <div className="rounded-md border-s-4 border-emerald-500 bg-emerald-500/5 px-3 py-2 text-sm">
            <strong className="text-foreground me-1">
              {t("patients.messages.finalDiagnosis")}:
            </strong>
            {admission.diagnosis}
          </div>
        ) : null}
      </div>
    </button>
  )
}

function Stat({
  label,
  value,
  tabular,
  valueClassName,
}: {
  label: string
  value: React.ReactNode
  tabular?: boolean
  valueClassName?: string
}) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={
          "text-foreground text-sm font-medium " +
          (valueClassName ?? "") +
          (tabular ? " tabular-nums" : "")
        }
      >
        {value}
      </div>
    </div>
  )
}
