"use client"

/**
 * Labelled select field — Phase 6.11.1.
 *
 * Same chrome as `GroupByField` (label + native select) but value-driven, so
 * the patient/doctor/nurse/payroll filters can render any option list —
 * including the ones built from `/api/reports/v2/options` — without a second
 * select implementation.
 *
 * A native `<select>` is deliberate: it keeps keyboard and screen-reader
 * behaviour free, and `select` is what every other filter in the app uses.
 */

import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

export interface SelectFieldOption {
  value: string
  label: string
}

export interface SelectFieldProps {
  /** Already-translated label. */
  label: string
  value: string
  options: SelectFieldOption[]
  onChange: (value: string) => void
  disabled?: boolean
  /** Stable element id; MUST be unique per page. */
  id: string
  /** Width class for the wrapper (the filter row is a flex row). */
  className?: string
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
  id,
  className,
}: SelectFieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-w-40"
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
