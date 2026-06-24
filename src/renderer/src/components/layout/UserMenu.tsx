import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
 * Dropdown-menu host. Renders the shadcn `<DropdownMenu>` Root
 * with its content (Profile stub · Settings stub · Logout) and
 * the confirm-on-sign-out AlertDialog.
 *
 * Consumers place **one or more** `<UserMenuTrigger>` siblings
 * inside it — multiple triggers are bound to the same Root and
 * visually swap based on a parent's `data-collapsible` selector
 * (used by the sidebar to switch between expanded and icon-only
 * states).
 *
 * Owned state:
 *   - `open` of the dropdown.
 *   - `logoutOpen` for the AlertDialog confirm.
 */
export function UserMenuBody({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  if (!user) return null

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {children}
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
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              setLogoutOpen(true)
            }}
          >
            <LogOut aria-hidden />
            <span>{t("sidebar.logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogoutConfirmation open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
  )
}

/**
 * Trigger primitive — must be invoked as a direct child of
 * `<UserMenuBody>`. Wraps shadcn's `<DropdownMenuTrigger asChild>`
 * so callers can supply their own element via the `asChild` pattern.
 */
export function UserMenuTrigger({
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuTrigger>) {
  return (
    <DropdownMenuTrigger asChild {...props}>
      {children}
    </DropdownMenuTrigger>
  )
}

/**
 * Legacy TopBar-style avatar shortcut. No longer mounted in the
 * primary chrome (design.md §5.1 relocated the user menu to the
 * sidebar footer) but kept exported so the dev playground and any
 * unmigrated consumer keeps compiling.
 */
export function UserMenu() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  return (
    <UserMenuBody>
      <UserMenuTrigger>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full p-0 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent focus-visible:ring-2"
          aria-label={t("topbar.openMenu")}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary-light text-primary text-xs font-semibold">
              {getInitials(user.username)}
            </AvatarFallback>
          </Avatar>
        </button>
      </UserMenuTrigger>
    </UserMenuBody>
  )
}
