/**
 * Chart entry-animation switch — Phase 6.11.
 *
 * Recharts animates series in over ~1.5s by default. That is right on screen
 * and wrong in a PDF: the export mounts a hidden copy of the chart and captures
 * it a couple of frames later, so a bitmap taken at ~30ms contains the axes
 * and nothing else. The wrappers therefore read this context and pass
 * `isAnimationActive={false}` whenever a capture could be in flight.
 *
 * The default is `true`, so a chart rendered anywhere else (a tab, the
 * dashboard) keeps its animation and no call site has to think about it.
 * `ChartSnapshotSurface` provides `false`.
 *
 * Users who ask the OS for reduced motion also get `false`: the media query is
 * read through `useSyncExternalStore`, so toggling the OS setting takes effect
 * without a reload. Outside a browser (SSR, jsdom without `matchMedia`) the
 * default stays `true` — tests keep animating.
 */

import { createContext, useContext, useSyncExternalStore } from "react"

export const ChartAnimationContext = createContext(true)

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/* A single MediaQueryList per document: `addEventListener`/`removeEventListener`
   must target the same instance, and re-creating it per render would leak
   listeners. `undefined` = not resolved yet, `null` = environment has no
   `matchMedia` (SSR / jsdom). */
let cachedMediaQueryList: MediaQueryList | null | undefined

function getMediaQueryList(): MediaQueryList | null {
  if (cachedMediaQueryList !== undefined) return cachedMediaQueryList
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    cachedMediaQueryList = null
    return cachedMediaQueryList
  }
  cachedMediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY)
  return cachedMediaQueryList
}

function subscribe(onStoreChange: () => void): () => void {
  const mql = getMediaQueryList()
  if (!mql) return () => undefined
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onStoreChange)
    return () => mql.removeEventListener("change", onStoreChange)
  }
  /* Safari < 14 fallback. */
  mql.addListener(onStoreChange)
  return () => mql.removeListener(onStoreChange)
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false
}

/** `true` when the OS asks for reduced motion. SSR/jsdom-safe (`false`). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * `false` inside a snapshot surface, `false` when the OS prefers reduced
 * motion, `true` everywhere else.
 */
export function useChartAnimation(): boolean {
  const contextAllowsAnimation = useContext(ChartAnimationContext)
  const prefersReducedMotion = usePrefersReducedMotion()
  return contextAllowsAnimation && !prefersReducedMotion
}
