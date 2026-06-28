"use client"

import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StepperStep {
  /** i18n key, fed to the runtime translator by the consumer. */
  id: string
  /** Display label fallback when caller passes plain text. */
  label: string
  /** Optional `aria-description` for screen readers. */
  description?: string
}

interface StepperProps {
  steps: StepperStep[]
  /** 0-based index of the current step. */
  current: number
  /** Steps at or below this index display as completed (filled check). */
  completedThrough?: number
  className?: string
}

/**
 * Tab-shaped stepper shown above the wizard body.
 *
 * Adapted from the shadcn `<Stepper>` pattern: numeric bullet, label,
 * optional description. Renders read-only (the wizard owns
 * forward/back navigation). The selected step is highlighted in the
 * primary color, completed steps use a check + primary-tinted tone,
 * unseen steps are muted.
 *
 * Layout: horizontal segments with a connecting track between
 * bullets. Hover/focus is purely aesthetic; no clicks.
 */
export function Stepper({
  steps,
  current,
  completedThrough,
  className,
}: StepperProps) {
  const completedUpTo = Math.max(
    completedThrough ?? current - 1,
    -1
  )

  return (
    <ol
      className={cn(
        "flex w-full items-start justify-between gap-2 sm:gap-4",
        className
      )}
      aria-label="Wizard progress"
    >
      {steps.map((step, idx) => {
        const isCurrent = idx === current
        const isCompleted = idx <= completedUpTo && !isCurrent
        const isFuture = idx > current && !isCompleted

        return (
          <li
            key={step.id}
            className="flex flex-1 items-center"
            aria-current={isCurrent ? "step" : undefined}
            data-state={
              isCurrent ? "active" : isCompleted ? "complete" : "future"
            }
          >
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-primary bg-primary/10 text-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                  isFuture && "border-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckIcon aria-hidden className="size-4" />
                ) : (
                  <span aria-hidden>{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium sm:text-sm",
                  isCurrent && "text-foreground",
                  isCompleted && "text-primary",
                  isFuture && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {step.description ? (
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {step.description}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
