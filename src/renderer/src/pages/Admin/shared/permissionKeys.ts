import type { Permission } from "@/pages/Admin/Roles/types/role"

/**
 * Permission label lookup.
 *
 * The `roles.permissions` i18n map is hand-maintained and lags the database:
 * the production seed has 20 permissions but the map only covers 19 (it was
 * missing `manage_supplies`). Rather than render a raw key such as
 * `roles.permissions.foo_bar`, every label goes through this fallback chain:
 *
 *   1. `roles.permissions.<feature_name>` if the translation exists
 *   2. the i18n key itself translated with `defaultValue` = `feature_name`
 *
 * Keeping this pure makes it unit-testable without an i18n instance.
 */
export type Translate = (
  key: string,
  options?: { defaultValue?: string }
) => string

export function permissionLabel(
  featureName: string,
  t: Translate
): string {
  return t(`roles.permissions.${featureName}`, { defaultValue: featureName })
}

/** Sorted copy — the grid and the expanded chips both want a stable order. */
export function sortPermissions(permissions: Permission[]): Permission[] {
  return [...permissions].sort((a, b) =>
    a.featureName.localeCompare(b.featureName)
  )
}
