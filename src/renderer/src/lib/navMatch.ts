import type { NavigationItem } from "@/types"

/**
 * Pure helper — does any descendant (recursively) of the given navigation
 * entry match the active pathname? Used by `SidebarNavItem` for the
 * "auto-open group" UX and for active-state styling on grouped nav entries.
 */
export function isDescendantActive(
  children: NavigationItem[],
  pathname: string,
): boolean {
  return children.some((child) => {
    if (child.url) {
      if (pathname === child.url || pathname.startsWith(`${child.url}/`)) {
        return true
      }
    }
    if (child.children) return isDescendantActive(child.children, pathname)
    return false
  })
}

/**
 * Pure helper — does the given navigation entry's URL match the active
 * pathname, either exactly or as a prefix (so `/patients/123` lights up
 * the `Patients` entry)?
 */
export function matchesPath(item: NavigationItem, pathname: string): boolean {
  if (!item.url) return false
  return (
    pathname === item.url ||
    (item.url !== "/" && pathname.startsWith(`${item.url}/`))
  )
}
