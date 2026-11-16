/**
 * Chart rasterization for PDF exports — Phase 6.11 plan §4.6 / D18.
 *
 * Recharts renders SVG, but pdfmake needs a bitmap. `html-to-image` walks the
 * rendered DOM (including CSS custom properties from the token file) and
 * produces a PNG; we render a dedicated English, fixed-size copy of each chart
 * off-screen so the capture never depends on the current viewport, locale or
 * scroll position.
 *
 * Capture is best-effort: a chart that fails (missing font, canvas taint,
 * unmounted node) yields `undefined` and the PDF builder falls back to the
 * data table it already prints underneath every chart.
 */

import { toPng } from "html-to-image"

export interface CaptureOptions {
  /** Device-pixel multiplier for the bitmap. Default 2 (≈180 dpi at 900px). */
  pixelRatio?: number
  backgroundColor?: string
}

/**
 * Waits until a chart slot has laid out its SVG **and** painted a frame.
 *
 * `ResponsiveContainer` measures its parent asynchronously (ResizeObserver), so
 * the `<svg>` can be absent for the first paint even though React has already
 * committed it. Capturing a slot whose SVG is missing, or is still 0×0, yields
 * a blank box — and before `ChartSnapshotSurface` disabled chart animation, a
 * slot could also be captured mid-entry-animation, which produced a bitmap with
 * axes and no series at all.
 *
 * The animation half is fixed at the source (`ChartAnimationContext`); this is
 * the measurement half. Both are bounded so a wedged chart cannot hang an
 * export.
 */
async function waitForChartGeometry(
  element: HTMLElement,
  timeoutMs = 1500
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const svg = element.querySelector<SVGSVGElement>("svg.recharts-surface")
    if (svg) {
      const box = svg.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) {
        // One more pair of frames so the first paint with real geometry lands.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        return
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25))
  }
}

/**
 * Captures a single element as a PNG data URL.
 *
 * Waits for layout/`ResizeObserver`-driven chart sizing to settle and for the
 * element's fonts to be ready — Recharts measures its container
 * asynchronously, and capturing too early yields a half-drawn chart.
 */
export async function captureElementAsPng(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<string | undefined> {
  const { pixelRatio = 2, backgroundColor = "#ffffff" } = options

  try {
    await waitForChartGeometry(element)
    // Best-effort: a font swap after capture would shift every label.
    await document.fonts?.ready

    return await toPng(element, {
      pixelRatio,
      backgroundColor,
      cacheBust: true,
      skipFonts: false,
      style: { margin: "0", transform: "none" },
    })
  } catch (error) {
    console.warn("Chart snapshot failed:", error)
    return undefined
  }
}

/**
 * Waits until the export snapshot surface is mounted and measurable.
 *
 * `html-to-image` captures a bitmap of a rendered DOM node, so the surface has
 * to be committed by React first. Polling the DOM (instead of a fixed timeout)
 * keeps the export fast when the browser is idle and reliable when it is not;
 * the timeout bounds the wait so a stuck render can never hang a download.
 */
export async function waitForSnapshotRoot(
  timeoutMs = 900
): Promise<HTMLElement | null> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const root = document.querySelector<HTMLElement>(
      "[data-chart-snapshot-surface]"
    )
    const slot = root?.querySelector("[data-chart-snapshot-key]")
    if (root && slot) return root
    await new Promise((resolve) => window.setTimeout(resolve, 40))
  }

  return null
}

/**
 * Captures every `[data-chart-snapshot-key]` slot inside `root`.
 *
 * Returns a `name → dataUrl` map; failed slots are omitted so callers can
 * branch on presence (`if (snapshots.revenue) …`).
 */
export async function captureChartSnapshots(
  root: HTMLElement | null,
  options: CaptureOptions = {}
): Promise<Record<string, string>> {
  if (!root) return {}

  const slots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-chart-snapshot-key]")
  )

  const entries = await Promise.all(
    slots.map(async (slot) => {
      const name = slot.dataset.chartSnapshotKey
      if (!name) return null
      const dataUrl = await captureElementAsPng(slot, options)
      return dataUrl ? ([name, dataUrl] as const) : null
    })
  )

  const result: Record<string, string> = {}
  for (const entry of entries) {
    if (entry) result[entry[0]] = entry[1]
  }
  return result
}
