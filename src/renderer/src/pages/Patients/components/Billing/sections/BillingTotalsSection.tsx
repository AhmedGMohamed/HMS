"use client"

import { useTranslation } from "react-i18next"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"

import { formatCurrency } from "@/pages/Patients/lib/billing/billingFormat"
import type { BillingFormSchema } from "@/pages/Patients/lib/billing/billingFormType"

export interface BillingTotalsSectionProps {
  servicesTotal: number
  drugsTotal: number
  suppliesTotal: number
  loadingLines: boolean
  /** RHF `register` helper from the form. */
  registerMedicalTests: import("react-hook-form").UseFormReturn<
    BillingFormSchema
  >["register"]
  medicalTestsFieldName: keyof BillingFormSchema
}

/**
 * Row 1 of the legacy card: services / drugs / supplies /
 * medical-tests subtotals. The first three are derived server-side
 * from the assigned-lines lists; medicalTests is the only user-editable
 * total — it auto-saves with the rest of the form.
 */
export function BillingTotalsSection({
  servicesTotal,
  drugsTotal,
  suppliesTotal,
  loadingLines,
  registerMedicalTests,
  medicalTestsFieldName,
}: BillingTotalsSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel>{t("patients.billing.servicesTotal")}</FieldLabel>
        {loadingLines ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <ReadOnlyCurrency
            aria-label={t("patients.billing.servicesTotal")}
            value={servicesTotal}
          />
        )}
      </Field>

      <Field>
        <FieldLabel>{t("patients.billing.drugsTotal")}</FieldLabel>
        {loadingLines ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <ReadOnlyCurrency
            aria-label={t("patients.billing.drugsTotal")}
            value={drugsTotal}
          />
        )}
      </Field>

      <Field>
        <FieldLabel>{t("patients.billing.suppliesTotal")}</FieldLabel>
        {loadingLines ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <ReadOnlyCurrency
            aria-label={t("patients.billing.suppliesTotal")}
            value={suppliesTotal}
          />
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="billing-medical-tests-amount">
          {t("patients.billing.medicalTestsTotal")}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              {t("common.currency")}
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="billing-medical-tests-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            {...registerMedicalTests(medicalTestsFieldName)}
          />
        </InputGroup>
      </Field>
    </div>
  )
}

function ReadOnlyCurrency({
  value,
  ...rest
}: { value: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>EGP</InputGroupText>
      </InputGroupAddon>
      <Input
        readOnly
        aria-readonly
        tabIndex={-1}
        value={formatCurrency(value)}
        className="tabular-nums"
        {...rest}
      />
    </InputGroup>
  )
}
