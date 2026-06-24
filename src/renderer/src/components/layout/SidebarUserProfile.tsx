import { useTranslation } from "react-i18next"
import { MoreVertical } from "lucide-react"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthStore } from "@/store/authStore"
import type { Role } from "@/types"
import { cn, getInitials } from "@/lib/utils"
import { UserMenuBody, UserMenuTrigger } from "./UserMenu"

/**
 * Sidebar footer profile (design.md §5.1).
 *
 *   ┌───────────────────────────────┐
 *   │ [AV] Username             ⋮   │   row 1
 *   │       Role                    │   row 2 (caption)
 *   └───────────────────────────────┘
 *
 * Why two `<UserMenuBody>` instances instead of one with two triggers?
 *
 *   Radix's `<DropdownMenu>` Root owns its anchor position when
 *   `<DropdownMenuContent>` opens. When two `<UserMenuTrigger>`s
 *   share one Root, the menu anchors to the **last** trigger that
 *   fired — visually it pops up wherever that trigger is, but it
 *   re-uses the cached position from the first open and never
 *   re-renders between modes. The previously seen bug: "menu opens
 *   in the wrong place" (anchored to the wrong sidebar state).
 *
 *   Two separate bodies also keeps the visible/collapsed mounts
 *   isolated so a click in expanded mode cannot open a menu whose
 *   trigger is hidden by `group-data-[collapsible=icon]`.
 *
 * Tooltip note:
 *   Wrapping a Radix `<DropdownMenuTrigger>` in `<Tooltip>` swallows
 *   the click — tooltip's pointer handlers intercept before the
 *   dropdown's open transition fires. We put the `<TooltipTrigger
 *   asChild>` on a sibling `<span>` that visually mirrors the
 *   trigger (same bounds, same styling) but does not participate in
 *   the dropdown tree.
 */
export function SidebarUserProfile() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  const role = user.role as Role
  const initials = getInitials(user.username)
  const openMenuLabel = t("sidebar.openUserMenu")
  const triggerClass = cn(
    "cursor-pointer outline-none ring-sidebar-ring transition-colors",
    "hover:bg-sidebar-accent focus-visible:ring-2"
  )

  return (
    <>
      {/* ---------- Expanded: full row clickable. ---------- */}
      <div
        className={cn(
          "group-data-[collapsible=icon]:hidden",
          "relative"
        )}
        data-testid="sidebar-user-profile-expanded-wrap"
      >
        <UserMenuBody>
          <UserMenuTrigger>
            <div
              className={cn(
                triggerClass,
                "flex items-start gap-3 rounded-md p-2 text-left"
              )}
              data-testid="sidebar-user-profile-expanded"
            >
              <Avatar className="my-auto size-9 rounded-lg ring-1 ring-border">
                <AvatarFallback className="rounded-lg bg-primary-light text-primary text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-foreground">
                  {user.username}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {role}
                </span>
              </div>

              <MoreVertical
                aria-hidden
                className="my-auto size-4 text-text-secondary"
              />
            </div>
          </UserMenuTrigger>
        </UserMenuBody>
      </div>

      {/* ---------- Collapsed: avatar-only trigger + tooltip on the avatar.

          The Radix <TooltipTrigger asChild> wraps the <Avatar> span which
          is a child of the <button> trigger. Pointer events on the avatar
          still bubble to the button (Radix Tooltip doesn't preventDefault
          on click); the tooltip's hover/focus tracking is the *only*
          pointer interaction the tooltip adds. ---------- */}
      <div
        className={cn(
          "hidden group-data-[collapsible=icon]:inline-flex",
          "relative"
        )}
        data-testid="sidebar-user-profile-collapsed-wrap"
      >
        <UserMenuBody>
          <UserMenuTrigger>
            <button
              type="button"
              className={cn(
                triggerClass,
                "flex size-9 items-center justify-center rounded-lg"
              )}
              aria-label={openMenuLabel}
              data-testid="sidebar-user-profile-collapsed"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="size-9 rounded-lg ring-1 ring-border">
                    <AvatarFallback className="rounded-lg bg-primary-light text-primary text-sm font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  {openMenuLabel}
                </TooltipContent>
              </Tooltip>
            </button>
          </UserMenuTrigger>
        </UserMenuBody>
      </div>
    </>
  )
}
