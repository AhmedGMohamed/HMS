import { useUIStore } from "@/store/uiStore"
import {
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Breadcrumbs } from "./Breadcrumbs"
import { LanguageToggle } from "./LanguageToggle"
import { UserMenu } from "./UserMenu"

/**
 * Sticky TopBar — `<h-16> | border-b | bg-surface`.
 *
 * Layout:
 *   - Left: hamburger on mobile only (`md:hidden`), then `<Breadcrumbs />`.
 *   - Right cluster: `<LanguageToggle />`, `<UserMenu />`.
 *
 * At `md+` the persistent sidebar replaces the hamburger; `<SidebarRail>`
 * inside the sidebar provides the desktop collapse control.
 */
export function TopBar() {
  const language = useUIStore((s) => s.language)
  const direction = language === "ar" ? "rtl" : "ltr"
  const { isMobile } = useSidebar()

  return (
    <header
      dir={direction}
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:px-6"
    >
      <SidebarTrigger
        className={isMobile ? "md:hidden" : "hidden"}
        aria-label="Toggle navigation"
      />
      <Breadcrumbs />
      <div className="ms-auto flex items-center gap-2">
        <LanguageToggle />
        <UserMenu />
      </div>
    </header>
  )
}
