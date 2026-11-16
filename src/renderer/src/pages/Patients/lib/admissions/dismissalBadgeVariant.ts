import type { VariantProps } from "class-variance-authority"
import type { badgeVariants } from "@/components/ui/badge"

import type { LeaveReason } from "@/pages/Patients/types/patient"

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

/**
 * Maps each `LeaveReason` (the SQL column) to a shadcn badge variant
 * + the i18n key that should render its label. Mirrors the legacy CSS
 * scheme:
 *  - `improvement`  → success (green)
 *  - `death`        → destructive (red)
 *  - `transfer`     → warning (yellow)
 *  - `as_desired`   → primary (default blue)
 */
export function dismissalBadgeVariant(
  reason: LeaveReason | string | null | undefined
): { variant: BadgeVariant; className?: string; labelKey: string } {
  switch (reason) {
    case "improvement":
      return {
        variant: "default",
        labelKey: "patients.leaveReasons.improvement",
      }
    case "death":
      return {
        variant: "destructive",
        labelKey: "patients.leaveReasons.death",
      }
    case "transfer":
      return {
        variant: "secondary",
        className:
          "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-500/30",
        labelKey: "patients.leaveReasons.transfer",
      }
    case "as_desired":
      return {
        variant: "secondary",
        labelKey: "patients.leaveReasons.as_desired",
      }
    default:
      return {
        variant: "outline",
        labelKey: "patients.messages.dismissalReason",
      }
  }
}
