import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Settings, User as UserIcon } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { getInitials } from "@/lib/utils"
import { LogoutConfirmation } from "./LogoutConfirmation"

/**
 * Avatar → DropdownMenu rendered in the TopBar.
 *
 * - Header: full username + role badge.
 * - Profile / Settings: disabled (decision #3); grey, `aria-disabled`,
 *   no-op on click. Real actions land in Phase 6h.
 * - Logout: opens `<LogoutConfirmation>` (AlertDialog).
 */
export function UserMenu() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [logoutOpen, setLogoutOpen] = useState(false)

  if (!user) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full p-0"
            aria-label={t("topbar.openMenu")}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary-light text-primary text-xs font-semibold">
                {getInitials(user.username)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{user.username}</span>
            <span className="text-xs text-muted-foreground">
              {t("userMenu.signedInAs", { role: user.role })}
            </span>
            <Badge variant="secondary" className="mt-1 w-fit text-xs">
              {user.role}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled aria-disabled>
            <UserIcon aria-hidden />
            <span>{t("userMenu.profile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled aria-disabled>
            <Settings aria-hidden />
            <span>{t("userMenu.settings")}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(event) => {
            event.preventDefault()
            setLogoutOpen(true)
          }}>
            <LogOut aria-hidden />
            <span>{t("sidebar.logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogoutConfirmation open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
  )
}
