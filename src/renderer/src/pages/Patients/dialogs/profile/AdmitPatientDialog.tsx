"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon } from "lucide-react"

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
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"

import {
  listAvailableNurses,
  listDoctors,
  listPriceLists,
} from "@/pages/Patients/api"
import type { AdmitPatientPayload } from "@/pages/Patients/api"
import type {
  Doctor,
  Nurse,
  Patient,
  PriceList,
} from "@/pages/Patients/types/patient"
import { useAdmitPatient } from "@/pages/Patients/hooks/profile/useAdmitPatient"

interface AdmitPatientDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patient: Patient | null
  onAdmitted: () => void
}

interface AdmitFormState {
  diagnosis: string
  quickCheck: boolean
  attendingDoctorIds: number[]
  attendingNurseIds: number[]
  pricelistId: number | null
}

const blankForm: AdmitFormState = {
  diagnosis: "",
  quickCheck: false,
  attendingDoctorIds: [],
  attendingNurseIds: [],
  pricelistId: null,
}

/**
 * T9.1 — Standalone admit dialog, opened from `<PatientProfilePanel>` ActionBar
 * when the patient record is currently NOT admitted (and the user has
 * `manage_patients`).
 *
 * Form state mirrors `AdmitPatientPayload` so the wire is one reshape away
 * from the hook. The dialog resolves the pricelist fallback:
 *   - If the patient's `paymentType === "insurance"`, the pricelist field is
 *     *disabled* and prefilled with `patient.insurance.pricelistId`. The server
 *     refuses an admit when the insurance pricelist is mismatched, so we make
 *     the safest choice for the user (one that matches the legacy admission UX
 *     and the server's pre-existing check).
 *   - Otherwise, the pricelist is a regular select over `listPriceLists()`.
 * Validation recreates the wizard's `superRefine` rule (diagnosis required, ≥1
 * doctor + ≥1 nurse required) without bringing back RHF.
 */
