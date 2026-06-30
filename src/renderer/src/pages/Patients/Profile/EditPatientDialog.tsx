"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

import {
  listInsuranceCompanies,
  listPriceLists,
  updatePatient,
} from "@/pages/Patients/api"
import {
  editPatientSchema,
  type EditPatientValues,
} from "@/pages/Patients/schemas/patient.schema"
import type {
  InsuranceCompany,
  Patient,
  PriceList,
  Gender
} from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"

interface EditPatientDialogProps {
  patient: Patient
  open: boolean
  onOpenChange: (next: boolean) => void
  onSaved?: () => void
}

/**
 * Edit Patient dialog (T4 — Subset A).
 *
 * Exposes Basic + Guardian + Payment fields. Diagnosis / quickCheck
 * / attending staff / referring doctor stay out of the form — each
 * has its own dialog landing in T7/T9.
 *
 * Pre-fills from `patient` props; resolves again every time the
 * dialog re-mounts so a stale edit doesn't leak across two distinct
 * patients. Resets on close.
 *
 * Reads `insurance-companies` + `price-lists` once on first open to
 * populate selectors. Uses React Query's `enabled` to gate fetching
 * on `open`. (We could reuse the wizard's loaders — but the wizard
 * is for create so the loaders are reserved.)
 */
