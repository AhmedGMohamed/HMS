"use client"

import { useTranslation } from "react-i18next"
import { useFormContext } from "react-hook-form"

import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import type { WizardFormShape } from "./CreatePatientWizardDialog"

/**
 * Step 2 of the Create Patient wizard — Guardian Info.
 *
 * All fields are optional. The patient may not have a guardian on
 * file (walk-in adults, no parent contact, etc.); the legacy page
 * collected these but never required any of them. We follow parity
 * so an empty guardian doesn't block submission.
 *
 * Validation (national-id digits, phone shape) still fires when the
 * user does enter text — via the wizard's `wizardGuardianSchema`.
 */
export function PatientWizardGuardianStep() {
  const { t } = useTranslation()
  const form = useFormContext<WizardFormShape>()

  const phoneError =
    form.formState.errors.guardian?.guardianPhone?.message
  const nationalIdError =
    form.formState.errors.guardian?.guardianNationalId?.message

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="patient-guardian-name">
          {t("patients.fields.guardianName")}
        </FieldLabel>
        <Input
          id="patient-guardian-name"
          autoComplete="off"
          {...form.register("guardian.guardianName")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-guardian-phone">
          {t("patients.fields.guardianPhone")}
        </FieldLabel>
        <Input
          id="patient-guardian-phone"
          type="tel"
          autoComplete="off"
          {...form.register("guardian.guardianPhone")}
          aria-invalid={Boolean(phoneError)}
        />
        <FieldError
          errors={
            phoneError ? [{ message: phoneError }] : undefined
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-guardian-national-id">
          {t("patients.fields.guardianNationalId")}
        </FieldLabel>
        <Input
          id="patient-guardian-national-id"
          inputMode="numeric"
          {...form.register("guardian.guardianNationalId")}
          aria-invalid={Boolean(nationalIdError)}
        />
        <FieldError
          errors={
            nationalIdError
              ? [{ message: nationalIdError }]
              : undefined
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-guardian-address">
          {t("patients.fields.guardianAddress")}
        </FieldLabel>
        <Textarea
          id="patient-guardian-address"
          rows={3}
          {...form.register("guardian.guardianAddress")}
        />
      </Field>
    </div>
  )
}
