import { Outlet, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar"
import { SidebarShell } from "./SidebarShell"
import { TopBar } from "./TopBar"
import { useUIStore } from "@/store/uiStore"

/**
 * Canonical authenticated chrome — layout §5.1 of design.md.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Sidebar (SidebarShell)        │ Inset (main column)         │
 *   │ ─ Header (SidebarAppHeader)   │  ┌ TopBar (sticky h-16) ──┐ │
 *   │ ─ Content (NAV_CONFIG items)  │  │ Breadcrumb · Toggle  · │ │
 *   │ ─ Footer (SidebarUserProfile) │  │                        │ │
 *   │ ─ Rail (collapse control)     │  ├────────────────────────┤ │
 *   │                               │  │ <Outlet /> (scroll)    │ │
 *   │                               │  └────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Mobile: the sidebar becomes an off-canvas drawer driven by the
 * `<SidebarTrigger />` button in the TopBar.
 */
export function AppShell() {
  const language = useUIStore((s) => s.language)
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <SidebarProvider defaultOpen>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("common.skipToContent")}
      </a>
      <SidebarShell />
      <SidebarInset>
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-6 py-8 md:px-8"
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <div
            key={location.pathname}
            className="animate-in fade-in-0 duration-150"
          >
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
