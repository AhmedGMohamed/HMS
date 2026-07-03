"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  HistoryIcon,
  PencilIcon,
  HospitalIcon,
  LogOutIcon,
  PrinterIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { usePermission } from "@/hooks/usePermission"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import type {
  Patient,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import {
  ProfileSectionCard,
  type ProfileSectionRow,
} from "@/pages/Patients/Profile/ProfileSectionCard"
import { EditPatientDialog } from "@/pages/Patients/Profile/EditPatientDialog"

interface PatientProfilePanelProps {
  patient: Patient | null
  admission: PatientHistory | null
  loading: boolean
  error: Error | null
  onRefresh: () => void
}

/**
 * /patients/:id — Profile tab body.
 *
 * Surfaces the patient record as four `ProfileSectionCard`s
 * (Basic / Guardian / Payment / Medical) plus a top action row.
 *
 * Action buttons honour a `manage_patients` permission: users
 * without it can read the profile but can't Edit / Admit /
 * Discharge / Print Bill. The implicit visibility toggle on
 * Admit/Discharge matches the legacy `updateActionButtons()`
 * (Admit only when `!is_active`, Discharge only when `is_active`).
 * Admit/Discharge/PrintBill toasts are connections to the eventual
 * T7/T9/T6 dialogs.
 */
export function PatientProfilePanel({
  patient,
  admission,
  loading,
  error,
  onRefresh,
}: PatientProfilePanelProps) {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")

  const [editOpen, setEditOpen] = useState(false)

  if (loading && !patient) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground"
      >
        <Spinner aria-hidden className="size-4 animate-spin" />
        {t("common.loading")}
      </div>
    )
  }

  if (error && !patient) {
    return (
      <EmptyState
        title={t("patients.messages.loadPatientError")}
        description={error.message || t("common.error")}
        action={
          <Button variant="outline" onClick={onRefresh}>
            {t("common.refresh")}
          </Button>
        }
      />
    )
  }

  if (!patient) {
    return (
      <EmptyState
        title={t("patients.title")}
        description={t("patients.messages.editPatientMissing")}
        action={
          <Button asChild variant="outline">
            <Link to="/patients">{t("common.back")}</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ActionBar
        patient={patient}
        canManage={canManage}
        onEdit={() => setEditOpen(true)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ProfileSectionCard
          title={t("patients.sections.basicInfo")}
          rows={basicInfoRows(t, patient)}
        />
        <ProfileSectionCard
          title={t("patients.sections.guardianInfo")}
          rows={guardianInfoRows(t, patient)}
        />
        <ProfileSectionCard
          title={t("patients.sections.paymentInfo")}
          rows={paymentInfoRows(t, patient)}
        />
        <ProfileSectionCard
          title={t("patients.sections.medicalInfo")}
          rows={medicalInfoRows(t, patient, admission)}
        />
      </div>

      <EditPatientDialog
        patient={patient}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onRefresh}
      />
    </div>
  )
}

interface ActionBarProps {
  patient: Patient
  canManage: boolean
  onEdit: () => void
}

function ActionBar({ patient, canManage, onEdit }: ActionBarProps) {
  const { t } = useTranslation()
  return (
    <div
      role="toolbar"
      aria-label={t("patients.patientDetails")}
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          toast.info(t("common.loading"), {
            description: t("patients.buttons.pastAdmissions"),
          })
        }
      >
        <HistoryIcon aria-hidden className="me-2 size-4" />
        {t("patients.buttons.pastAdmissions")}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!canManage}
        onClick={onEdit}
      >
        <PencilIcon aria-hidden className="me-2 size-4" />
        {t("common.edit")}
      </Button>

      {patient.isActive ? (
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/5"
          disabled={!canManage}
          onClick={() =>
            toast.info(t("common.loading"), {
              description: t("patients.buttons.dischargePatient"),
            })
          }
        >
          <LogOutIcon aria-hidden className="me-2 size-4" />
          {t("patients.buttons.dischargePatient")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="text-success hover:bg-success/5"
          disabled={!canManage}
          onClick={() =>
            toast.info(t("common.loading"), {
              description: t("patients.buttons.admitPatient"),
            })
          }
        >
          <HospitalIcon aria-hidden className="me-2 size-4" />
          {t("patients.buttons.admitPatient")}
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          toast.info(t("common.loading"), {
            description: t("patients.buttons.printBill"),
          })
        }
      >
        <PrinterIcon aria-hidden className="me-2 size-4" />
        {t("patients.buttons.printBill")}
      </Button>
    </div>
  )
}

/* ----------------------------------------------------------------
   Row builders — translate first, then shape into ProfileSectionRow.
   T4 keeps to four sections matching the legacy `patients.html` info
   groups; Assigned Services / Drugs / Supplies land in T5.
   ---------------------------------------------------------------- */

function basicInfoRows(
  t: (key: string, options?: Record<string, unknown>) => string,
  patient: Patient
): ProfileSectionRow[] {
  return [
    { label: t("patients.fields.fullName"), value: patient.name },
    {
      label: t("patients.fields.gender"),
      value: patient.gender ? t(`patients.gender.${patient.gender}`) : "—",
    },
    {
      label: t("patients.fields.nationalId"),
      value: patient.nationalId ?? "—",
    },
    { label: t("patients.fields.phone"), value: patient.phone ?? "—" },
    { label: t("patients.fields.address"), value: patient.address ?? "—" },
    {
      label: t("patients.fields.registrationDate"),
      value: patient.registrationDate
        ? new Date(patient.registrationDate).toLocaleDateString()
        : "—",
    },
    {
      label: t("common.status"),
      value: patient.isActive
        ? t("patients.status.admitted")
        : t("patients.status.notAdmitted"),
    },
  ]
}

function guardianInfoRows(
  t: (key: string, options?: Record<string, unknown>) => string,
  patient: Patient
): ProfileSectionRow[] {
  const guardianName =
    patient.guardianInfo?.name  ?? null;
  const guardianPhone =
    patient.guardianInfo?.phone ?? null;
  const guardianAddress =
    patient.guardianInfo?.address ?? null;
  return [
    {
      label: t("patients.fields.guardianName"),
      value: guardianName ?? "—",
    },
    {
      label: t("patients.fields.guardianPhone"),
      value: guardianPhone ?? "—",
    },
    {
      /* The legacy patient detail labelled the Guardian National ID
         with `patients.fields.nationalId`, not a dedicated key.
         Reuse that to keep translation surface narrow; future
         phase can introduce `patients.fields.guardianNationalId`. */
      label: t("patients.fields.guardianNationalId"),
      value: patient.guardianInfo?.nationalId ?? "—",
    },
    {
      label: t("patients.fields.guardianAddress"),
      value: guardianAddress ?? "—",
    },
  ]
}

function paymentInfoRows(
  t: (key: string, options?: Record<string, unknown>) => string,
  patient: Patient
): ProfileSectionRow[] {
  return [
    {
      label: t("patients.fields.paymentType"),
      value: t(
        `patients.paymentTypes.${patient.paymentType}` as
          | "patients.paymentTypes.cash"
          | "patients.paymentTypes.credit"
          | "patients.paymentTypes.insurance"
      ),
    },
    {
      label: t("patients.fields.insuranceCompany"),
      value:
        patient.insuranceCompanyName ??
        patient.insurance?.pricelistName ??
        "—",
    },
    {
      label: t("patients.fields.insuranceCardId"),
      value: patient.insurance?.insuranceCardId ?? "—",
    },
    {
      label: t("patients.fields.insuranceFormId"),
      value: patient.insurance?.insuranceFormId ?? "—",
    },
    {
      label: t("patients.fields.priceList"),
      value: patient.insurance?.pricelistName ?? "—",
    },
  ]
}

function medicalInfoRows(
  t: (key: string, options?: Record<string, unknown>) => string,
  patient: Patient,
  admission: PatientHistory | null
): ProfileSectionRow[] {
  return [
    {
      label: t("patients.fields.quickCheck"),
      value: admission?.quickCheck ?? "—",
    },
    {
      label: t("patients.fields.referringDoctor"),
      value: patient.referringDoctorName ?? "—",
    },
    {
      label: t("patients.fields.diagnosis"),
      value: admission?.diagnosis ?? "—",
    },
    {
      label: t("patients.fields.attendingDoctors"),
      value:
        admission && admission.assignedDoctors && admission.assignedDoctors.length > 0
          ? admission.assignedDoctors.map((d) => d.name).join(", ")
          : "—",
    },
    {
      label: t("patients.fields.attendingNurses"),
      value:
        admission && admission.assignedNurses && admission.assignedNurses.length > 0
          ? admission.assignedNurses.map((n) => n.name).join(", ")
          : "—",
    },
  ]
}
