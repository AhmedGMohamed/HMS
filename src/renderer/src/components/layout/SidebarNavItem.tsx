/* eslint-disable react-hooks/static-components -- dynamic Lucide icons resolved from NAV_CONFIG.icon */
import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRight } from "lucide-react"
import { getIcon } from "@/lib/iconRegistry"
import { isDescendantActive, matchesPath } from "@/lib/navMatch"
import type { NavigationItem } from "@/types"

export interface SidebarNavItemProps {
  item: NavigationItem
}

/**
 * Render a single entry from `NAV_CONFIG`.
 *
 * - Leaf items: a `<SidebarMenuButton>` wrapping a `<button>` that calls
 *   `navigate(item.url)` and applies `data-active` whenever the current
 *   pathname matches with starts-with semantics (decision #2 of Phase 3).
 * - Grouped items (User Management): a `<Collapsible>` whose default
 *   open state is derived from whether any descendant matches the active
 *   URL — Groups auto-open while navigating into their child pages.
 *
 * Tooltips surface the i18n label and only show in the collapsed state
 * (the shadcn sidebar primitive handles that visibility internally).
 */
export function SidebarNavItem({ item }: SidebarNavItemProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = useMemo(() => {
    if (matchesPath(item, location.pathname)) return true
    if (item.children) return isDescendantActive(item.children, location.pathname)
    return false
  }, [item, location.pathname])

  if (item.children && item.children.length > 0) {
    return <SidebarGroupedItem item={item} isActive={isActive} onNavigate={navigate} />
  }
  return <SidebarLeafItem item={item} isActive={isActive} onNavigate={navigate} />
}

function SidebarGroupedItem({
  item,
  isActive,
  onNavigate,
}: {
  item: NavigationItem
  isActive: boolean
  onNavigate: (url: string) => void
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const Icon = getIcon(item.icon)

  return (
    <Collapsible asChild defaultOpen={isActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={isActive} tooltip={t(item.label)}>
            <Icon aria-hidden />
            <span className="truncate">{t(item.label)}</span>
            <ChevronRight
              className="ms-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
              aria-hidden
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => {
              const ChildIcon = getIcon(child.icon)
              const childActive = matchesPath(child, location.pathname)
              return (
                <SidebarMenuItem key={child.id}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={childActive}
                    onClick={child.url ? () => onNavigate(child.url!) : undefined}
                  >
                    <button type="button" className="w-full cursor-pointer">
                      <ChildIcon aria-hidden />
                      <span className="truncate">{t(child.label)}</span>
                    </button>
                  </SidebarMenuSubButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarLeafItem({
  item,
  isActive,
  onNavigate,
}: {
  item: NavigationItem
  isActive: boolean
  onNavigate: (url: string) => void
}) {
  const { t } = useTranslation()
  if (!item.url) return null
  const Icon = getIcon(item.icon)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(item.label)}
        onClick={() => onNavigate(item.url!)}
      >
        <button type="button" className="cursor-pointer">
          <Icon aria-hidden />
          <span className="truncate">{t(item.label)}</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
