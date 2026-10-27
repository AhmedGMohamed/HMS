"use client"

/**
 * Labelled search field — Phase 6.11.1.
 *
 * Extracted from the report tabs so the patient (and later doctor/nurse/
 * payroll) filters share one control: label above, icon inside, clear button
 * when non-empty.
 *
 * Unlike `DataTable`'s inline search this value is **not** live: report
 * searches are committed at Generate time, so typing must never mutate the
 * URL or fire a request. The field therefore owns no debounce at all.
 */

import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface SearchFieldProps {
  /** Already-translated label. */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Stable element id; defaults to a deterministic per-label id. */
  id?: string
  /** Width class for the wrapper (the filter row is a flex row). */
  className?: string
}

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  id = "reports-search",
  className,
}: SearchFieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 inset-s-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="w-full min-w-56 ps-9 pe-9"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
            onClick={() => onChange("")}
          >
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
