import { useTranslation } from "react-i18next"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { HmsLogo, HmsWordmark } from "@/components/icons/HmsLogo"

/**
 * Sidebar app header (design.md §5.1).
 *
 *   - **Expanded:** `<HmsLogo />` + `<HmsWordmark />` ("HealthCore+")
 *     on the inline-start side; a `<PanelLeftClose>` button sits on
 *     the inline-end and collapses the sidebar.
 *   - **Collapsed, idle:** the logo fades in alone.
 *   - **Collapsed, hovered anywhere on the sidebar:** the logo
 *     fades out and the expand button fades in.
 *
 * The "anywhere on the sidebar" hover relies on the implicit
 * `group` declared by `<Sidebar>` itself (`sidebar.tsx:207`:
 * `className="group peer ..."`). The trigger uses `group-hover:`
 * (unnamed, so the nearest `group` ancestor wins — the sidebar
 * root), which fires whenever the cursor enters any pixel of the
 * sidebar column, including the nav content and footer.
 *
 * We do **not** use `SidebarProvider`'s `group/sidebar-wrapper`
 * — it spans the entire layout (sidebar + main inset), so a hover
 * on the page body would otherwise reveal the expand icon.
 */
export function SidebarAppHeader() {
  const { t } = useTranslation()
  const { toggleSidebar } = useSidebar()

  return (
    <div
      className="relative flex h-12 items-center gap-2 pb-1"
      data-testid="sidebar-app-header"
    >
      {/* Logo cluster — visible whenever (1) expanded OR (2) collapsed but not hovered. */}
      <div
        className={cn(
          "flex flex-1 items-center gap-2 transition-opacity duration-150 ease-out",
          "group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center",
          "group-data-[collapsible=icon]:group-hover:pointer-events-none",
          "group-data-[collapsible=icon]:group-hover:opacity-0"
        )}
      >
        <HmsLogo size={32} className="shrink-0 text-primary" />
        <HmsWordmark className="truncate text-base group-data-[collapsible=icon]:hidden" />
      </div>

      {/* Collapse trigger — visible when expanded; hidden when collapsed. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={toggleSidebar}
        aria-label={t("sidebar.toggleSidebar")}
        className={cn(
          "size-7 shrink-0 text-text-secondary hover:bg-sidebar-accent hover:text-foreground",
          "group-data-[collapsible=icon]:hidden"
        )}
      >
        <PanelLeftClose className="size-4" />
      </Button>

      {/* Expand trigger — visible only when (collapsed AND sidebar is hovered). */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={toggleSidebar}
        aria-label={t("sidebar.toggleSidebar")}
        className={cn(
          "pointer-events-none absolute inset-y-0 my-auto size-8",
          "opacity-0 transition-opacity duration-150 ease-out",
          "group-data-[collapsible=icon]:group-hover:opacity-100",
          "group-data-[collapsible=icon]:group-hover:pointer-events-auto",
          "group-data-[collapsible=icon]:group-focus-within:opacity-100",
          "group-data-[collapsible=icon]:group-focus-within:pointer-events-auto"
        )}
      >
        <PanelLeftOpen className="size-4" />
      </Button>
    </div>
  )
}
