"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  PencilIcon,
  HospitalIcon,
  LogOutIcon,
  PrinterIcon,
  UsersIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { usePermission } from "@/hooks/usePermission"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import type {
  Bill,
  Patient,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import {
  ProfileSectionCard,
  type ProfileSectionRow,
} from "@/pages/Patients/Profile/ProfileSectionCard"
import { EditPatientDialog } from "@/pages/Patients/Profile/Dialogs/EditPatientDialog"
import { EditDiagnosisDialog } from "@/pages/Patients/Profile/Dialogs/EditDiagnosisDialog"
import { AdmitPatientDialog } from "@/pages/Patients/Profile/Dialogs/AdmitPatientDialog"
import { DischargePatientDialog } from "@/pages/Patients/Profile/Dialogs/DischargePatientDialog"
import { EditStaffAssignmentDialog } from "@/pages/Patients/Profile/Dialogs/EditStaffAssignmentDialog"

interface PatientProfilePanelProps {
  patient: Patient | null
  admission: PatientHistory | null
  bill: Bill | null
  loading: boolean
  error: Error | null
  onRefresh: () => void
  onPrintBill: () => void
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
 * Admit/Discharge toasts connect to the eventual T7/T9 dialogs;
 * Print Bill dispatches to the top-level pdfShell.
 */
export function PatientProfilePanel({
  patient,
  admission,
  bill,
  loading,
  error,
  onRefresh,
  onPrintBill,
}: PatientProfilePanelProps) {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")

  const [editOpen, setEditOpen] = useState(false)
  const [admitOpen, setAdmitOpen] = useState(false)
  const [dischargeOpen, setDischargeOpen] = useState(false)
  const [diagnosisEditOpen, setDiagnosisEditOpen] = useState(false)
  const [staffEditOpen, setStaffEditOpen] = useState(false)

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
        bill={bill}
        onEdit={() => setEditOpen(true)}
        onAdmit={() => setAdmitOpen(true)}
        onDischarge={() => setDischargeOpen(true)}
        onEditStaff={() => setStaffEditOpen(true)}
        onPrintBill={onPrintBill}
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
          rows={medicalInfoRows(t, patient, admission, canManage, () =>
            setDiagnosisEditOpen(true)
          )}
        />
      </div>

      <EditPatientDialog
        patient={patient}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onRefresh}
      />

      <AdmitPatientDialog
        open={admitOpen}
        onOpenChange={setAdmitOpen}
        patient={patient}
        onAdmitted={onRefresh}
      />

      <DischargePatientDialog
        open={dischargeOpen}
        onOpenChange={setDischargeOpen}
        patient={patient}
        onDischarged={onRefresh}
      />

      <EditDiagnosisDialog
        open={diagnosisEditOpen}
        onOpenChange={setDiagnosisEditOpen}
        patientId={patient.patientId}
        initialDiagnosis={admission?.diagnosis ?? null}
        onSaved={onRefresh}
      />

      <EditStaffAssignmentDialog
        open={staffEditOpen}
        onOpenChange={setStaffEditOpen}
        patientId={patient.patientId}
        patientName={patient.name}
        onSaved={onRefresh}
      />
    </div>
  )
}

interface ActionBarProps {
  patient: Patient
  canManage: boolean
  bill: Bill | null
  onEdit: () => void
  onAdmit: () => void
  onDischarge: () => void
  onEditStaff: () => void
  onPrintBill: () => void
}

function ActionBar({
  patient,
  canManage,
  bill,
  onEdit,
  onAdmit,
  onDischarge,
  onEditStaff,
  onPrintBill,
}: ActionBarProps) {
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
        disabled={!canManage}
        onClick={onEdit}
      >
        <PencilIcon aria-hidden className="me-2 size-4" />
        {t("common.edit")}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!canManage || !patient.isActive}
        title={
          !patient.isActive
            ? t("patients.fields.admissionNotActive")
            : !canManage
              ? t("common.permission.requires_manage_patients")
              : undefined
        }
        onClick={onEditStaff}
      >
        <UsersIcon aria-hidden className="me-2 size-4" />
        {t("patients.buttons.editStaff")}
      </Button>

      {patient.isActive ? (
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/5"
          disabled={!canManage}
          onClick={onDischarge}
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
          onClick={onAdmit}
        >
          <HospitalIcon aria-hidden className="me-2 size-4" />
          {t("patients.buttons.admitPatient")}
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onPrintBill}
        disabled={!canManage || !bill}
        title={
          !bill
            ? t("patients.fields.admissionNotActive")
            : !canManage
              ? t("common.permission.requires_manage_patients")
              : undefined
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
    patient.guardianInfo?.name ?? null;
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
  admission: PatientHistory | null,
  canEdit: boolean,
  onEditDiagnosis: () => void
): ProfileSectionRow[] {
  return [
    {
      label: t("patients.fields.quickCheck"),
      value: admission?.quickCheck ? "Yes" : "No"
    },
    {
      label: t("patients.fields.referringDoctor"),
      value: patient.referringDoctorName ?? "—",
    },
    {
      label: t("patients.fields.diagnosis"),
      value: canEdit && admission ? (
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 whitespace-pre-wrap">
            {admission.diagnosis ?? "—"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onEditDiagnosis}
            aria-label={t("patients.buttons.editDiagnosis")}
          >
            <PencilIcon aria-hidden className="size-3.5" />
            <span className="sr-only">{t("patients.buttons.editDiagnosis")}</span>
          </Button>
        </span>
      ) : (
        admission?.diagnosis ?? "—"
      ),
    },
    {
      label: t("patients.fields.attendingDoctors"),
      value:
        admission && admission.attendingDoctors && admission.attendingDoctors.length > 0
          ? admission.attendingDoctors?.join(", ")
          : "—",
    },
    {
      label: t("patients.fields.attendingNurses"),
      value:
        admission && admission.attendingNurses && admission.attendingNurses.length > 0
          ? admission.attendingNurses?.join(", ")
          : "—",
    },
  ]
}