export function AdmitPatientDialog({
  open,
  onOpenChange,
  patient,
  onAdmitted,
}: AdmitPatientDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AdmitFormState>(blankForm)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [nurses, setNurses] = useState<Nurse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { admit, submitting } = useAdmitPatient(patient?.patientId ?? 0)

  const isInsurance = patient?.paymentType === "insurance"
  const insurancePricelistId = patient?.insurance?.pricelistId ?? null
  const insurancePricelistName = patient?.insurance?.pricelistName ?? null

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLookupLoading(true)
    async function load() {
      try {
        const [d, n, p] = await Promise.all([
          listDoctors(),
          listAvailableNurses(),
          listPriceLists(),
        ])
        if (cancelled) return
        setDoctors(d)
        setNurses(n)
        setPriceLists(p)
      } catch {
        /* empty states will surface naturally */
      } finally {
        if (!cancelled) setLookupLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open])

  /* When the dialog opens against an insurance-backed patient, pin the
     pricelist to the insurance's pricelist so the user can't accidentally
     post a mismatched payload. */
  useEffect(() => {
    if (!open || !isInsurance || insurancePricelistId == null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((prev) =>
      prev.pricelistId === insurancePricelistId
        ? prev
        : { ...prev, pricelistId: insurancePricelistId }
    )
  }, [open, isInsurance, insurancePricelistId])

  /* Reset everything whenever the dialog closes (success or cancel). We
     intentionally use one `open`-driven reset effect so subsequent opens
     against a different patient start from a clean slate. */
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(blankForm)
    setSubmitted(false)
  }, [open])

  const diagnosisError =
    submitted && form.diagnosis.trim().length === 0
      ? t("patients.validation.diagnosisRequired")
      : null
  const doctorError =
    submitted && form.attendingDoctorIds.length === 0
      ? t("patients.validation.attendingDoctorRequired")
      : null

  function toggleDoctor(id: number) {
    setForm((prev) => ({
      ...prev,
      attendingDoctorIds: prev.attendingDoctorIds.includes(id)
        ? prev.attendingDoctorIds.filter((x) => x !== id)
        : [...prev.attendingDoctorIds, id],
    }))
  }
  function toggleNurse(id: number) {
    setForm((prev) => ({
      ...prev,
      attendingNurseIds: prev.attendingNurseIds.includes(id)
        ? prev.attendingNurseIds.filter((x) => x !== id)
        : [...prev.attendingNurseIds, id],
    }))
  }

  async function handleSubmit() {
    if (!patient) return
    setSubmitted(true)
    if (
      form.diagnosis.trim().length === 0 ||
      form.attendingDoctorIds.length === 0
    ) {
      return
    }
    const payload: AdmitPatientPayload = {
      diagnosis: form.diagnosis.trim(),
      quickCheck: form.quickCheck ? true : null,
      attendingDoctors: form.attendingDoctorIds,
      attendingNurses: form.attendingNurseIds ?? [],
      pricelistId:
        isInsurance && insurancePricelistId != null
          ? insurancePricelistId
          : form.pricelistId,
    }

    console.log(payload)
    const result = await admit(payload)
    if (result) {
      onOpenChange(false)
      onAdmitted()
    }
  }

  /* ----- render ----- */

  if (!patient) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.admitPatient")}</DialogTitle>
          <DialogDescription>
            {t("patients.help.admitOnRegisterHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="admit-diagnosis">
              {t("patients.fields.diagnosis")}
            </FieldLabel>
            <Textarea
              id="admit-diagnosis"
              rows={3}
              value={form.diagnosis}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, diagnosis: e.target.value }))
              }
              aria-invalid={Boolean(diagnosisError)}
            />
            <FieldDescription>
              {t("patients.help.admitOnRegisterHint")}
            </FieldDescription>
            {diagnosisError ? (
              <FieldError errors={[{ message: diagnosisError }]} />
            ) : null}
          </Field>

          <Field>
            <label
              htmlFor="admit-quick-check"
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <Checkbox
                id="admit-quick-check"
                checked={form.quickCheck}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    quickCheck: Boolean(checked),
                  }))
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
            {lookupLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon aria-hidden className="size-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : doctors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("patients.messages.noDoctorsAvailable")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {doctors.map((d) => {
                  const selected = form.attendingDoctorIds.includes(
                    d.employeeId
                  )
                  return (
                    <button
                      key={d.employeeId}
                      type="button"
                      onClick={() => toggleDoctor(d.employeeId)}
                      className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      aria-pressed={selected}
                    >
                      <Badge
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer"
                      >
                        {d.name}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
            {doctorError ? (
              <FieldError errors={[{ message: doctorError }]} />
            ) : null}
          </Field>

          <Field>
            <FieldLabel>{t("patients.fields.attendingNurses")}</FieldLabel>
            {lookupLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon aria-hidden className="size-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : nurses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("patients.messages.noNursesAvailable")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nurses.map((n) => {
                  const selected = form.attendingNurseIds.includes(
                    n.employeeId
                  )
                  console.log(n)
                  return (
                    <button
                      key={n.employeeId}
                      type="button"
                      onClick={() => toggleNurse(n.employeeId)}
                      className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      aria-pressed={selected}
                    >
                      <Badge
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer"
                      >
                        {n.name}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="admit-pricelist">
              {t("patients.fields.priceList")}
            </FieldLabel>
            {isInsurance ? (
              <p className="text-sm text-muted-foreground">
                {insurancePricelistName ?? "—"}
                <span className="ms-2 text-xs italic">
                  ({t("patients.fields.pricelistDisabledForInsurance")})
                </span>
              </p>
            ) : lookupLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden className="size-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : (
              <NativeSelect
                id="admit-pricelist"
                value={form.pricelistId ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    pricelistId:
                      e.target.value === ""
                        ? null
                        : Number(e.target.value),
                  }))
                }
              >
                <NativeSelectOption value="">
                  {t("patients.placeholders.default")}
                </NativeSelectOption>
                {priceLists.map((p) => (
                  <NativeSelectOption key={p.pricelistId} value={p.pricelistId}>
                    {p.name}
                    {p.isDefault ? ` (${t("common.default")})` : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
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
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner aria-hidden className="me-2 size-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("patients.buttons.admitPatient")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
