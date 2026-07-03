"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ReceiptIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import type {
  DrugUsage,
  MedicalSupplyUsage,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"
import { usePermission } from "@/hooks/usePermission"

import { useBill } from "@/pages/Patients/Billing/hooks/useBill"
import {
  useBillingRecalc,
} from "@/pages/Patients/Billing/hooks/useBillingRecalc"
import {
  useBillPayment,
  useBillSave,
} from "@/pages/Patients/Billing/hooks/useBillSave"
import {
  useBillChangeSubscription,
} from "@/pages/Patients/Billing/lib/billEvents"
import {
  BillingTotalsSection,
} from "@/pages/Patients/Billing/sections/BillingTotalsSection"
import {
  BillingDiscountSection,
} from "@/pages/Patients/Billing/sections/BillingDiscountSection"
import {
  BillingVatSection,
} from "@/pages/Patients/Billing/sections/BillingVatSection"
import {
  BillingFeesSection,
} from "@/pages/Patients/Billing/sections/BillingFeesSection"
import {
  BillingPaymentSection,
} from "@/pages/Patients/Billing/sections/BillingPaymentSection"
import {
  billToFormDefaults,
  mergeBillingFormValues,
  type BillingFormValues,
} from "@/pages/Patients/Billing/lib/billingInputs"
import type { BillingFormSchema } from "@/pages/Patients/Billing/lib/billingFormType"
import {
  discountScopeFromServer,
  vatScopeFromServer,
} from "@/pages/Patients/Billing/lib/billingTransformers"

interface BillingFormProps {
  patientId: number
  admission: PatientHistory | null
  drugs: DrugUsage[]
  supplies: MedicalSupplyUsage[]
  drugsLoading: boolean
  suppliesLoading: boolean
}

/**
 * Billing card rooted in RHF + explicit Save. Subtotals come
 * exclusively from `Bill.billDetails[]` (via `useBill`); the
 * assigned-lines endpoints only feed the Assigned tab list cards
 * and never here. Recalc repaints the read-only outputs at every
 * form change with zero network. The "Update Calculations" button
 * is the only trigger that hits `PUT /api/bills/:id`.
 *
 * Confirm Payment is a separate explicit button — same hospital
 * semantics as legacy `confirmPayment`.
 */
