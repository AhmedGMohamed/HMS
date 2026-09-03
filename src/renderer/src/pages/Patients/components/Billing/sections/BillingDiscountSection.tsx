"use client"

import { useTranslation } from "react-i18next"

import { Field, FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"

import type { DiscountScope } from "@/pages/Patients/types/patient"

import type { BillingFormSchema } from "@/pages/Patients/lib/billing/billingFormType"

export interface BillingDiscountSectionProps {
  form: Pick<
    import("react-hook-form").UseFormReturn<BillingFormSchema>,
    "register" | "watch" | "setValue"
  >
  discountFieldName: keyof BillingFormSchema
  /** Field name to bind the discountType checkbox to. */
  discountTypeFieldName: keyof BillingFormSchema
}

/**
 * Row 2 of the legacy card: discount value + percent toggle +
 * 4× discount-scope checkboxes. The "Discount Total" output
 * lives in `BillingFeesSection`.
 *
 * The percent toggle writes a string ("percentage" | "fixed") into
 * RHF so `useBillingRecalc` can read it directly without mapping.
 */
export function BillingDiscountSection({
  form,
  discountFieldName,
  discountTypeFieldName,
}: BillingDiscountSectionProps) {
  const { t } = useTranslation()
  const discountType = form.watch(discountTypeFieldName) === "percentage"

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel htmlFor="billing-discount-amount">
          {t("patients.billing.discount")}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>EGP</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="billing-discount-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            {...form.register(discountFieldName, {
              setValueAs: (v) =>
                v === "" || v == null ? 0 : Number(v),
            })}
          />
        </InputGroup>
        {discountType ? (
          <span className="text-muted-foreground text-xs">
            {t("patients.billing.discountPercentUnit")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("patients.billing.discountFixedUnit")}
          </span>
        )}
      </Field>

      <Field>
        <FieldLabel className="block">
          {t("patients.billing.discountTypeLabel")}
        </FieldLabel>
        <label
          htmlFor="billing-discount-percentage"
          className="border-input bg-background hover:bg-accent/40 flex h-9 w-fit items-center gap-2 rounded-md border px-3 text-sm shadow-xs transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50"
        >
          <Checkbox
            id="billing-discount-percentage"
            checked={discountType}
            onCheckedChange={(v) =>
              form.setValue(
                discountTypeFieldName,
                v === true ? "percentage" : "fixed",
                { shouldDirty: true }
              )
            }
          />
          <span className="select-none font-medium">%</span>
        </label>
      </Field>

      <Field className="sm:col-span-2 lg:col-span-2">
        <FieldLabel>{t("patients.billing.applyDiscountOn")}</FieldLabel>
        <ScopeCheckboxes
          scope={form.watch("discountScope") as DiscountScope}
          onSet={(scope) =>
            form.setValue("discountScope", scope, { shouldDirty: true })
          }
        />
      </Field>
    </div>
  )
}

function ScopeCheckboxes({
  scope,
  onSet,
}: {
  scope: DiscountScope
  onSet: (next: DiscountScope) => void
}) {
  const { t } = useTranslation()
  const update = (key: keyof DiscountScope, next: boolean) => {
    onSet({ ...scope, [key]: next })
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-input px-3 py-2 shadow-xs">
      <CheckboxRow
        id="billing-discount-on-services"
        checked={scope.onServices}
        onChange={(v) => update("onServices", v)}
        label={t("patients.billing.scope.services")}
      />
      <CheckboxRow
        id="billing-discount-on-drugs"
        checked={scope.onDrugs}
        onChange={(v) => update("onDrugs", v)}
        label={t("patients.billing.scope.drugs")}
      />
      <CheckboxRow
        id="billing-discount-on-supplies"
        checked={scope.onSupplies}
        onChange={(v) => update("onSupplies", v)}
        label={t("patients.billing.scope.supplies")}
      />
      <CheckboxRow
        id="billing-discount-on-tests"
        checked={scope.onTests}
        onChange={(v) => update("onTests", v)}
        label={t("patients.billing.scope.tests")}
      />
    </div>
  )
}

function CheckboxRow({
  id,
  checked,
  onChange,
  label,
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-sm"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span className="select-none">{label}</span>
    </label>
  )
}
