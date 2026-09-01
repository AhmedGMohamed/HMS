"use client"

import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Patient, Bill, BillDetail } from "@/pages/Patients/types/patient"
import { openPdfShellDoc } from "@/lib/pdfShell"

import {
  buildBillBodyContent,
  type BuildBillBodyInputs,
} from "@/pages/Patients/print/printBill"
import { extractBillPrintLabels } from "@/pages/Patients/print/printBillLabels"
import { formatCurrency } from "@/pages/Patients/Admissions/lib/admissionFormat"

export type UsePrintBillArgs = Omit<BuildBillBodyInputs, "language">

export interface UsePrintBillResult {
  printing: boolean
  error: Error | null
  trigger: (args: UsePrintBillArgs) => Promise<void>
}

/**
 * Loads the pdfmake shell module + opens the PDF in a Chromium
 * window. Wraps `openPdfShellDoc` — the patients-page body builder is
 * piped into the shell's content slot.
 *
 * Throws on:
 *   - pdfmake UMD not registered
 *   - malformed docDefinition
 *   - any error from `.open()` (rare under Electron)
 *
 * Caller should `try/catch` around `.trigger(...)` to surface toast
 * messages on user-visible failures.
 *
 * CamelCase-only inside.
 */
export function usePrintBill(): UsePrintBillResult {
  const { t, i18n } = useTranslation()
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const trigger = useCallback(
    async (args: UsePrintBillArgs) => {
      setPrinting(true)
      setError(null)
      try {
        const language =
          (i18n.resolvedLanguage ?? i18n.language ?? "en") === "ar"
            ? "ar"
            : "en"
        const labels = extractBillPrintLabels(t)
        const inputs: BuildBillBodyInputs = {
          patient: args.patient,
          bill: args.bill,
          billDetails: args.billDetails,
          language,
        }
        const body = buildBillBodyContent(
          inputs,
          labels,
          (n, lang) => formatCurrency(n, lang),
          /**
           * Pass-through date formatter. The shell's billDate label
           * uses the local "now()" emission per current legacy
           * behaviour (rather than reading bill.generatedAt).
           * We use ISO formatter only when an explicit `format`
           * helper is required at the column level.
           */
          (_value, lang) => {
            const locale = lang === "ar" ? "ar-EG" : "en-GB"
            return new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }).format(new Date())
          }
        )
        await openPdfShellDoc(
          {
            title: t("patients.billingPrint.title"),
            content: body,
          },
          { t, language }
        )
        toast.success(t("patients.messages.printBillGenerated"), {
          id: "print-bill-success",
        })
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        toast.error(t("patients.messages.printBillError"), {
          id: "print-bill-error",
        })
      } finally {
        setPrinting(false)
      }
    },
    [t, i18n.resolvedLanguage, i18n.language]
  )

  return { printing, error, trigger }
}

/** Convenience typealiases re-exported for callers that want to type
 *  the print button's onClick. */
export type {
  Patient,
  Bill,
  BillDetail,
}