export function BillingForm({
  patientId,
  admission,
  drugs,
  supplies,
  drugsLoading,
  suppliesLoading,
}: BillingFormProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")

  const billId = admission?.billId ?? null

  const billRes = useBill(billId)
  const bill = billRes.bill

  const linesLoading = drugsLoading || suppliesLoading

  const form = useForm<BillingFormSchema>({
    defaultValues: {
      medicalTestsAmount: 0,
      discount: 0,
      discountType: "fixed",
      discountScope: {
        onServices: true,
        onDrugs: true,
        onSupplies: true,
        onTests: true,
      },
      vatPercentage: 0,
      vatScope: {
        onServices: true,
        onDrugs: true,
        onSupplies: true,
        onTests: true,
      },
      administrativeExpenses: 0,
    },
  })

  /* Hydration:
     - When billId changes, clear the hydration flag so the next
       bill arrival triggers a fresh form reset.
     - When the first valid bill lands (transition from null to
       data), hydrate the form once after applying the scope
       transformers (server returns string arrays, renderer
       speaks boolean objects). Re-fetches (from
       `hms:bill-changed`) don't reset again — user edits
       are preserved. */
  const didHydrateRef = useRef(false)

  useEffect(() => {
    didHydrateRef.current = false
  }, [billId])

  useEffect(() => {
    if (bill != null && !didHydrateRef.current) {
      const defaults = billToFormDefaults(bill)
      form.reset({
        ...defaults,
        discountScope: discountScopeFromServer(
          (defaults.discountScope as unknown as string[] | null | undefined)
        ),
        vatScope: vatScopeFromServer(
          (defaults.vatScope as unknown as string[] | null | undefined)
        ),
      })
      didHydrateRef.current = true
    }
  }, [bill, form])

  const watchValues = form.watch()

  const mergedValues: BillingFormValues = useMemo(
    () => mergeBillingFormValues(bill),
    [bill]
  )

  const recalcInputs = useMemo(
    () => ({
      servicesTotal: mergedValues.servicesTotal,
      drugsTotal: mergedValues.drugsTotal,
      suppliesTotal: mergedValues.suppliesTotal,
      medicalTestsAmount: watchValues.medicalTestsAmount,
      paidAmount: bill?.paidAmount ?? 0,
      discount: watchValues.discount,
      discountType: watchValues.discountType,
      discountScope: watchValues.discountScope,
      vatPercentage: watchValues.vatPercentage,
      vatScope: watchValues.vatScope,
      administrativeExpenses: watchValues.administrativeExpenses,
    }),
    [mergedValues, watchValues, bill]
  )

  const snapshot = useBillingRecalc(recalcInputs)

  /* Save payload — the form values are already the shapes we want;
     `useBillSave` does the snake-case transform internally. */
  const saveInput = useMemo(
    () => ({
      discount: watchValues.discount,
      discountType: watchValues.discountType,
      discountScope: watchValues.discountScope,
      vatPercentage: watchValues.vatPercentage,
      vatScope: watchValues.vatScope,
      administrativeExpenses: watchValues.administrativeExpenses,
      medicalTestsAmount: watchValues.medicalTestsAmount,
    }),
    [watchValues]
  )

  const saver = useBillSave(billId, saveInput)
  const payment = useBillPayment(billId)

  async function onSave() {
    if (!canManage || billId == null || billId <= 0) return
    await saver.save()
    if (saver.error == null) {
      toast.success(t("patients.messages.billingUpdated"))
      billRes.refresh()
    } else {
      const msg =
        saver.error instanceof ApiError
          ? saver.error.message
          : t("patients.messages.billingUpdateError")
      toast.error(msg)
    }
  }

  const [paymentAmount, setPaymentAmount] = useState(0)

  async function onConfirmPayment() {
    if (billId == null || billId <= 0 || !canManage || paymentAmount <= 0) return
    const ok = await payment.recordPayment(paymentAmount)
    if (ok != null) {
      toast.success(t("patients.messages.paymentRecorded"))
      setPaymentAmount(0)
      billRes.refresh()
    } else if (payment.error) {
      toast.error(
        payment.error instanceof ApiError
          ? payment.error.message
          : t("patients.messages.paymentRecordingError")
      )
    }
  }

  /* CustomEvent coherence: refetch the bill whenever an
     Assigned-tab mutation succeeds (service/drug/supply added,
     stopped, removed, administered). */
  const billRefresher = useCallback(() => billRes.refresh(), [billRes])
  useBillChangeSubscription(patientId, billRefresher)

  /* Touch the unused-supplies prop so type narrowing across callers
     stays consistent — supplies is still used by the
     totals-already-rendered skeleton check (linesLoading) but not
     for pricing (we read from bill.billDetails for that). */
  void drugs
  void supplies

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t("patients.sections.billingInfo")}</CardTitle>
            {billId ? (
              <CardDescription className="tabular-nums">
                {t("patients.billing.billIdLabel")} #{billId}
              </CardDescription>
            ) : null}
          </div>
          {saver.saving ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Spinner aria-hidden className="size-3" />
              {t("common.saving")}
            </span>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <ReceiptIcon aria-hidden className="size-3.5" />
              {t("patients.billing.explicitSaveHint")}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* Row 1 */}
        <BillingTotalsSection
          servicesTotal={mergedValues.servicesTotal}
          drugsTotal={mergedValues.drugsTotal}
          suppliesTotal={mergedValues.suppliesTotal}
          loadingLines={linesLoading || billRes.loading}
          registerMedicalTests={form.register}
          medicalTestsFieldName="medicalTestsAmount"
        />

        <div className="border-input-hair w-full border-t" aria-hidden />

        {/* Row 2 */}
        <BillingDiscountSection
          form={form}
          discountFieldName="discount"
          discountTypeFieldName="discountType"
        />

        {/* Row 3 */}
        <BillingVatSection
          form={form}
          vatPercentFieldName="vatPercentage"
        />

        {/* Row 4/5 */}
        <BillingFeesSection
          form={form}
          adminExpensesFieldName="administrativeExpenses"
          snapshot={snapshot}
        />

        <div className="border-input-hair w-full border-t" aria-hidden />

        {/* Payment + Save */}
        <BillingPaymentSection
          paymentAmount={paymentAmount}
          onPaymentAmountChange={setPaymentAmount}
          canManage={canManage}
          saving={saver.saving}
          savingPayment={payment.saving}
          onConfirmPayment={onConfirmPayment}
          onSave={onSave}
          snapshot={snapshot}
        />
      </CardContent>
    </Card>
  )
}