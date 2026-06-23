import type { ComponentType } from "react"
import type { ChartConfig } from "@/components/ui/chart"

export interface ChartConfigEntry {
  /** Human-readable label rendered in legends & tooltips. */
  label: string
  /** CSS color reference, typically `var(--color-<token>)`. */
  color: string
  /** Optional Lucide icon to render inside the legend instead of a swatch dot. */
  icon?: ComponentType
}

/**
 * Build a typed `ChartConfig` keyed by TKey. Each entry maps to a CSS
 * variable so colors follow the design-token system rather than literal
 * hex values (design.md §11.2: "semantic Tailwind class names ... the HSL
 * is only used by shadcn primitives internally").
 *
 * See `chart.tsx` — `ChartStyle` reads the `theme[mode]` slot and emits
 * a CSS custom-property per key. We render ChartContainer in light theme
 * only for now (dark mode is not in scope pre-Phase-8), so we provide one
 * light-mode slot.
 *
 * Example:
 *   const config = useChartConfig({
 *     revenue: { label: 'Revenue', color: 'var(--color-primary)' },
 *     profit:  { label: 'Profit',  color: 'var(--color-success)' },
 *   })
 *   <ChartContainer config={config}>
 *     <LineChart>...</LineChart>
 *   </ChartContainer>
 */
export function useChartConfig<TKey extends string>(
  entries: Record<TKey, ChartConfigEntry>
): ChartConfig {
  const config = {} as ChartConfig

  for (const key of Object.keys(entries) as TKey[]) {
    const entry = entries[key]
    config[key] = {
      label: entry.label,
      icon: entry.icon,
      theme: {
        light: entry.color,
        // dark slot mirrors light for now — Phase 8 dark-mode pass will
        // supply a separate palette, but we don't have a way to detect
        // theme at chart-config build time, so we share a CSS variable.
        // shadcn `chart.tsx` exposes the `THEMES` constant; if we ever
        // want dark-mode variants we will resolve them here.
        dark: entry.color,
      },
    }
  }

  return config
}
