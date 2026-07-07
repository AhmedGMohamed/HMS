"use client"

import { useCallback, useMemo, useState } from "react"

import type { PatientHistory } from "@/pages/Patients/types/patient"
import type {
  DiscountScope,
  DrugUsage,
  MedicalSupplyUsage,
  VatScope,
} from "@/pages/Patients/types/patient"

import { ApiError } from "@/lib/errors"
import { updateBill } from "@/pages/Patients/api"
import {
  discountScopeToServer,
  vatScopeToServer,
} from "@/pages/Patients/lib/billingTransformers"

export interface BillSaveInput {
  discount: number
  discountType: "percentage" | "fixed"
  discountScope: DiscountScope
  vatPercentage: number
  vatScope: VatScope
  administrativeExpenses: number
  medicalTestsAmount: number
}

export interface BillAdjustInput extends BillSaveInput {
  paidAmount: number
}

export interface UseBillSaveResult {
  saving: boolean
  error: Error | null
  /** Fire one PUT to `/api/bills/:billId` with the snake-cased payload. */
  save: () => Promise<void>
  /** Drop current error without firing a request. */
  clearError: () => void
}

/**
 * One-shot Save hook for the Billing card. The "Update
 * Calculations" button invokes `save()` once per click.
 *
 * Translates camel-cased form-shaped input into the snake-cased
 * JSON the server's `BillModel.updateBill` expects — including
 * flattening `DiscountScope`/`VatScope` into the JSONB-array form
 * the legacy controller relies on. Mirrors legacy
 * `updateBilling()` (`patients.ts:1989`).
 */
export function useBillSave(
  billId: number | null,
  input: BillSaveInput
): UseBillSaveResult {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const snakePayload = useMemo(
    () => ({
      discount_type: input.discountType,
      discount: input.discount,
      discount_scope: discountScopeToServer(input.discountScope),
      vat_percentage: input.vatPercentage,
      vat_scope_custom: vatScopeToServer(input.vatScope),
      vat_scope: "both" as const,
      administrative_expenses: input.administrativeExpenses,
      medical_tests_amount: input.medicalTestsAmount,
    }),
    [
      input.discountType,
      input.discount,
      input.discountScope,
      input.vatPercentage,
      input.vatScope,
      input.administrativeExpenses,
      input.medicalTestsAmount,
    ]
  )

  const save = useCallback(async () => {
    if (billId == null || billId <= 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      // The body is already snake-keyed; bypass api.put's toSnake by
      // issuing a raw fetch (mirrors what the previous autosave hook
      // did for the same reason).
      const res = await fetch(`/api/bills/${billId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(snakePayload),
      })
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => null)) as { error?: string } | null
        throw new ApiError(
          res.status,
          body?.error || res.statusText || "Failed to update billing",
          `/api/bills/${billId}`
        )
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : err instanceof Error
            ? err
            : new Error(String(err))
      )
    } finally {
      setSaving(false)
    }
  }, [billId, snakePayload, saving])

  const clearError = useCallback(() => setError(null), [])

  return { saving, error, save, clearError }
}

/**
 * Confirm Payment — identical network call shape, but with
 * `{ paid_amount }` body. Separate hook so firing it is a single
 * click away from the Save hook (no risk of accidental field
 * mutation spills).
 */
export function useBillPayment(billId: number | null) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const recordPayment = useCallback(
    async (amount: number) => {
      if (billId == null || billId <= 0 || amount <= 0) return null
      setSaving(true)
      setError(null)
      try {
        await updateBill(billId, { paidAmount: amount })
        return amount
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err
            : err instanceof Error
              ? err
              : new Error(String(err))
        )
        return null
      } finally {
        setSaving(false)
      }
    },
    [billId]
  )

  return { saving, error, recordPayment }
}

// Re-exports kept here for callers that need the patient-shape
// bundled when coordinating across tabs (e.g. memoizing a
// downstream effect keyed on the union of provided billing inputs).
export type { PatientHistory, DrugUsage, MedicalSupplyUsage }
