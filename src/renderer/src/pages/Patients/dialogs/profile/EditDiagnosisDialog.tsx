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
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"

import { useUpdateDiagnosis } from "@/pages/Patients/hooks/profile/useUpdateDiagnosis"

interface EditDiagnosisDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number
  /** Current diagnosis (from `usePatientProfile.admission.diagnosis`). */
  initialDiagnosis: string | null
  onSaved: () => void
}

/**
 * T9.1 — Inline edit dialog for the current admission's diagnosis. Triggered
 * by clicking the pencil button next to the Diagnosis row in the Medical
 * Information section of `<PatientProfilePanel>`.
 *
 * Pre-populates the textarea with whatever the server returned so far and
 * POSTs only when the value differs. Empty submissions are blocked before
 * the wire (server also rejects with `Diagnosis is required`).
 *
 * The dialog doesn't take a `Patient` prop — just `patientId` is enough since
 * we're editing the current admission's diagnosis record, and the patient's
 * identity was already shown by the parent's row label.
 */
export function EditDiagnosisDialog({
  open,
  onOpenChange,
  patientId,
  initialDiagnosis,
  onSaved,
}: EditDiagnosisDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialDiagnosis ?? "")
  const [submitted, setSubmitted] = useState(false)
  const { setDiagnosis, submitting } = useUpdateDiagnosis(patientId)

  /* Sync the textarea when the dialog opens against a fresh admission. */
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(initialDiagnosis ?? "")
    setSubmitted(false)
  }, [open, initialDiagnosis])

  /* Reset everything on close. */
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitted(false)
  }, [open])

  const trimmed = value.trim()
  const diagnosisError =
    submitted && trimmed.length === 0
      ? t("patients.validation.diagnosisRequired")
      : null

  async function handleSubmit() {
    setSubmitted(true)
    if (trimmed.length === 0) return
    /* No-op guard — server accepts identical rewrites but we avoid the
       extra round-trip + toast spam. */
    if (trimmed === (initialDiagnosis ?? "").trim()) {
      onOpenChange(false)
      return
    }
    const ok = await setDiagnosis(trimmed)
    if (ok) {
      onOpenChange(false)
      onSaved()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.editDiagnosis")}</DialogTitle>
          <DialogDescription>
            {t("patients.help.admitOnRegisterHint")}
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="edit-diagnosis">
            {t("patients.fields.diagnosis")}
          </FieldLabel>
          <Textarea
            id="edit-diagnosis"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={Boolean(diagnosisError)}
          />
          <FieldDescription>
            {t("patients.help.admitOnRegisterHint")}
          </FieldDescription>
          {diagnosisError ? (
            <FieldError errors={[{ message: diagnosisError }]} />
          ) : null}
        </Field>

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
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner aria-hidden className="me-2 size-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
