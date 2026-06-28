"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFormContext } from "react-hook-form"
import { Loader2Icon } from "lucide-react"

import { Field, FieldLabel } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

import type { WizardFormShape } from "./CreatePatientWizardDialog"
import type { Doctor } from "@/pages/Patients/types/patient"
import { listDoctors } from "@/pages/Patients/api"

/**
 * Step 4 of the Create Patient wizard — Medical.
 *
 * Optional referring-doctor picker. Mirrors the legacy Quick-Check
 * path where the diagnosis attaches to the patient record (and not
 * to an admission). When `admitOnSave=true` doctors are already
 * picked in step 3; the user can still record a referring-doctor
 * independently here for medical audit purposes.
 */
export function PatientWizardMedicalStep() {
  const { t } = useTranslation()
  const form = useFormContext<WizardFormShape>()

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const d = await listDoctors()
        if (cancelled) return
        setDoctors(d)
      } catch {
        /* fall back to empty select */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="patient-medical-referring-doctor">
          {t("patients.fields.referringDoctor")}
        </FieldLabel>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon
              aria-hidden
              className="size-4 animate-spin"
            />
            {t("common.loading")}
          </div>
        ) : (
          <NativeSelect
            id="patient-medical-referring-doctor"
            {...form.register("medical.referringDoctorId", {
              setValueAs: (v) =>
                v === "" || v == null ? null : Number(v),
            })}
          >
            <NativeSelectOption value="">
              {t("patients.placeholders.selectReferringDoctor")}
            </NativeSelectOption>
            {doctors.map((d) => (
              <NativeSelectOption
                key={d.doctorId}
                value={d.doctorId}
              >
                {d.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <p className="text-xs text-muted-foreground">
          {t("patients.help.referringDoctorOptional")}
        </p>
      </Field>
    </div>
  )
}
