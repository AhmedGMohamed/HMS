"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

import type { DischargePatientPayload } from "@/pages/Patients/api"
import type { LeaveReason, Patient } from "@/pages/Patients/types/patient"
import { useDischargePatient } from "@/pages/Patients/Profile/hooks/useDischargePatient"

interface DischargePatientDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patient: Patient | null
  onDischarged: () => void
}

interface DischargeFormState {
  leaveReason: LeaveReason | ""
  dischargeTime: string
}

const blankForm: DischargeFormState = {
  leaveReason: "",
  dischargeTime: "",
}

const LEAVE_REASONS: readonly LeaveReason[] = [
  "improvement",
  "death",
  "transfer",
  "as_desired",
] as const

/**
 * T9.1 — Discharge dialog opened from `<PatientProfilePanel>` ActionBar when
 * the patient has an active admission (and the user has `manage_patients`).
 *
 * Mirrors the legacy `#dischargeModal` body — two fields:
 *   - `leaveReason` (required) select populated by enum keys.
 *   - `dischargeTime` (optional) datetime-local, blank means "use now" on the
 *     server (passes nothing in the payload, matching legacy behaviour).
 *
 * The dialog is intentionally not a `<form>` — submit fires synchronously
 * inside the click handler so we don't double-fire via both `onSubmit` and
 * `keydown/Enter`. Preventing accidental page-reload is handled by `type=
 * "button"` on every interactive element.
 */
export function DischargePatientDialog({
  open,
  onOpenChange,
  patient,
  onDischarged,
}: DischargePatientDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<DischargeFormState>(blankForm)
  const [submitted, setSubmitted] = useState(false)
  const { discharge, submitting } = useDischargePatient(patient?.patientId ?? 0)

  /* Reset when opening against a fresh patient / on close. */
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(blankForm)
    setSubmitted(false)
  }, [open])

  const leaveReasonError =
    submitted && form.leaveReason === ""
      ? t("patients.validation.leaveReasonRequired")
      : null

  async function handleSubmit() {
    if (!patient) return
    setSubmitted(true)
    if (form.leaveReason === "") return
    const payload: DischargePatientPayload = {
      leaveReason: form.leaveReason,
      dischargeTime: form.dischargeTime === "" ? null : form.dischargeTime,
    }
    const ok = await discharge(payload)
    if (ok) {
      onOpenChange(false)
      onDischarged()
    }
  }

  if (!patient) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.discharge")}</DialogTitle>
          <DialogDescription>
            {patient.name}{" "}
            <span className="text-xs text-muted-foreground tabular-nums">
              #{patient.patientId}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="discharge-leave-reason">
              {t("patients.fields.leaveReason")} *
            </FieldLabel>
            <NativeSelect
              id="discharge-leave-reason"
              value={form.leaveReason}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  leaveReason: e.target.value as LeaveReason | "",
                }))
              }
              aria-invalid={Boolean(leaveReasonError)}
            >
              <NativeSelectOption value="">
                {t("patients.placeholders.selectReason")}
              </NativeSelectOption>
              {LEAVE_REASONS.map((reason) => (
                <NativeSelectOption key={reason} value={reason}>
                  {t(`patients.leaveReasons.${reason}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {leaveReasonError ? (
              <FieldError errors={[{ message: leaveReasonError }]} />
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="discharge-time">
              {t("patients.fields.dischargeTime")}
            </FieldLabel>
            <Input
              id="discharge-time"
              type="datetime-local"
              value={form.dischargeTime}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  dischargeTime: e.target.value,
                }))
              }
            />
            <FieldDescription>
              {t("patients.help.dischargeTimeInfo")}
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner aria-hidden className="me-2 size-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("patients.buttons.dischargePatient")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
