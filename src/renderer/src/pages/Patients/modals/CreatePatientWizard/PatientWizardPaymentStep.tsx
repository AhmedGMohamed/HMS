"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFormContext } from "react-hook-form"
import { Loader2Icon } from "lucide-react"

import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

import type { WizardFormShape } from "./CreatePatientWizardDialog"
import type {
  InsuranceCompany,
  PriceList,
} from "@/pages/Patients/types/patient"
import {
  listInsuranceCompanies,
  listPriceLists,
} from "@/pages/Patients/api"

/**
 * Step 2 of the Create Patient wizard — Payment.
 *
 * Loads `insurance-companies` and `price-lists` once on mount. The
 * form is reactive: when `paymentType === "insurance"`, the three
 * insurance fields (company, card id, form id) are required; otherwise
 * they're hidden. Validation lives on the schema (see
 * `schemas/patient.schema.ts`).
 */
export function PatientWizardPaymentStep() {
  const { t } = useTranslation()
  const form = useFormContext<WizardFormShape>()

  const paymentType = form.watch("payment.paymentType")
  const insuranceError = form.formState.errors.payment?.insuranceId?.message
  const insuranceCardError =
    form.formState.errors.payment?.insuranceCardId?.message
  const insuranceFormError =
    form.formState.errors.payment?.insuranceFormId?.message

  const [insuranceList, setInsuranceList] = useState<InsuranceCompany[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ic, pl] = await Promise.all([
          listInsuranceCompanies(),
          listPriceLists(),
        ])
        if (cancelled) return
        setInsuranceList(ic)
        setPriceLists(pl)
      } catch {
        /* ignore — empty selectors fall back to plain text */
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
        <FieldLabel htmlFor="patient-payment-type">
          {t("patients.fields.paymentType")}
        </FieldLabel>
        <NativeSelect
          id="patient-payment-type"
          {...form.register("payment.paymentType")}
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
            <FieldLabel htmlFor="patient-payment-insurance">
              {t("patients.fields.insuranceCompany")}
            </FieldLabel>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon
                  aria-hidden
                  className="size-4 animate-spin"
                />
                {t("patients.messages.loadingCompanies")}
              </div>
            ) : (
              <NativeSelect
                id="patient-payment-insurance"
                {...form.register("payment.insuranceId", {
                  setValueAs: (v) =>
                    v === "" || v == null ? null : Number(v),
                })}
                aria-invalid={Boolean(insuranceError)}
              >
                <NativeSelectOption value="">
                  {t("common.select")}
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
            )}
            <FieldError
              errors={
                insuranceError ? [{ message: insuranceError }] : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="patient-payment-insurance-card">
              {t("patients.fields.insuranceCardId")}
            </FieldLabel>
            <input
              id="patient-payment-insurance-card"
              {...form.register("payment.insuranceCardId")}
              className="border-input bg-transparent ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
            <FieldLabel htmlFor="patient-payment-insurance-form">
              {t("patients.fields.insuranceFormId")}
            </FieldLabel>
            <input
              id="patient-payment-insurance-form"
              {...form.register("payment.insuranceFormId")}
              className="border-input bg-transparent ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
        <FieldLabel htmlFor="patient-payment-pricelist">
          {t("patients.fields.priceList")}
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
            id="patient-payment-pricelist"
            {...form.register("payment.pricelistId", {
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
        )}
      </Field>
    </div>
  )
}
