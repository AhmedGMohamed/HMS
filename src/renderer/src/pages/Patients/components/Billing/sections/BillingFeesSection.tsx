"use client"

import { useTranslation } from "react-i18next"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"

import type { BillingSnapshot } from "@/pages/Patients/types/patient"
import { formatCurrency } from "@/pages/Patients/lib/billing/billingFormat"

import type { BillingFormSchema } from "@/pages/Patients/lib/billing/billingFormType"

export interface BillingFeesSectionProps {
  form: Pick<
    import("react-hook-form").UseFormReturn<BillingFormSchema>,
    "register"
  >
  adminExpensesFieldName: keyof BillingFormSchema
  snapshot: BillingSnapshot
}

/**
 * Section that hosts the "post-discount" reads + adminExpenses input.
 * Read-only fields are derived from `useBillingRecalc` and have
 * stable ids so any tooltips / labels can pair with them.
 */
export function BillingFeesSection({
  form,
  adminExpensesFieldName,
  snapshot,
}: BillingFeesSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel htmlFor="billing-admin-expenses">
          {t("patients.billing.adminExpenses")}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>EGP</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="billing-admin-expenses"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            {...form.register(adminExpensesFieldName, {
              setValueAs: (v) =>
                v === "" || v == null ? 0 : Number(v),
            })}
          />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel>{t("patients.billing.discountTotal")}</FieldLabel>
        <ReadOnlyCurrency
          value={snapshot.discountAmount}
          aria-label={t("patients.billing.discountTotal")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("patients.billing.totalAfterDiscount")}</FieldLabel>
        <ReadOnlyCurrency
          value={snapshot.totalAfterDiscount}
          aria-label={t("patients.billing.totalAfterDiscount")}
        />
      </Field>

      <Field>
        <FieldLabel>
          {t("patients.billing.vatAmount")
            ? t("patients.billing.vatAmount")
            : t("patients.billing.vatPercentage")}
        </FieldLabel>
        <ReadOnlyCurrency
          value={snapshot.vatAmount}
          aria-label={t("patients.billing.vatAmount")}
        />
      </Field>

      <Field className="sm:col-span-2 lg:col-span-2">
        <FieldLabel>{t("patients.billing.totalFee")}</FieldLabel>
        <ReadOnlyCurrency
          value={snapshot.totalFee}
          aria-label={t("patients.billing.totalFee")}
          emphasis
        />
      </Field>
    </div>
  )
}

function ReadOnlyCurrency({
  value,
  emphasis,
  ...rest
}: {
  value: number
  emphasis?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>) {
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
        className={
          emphasis
            ? "bg-accent/40 text-base font-semibold tabular-nums"
            : "tabular-nums"
        }
        {...rest}
      />
    </InputGroup>
  )
}
