import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchIcon } from "lucide-react"
import { useUIStore } from "@/store/uiStore"
import { Button } from "@/components/ui/button"
import {
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Breadcrumbs } from "./Breadcrumbs"
import { CommandPalette } from "./CommandPalette"
import { LanguageToggle } from "./LanguageToggle"

/**
 * Sticky TopBar — `<h-12> | border-b | bg-surface`.
 *
 * Layout:
 *   - Left: hamburger on mobile only (`md:hidden`), then `<Breadcrumbs />`.
 *   - Right cluster: `<LanguageToggle />`.
 *
 * Per design.md §5.1 the user menu has moved out of the TopBar into
 * the sidebar footer (`<SidebarUserProfile />`). The layout is intentionally
 * left-justified because no other action groups live here.
 *
 * At `md+` the persistent sidebar replaces the hamburger; `<SidebarRail>`
 * inside the sidebar provides the desktop collapse control.
 */
export function TopBar() {
  const language = useUIStore((s) => s.language)
  const direction = language === "ar" ? "rtl" : "ltr"
  const { isMobile } = useSidebar()
  const { t } = useTranslation()
  const [commandOpen, setCommandOpen] = useState(false)

  return (
    <header
      dir={direction}
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:px-6"
    >
      <SidebarTrigger
        className={isMobile ? "md:hidden" : "hidden"}
        aria-label={t("topbar.toggleNavigation")}
      />
      <Breadcrumbs />
      <div className="ms-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2 text-muted-foreground"
          onClick={() => setCommandOpen(true)}
          aria-label={t("topbar.search")}
          aria-keyshortcuts="Control+K"
        >
          <SearchIcon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t("topbar.search")}</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
            Ctrl K
          </kbd>
        </Button>
        <LanguageToggle />
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  )
}
