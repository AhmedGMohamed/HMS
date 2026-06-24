import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { HmsLogo, HmsWordmark } from "@/components/icons/HmsLogo"

/**
 * Sidebar app header (design.md §5.1).
 *
 *   - **Expanded:** `<HmsLogo />` + `<HmsWordmark />` ("HealthCore+").
 *   - **Collapsed, idle:** the logo fades in alone.
 *   - **Collapsed, hovered:** the logo fades out and a single
 *     expand button fades in its place. The icon mirrors itself
 *     in RTL via the sidebar primitive's `data-side="right"` rotation.
 *
 * The switch between logo and expand icon is driven by local
 * `mouseenter` / `mouseleave` state (scoped to this component),
 * NOT the outer `SidebarProvider`'s `sidebar-wrapper` group —
 * the sidebar-wrapper spans the entire layout (sidebar + main
 * inset), so hovering the page body would otherwise reveal the
 * expand icon inadvertently. The header listens for interaction
 * inside its own bounding box only.
 *
 * Collapse interaction elsewhere remains available via:
 *   - `<SidebarRail />` (drag edge) — still rendered by `SidebarShell`.
 *   - `Ctrl/Cmd+B` keyboard shortcut (handled by `SidebarProvider`).
 */
export function SidebarAppHeader() {
  const { t } = useTranslation()
  const { toggleSidebar } = useSidebar()
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group/header relative flex h-12 items-center gap-2 pb-1"
      data-testid="sidebar-app-header"
    >
      {/* Logo — visible whenever (1) expanded OR (2) collapsed but NOT hovered. */}
      <div
        className={cn(
          "flex items-center gap-2 transition-opacity duration-150 ease-out",
          "group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center",
          hovered &&
            "group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
        )}
      >
        <HmsLogo
          size={32}
          className="shrink-0 text-primary"
        />
        <HmsWordmark className="truncate text-base group-data-[collapsible=icon]:hidden" />
      </div>

      {/* Expand trigger — only visible when (collapsed AND hovered). */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={toggleSidebar}
        aria-label={t("sidebar.toggleSidebar")}
        className={cn(
          "absolute inset-0 m-auto size-8 opacity-0 transition-opacity duration-150 ease-out",
          "pointer-events-none",
          "group-data-[collapsible=icon]:group-hover/header:opacity-100",
          "group-data-[collapsible=icon]:group-focus-within/header:opacity-100",
          "group-data-[collapsible=icon]:group-hover/header:pointer-events-auto",
          "group-data-[collapsible=icon]:group-focus-within/header:pointer-events-auto"
        )}
      >
        <PanelLeftOpen className="size-4"/>
      </Button>
    </div>
  )
}
