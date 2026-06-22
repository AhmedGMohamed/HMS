import { getIcon } from "@/lib/iconRegistry"

export interface DynamicIconProps {
  name: string
}

/**
 * Render a Lucide icon by string name.
 *
 * This wrapper exists so that `SidebarNavItem` (and other map-driven
 * renderers) can render an icon from a name without keeping a
 * `const Icon = ...` declaration in component scope — declarations
 * of that form trip the `react-hooks/static-components` ESLint rule
 * with the project's recommended config.
 *
 * Cost: one extra function component for every icon render. Benefit:
 * idiomatic lint-clean code that doesn't require per-line disables.
 */
export function DynamicIcon({ name }: DynamicIconProps) {
  const Icon = getIcon(name)
  return <Icon aria-hidden />
}
