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
 *   - **Collapsed, expand button keyboard-focused:** same swap. The
 *     button reveals itself via `focus-visible:` and hides the logo
 *     through `peer-focus-visible:`, so a rail click or nav click
 *     (which only sets `:focus`, not `:focus-visible`) cannot leave
 *     both controls visible at once.
 *
 * Only one of the two toggle buttons is mounted at a time, which
 * also keeps the hidden control out of the tab order.
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
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <div
      className="relative flex h-12 items-center gap-2 pb-1"
      data-testid="sidebar-app-header"
    >
      {/* Expand trigger — collapsed only. The `peer` marker lets the logo
          cluster below hide itself when this control receives keyboard
          focus, keeping the two states mutually exclusive without
          `group-focus-within` (which also fired for nav clicks). */}
      {isCollapsed && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleSidebar}
          aria-label={t("sidebar.toggleSidebar")}
          className={cn(
            "peer absolute inset-0 m-auto size-8",
            "pointer-events-none opacity-0 transition-opacity duration-150 ease-out",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "focus-visible:pointer-events-auto focus-visible:opacity-100"
          )}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      )}

      {/* Logo cluster — expanded: logo + wordmark. Collapsed: logo only,
          replaced by the expand trigger while the sidebar is hovered or
          the trigger has keyboard focus. */}
      <div
        className={cn(
          "flex flex-1 items-center gap-2 transition-opacity duration-150 ease-out",
          isCollapsed && "flex-none justify-center",
          isCollapsed &&
            "group-hover:pointer-events-none group-hover:opacity-0",
          "peer-focus-visible:pointer-events-none peer-focus-visible:opacity-0"
        )}
      >
        <HmsLogo size={32} className="shrink-0 text-primary" />
        <HmsWordmark
          className={cn("truncate text-base", isCollapsed && "hidden")}
        />
      </div>

      {/* Collapse trigger — expanded only. */}
      {!isCollapsed && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleSidebar}
          aria-label={t("sidebar.toggleSidebar")}
          className="size-7 shrink-0 text-text-secondary hover:bg-sidebar-accent hover:text-foreground"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      )}
    </div>
  )
}
