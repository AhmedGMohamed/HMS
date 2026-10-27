"use client"

/**
 * Daily assignment accordion — Phase 6.11.3.
 *
 * One row per `work_date` from `DailyStaffAssignment`, newest first (the server
 * orders them, the component only renders). Inside a day:
 *
 *   patient | payment type | diagnosis | hours
 *
 * with a day-total row. The diagnosis comes from the same lateral the patient
 * table uses, so a patient's diagnosis here always matches the one above —
 * the legacy accordion re-ran a different query and could disagree.
 *
 * The accordion is presentational: it never fetches. The detail endpoint ships
 * the whole accordion in one payload, and the export prints the same shape.
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { PaymentTypeBadge } from "@/pages/Reports/components/StatusBadges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, resolveLocale } from "@/lib/utils"
import type { NurseDailyAssignment } from "@/pages/Reports/types/nurseReport"
import { useUIStore } from "@/store/uiStore"

export interface DailyAssignmentAccordionProps {
  days: NurseDailyAssignment[]
  /** Already-translated "no daily assignments" message. */
  emptyLabel: string
  /**
   * Value of the item open on first render. Defaults to the newest day so the
   * most relevant assignments are visible without a click.
   */
  defaultOpen?: string | null
}

export function DailyAssignmentAccordion({
  days,
  emptyLabel,
  defaultOpen,
}: DailyAssignmentAccordionProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const locale = resolveLocale(language)

  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)

  const [openValues, setOpenValues] = useState<string[]>(() => {
    const initial = defaultOpen ?? days[0]?.workDate
    return initial ? [initial] : []
  })

  // A new nurse/search replaces the date set: keep the open state when at
  // least one of its dates still exists, otherwise fall back to the newest day
  // instead of rendering an accordion with nothing open.
  const present = new Set(days.map((day) => day.workDate))
  const stale = openValues.length > 0 && !openValues.some((value) => present.has(value))
  const effectiveValues =
    stale && days.length > 0
      ? [defaultOpen && present.has(defaultOpen) ? defaultOpen : days[0].workDate]
      : openValues

  if (days.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {emptyLabel}
      </p>
    )
  }

  return (
    <Accordion
      type="multiple"
      value={effectiveValues}
      onValueChange={setOpenValues}
      className="rounded-md border border-border"
    >
      {days.map((day) => (
        <AccordionItem key={day.workDate} value={day.workDate} className="px-3">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-medium text-foreground">
                {formatDate(new Date(`${day.workDate}T00:00:00`), language)}
              </span>
              <span className="flex items-baseline gap-4 text-xs font-normal text-muted-foreground tabular-nums">
                <span>
                  {t("reports.nurseDetail.dayPatients", {
                    count: day.patientCount,
                  })}
                </span>
                <span>
                  {t("reports.nurseDetail.dayHours", {
                    count: number(day.totalHours),
                  })}
                </span>
              </span>
            </span>
          </AccordionTrigger>

          <AccordionContent className="pt-0 pb-3">
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-surface-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("reports.table.patientName")}</TableHead>
                    <TableHead className="w-28">
                      {t("reports.table.paymentType")}
                    </TableHead>
                    <TableHead>{t("reports.table.diagnosis")}</TableHead>
                    <TableHead className="w-24 text-end">
                      {t("reports.table.hours")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.patients.map((patient) => (
                    <TableRow key={patient.patientId}>
                      <TableCell className="max-w-[16rem]">
                        <span
                          className="block truncate font-medium text-foreground"
                          dir="auto"
                          title={patient.patientName}
                        >
                          {patient.patientName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PaymentTypeBadge value={patient.paymentType} />
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <span
                          className="block truncate"
                          dir="auto"
                          title={patient.diagnosis ?? undefined}
                        >
                          {patient.diagnosis || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-end tabular-nums" dir="ltr">
                        {number(patient.hoursWorked)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-surface-muted hover:bg-surface-muted">
                    <TableCell
                      colSpan={3}
                      className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      {t("reports.nurseDetail.dayTotal")}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums" dir="ltr">
                      {number(day.totalHours)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
