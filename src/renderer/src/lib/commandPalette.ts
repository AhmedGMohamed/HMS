import type { NavigationItem, User } from "@/types"
import { NAV_CONFIG, filterNavForUser } from "./navigation"

export interface CommandPaletteItem {
  id: string
  label: string
  url: string
  icon: string
}

/**
 * Flatten the permission-filtered navigation tree into command-palette
 * entries. Grouped items (e.g. User Management) contribute their children
 * only — the parent is a collapsible label in the sidebar, not a page.
 */
export function buildCommandPaletteItems(user: User | null): CommandPaletteItem[] {
  if (!user) return []

  const items: CommandPaletteItem[] = []

  const walk = (entries: NavigationItem[]): void => {
    for (const entry of entries) {
      if (entry.url) {
        items.push({
          id: entry.id,
          label: entry.label,
          url: entry.url,
          icon: entry.icon,
        })
      }
      if (entry.children?.length) walk(entry.children)
    }
  }

  walk(filterNavForUser(NAV_CONFIG, user))
  return items
}