export function EditPatientDialog({
  patient,
  open,
  onOpenChange,
  onSaved,
}: EditPatientDialogProps) {
  const { t } = useTranslation()

  const form = useForm<EditPatientValues>({
    resolver: zodResolver(editPatientSchema),
    mode: "onBlur",
    defaultValues: patientToFormDefaults(patient),
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      form.reset(patientToFormDefaults(patient))
    }
  }, [open, patient, form])

  const paymentType = form.watch("paymentType")
  const insuranceError = form.formState.errors.insuranceId?.message
  const insuranceCardError =
    form.formState.errors.insuranceCardId?.message
  const insuranceFormError =
    form.formState.errors.insuranceFormId?.message

  /* Insurance / price-list lookups — load once on first open, idle
     afterwards. Mirrors the wizard's payment-step loader so we don't
     need a server-roundtrip per field edit. */
  const [insuranceList, setInsuranceList] = useState<InsuranceCompany[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loadingLookups, setLoadingLookups] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingLookups(true)
    Promise.all([listInsuranceCompanies(), listPriceLists()])
      .then(([ic, pl]) => {
        if (cancelled) return
        setInsuranceList(ic)
        setPriceLists(pl)
      })
      .catch(() => {
        /* keep empty selectors and fall back to plain `<Input>` for insurance id */
      })
      .finally(() => {
        if (!cancelled) setLoadingLookups(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function onSubmit(values: EditPatientValues) {
    setSubmitting(true)
      try {
      await updatePatient(patient.patientId, {
        name: values.name.trim(),
        gender: values.gender as Gender,
        nationalId: values.nationalId?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        address: values.address?.trim() || undefined,
        paymentType: values.paymentType,
        insuranceId:
          values.paymentType === "insurance" ? values.insuranceId ?? null : null,
        insuranceCardId:
          values.paymentType === "insurance"
            ? values.insuranceCardId?.trim() || null
            : null,
        insuranceFormId:
          values.paymentType === "insurance"
            ? values.insuranceFormId?.trim() || null
            : null,
        guardianInfo: {
          name: values.guardianName?.trim() || null,
          phone: values.guardianPhone?.trim() || null,
          nationalId: values.guardianNationalId?.trim() || null,
          address: values.guardianAddress?.trim() || null,
        },
        pricelistId: values.pricelistId ?? null,
      })
      toast.success(t("patients.messages.patientUpdated"))
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.messages.editPatientError")
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.editPatient")}</DialogTitle>
          <DialogDescription>
            {patient.name}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          {/* Basic */}
          <SectionHeading>{t("patients.sections.basicInfo")}</SectionHeading>
          <Field>
            <FieldLabel htmlFor="edit-patient-name">
              {t("patients.fields.fullName")}
            </FieldLabel>
            <Input
              id="edit-patient-name"
              {...form.register("name")}
              autoComplete="name"
            />
            <FieldError
              errors={
                form.formState.errors.name
                  ? [{ message: form.formState.errors.name.message ?? "" }]
                  : undefined
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-gender">
              {t("patients.fields.gender")}
            </FieldLabel>
            <NativeSelect
              id="edit-patient-gender"
              {...form.register("gender")}
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
            <FieldError
              errors={
                form.formState.errors.gender
                  ? [{ message: form.formState.errors.gender.message ?? "" }]
                  : undefined
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-national-id">
              {t("patients.fields.nationalId")}
            </FieldLabel>
            <Input
              id="edit-patient-national-id"
              inputMode="numeric"
              {...form.register("nationalId")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-phone">
              {t("patients.fields.phone")}
            </FieldLabel>
            <Input
              id="edit-patient-phone"
              type="tel"
              {...form.register("phone")}
              autoComplete="tel"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-address">
              {t("patients.fields.address")}
            </FieldLabel>
            <Textarea
              id="edit-patient-address"
              rows={3}
              {...form.register("address")}
            />
          </Field>

          {/* Guardian */}
          <SectionHeading>{t("patients.sections.guardianInfo")}</SectionHeading>
          <Field>
            <FieldLabel htmlFor="edit-patient-guardian-name">
              {t("patients.fields.guardianName")}
            </FieldLabel>
            <Input
              id="edit-patient-guardian-name"
              {...form.register("guardianName")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-guardian-phone">
              {t("patients.fields.guardianPhone")}
            </FieldLabel>
            <Input
              id="edit-patient-guardian-phone"
              type="tel"
              {...form.register("guardianPhone")}
              autoComplete="tel"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-guardian-national-id">
              {t("patients.fields.nationalId")}
            </FieldLabel>
            <Input
              id="edit-patient-guardian-national-id"
              inputMode="numeric"
              {...form.register("guardianNationalId")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-patient-guardian-address">
              {t("patients.fields.guardianAddress")}
            </FieldLabel>
            <Textarea
              id="edit-patient-guardian-address"
              rows={2}
              {...form.register("guardianAddress")}
            />
          </Field>

          {/* Payment */}
          <SectionHeading>{t("patients.sections.paymentInfo")}</SectionHeading>
          <Field>
            <FieldLabel htmlFor="edit-patient-payment-type">
              {t("patients.fields.paymentType")}
            </FieldLabel>
            <NativeSelect
              id="edit-patient-payment-type"
              {...form.register("paymentType")}
            >
              <NativeSelectOption value="cash">
                {t("patients.paymentTypes.cash")}
              </NativeSelectOption>
              <NativeSelectOption value="credit">
                {t("patients.paymentTypes.credit")}
              </NativeSelectOption>
              <NativeSelectOption value="insurance">
                {t("patients.paymentTypes.insurance")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>

          {paymentType === "insurance" ? (
            <>
              <Field>
                <FieldLabel htmlFor="edit-patient-insurance">
                  {t("patients.fields.insuranceCompany")}
                </FieldLabel>
                <NativeSelect
                  id="edit-patient-insurance"
                  {...form.register("insuranceId", {
                    setValueAs: (v) =>
                      v === "" || v == null ? null : Number(v),
                  })}
                  aria-invalid={Boolean(insuranceError)}
                  disabled={loadingLookups}
                >
                  <NativeSelectOption value="">
                    {loadingLookups
                      ? t("common.loading")
                      : t("common.select")}
                  </NativeSelectOption>
                  {insuranceList.map((ic) => (
                    <NativeSelectOption
                      key={ic.insuranceId}
                      value={ic.insuranceId}
                    >
                      {ic.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError
                  errors={
                    insuranceError
                      ? [{ message: insuranceError }]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-patient-insurance-card">
                  {t("patients.fields.insuranceCardId")}
                </FieldLabel>
                <Input
                  id="edit-patient-insurance-card"
                  {...form.register("insuranceCardId")}
                  aria-invalid={Boolean(insuranceCardError)}
                />
                <FieldError
                  errors={
                    insuranceCardError
                      ? [{ message: insuranceCardError }]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-patient-insurance-form">
                  {t("patients.fields.insuranceFormId")}
                </FieldLabel>
                <Input
                  id="edit-patient-insurance-form"
                  {...form.register("insuranceFormId")}
                  aria-invalid={Boolean(insuranceFormError)}
                />
                <FieldError
                  errors={
                    insuranceFormError
                      ? [{ message: insuranceFormError }]
                      : undefined
                  }
                />
              </Field>
            </>
          ) : null}

          <Field>
            <FieldLabel htmlFor="edit-patient-pricelist">
              {t("patients.fields.priceList")}
            </FieldLabel>
            <NativeSelect
              id="edit-patient-pricelist"
              {...form.register("pricelistId", {
                setValueAs: (v) =>
                  v === "" || v == null ? null : Number(v),
              })}
            >
              <NativeSelectOption value="">
                {t("patients.fields.default")}
              </NativeSelectOption>
              {priceLists.map((pl) => (
                <NativeSelectOption
                  key={pl.priceListId}
                  value={pl.priceListId}
                >
                  {pl.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Spinner aria-hidden className="me-2 size-4" />
              ) : null}
              {t("patients.buttons.savePatient")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="border-s-4 border-primary ps-3 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h6>
  )
}

function patientToFormDefaults(patient: Patient): EditPatientValues {
  return {
    name: patient.name ?? "",
    gender:
      patient.gender === "male" ||
      patient.gender === "female" ||
      patient.gender === "other"
        ? patient.gender
        : "",
    nationalId: patient.nationalId ?? "",
    phone: patient.phone ?? "",
    address: patient.address ?? "",
    guardianName: patient.guardianInfo.name ?? "",
    guardianPhone: patient.guardianInfo.phone ?? "",
    guardianNationalId: patient.guardianInfo.nationalId ?? "",
    guardianAddress: patient.guardianInfo.address ?? "",
    paymentType: patient.paymentType ?? "cash",
    insuranceId: patient.insurance?.insuranceId ?? null,
    insuranceCardId: patient.insurance?.insuranceCardId ?? "",
    insuranceFormId: patient.insurance?.insuranceFormId ?? "",
    pricelistId: patient.pricelistId ?? null,
  }
}
