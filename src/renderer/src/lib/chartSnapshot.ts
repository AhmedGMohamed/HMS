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
 * Captures a single element as a PNG data URL.
 *
 * Waits for a frame first so layout/`ResizeObserver`-driven chart sizing has
 * settled — Recharts measures its container asynchronously, and capturing too
 * early yields a half-drawn chart.
 */
export async function captureElementAsPng(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<string | undefined> {
  const { pixelRatio = 2, backgroundColor = "#ffffff" } = options

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

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
