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

import type { VatScope } from "@/pages/Patients/types/patient"

import type { BillingFormSchema } from "@/pages/Patients/Billing/lib/billingFormType"

export interface BillingVatSectionProps {
  form: Pick<
    import("react-hook-form").UseFormReturn<BillingFormSchema>,
    "register" | "watch" | "setValue"
  >
  vatPercentFieldName: keyof BillingFormSchema
}

/**
 * Row 3-input / 4-input of the legacy card: VAT % + 4× scope.
 * The "VAT amount" output lives in `BillingFeesSection`.
 */
export function BillingVatSection({
  form,
  vatPercentFieldName,
}: BillingVatSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel htmlFor="billing-vat-percentage">
          {t("patients.billing.vatPercentage")}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>%</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="billing-vat-percentage"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.1"
            {...form.register(vatPercentFieldName, {
              setValueAs: (v) =>
                v === "" || v == null ? 0 : Number(v),
            })}
          />
        </InputGroup>
        <span className="text-muted-foreground text-xs">
          {t("patients.billing.vatPercentHint")}
        </span>
      </Field>

      <Field className="sm:col-span-2 lg:col-span-3">
        <FieldLabel>{t("patients.billing.applyVatOn")}</FieldLabel>
        <ScopeCheckboxes
          scope={form.watch("vatScope") as VatScope}
          onSet={(scope) =>
            form.setValue("vatScope", scope, { shouldDirty: true })
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
  scope: VatScope
  onSet: (next: VatScope) => void
}) {
  const { t } = useTranslation()
  const update = (key: keyof VatScope, next: boolean) => {
    onSet({ ...scope, [key]: next })
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-input px-3 py-2 shadow-xs">
      <CheckboxRow
        id="billing-vat-on-services"
        checked={scope.onServices}
        onChange={(v) => update("onServices", v)}
        label={t("patients.billing.scope.services")}
      />
      <CheckboxRow
        id="billing-vat-on-drugs"
        checked={scope.onDrugs}
        onChange={(v) => update("onDrugs", v)}
        label={t("patients.billing.scope.drugs")}
      />
      <CheckboxRow
        id="billing-vat-on-supplies"
        checked={scope.onSupplies}
        onChange={(v) => update("onSupplies", v)}
        label={t("patients.billing.scope.supplies")}
      />
      <CheckboxRow
        id="billing-vat-on-tests"
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
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span className="select-none">{label}</span>
    </label>
  )
}
