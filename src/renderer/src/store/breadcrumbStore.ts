import { create } from "zustand"

/**
 * Dynamic breadcrumb label override.
 *
 * `lib/breadcrumbs.ts` resolves crumbs purely from the pathname, which
 * cannot know an entity's name (`/insurance/12` can only ever render a
 * generic "Record"). A detail page therefore publishes the human label
 * for its own pathname here while it is mounted:
 *
 *     useBreadcrumbLabel(company?.name ?? null)
 *
 * `Breadcrumbs` replaces the **last** crumb's label with the override only
 * when the recorded `pathname` matches the current location, so a stale
 * label can never leak onto another route during a transition.
 *
 * Keyed by pathname (not a bare string) on purpose: two navigations in the
 * same commit can otherwise race — the outgoing page's cleanup would wipe
 * the incoming page's label, or vice-versa.
 */
interface BreadcrumbOverrideState {
  /** Pathname the label belongs to (`null` = no override). */
  pathname: string | null
  /** Human-readable label for that pathname's last crumb. */
  label: string | null
  setOverride: (pathname: string, label: string | null) => void
  /** Clears only if the stored override belongs to `pathname`. */
  clearOverride: (pathname: string) => void
}

export const useBreadcrumbOverrideStore = create<BreadcrumbOverrideState>()(
  (set, get) => ({
    pathname: null,
    label: null,
    setOverride: (pathname, label) => {
      if (!label) {
        get().clearOverride(pathname)
        return
      }
      if (get().pathname === pathname && get().label === label) return
      set({ pathname, label })
    },
    clearOverride: (pathname) => {
      if (get().pathname !== pathname) return
      set({ pathname: null, label: null })
    },
  })
)
