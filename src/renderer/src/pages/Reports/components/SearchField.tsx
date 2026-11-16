"use client"

/**
 * Labelled search field — Phase 6.11.1.
 *
 * Extracted from the report tabs so the patient (and later doctor/nurse/
 * payroll) filters share one control: label above, icon inside, clear button
 * when non-empty.
 *
 * Report searches are **committed**, never live: the report only changes at
 * Generate time, so typing must not mutate the page draft (which would
 * re-render the whole tab — column arrays and every row — on each
 * keystroke). The typed value therefore lives in this component and is
 * pushed upward only on blur, on Enter, on Clear — and, because focus leaves
 * the input before a Generate click or Tab-to-Generate, ahead of Generate.
 * The page-level `value` still wins when it changes from the outside
 * (back/forward, deep link, tab switch, preset reset).
 */

import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface SearchFieldProps {
  /** Already-translated label. */
  label: string
  /** Committed draft value owned by the page. */
  value: string
  /** Fired when the typed draft is committed (blur, Enter, Clear). */
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Stable element id; defaults to a per-instance `useId()`. */
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
  id,
  className,
}: SearchFieldProps) {
  const { t } = useTranslation()
  const generatedId = useId()
  const inputId = id ?? `reports-search-${generatedId}`
  const inputRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState(value)
  /* The last value this field pushed upward (or adopted). When the page
     value changes while it matches, the change came from our own commit and
     must not clobber in-progress typing. */
  const committedRef = useRef(value)

  useEffect(() => {
    if (committedRef.current === value) return
    committedRef.current = value
    setDraft(value)
  }, [value])

  const commit = (next: string) => {
    committedRef.current = next
    if (next !== value) onChange(next)
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={inputId}>{label}</Label>

      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 inset-s-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={inputId}
          name={inputId}
          autoComplete="off"
          type="search"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit(event.currentTarget.value)
            }
            if (event.key === "Escape" && draft !== "") {
              event.preventDefault()
              setDraft("")
              commit("")
            }
          }}
          className="w-full min-w-56 ps-9 pe-9"
        />
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
            aria-label={t("common.clear")}
            onClick={() => {
              setDraft("")
              commit("")
              /* Keep the caret in the field after clearing. */
              inputRef.current?.focus()
            }}
          >
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
