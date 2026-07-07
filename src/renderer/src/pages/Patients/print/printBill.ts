/**
 * Bilingual PDF content builder for the Patients bill.
 *
 * Two-layer design:
 *   - Top-level `pdfShell.ts` owns page chrome (header, footer, page
 *     number, brand mark).
 *   - This module owns the bill *body*: patient info columns,
 *     items table, summary panel.
 *
 * Layout zones (top → bottom, before title):
 *   1. Two-column patient-info + bill-info header row.
 *   2. Subheader: "BILL DETAILS" with a brand-blue left rule.
 *   3. Items table — 6 columns (Description, Date, Type, Qty, Unit, Total).
 *      Rows are grouped by (kind × itemId × unitPrice × day) via
 *      `groupPrintBillItems` so two administrations of the same
 *      service on the same day at the same price collapse to one
 *      line (quantities summed). Days are kept as separate rows.
 *      Rows are sorted chronologically (oldest first), then by kind.
 *      Header strip uses the brand primary; zebra alternates
 *      surface-muted / surface.
 *   4. Right-aligned summary panel — Subtotal, [Discount],
 *      Administrative, Medical Tests, VAT, Total, Paid, Balance.
 *      Built as a soft card with a divider between rows; the total
 *      row is emphasised in brand primary.
 *
 * VAT is recomputed locally via `recalcBilling` (T6's pure
 * algorithm) from the grouped category subtotals — the server
 * stores `vatAmount` but the renderer's `Bill` type doesn't surface
 * it, so we derive to avoid the legacy "0 EGP" trap.
 *
 * Bilingual: all labels are passed in via `BillPrintLabels` — page
 * passes strings from `t()`. Math runs on raw numbers (currency
 * formatter is locale-aware, supplied by caller).
 *
 * RTL: column order flips on `language === "ar"`. Internal logic
 * is locale-agnostic; pdfmake's text-direction reversal is
 * delegated to `@digicole/pdfmake-rtl`.
 *
 * CamelCase-only inputs and outputs — no snake_case.
 */

import type { Patient, Bill, BillDetail } from "@/pages/Patients/types/patient"
import {
  formatPrintDate,
  type PrintItemRow,
} from "@/pages/Patients/print/lib/groupPrintBillItems"
import { buildPrintPreview } from "@/pages/Patients/print/lib/buildPrintPreview"

export interface BuildBillBodyInputs {
  patient: Patient
  bill: Bill
  billDetails: BillDetail[]
  language: "en" | "ar"
}

export interface BillPrintLabels {
  // Top-level pieces
  billDetailsHeader: string
  // Top-row labels
  patient: string
  phone: string
  paymentType: string
  billId: string
  billDate: string
  statusPaid: string
  statusPending: string

  // Table columns
  description: string
  date: string
  type: string
  quantity: string
  unitPrice: string
  total: string

  // Type bucket labels
  typeService: string
  typeDrug: string
  typeSupply: string
  typeTest: string
  typeUnknown: string
  unknownItem: string

  // Summary rows
  subtotal: string
  admin: string
  medicalTests: string
  paid: string
  totalRow: string
  balance: string
  scopeSeparator: string

  /** Function-shaped labels. */
  discount(scope: string): string
  vat(pct: number, scope: string): string
  /** Passthrough capitalisation used for the paymentType column. */
  paymentTypeValue(value: string): string
}

/* ----------------------------------------------------------------
 * Theme palette — mirrors src/renderer/src/index.css `@theme` hex
 * tokens. Kept inline so the PDF is self-contained and does not
 * pull CSS at runtime.
 * ---------------------------------------------------------------- */
const COLOR = {
  primary: "#0077B6",
  primaryLight: "#DBEAFE",
  primaryDark: "#005A8C",
  secondary: "#00A896",
  accent: "#059669",
  success: "#10B981",
  successLight: "#D1FAE5",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  white: "#FFFFFF",
} as const

/**
 * Pure row builder — reads a `PrintItemRow` + a translation-fn
 * pair and emits a 6-cell pdfmake row. Reused for every body row
 * so the column order is one source of truth.
 */
