"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFormContext } from "react-hook-form"
import { Loader2Icon } from "lucide-react"

import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

import type { WizardFormShape } from "./CreatePatientWizardDialog"
import type { Doctor, Nurse } from "@/pages/Patients/types/patient"
import { listAvailableNurses, listDoctors } from "@/pages/Patients/api"

interface AdmissionOption<T> {
  row: T
  selected: boolean
}

/**
 * Step 3 of the Create Patient wizard — Admission.
 *
 * Always rendered when the wizard reaches this step, but its visible
 * fields toggle on the `Admit Patient Immediately` switch. Schema
 * gates validation: when `admitOnSave=true`, diagnosis and at least
 * one attending doctor are required.
 *
 * Pulls Doctor + Nurse lists once on mount, ranks available staff
 * first, and offers a single-toggle button per attending role.
 */
export function PatientWizardAdmissionStep() {
  const { t } = useTranslation()
  const form = useFormContext<WizardFormShape>()

  const admitOnSave = form.watch("admission.admitOnSave")
  const diagnosisError = form.formState.errors.admission?.diagnosis?.message
  const attendingError =
    form.formState.errors.admission?.attendingDoctorIds?.message

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [nurses, setNurses] = useState<Nurse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [d, n] = await Promise.all([
          listDoctors(),
          listAvailableNurses(),
        ])
        if (cancelled) return
        setDoctors(d)
        setNurses(n)
      } catch {
        /* empty selectors fall back to a friendly empty state */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const attendingDoctors = form.watch("admission.attendingDoctorIds") ?? []
  const attendingNurses = form.watch("admission.attendingNurseIds") ?? []

  const doctorOptions: AdmissionOption<Doctor>[] = doctors.map((d) => ({
    row: d,
    selected: attendingDoctors.includes(d.doctorId),
  }))
  const nurseOptions: AdmissionOption<Nurse>[] = nurses.map((n) => ({
    row: n,
    selected: attendingNurses.includes(n.nurseId),
  }))

  function toggleDoctor(id: number) {
    const next = attendingDoctors.includes(id)
      ? attendingDoctors.filter((x) => x !== id)
      : [...attendingDoctors, id]
    form.setValue("admission.attendingDoctorIds", next)
  }
  function toggleNurse(id: number) {
    const next = attendingNurses.includes(id)
      ? attendingNurses.filter((x) => x !== id)
      : [...attendingNurses, id]
    form.setValue("admission.attendingNurseIds", next)
  }

  return (
    <div className="grid gap-4">
      {admitOnSave ? (
        <>
          <Field>
            <FieldLabel htmlFor="patient-admit-diagnosis">
              {t("patients.fields.diagnosis")}
            </FieldLabel>
            <Textarea
              id="patient-admit-diagnosis"
              rows={3}
              {...form.register("admission.diagnosis")}
              aria-invalid={Boolean(diagnosisError)}
            />
            <FieldError
              errors={
                diagnosisError
                  ? [{ message: diagnosisError }]
                  : undefined
              }
            />
          </Field>

          <Field>
            <label
              htmlFor="patient-admit-quick-check"
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <Checkbox
                id="patient-admit-quick-check"
                checked={form.watch("admission.quickCheck")}
                onCheckedChange={(v) =>
                  form.setValue("admission.quickCheck", Boolean(v), {
                    shouldDirty: true,
                  })
                }
                className="mt-1"
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  {t("patients.fields.quickCheckAdmission")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("patients.help.quickCheckInfo")}
                </span>
              </div>
            </label>
          </Field>

          <Field>
            <FieldLabel>{t("patients.fields.attendingDoctors")}</FieldLabel>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon
                  aria-hidden
                  className="size-4 animate-spin"
                />
                {t("common.loading")}
              </div>
            ) : doctorOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("patients.messages.noDoctorsAvailable")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {doctorOptions.map((d) => (
                  <button
                    key={d.row.doctorId}
                    type="button"
                    onClick={() => toggleDoctor(d.row.doctorId)}
                    className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    aria-pressed={d.selected}
                  >
                    <Badge
                      variant={d.selected ? "default" : "outline"}
                      className="cursor-pointer"
                    >
                      {d.row.name}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            <FieldError
              errors={
                attendingError ? [{ message: attendingError }] : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel>{t("patients.fields.attendingNurses")}</FieldLabel>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon
                  aria-hidden
                  className="size-4 animate-spin"
                />
                {t("common.loading")}
              </div>
            ) : nurseOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("patients.messages.noNursesAvailable")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nurseOptions.map((n) => (
                  <button
                    key={n.row.nurseId}
                    type="button"
                    onClick={() => toggleNurse(n.row.nurseId)}
                    className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    aria-pressed={n.selected}
                  >
                    <Badge
                      variant={n.selected ? "default" : "outline"}
                      className="cursor-pointer"
                    >
                      {n.row.name}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </Field>
        </>
      ) : null}
    </div>
  )
}
