import { Outlet } from "react-router-dom"
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
 *   │ ─ Header (SidebarProfile)     │  ┌ TopBar (sticky h-16) ──┐ │
 *   │ ─ Content (NAV_CONFIG items)  │  │ Breadcrumb · Toggle  · │ │
 *   │ ─ Footer                      │  │                       │ │
 *   │ ─ Rail (collapse control)     │  ├───────────────────────┤ │
 *   │                              │  │ <Outlet /> (scroll)   │ │
 *   │                              │  └───────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Mobile: the sidebar becomes an off-canvas drawer driven by the
 * `<SidebarTrigger />` button in the TopBar.
 */
export function AppShell() {
  const language = useUIStore((s) => s.language)

  return (
    <SidebarProvider defaultOpen>
      <SidebarShell />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 px-6 py-8 md:px-8" dir={language === "ar" ? "rtl" : "ltr"}>
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
