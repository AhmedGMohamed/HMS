"use client"

/**
 * Group-by field — Phase 6.11.
 *
 * The legacy page rendered this control on every tab but only Statistics
 * consumed it. Here the value lives in the URL (`?group=…`) and the field is
 * only mounted by the tabs that actually group (`statistics`, `payments`),
 * so the control can never appear to do nothing.
 */

import { useTranslation } from "react-i18next"

import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import {
  REPORT_GROUPINGS,
  type ReportGrouping,
} from "@/pages/Reports/types/reports"

export interface GroupByFieldProps {
  value: ReportGrouping
  onChange: (value: ReportGrouping) => void
  disabled?: boolean
}

export function GroupByField({ value, onChange, disabled }: GroupByFieldProps) {
  const { t } = useTranslation()
  const id = "reports-group-by"

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("reports.filters.groupBy")}</Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value as ReportGrouping)}
        className="min-w-32"
      >
        {REPORT_GROUPINGS.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {t(`reports.filters.groupByOptions.${option}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
