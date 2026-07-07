/**
 * Top-level PDF shell.
 *
 * The shell owns the page chrome — header strip (brand + future
 * logo), title, caller-supplied content, and footer (brand stub +
 * page number). Pages in the renderer pipe their own body content
 * into this shell and shell takes care of the rest.
 *
 * Single source of truth for:
 *   - page size (A4 portrait),
 *   - margins (raised top margin to make room for the header strip),
 *   - default font size,
 *   - cross-page branding (sidebar.brand key),
 *   - footer page numbering,
 *   - RTL alignment flips (delegated to `@digicole/pdfmake-rtl`).
 *
 * Pages (Patients, Reports, Vault, …) do not own any of the above.
 * Their print code generates a `content: unknown[]` array plus a
 * `title` string and hands them to `openPdfShellDoc(...)`.
 *
 * Future iteration hooks (logo image, footer brand stub, regulatory
 * text) are reserved as documented options on the inputs.
 */

import type { TFunction } from "i18next"

import { loadPdfMake } from "@/lib/pdfmake/pdfmakeLoader"

export interface PdfShellInputs {
  /** Body title — large bold text centred on the page below the
   *  header strip. e.g. "PATIENT BILL" / "فاتورة المريض". */
  title: string
  /** Caller-supplied pdfmake content nodes (post-title). */
  content: unknown[]
  /** Optional subtitle paragraphs (e.g. clinic subtitle). */
  brandSubtitle?: string
}

export interface PdfShellOptions {
  /** i18n function used for the brand line + page label. */
  t: TFunction
  /** Active locale; drives alignment flips. */
  language: "en" | "ar"
  /** When true, also renders a "Page X of Y" footer. Default true. */
  pageNumberFooter?: boolean
}

/**
 * Build the full docDefinition. Layout, top → bottom:
 *   1. Header strip (brand mark + brand text).
 *   2. Title (large, bold, centred).
 *   3. Caller content (untouched).
 *   4. Footer (brand strip + optional page numbering).
 *
 * Returns the docDefinition object the caller pipes to
 * `pdfMake.createPdf(...).open()`.
 *
 * The shell owns fonts/margins/styles; callers should NOT override
 * them — if they need page-local styling, they should extend via
 * the namespaced `style` block under `styles.Xxx` keys rather than
 * poking at the top-level defaults.
 */
export function buildPdfShellDoc(
  inputs: PdfShellInputs,
  options: PdfShellOptions
): Record<string, unknown> {
  const { t, language, pageNumberFooter = true } = options
  const isRtl = language === "ar"

  /** Pdfmake node reference: a single header line with the brand.
   *  Future hook: replace text with `<HmsLogo>` SVG by passing an
   *  optional `brandLogo` field through `PdfShellOptions`. */
  const headerLine: Record<string, unknown> = {
    text: t("sidebar.brand"),
    alignment: isRtl ? "right" : "left",
    bold: true,
    fontSize: 8,
    color: "#475569",
    margin: [0, 0, 0, 0],
  }

  const subtitleLine: Record<string, unknown> | null = inputs.brandSubtitle
    ? {
        text: inputs.brandSubtitle,
        alignment: isRtl ? "right" : "left",
        fontSize: 8,
        color: "#94a3b8",
        margin: [0, 0, 0, 0],
      }
    : null
  
  const headerBlock: Array<Record<string, unknown> | null> = [
    headerLine,
    subtitleLine ? subtitleLine : null
  ].filter(Boolean)

  const titleBlock: Record<string, unknown> = {
    text: inputs.title,
    alignment: "center",
    fontSize: 16,
    bold: true,
    margin: [40, 0, 40, 16],
    color: "#0f172a",
  }

  const footerBrandLine: Record<string, unknown> = {
    text: t("sidebar.brand"),
    alignment: isRtl ? "right" : "left",
    fontSize: 8,
    color: "#94a3b8",
  }

  const footerBlock =
    (currentPage: number, totalPages: number): Record<string, unknown> => {
      const footerPageArea: Record<string, unknown> = {
        text: t("patients.pdfShelf.page", {
          current: currentPage.toString(),
          total: totalPages.toString(),
        }),
        alignment: isRtl ? "left" : "right",
        fontSize: 8,
        color: "#94a3b8",
      }

      return {
        columns: pageNumberFooter
          ? [
            { width: "*", ...footerBrandLine },
            { width: "auto", ...footerPageArea },
          ]
          : [{ width: "*", ...footerBrandLine }],
        margin: [40, 18, 40, 0],
      }
    }

  const content: unknown[] = [
    titleBlock,
    ...inputs.content,
    footerBlock
  ]

  return {
    header: {
      stack: headerBlock,
      margin: [40, 40, 0, 0]
    },
    content,
    footer: footerBlock,
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, 50, 40, 40],
    defaultStyle: { fontSize: 9, noWrap: false },
    styles: {
      brand: { fontSize: 8, bold: true, color: "#475569" },
      title: { fontSize: 18, bold: true },
      subtitle: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
      footer: { fontSize: 8, color: "#94a3b8" },
      zebraHeader: { fillColor: "#f0f0f0" },
      zebraRow: { fillColor: "#f9f9f9" },
      noBorders: {},
    },
    /** pdfmake primitives; populated at runtime. The shell exposes
     *  these as placeholders so callers don't need to know about
     *  runtime counters. */
  } as Record<string, unknown>
}

/**
 * Convenience entry point: load `@digicole/pdfmake-rtl`, build the
 * docDefinition, and trigger `.open()` in a separate Electron
 * Chromium window (pdfmake's bootstrap HTML page).
 *
 * Errors from `loadPdfMake()` (UMD not registered) or pdfmake
 * (malformed docDefinition) surface via `throw` — callers wrap with
 * `try/catch` and surface a toast.
 */
export async function openPdfShellDoc(
  inputs: PdfShellInputs,
  options: PdfShellOptions
): Promise<void> {
  const pdfMake = await loadPdfMake()
  const docDefinition = buildPdfShellDoc(inputs, options)
  const doc = pdfMake.createPdf(docDefinition as unknown as Parameters<
    typeof pdfMake.createPdf
  >[0])
  doc.open()
}
