"use client"

import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"
import {
  CalendarPlusIcon,
  CreditCardIcon,
  FileTextIcon,
  HospitalIcon,
  PhoneIcon,
  UserIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  resolveLocale,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { InsurancePatient } from "@/pages/Insurance/types/insurance"

export interface PatientCardProps {
  patient: InsurancePatient
  canManageReports: boolean
  onGenerateReport: (patient: InsurancePatient) => void
}

interface MetaRowProps {
  icon: ReactNode
  children: ReactNode
}

function MetaRow({ icon, children }: MetaRowProps) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </li>
  )
}

/**
 * Patient card inside the detail view (Phase 6.10 plan §3, Decision #14).
 *
 * Legacy parity: status badge, gender + localized label, optional phone,
 * insurance card / form IDs, registration date, and — when the patient
 * has an open admission — the admission date, diagnosis, bill total,
 * medical tests and outstanding amount (zero highlighted green).
 *
 * One deliberate fix: a missing diagnosis now reads "No diagnosis
 * recorded" instead of the legacy "No active admission", which was shown
 * *inside* an active-admission block.
 */
export function PatientCard({
  patient,
  canManageReports,
  onGenerateReport,
}: PatientCardProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"
  const locale = resolveLocale(language)

  const genderKey =
    patient.gender === "male"
      ? "insurance.patient.gender.male"
      : patient.gender === "female"
        ? "insurance.patient.gender.female"
        : "insurance.patient.gender.other"

  const admission = patient.currentAdmission

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium text-foreground">{patient.name}</p>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0",
              patient.isActive
                ? "border-success/30 bg-success-light text-success-dark"
                : "bg-muted text-muted-foreground"
            )}
          >
            {patient.isActive
              ? t("insurance.patient.status.active")
              : t("insurance.patient.status.inactive")}
          </Badge>
        </div>

        <ul className="space-y-1.5">
          <MetaRow icon={<UserIcon className="size-3.5" />}>
            {t(genderKey)}
          </MetaRow>
          {patient.phone ? (
            <MetaRow icon={<PhoneIcon className="size-3.5" />}>
              <span dir="ltr">{patient.phone}</span>
            </MetaRow>
          ) : null}
          {patient.insuranceCardId ? (
            <MetaRow icon={<CreditCardIcon className="size-3.5" />}>
              {t("insurance.patient.insuranceCardId")}:{" "}
              <span dir="ltr">{patient.insuranceCardId}</span>
            </MetaRow>
          ) : null}
          {patient.insuranceFormId ? (
            <MetaRow icon={<FileTextIcon className="size-3.5" />}>
              {t("insurance.patient.insuranceFormId")}:{" "}
              <span dir="ltr">{patient.insuranceFormId}</span>
            </MetaRow>
          ) : null}
          <MetaRow icon={<CalendarPlusIcon className="size-3.5" />}>
            {t("insurance.patient.registration")}:{" "}
            {formatDate(new Date(patient.registrationDate), language)}
          </MetaRow>
        </ul>

        {admission ? (
          <div className="rounded-md border border-border bg-surface-muted/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
              <HospitalIcon aria-hidden className="size-3.5 text-primary" />
              {t("insurance.patient.admission")}
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">
                  {t("insurance.patient.admissionDate")}
                </dt>
                <dd className="text-foreground">
                  {formatDateTime(new Date(admission.admissionTime), language)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("insurance.patient.diagnosis")}
                </dt>
                <dd className="truncate text-foreground">
                  {admission.diagnosis || t("insurance.patient.noDiagnosis")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("common.total")}</dt>
                <dd className="tabular-nums text-foreground">
                  {formatCurrency(admission.totalAmount, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("insurance.report.totalMedicalTests")}
                </dt>
                <dd className="tabular-nums text-foreground">
                  {formatCurrency(admission.medicalTestsAmount, locale)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">
                  {t("insurance.patient.outstandingAmount")}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums",
                    admission.outstandingAmount === 0
                      ? "text-success"
                      : "text-warning"
                  )}
                >
                  {formatCurrency(admission.outstandingAmount, locale)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {canManageReports ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-auto w-full"
            onClick={() => onGenerateReport(patient)}
          >
            <FileTextIcon aria-hidden className="me-1.5 size-4" />
            {t("insurance.buttons.generatePatientReport")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
