import { useMemo } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/store/authStore"
import { NAV_CONFIG, filterNavForUser } from "@/lib/navigation"
import { SidebarProfile } from "./SidebarProfile"
import { SidebarNavItem } from "./SidebarNavItem"
import { useUIStore } from "@/store/uiStore"

/**
 * Composition of the shadcn `<Sidebar>` primitives + the HMS
 * navigation tree (NAV_CONFIG, filtered by the current user's
 * permissions by `filterNavForUser`). Hidden away from `<AppShell>`
 * so the AppShell layout can stay narrow and review-friendly.
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
      <SidebarHeader>
        <SidebarProfile />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