function buildItemRow(
  row: PrintItemRow,
  labels: BillPrintLabels,
  formatCurrency: (value: number, language: "en" | "ar") => string,
  language: "en" | "ar"
): unknown[] {
  const typeLabel =
    row.kind === "service"
      ? labels.typeService
      : row.kind === "drug"
        ? labels.typeDrug
        : row.kind === "supply"
          ? labels.typeSupply
          : labels.typeUnknown
  return [
    {
      text: row.description || labels.unknownItem,
      fontSize: 9,
      color: COLOR.textPrimary,
    },
    {
      text: formatPrintDate(row.date, language),
      fontSize: 9,
      color: COLOR.textSecondary,
    },
    {
      text: typeLabel,
      fontSize: 9,
      color: COLOR.textSecondary,
    },
    {
      text: String(row.quantity),
      alignment: "right",
      fontSize: 9,
      color: COLOR.textPrimary,
    },
    {
      text: formatCurrency(row.unitPrice, language),
      alignment: "right",
      fontSize: 9,
      color: COLOR.textPrimary,
    },
    {
      text: formatCurrency(row.quantity * row.unitPrice, language),
      alignment: "right",
      fontSize: 9,
      bold: true,
      color: COLOR.textPrimary,
    },
  ]
}

/**
 * Build the body content array (passed into the shell's `content:`).
 * Pure — no DOM mutations, no pdfmake invocation.
 *
 * Single source of truth: `buildPrintPreview` (in `pages/Patients/lib/`)
 * normalises the Bill's scope fields, groups the BillDetail rows by
 * `(kind × id × unitPrice × day)`, sorts them chronologically, and
 * runs `recalcBilling` to produce the `BillingSnapshot`. The same
 * helper is consumed by `PrintBillConfirmDialog` so what the user
 * sees in the confirm modal matches the printed PDF exactly.
 */
