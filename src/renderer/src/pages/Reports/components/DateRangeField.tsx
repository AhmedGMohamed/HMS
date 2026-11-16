"use client"

/**
 * Date-range field — Phase 6.11 plan §4.5.
 *
 * A labelled range button (opens a two-month calendar) plus the four presets
 * the legacy page had (Today / This Week / This Month / This Year) — the
 * legacy quick row lacked "This Year" and used UTC dates.
 *
 * Values are local `YYYY-MM-DD` strings; the popover works with `Date`
 * objects and converts at the boundary so no component has to think about
 * time zones.
 *
 * The trigger names itself from the field title plus the visible range (a
 * dates-only accessible name does not say what the button controls), and
 * `aria-describedby` points at the inline error only while one renders.
 * Choosing a preset closes the popover instead of leaving it open.
 */

import { useId, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  currentMonthRange,
  fromDateParam,
  rangeForPreset,
  toDateParam,
  type DateRange,
  type DateRangePreset,
} from "@/lib/dateRange"
import { formatDate } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { ReportRange } from "@/pages/Reports/types/reports"

export interface DateRangeFieldProps {
  value: ReportRange
  onChange: (range: ReportRange) => void
  /** Renders a validation message under the control. */
  error?: string | null
  disabled?: boolean
}

const PRESETS: DateRangePreset[] = ["today", "week", "month", "year"]

/** `YYYY-MM-DD` → local-midnight `Date` (falls back to today). */
function toDate(value: string): Date {
  return fromDateParam(value) ?? new Date()
}

/** `DateRange` (Dates) → `ReportRange` (strings). */
function serialize(range: DateRange): ReportRange {
  return { from: toDateParam(range.from), to: toDateParam(range.to) }
}

export function DateRangeField({
  value,
  onChange,
  error,
  disabled = false,
}: DateRangeFieldProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"

  const from = toDate(value.from)
  const to = toDate(value.to)

  const [open, setOpen] = useState(false)

  const applyPreset = (preset: DateRangePreset) => {
    onChange(serialize(rangeForPreset(preset)))
    setOpen(false)
  }

  /* `useId()` keeps two fields (tab + dialog) from sharing a control id;
     the colons it emits are legal in ids but stripped so the value is also
     a valid CSS selector fragment. */
  const controlId = `reports-date-range${useId().replace(/:/g, "")}`
  const errorId = `${controlId}-error`
  const labelText = t("reports.filters.dateRange")
  const fromLabel = formatDate(from, language)
  const toLabel = formatDate(to, language)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId}>{labelText}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            type="button"
            variant="outline"
            className="justify-start gap-2 font-normal"
            disabled={disabled}
            /* Name = field title + the visible dates (label-in-name), so AT
               announces what the button is for, not just two dates. */
            aria-label={`${labelText}: ${fromLabel} – ${toLabel}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
            {/*
              Each date is an isolated LTR run: without it the bidi algorithm
              reorders the two numeric date fragments inside an RTL sentence
              and the reader cannot tell which one is the start date. The
              wrapping span keeps the start→end reading order per locale.
            */}
            <span className="flex items-center gap-1">
              <span dir="ltr">{fromLabel}</span>
              <span aria-hidden>–</span>
              <span dir="ltr">{toLabel}</span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={{ from, to }}
            onSelect={(next) => {
              if (next?.from && next?.to) {
                onChange(serialize({ from: next.from, to: next.to }))
              }
            }}
            numberOfMonths={2}
          />
          <div className="flex flex-wrap gap-2 border-t p-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyPreset(preset)}
              >
                {t(`reports.filters.quick.${preset}`)}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-auto"
              onClick={() => {
                onChange(serialize(currentMonthRange()))
                setOpen(false)
              }}
            >
              {t("reports.filters.quick.reset")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
