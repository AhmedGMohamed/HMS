"use client"

import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useFieldControlProps } from "@/components/ui/field"

interface FieldControlOptions {
  /** Set only while a `FieldError` renders an error for this control. */
  invalid?: boolean
  /** The enclosing `Field` renders a `FieldDescription`. */
  hasDescription?: boolean
  required?: boolean
}

/**
 * S03 adapters for the Insurance forms.
 *
 * `useFieldControlProps()` reads the id/description/error ids minted by
 * the enclosing `<Field>`, so it has to run *below* that `Field` — these
 * two wrappers are that boundary. They add `aria-invalid`,
 * `aria-describedby` and `aria-required` (plus the matching control id)
 * so `<FieldLabel>`, `<FieldDescription>` and `<FieldError>` stay
 * associated with their control without hand-written ids per dialog.
 */
export function FieldInput({
  invalid,
  hasDescription,
  required,
  ...props
}: FieldControlOptions & ComponentProps<typeof Input>) {
  return (
    <Input
      {...useFieldControlProps({ invalid, hasDescription, required })}
      {...props}
    />
  )
}

export function FieldTextarea({
  invalid,
  hasDescription,
  required,
  ...props
}: FieldControlOptions & ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...useFieldControlProps({ invalid, hasDescription, required })}
      {...props}
    />
  )
}
