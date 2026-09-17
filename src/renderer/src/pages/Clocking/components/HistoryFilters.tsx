"use client"

import { useTranslation } from "react-i18next"
import { CalendarIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUIStore } from "@/store/uiStore"

export interface HistoryRange {
  from?: Date
  to?: Date
}

interface HistoryFiltersProps {
  range: HistoryRange
  onChange: (range: HistoryRange) => void
}

function formatDay(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * History date-range filter (§B6 of `phase_6.8_ux_research.md`).
 *
 * Popover + `Calendar mode="range"` copied from the Patients
 * `PatientFilters` precedent (design.md §6.4 — Popover hosts the
 * Calendar). Applied to `clockIn` dates by the parent, inclusive on
 * both ends. The in-trigger X clears (PatientFilters pattern).
 */
export function HistoryFilters({ range, onChange }: HistoryFiltersProps) {
  const { t } = useTranslation()
  const language = (useUIStore((s) => s.language) ?? "en") as "en" | "ar"
  const dayPickerLocale = language === "ar" ? "ar-EG" : "en-GB"

  const hasRange = Boolean(range.from || range.to)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          aria-label={t("clocking.filters.fromDate")}
        >
          <CalendarIcon aria-hidden className="size-4" />
          {range.from && range.to
            ? `${formatDay(range.from, dayPickerLocale)} – ${formatDay(range.to, dayPickerLocale)}`
            : `${t("clocking.filters.fromDate")} – ${t("clocking.filters.toDate")}`}
          {hasRange ? (
            <span
              role="button"
              aria-label={t("clocking.filters.clearRange")}
              onClick={(e) => {
                e.stopPropagation()
                onChange({})
              }}
              className="ms-1 rounded-sm p-0.5 hover:bg-muted"
            >
              <XIcon aria-hidden className="size-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={
            range.from ? { from: range.from, to: range.to } : undefined
          }
          onSelect={(next) => onChange({ from: next?.from, to: next?.to })}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
