"use client"

import { useTranslation } from "react-i18next"
import { useFormContext } from "react-hook-form"

import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

import type { WizardFormShape } from "./CreatePatientWizardDialog"

/**
 * Step 1 of the Create Patient wizard — Basic Info.
 *
 * Fields: name, gender (required), national ID (digits), phone,
 * address, plus a top-of-form "Admit on Register" checkbox. The
 * checkbox feeds the wizard's `admission.admitOnSave` boolean —
 * step 3 only renders (and adds diagnosis/attending-doctor
 * requirements) when this is set, so the user is never surprised
 * by a hidden admission step.
 */
export function PatientWizardBasicStep() {
  const { t } = useTranslation()
  const form = useFormContext<WizardFormShape>()

  const nameError = form.formState.errors.basic?.name?.message
  const genderError = form.formState.errors.basic?.gender?.message
  const nationalIdError = form.formState.errors.basic?.nationalId?.message
  const phoneError = form.formState.errors.basic?.phone?.message

  const admitOnSave = form.watch("admission.admitOnSave")

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="patient-basic-name">
          {t("patients.fields.fullName")}
        </FieldLabel>
        <Input
          id="patient-basic-name"
          {...form.register("basic.name")}
          aria-invalid={Boolean(nameError)}
          autoComplete="name"
        />
        <FieldError errors={nameError ? [{ message: nameError }] : undefined} />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-basic-gender">
          {t("patients.fields.gender")}
        </FieldLabel>
        <NativeSelect
          id="patient-basic-gender"
          {...form.register("basic.gender")}
          aria-invalid={Boolean(genderError)}
        >
          <NativeSelectOption value="">
            {t("common.select")}
          </NativeSelectOption>
          <NativeSelectOption value="male">
            {t("patients.gender.male")}
          </NativeSelectOption>
          <NativeSelectOption value="female">
            {t("patients.gender.female")}
          </NativeSelectOption>
          <NativeSelectOption value="other">
            {t("patients.gender.other")}
          </NativeSelectOption>
        </NativeSelect>
        <FieldError errors={genderError ? [{ message: genderError }] : undefined} />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-basic-national-id">
          {t("patients.fields.nationalId")}
        </FieldLabel>
        <Input
          id="patient-basic-national-id"
          inputMode="numeric"
          {...form.register("basic.nationalId")}
          aria-invalid={Boolean(nationalIdError)}
        />
        <FieldError
          errors={
            nationalIdError ? [{ message: nationalIdError }] : undefined
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-basic-phone">
          {t("patients.fields.phone")}
        </FieldLabel>
        <Input
          id="patient-basic-phone"
          type="tel"
          {...form.register("basic.phone")}
          aria-invalid={Boolean(phoneError)}
          autoComplete="tel"
        />
        <FieldError errors={phoneError ? [{ message: phoneError }] : undefined} />
      </Field>

      <Field>
        <FieldLabel htmlFor="patient-basic-address">
          {t("patients.fields.address")}
        </FieldLabel>
        <Textarea
          id="patient-basic-address"
          rows={3}
          {...form.register("basic.address")}
        />
      </Field>

      <Field>
        <label
          htmlFor="patient-basic-admit"
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <Checkbox
            id="patient-basic-admit"
            checked={admitOnSave}
            onCheckedChange={(v) => {
              form.setValue(
                "admission.admitOnSave",
                Boolean(v),
                { shouldDirty: true }
              )
              if (!v) {
                form.setValue("admission.diagnosis", "")
                form.setValue("admission.attendingDoctorIds", [])
                form.setValue("admission.attendingNurseIds", [])
                form.setValue("admission.quickCheck", false)
              }
            }}
            className="mt-1"
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {t("patients.fields.admitImmediately")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("patients.help.admitOnRegisterHint")}
            </span>
          </div>
        </label>
      </Field>
    </div>
  )
}
