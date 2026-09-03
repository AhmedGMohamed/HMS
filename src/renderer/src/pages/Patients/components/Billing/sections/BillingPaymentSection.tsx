"use client"

import { useTranslation } from "react-i18next"
import { CalculatorIcon, CheckCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import type { BillingSnapshot } from "@/pages/Patients/types/patient"
import { formatCurrency } from "@/pages/Patients/lib/billing/billingFormat"

export interface BillingPaymentSectionProps {
  paymentAmount: number
  onPaymentAmountChange: (next: number) => void
  canManage: boolean
  saving: boolean
  savingPayment: boolean
  onSave: () => void
  onConfirmPayment: () => void
  snapshot: BillingSnapshot
}

/**
 * Bottom row of the legacy card: payment amount input +
 * remaining reads + Update Calculations (Save) + Confirm
 * Payment buttons. Saves are explicit (legacy parity) — no
 * autosave.
 */
export function BillingPaymentSection({
  paymentAmount,
  onPaymentAmountChange,
  canManage,
  saving,
  savingPayment,
  onSave,
  onConfirmPayment,
  snapshot,
}: BillingPaymentSectionProps) {
  const { t } = useTranslation()

  const canConfirm = canManage && paymentAmount > 0 && !savingPayment
  const canSave = canManage && !saving

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel>{t("patients.billing.paidAmount")}</FieldLabel>
          <ReadOnlyCurrency value={snapshot.paidAmount} emphasis />
        </Field>

        <Field>
          <FieldLabel htmlFor="billing-payment-amount">
            {t("patients.billing.paymentAmount")}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <InputGroupText>EGP</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="billing-payment-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={paymentAmount === 0 ? "" : paymentAmount}
              onChange={(e) => {
                const raw = e.target.value
                onPaymentAmountChange(raw === "" ? 0 : Number(raw))
              }}
              disabled={!canManage}
            />
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel>{t("patients.billing.remainingFacility")}</FieldLabel>
          <ReadOnlyCurrency value={snapshot.remainingFacility} />
        </Field>

        <Field>
          <FieldLabel>{t("patients.billing.remainingPatient")}</FieldLabel>
          <ReadOnlyCurrency value={snapshot.remainingPatient} />
        </Field>
      </div>

      <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-2">
        {canConfirm ? (
          <Button
            type="button"
            variant="default"
            onClick={onConfirmPayment}
            disabled={savingPayment}
            aria-busy={savingPayment}
          >
            <CheckCircleIcon
              aria-hidden
              className="me-1.5 size-4"
            />
            {t("patients.buttons.confirmPayment")}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="default"
                  disabled
                  aria-disabled
                >
                  <CheckCircleIcon
                    aria-hidden
                    className="me-1.5 size-4"
                  />
                  {t("patients.buttons.confirmPayment")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {paymentAmount <= 0
                ? t("patients.messages.paymentAmountZero")
                : t("common.permission.requires_manage_patients")}
            </TooltipContent>
          </Tooltip>
        )}

        {canSave ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onSave}
            disabled={saving}
            aria-busy={saving}
          >
            <CalculatorIcon aria-hidden className="me-1.5 size-4" />
            {saving
              ? t("common.saving")
              : t("patients.buttons.updateCalculations")}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="secondary"
                  disabled
                  aria-disabled
                >
                  <CalculatorIcon aria-hidden className="me-1.5 size-4" />
                  {t("patients.buttons.updateCalculations")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t("common.permission.requires_manage_patients")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
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
