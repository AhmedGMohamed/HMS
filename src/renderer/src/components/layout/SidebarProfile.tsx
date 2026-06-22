import { useTranslation } from "react-i18next"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/store/authStore"
import { getInitials } from "@/lib/utils"
import type { Role } from "@/types"

/**
 * Mini profile block rendered at the top of the sidebar.
 *
 * Hidden when the sidebar collapses to icon-only — the parent
 * shadcn `SidebarHeader` applies `group-data-[collapsible=icon]:hidden`
 * on its children, so simply being inside `<SidebarHeader>` is enough
 * to opt out.
 */
export function SidebarProfile() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  const role = user.role as Role

  return (
    <div className="flex flex-col gap-3 px-2 py-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-9 ring-1 ring-border">
          <AvatarFallback className="bg-primary-light text-primary text-sm font-semibold">
            {getInitials(user.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-foreground">
            {user.username}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {user.name ?? t("sidebar.profile")}
          </span>
        </div>
      </div>
      <Badge variant="secondary" className="w-fit text-xs">
        {role}
      </Badge>
      <Separator className="bg-sidebar-border" />
    </div>
  )
}
