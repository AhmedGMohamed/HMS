import { useMemo } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader as SidebarHeaderSlot,
  SidebarMenu,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/store/authStore"
import { useUIStore } from "@/store/uiStore"
import { NAV_CONFIG, filterNavForUser } from "@/lib/navigation"
import { SidebarAppHeader } from "./SidebarHeader"
import { SidebarUserProfile } from "./SidebarUserProfile"
import { SidebarNavItem } from "./SidebarNavItem"

/**
 * Composition of the shadcn `<Sidebar>` primitives + the HMS
 * navigation tree (NAV_CONFIG, filtered by `filterNavForUser`).
 *
 *   ┌─────────────────────────────────┐
 *   │ <SidebarHeader>                │  logo + wordmark + collapse
 *   ├─────────────────────────────────┤
 *   │ <SidebarContent>               │
 *   │   SidebarMenu (filterNav tree) │
 *   ├─────────────────────────────────┤
 *   │ <SidebarFooter>                │  user profile + kebab
 *   └─────────────────────────────────┘
 *
 * Collapsed state comes from the shadcn `SidebarProvider`'s own
 * cookie (see Phase 3 plan §Decisions). Direction (`side`) flips
 * in RTL via the language read from `uiStore`.
 */
export function SidebarShell() {
  const user = useAuthStore((s) => s.user)
  const language = useUIStore((s) => s.language)
  const direction = language === "ar" ? "rtl" : "ltr"

  const items = useMemo(() => filterNavForUser(NAV_CONFIG, user), [user])

  return (
    <Sidebar
      side={language === "ar" ? "right" : "left"}
      collapsible="icon"
      dir={direction}
    >
      <SidebarHeaderSlot>
        <SidebarAppHeader />
      </SidebarHeaderSlot>
      <SidebarContent className="my-4">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserProfile />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
