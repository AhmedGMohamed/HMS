/**
 * PDF theme for insurance reports — Phase 6.10.
 *
 * Matches the palette the rest of the system's PDFs use (Vault 6.9 is the
 * reference): primary `#0077B6` header bands with white text, `#0f172a`
 * body text, `#e2e8f0` hairline borders at 0.5pt and `#ffffff`/`#f8fafc`
 * zebra rows. Semantic accents come from the design tokens (`danger`,
 * `success`, `warning` in `index.css`).
 *
 * ## Why fixed widths and no `colSpan`
 *
 * The A4 portrait usable width with the shell's `pageMargins: [40, 50,
 * 40, 40]` is 515.28pt. Mixing `"*"`/`"auto"` widths with `colSpan` cells
 * (the legacy approach for totals rows) let pdfmake size the spanning cell
 * against the last `auto` column, which pushed the table past the right
 * margin — the value column ended up clipped at the page edge, so totals
 * appeared "missing". Every table here therefore uses explicit widths that
 * sum to the usable width and plain 6-cell rows (label in column 1, value
 * in column 6, middle cells empty) instead of a merged cell.
 */

export interface PdfNode {
  [key: string]: unknown
}

export const PDF_COLORS = {
  primary: "#0077B6",
  headerText: "#ffffff",
  text: "#0f172a",
  muted: "#475569",
  border: "#e2e8f0",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  band: "#f1f5f9",
  bandStrong: "#e2e8f0",
  /**
   * Print-weight variants of the `danger` / `success` / `warning` design
   * tokens. The UI tokens (`#EF4444` / `#10B981` / `#F59E0B`) drop to
   * ~2:1 contrast at 8pt on white; these are the dark end of the same
   * hues and clear 4.5:1 on paper.
   */
  danger: "#B91C1C",
  success: "#047857",
  warning: "#B45309",
} as const

/**
 * Item table columns: name, type, date, qty, unit price, total.
 *
 * `"*"` + `"auto"` (never fixed sums): pdfmake distributes the star column
 * over whatever width remains after the content-sized columns, so the
 * table can never exceed the content box. Fixed numbers look correct on
 * paper but ignore cell padding — the sum plus 6pt per column overflowed
 * the right margin and pushed the last column (the totals!) off-page.
 * This is the same width strategy the working Vault report uses.
 */
export const ITEM_TABLE_WIDTHS = ["*", "auto", "auto", "auto", "auto", "auto"]

/** Summary table columns: label, value. */
export const SUMMARY_TABLE_WIDTHS = ["*", "auto"]

/**
 * Horizontal alignment. Accepts the table config's logical names
 * (`start`/`end`, used by `ITEM_COLUMNS`) and converts them to the
 * physical `left`/`right` pdfmake expects.
 */
export type CellAlign = "left" | "right" | "center" | "start" | "end"

function alignOf(align: CellAlign | undefined): string {
  if (align === "start") return "left"
  if (align === "end") return "right"
  return align ?? "left"
}

/**
 * Shared table layout: hairline grid + comfortable cell padding so text is
 * never glued to the table/page edge.
 */
export function reportTableLayout() {
  return {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => PDF_COLORS.border,
    vLineColor: () => PDF_COLORS.border,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  }
}

/** Blue header cell with white bold text. */
export function headerCell(text: string, align?: CellAlign): PdfNode {
  return {
    text,
    bold: true,
    fontSize: 8,
    color: PDF_COLORS.headerText,
    fillColor: PDF_COLORS.primary,
    alignment: alignOf(align),
  }
}

/** Body cell with optional zebra fill. */
export function bodyCell(
  text: string,
  options: { align?: CellAlign; zebra?: boolean } = {}
): PdfNode {
  return {
    text,
    fontSize: 8,
    color: PDF_COLORS.text,
    alignment: alignOf(options.align),
    fillColor: options.zebra ? PDF_COLORS.surfaceAlt : PDF_COLORS.surface,
  }
}

export type TotalTone = "danger" | "success" | "warning"

export interface TotalDescriptor {
  label: string
  value: string
  tone?: TotalTone
  /** Net-total row: stronger band + heavier weight. */
  emphasis?: boolean
}

function toneColor(tone: TotalTone | undefined): string {
  switch (tone) {
    case "danger":
      return PDF_COLORS.danger
    case "success":
      return PDF_COLORS.success
    case "warning":
      return PDF_COLORS.warning
    default:
      return PDF_COLORS.text
  }
}

/**
 * One totals row across the 6-column item table.
 *
 * The label sits in the wide first column and the value in the last one;
 * the four middle cells are empty but carry the same fill so the band
 * reads as a single strip. No `colSpan` (see the module note).
 */
export function totalRow(descriptor: TotalDescriptor): PdfNode[] {
  const fill = descriptor.emphasis ? PDF_COLORS.bandStrong : PDF_COLORS.band
  const color = toneColor(descriptor.tone)

  const blank = (): PdfNode => ({
    text: "",
    fontSize: 8,
    fillColor: fill,
  })

  return [
    {
      text: descriptor.label,
      bold: true,
      fontSize: 8,
      color,
      fillColor: fill,
    },
    blank(),
    blank(),
    blank(),
    blank(),
    {
      text: descriptor.value,
      bold: true,
      fontSize: 8,
      color,
      alignment: "right",
      fillColor: fill,
    },
  ]
}

/**
 * Two-column summary/meta row.
 *
 * `valueAlign` defaults to right (numeric summaries). Key/value info
 * blocks pass `"left"` so long text reads naturally instead of colliding
 * with the neighbouring table.
 */
export function summaryRow(
  label: string,
  value: string,
  options: {
    tone?: TotalTone
    emphasis?: boolean
    valueAlign?: "left" | "right"
  } = {}
): PdfNode[] {
  const fill = options.emphasis ? PDF_COLORS.bandStrong : PDF_COLORS.surface
  return [
    {
      text: label,
      fontSize: 8,
      bold: options.emphasis === true,
      color: PDF_COLORS.text,
      fillColor: fill,
    },
    {
      text: value,
      fontSize: 8,
      bold: options.emphasis === true,
      color: toneColor(options.tone),
      alignment: options.valueAlign ?? "right",
      fillColor: fill,
    },
  ]
}

/** `1 patient` / `2 patients` — English-only exports. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

/** Section heading used above each patient / admission block. */
export function sectionHeading(text: string): PdfNode {
  return {
    text,
    fontSize: 11,
    bold: true,
    color: PDF_COLORS.text,
    margin: [0, 14, 0, 3],
  }
}

/** Muted supporting line under a section heading. */
export function sectionMeta(text: string): PdfNode {
  return {
    text,
    fontSize: 8,
    color: PDF_COLORS.muted,
    margin: [0, 0, 0, 8],
  }
}