export function buildBillBodyContent(
  inputs: BuildBillBodyInputs,
  labels: BillPrintLabels,
  formatCurrency: (value: number, language: "en" | "ar") => string,
  formatDate: (value: string | Date, language: "en" | "ar") => string
): unknown[] {
  const { patient, bill, billDetails, language } = inputs
  const isRtl = language === "ar"
  const paymentType =
    String(patient.paymentType ?? "").trim() || "cash"

  // Single source of truth for grouping + category totals + the
  // recomputed `BillingSnapshot`. The dialog (`PrintBillConfirmDialog`)
  // calls `buildPrintPreview` too, so what the user sees in the
  // confirm modal matches the PDF exactly.
  const preview = buildPrintPreview(bill, billDetails)
  const { snapshot, rows } = preview
  const normalizedBill = preview.bill

  const medicalTests = Number(normalizedBill.medicalTestsAmount ?? 0)
  const administrativeExpenses = Number(normalizedBill.administrativeExpenses ?? 0)
  const discount = Number(normalizedBill.discount ?? 0)
  const discountType =
    normalizedBill.discountType === "percentage" ? "percentage" : "fixed"
  const vatPercentage = Number(normalizedBill.vatPercentage ?? 0)
  const paid = Number(normalizedBill.paidAmount ?? 0)

  const discountScopeArr = preview.discountScopeArr
  const vatScopeArr = preview.vatScopeArr
  const isPaid = paid >= snapshot.totalFee && snapshot.totalFee > 0

  // ──── Top: two-column patient + bill header ─────────────────────
  const flowAlignment: "left" | "right" = isRtl ? "right" : "left"

  const patientBlock = {
    stack: [
      {
        text: labels.patient,
        bold: true,
        fontSize: 10,
        color: COLOR.primary,
      },
      {
        text: patient.name ?? "—",
        fontSize: 12,
        bold: true,
        color: COLOR.textPrimary,
        margin: [0, 0, 0, 6],
      },
      {
        text: `${labels.phone} ${patient.phone ?? "—"}`,
        fontSize: 9,
        color: COLOR.textSecondary,
      },
      {
        text: `${labels.paymentType} ${labels.paymentTypeValue(paymentType)}`,
        fontSize: 9,
        color: COLOR.textSecondary,
      },
    ],
    alignment: flowAlignment,
  }

  // Status badge rendered as a pill: filled background + matching fg.
  const statusBg = isPaid ? COLOR.successLight : COLOR.warningLight
  const statusFg = isPaid ? COLOR.success : COLOR.warning
  const statusText = isPaid ? labels.statusPaid : labels.statusPending

  const billBlock = {
    stack: [
      {
        text: labels.billId,
        bold: true,
        fontSize: 10,
        alignment: flowAlignment,
        color: COLOR.primary,
      },
      {
        text: `#${bill.billId ?? "—"}`,
        fontSize: 12,
        bold: true,
        color: COLOR.textPrimary,
        margin: [0, 0, 0, 6],
        alignment: flowAlignment,
      },
      {
        text: `${labels.billDate} ${formatDate(new Date().toISOString(), language)}`,
        fontSize: 9,
        color: COLOR.textSecondary,
        alignment: flowAlignment,
      },
      {
        text: statusText,
        bold: true,
        fontSize: 9,
        color: statusFg,
        background: statusBg,
        margin: [0, 2, 0, 0],
        padding: [2, 4, 2, 4],
        alignment: flowAlignment,
      },
    ],
  }

  const headerColumns = isRtl
    ? [
      { width: "*", ...billBlock },
      { width: "auto", ...patientBlock },
    ]
    : [
      { width: "*", ...patientBlock },
      { width: "auto", ...billBlock },
    ]

  // ──── Subheader: BILL DETAILS (brand-bar style) ─────────────────
  const subHeader = {
    margin: [0, 14, 0, 8],
    stack: [
      {
        // Brand-tinted bar above the header text.
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 4,
            h: 14,
            color: COLOR.primary,
            r: 0,
          },
        ],
        // tiny vertical spacer before the heading text
        // (kept inside this stack entry only to position the bar)
        absolutePosition: { x: 0, y: 0 },
      },
      {
        text: `  ${labels.billDetailsHeader}`,
        bold: true,
        fontSize: 11,
        color: COLOR.primary,
      },
    ] as unknown[],
  }

  // ──── Items table ───────────────────────────────────────────────
  const headerRow = [
    labels.description,
    labels.date,
    labels.type,
    labels.quantity,
    labels.unitPrice,
    labels.total,
  ].map((heading) => ({
    text: heading,
    bold: true,
    fontSize: 9,
    color: COLOR.white,
    fillColor: COLOR.primary,
  }))

  const bodyRows = rows.map((row) =>
    buildItemRow(row, labels, formatCurrency, language)
  )

  const itemsTable = {
    table: {
      headerRows: 1,
      widths: ["*", "auto", "auto", "auto", "auto", "auto"],
      body:
        bodyRows.length > 0 ? [headerRow, ...bodyRows] : [headerRow],
    },
    layout: {
      fillColor: (rowIndex: number) =>
        rowIndex === 0
          ? COLOR.primary
          : rowIndex % 2 === 0
            ? COLOR.surfaceMuted
            : COLOR.surface,
      // 1px hairline dividers in the muted border tone.
      hLineColor: () => COLOR.border,
      vLineColor: () => COLOR.border,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 0, 0, 4],
  }

  const emptyNotice =
    bodyRows.length === 0
      ? {
        text: labels.unknownItem,
        alignment: "center",
        margin: [0, 8, 0, 8],
        color: COLOR.textTertiary,
        italic: true,
        fontSize: 9,
      }
      : null

  // ──── Summary panel (card on the right, dividers between rows) ──
  // Each row is a 2-cell table row; total row gets a top-divider +
  // bold + brand color.
  type SummaryRow = [
    { text: string; color?: string; bold?: boolean; fontSize?: number, margin?: number[] },
    { text: string; alignment: "right"; color?: string; bold?: boolean; fontSize?: number, margin?: number[] }
  ]

  const summaryRows: SummaryRow[] = []

  summaryRows.push([
    {
      text: labels.subtotal,
      color: COLOR.textSecondary,
      fontSize: 9,
    },
    {
      text: formatCurrency(
        snapshot.servicesTotal + snapshot.drugsTotal + snapshot.suppliesTotal,
        language
      ),
      alignment: "right",
      color: COLOR.textPrimary,
      fontSize: 9,
    },
  ])

  if (discount > 0) {
    summaryRows.push([
      {
        text: `${discountType === "percentage" ? discount + "% " : ""} ${labels.discount(discountScopeArr.join(labels.scopeSeparator))}`,
        color: COLOR.textSecondary,
        fontSize: 9,
      },
      {
        text: formatCurrency(snapshot.discountAmount, language),
        alignment: "right",
        color: COLOR.danger,
        fontSize: 9,
      },
    ])
  }

  summaryRows.push([
    {
      text: labels.admin,
      color: COLOR.textSecondary,
      fontSize: 9,
    },
    {
      text: formatCurrency(administrativeExpenses, language),
      alignment: "right",
      color: COLOR.textPrimary,
      fontSize: 9,
    },
  ])

  summaryRows.push([
    {
      text: labels.medicalTests,
      color: COLOR.textSecondary,
      fontSize: 9,
    },
    {
      text: formatCurrency(medicalTests, language),
      alignment: "right",
      color: COLOR.textPrimary,
      fontSize: 9,
    },
  ])

  summaryRows.push([
    {
      text: labels.vat(vatPercentage, vatScopeArr.join(labels.scopeSeparator)),
      color: COLOR.textSecondary,
      fontSize: 9,
    },
    {
      text: formatCurrency(snapshot.vatAmount, language),
      alignment: "right",
      color: COLOR.textPrimary,
      fontSize: 9,
    },
  ])

  // Total row — emphasised with a top divider, brand color, bold.
  summaryRows.push([
    {
      text: labels.totalRow,
      bold: true,
      color: COLOR.primary,
      fontSize: 11,
      margin: [0, 4, 0, 0],
    },
    {
      text: formatCurrency(snapshot.totalFee, language),
      alignment: "right",
      bold: true,
      color: COLOR.primary,
      fontSize: 11,
      margin: [0, 4, 0, 0],
    },
  ])

  summaryRows.push([
    {
      text: labels.paid,
      color: COLOR.textSecondary,
      fontSize: 9,
    },
    {
      text: formatCurrency(paid, language),
      alignment: "right",
      color: COLOR.success,
      fontSize: 9,
    },
  ])

  const balanceColor =
    snapshot.balance > 0 ? COLOR.danger : COLOR.success
  summaryRows.push([
    {
      text: labels.balance,
      bold: true,
      color: balanceColor,
      fontSize: 10,
    },
    {
      text: formatCurrency(Math.abs(snapshot.balance), language),
      alignment: "right",
      bold: true,
      color: balanceColor,
      fontSize: 10,
    },
  ])

  const summaryPanel = {
    columns: [
      { width: "*", text: "" },
      {
        width: 200,
        margin: [0, 12, 0, 0],
        table: {
          widths: ["*", "auto"],
          body: summaryRows as unknown as string[][],
        },
        layout: {
          hLineColor: (i: number) =>
            // Divider above the Total row
            i === summaryRows.length - 3 ? COLOR.primary : COLOR.border,
          vLineColor: () => COLOR.border,
          hLineWidth: (i: number) => (i === summaryRows.length - 3 ? 1 : 0.5),
          vLineWidth: () => 0,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
  }

  // Order: headerColumns → subHeader → itemsTable (or empty notice) → summaryPanel
  return [
    { columns: headerColumns } as unknown,
    subHeader as unknown,
    itemsTable as unknown,
    ...(emptyNotice ? [emptyNotice] : []),
    summaryPanel as unknown,
  ]
}

// Re-exports kept for callers that want type-only imports from this module.
export type { PrintItemRow }
