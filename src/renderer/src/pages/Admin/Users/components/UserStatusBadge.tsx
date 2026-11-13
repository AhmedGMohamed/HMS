import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface UserStatusBadgeProps {
  active: boolean
  className?: string
}

/**
 * Active / inactive pill for the users table.
 *
 * Deliberately limited to built-in badge variants instead of the ad-hoc
 * `success` tokens: those exist in `@theme` but have no dark-mode pair, and this
 * badge has to read correctly in both themes. The label carries the meaning, so
 * colour is never the only signal.
 */
export function UserStatusBadge({ active, className }: UserStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <Badge
      variant={active ? "secondary" : "outline"}
      className={cn(!active && "text-muted-foreground", className)}
    >
      {active ? t("common.active") : t("common.inactive")}
    </Badge>
  )
}
