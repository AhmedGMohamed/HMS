"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CalendarIcon, XIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { useUIStore } from "@/store/uiStore"
import { listInsuranceCompanies } from "@/pages/Patients/api"
import type { InsuranceCompany } from "@/pages/Patients/types/patient"

export interface PatientFiltersValue {
  paymentType?: string
  insuranceId?: number
  isActive?: boolean
  registeredFrom?: string
  registeredTo?: string
}

interface PatientFiltersProps {
  value: PatientFiltersValue
  onChange: (next: PatientFiltersValue) => void
}

function toIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function fromIso(iso?: string): Date | undefined {
  if (!iso) return undefined
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Patients list filters — rendered in the DataTable toolbar (top-right).
 * Server-driven: every change calls `onChange` with the full filter set;
 * the parent merges it into `useListData.filters` (which resets to page 1).
 *
 * Controls:
 *   - Payment type (NativeSelect: All / cash / credit / insurance)
 *   - Insurance company (NativeSelect, loaded once from the API)
 *   - Status (NativeSelect: All / active / inactive)
 *   - Registration date range (Popover + Calendar, mode="range")
 */
export function PatientFilters({ value, onChange }: PatientFiltersProps) {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const language = (useUIStore((s) => s.language) ?? "en") as "en" | "ar"

  const [insuranceCompanies, setInsuranceCompanies] = useState<
    InsuranceCompany[]
  >([])

  useEffect(() => {
    let cancelled = false
    listInsuranceCompanies()
      .then((res) => {
        if (!cancelled) setInsuranceCompanies(res)
      })
      .catch(() => {
        /* lookup failure is non-fatal; the select stays empty */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const range: DateRange = {
    from: fromIso(value.registeredFrom),
    to: fromIso(value.registeredTo),
  }

  function applyRange(next: DateRange | undefined) {
    const from = next?.from ? toIso(next.from) : undefined
    const to = next?.to ? toIso(next.to) : undefined
    onChange({ registeredFrom: from, registeredTo: to })
  }

  function onRangeSelect(selected: DateRange | undefined): void {
    applyRange(selected)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        size="sm"
        value={value.paymentType ?? ""}
        onChange={(e) =>
          onChange({ paymentType: e.currentTarget.value || undefined })
        }
        aria-label={t("patients.filters.paymentType")}
      >
        <NativeSelectOption value="">
          {t("patients.paymentTypes.all")}
        </NativeSelectOption>
        <NativeSelectOption value="cash">
          {t("patients.paymentTypes.cash")}
        </NativeSelectOption>
        <NativeSelectOption value="credit">
          {t("patients.paymentTypes.credit")}
        </NativeSelectOption>
        <NativeSelectOption value="insurance">
          {t("patients.paymentTypes.insurance")}
        </NativeSelectOption>
      </NativeSelect>

      <NativeSelect
        size="sm"
        value={value.insuranceId ?? ""}
        onChange={(e) => {
          const raw = e.currentTarget.value
          onChange({
            insuranceId: raw === "" ? undefined : Number(raw),
          })
        }}
        aria-label={t("patients.filters.insuranceCompany")}
      >
        <NativeSelectOption value="">
          {t("patients.filters.allInsuranceCompanies")}
        </NativeSelectOption>
        {insuranceCompanies.map((company) => (
          <NativeSelectOption key={company.insuranceId} value={company.insuranceId}>
            {company.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      <NativeSelect
        size="sm"
        value={
          value.isActive === undefined
            ? ""
            : value.isActive
              ? "active"
              : "inactive"
        }
        onChange={(e) => {
          const raw = e.currentTarget.value
          onChange({
            isActive: raw === "" ? undefined : raw === "active",
          })
        }}
        aria-label={t("patients.filters.status")}
      >
        <NativeSelectOption value="">{t("patients.filters.allStatuses")}</NativeSelectOption>
        <NativeSelectOption value="active">{t("common.active")}</NativeSelectOption>
        <NativeSelectOption value="inactive">{t("common.inactive")}</NativeSelectOption>
      </NativeSelect>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
          >
            <CalendarIcon aria-hidden className="size-4" />
            {range.from && range.to
              ? `${new Date(`${range.from}`).toLocaleDateString(
                  language === "ar" ? "ar-EG" : "en-GB"
                )} – ${new Date(`${range.to}`).toLocaleDateString(
                  language === "ar" ? "ar-EG" : "en-GB"
                )}`
              : t("patients.filters.registrationDate")}
            {(value.registeredFrom || value.registeredTo) && (
              <span
                role="button"
                aria-label={t("patients.filters.clearDateRange")}
                onClick={(e) => {
                  e.stopPropagation()
                  applyRange(undefined)
                }}
                className="ml-1 rounded-sm p-0.5 hover:bg-muted"
              >
                <XIcon aria-hidden className="size-3.5" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={range}
            onSelect={onRangeSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}