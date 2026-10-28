/**
 * Statistics report PDF — Phase 6.11.4.
 *
 * Document order:
 *
 *   1. Report period + grouping.
 *   2. KPI table (patients, admissions, discharges, average stay, billed,
 *      collected, outstanding).
 *   3. Eight chart sections, each as a captured bitmap **followed by the table
 *      of the numbers it draws**. A bitmap alone is not auditable, and a table
 *      alone is not a report the eye can scan; printing both means the document
 *      survives a failed capture and still reconciles.
 *   4. Top services / top drugs tables (ten rows each, by revenue).
 *
 * There is no occupancy section: the metric was removed rather than faked
 * (plan §2.8).
 *
 * Labels are English and dates `en-GB`, like every other export in the phase.
 */

import type { TFunction } from "i18next"

import { openPdfShellDoc } from "@/lib/pdfShell"
import { formatCurrencyEn, formatEnGbDate, formatNumberEn } from "@/lib/pdf/format"
import {
	PDF_COLORS,
	SUMMARY_TABLE_WIDTHS,
	bodyCell,
	headerCell,
	plural,
	reportTableLayout,
	sectionHeading,
	sectionMeta,
	summaryRow,
	type PdfNode,
} from "@/lib/pdf/pdfTheme"
import type {
	StatisticsReportExportPayload,
} from "@/pages/Reports/types/statisticsReport"

export interface BuildStatisticsReportPdfInputs {
	payload: StatisticsReportExportPayload
	t: TFunction
	language: "en" | "ar"
	/** `snapshot key → PNG data URL`, captured by the tab. */
	images?: Record<string, string | undefined>
}

/** Section keys, mirrored from `statisticsChartSnapshot.ts`. */
const IMAGE_KEYS = {
	census: "statistics-census",
	distribution: "statistics-distribution",
	averageStay: "statistics-average-stay",
	revenue: "statistics-revenue",
	flow: "statistics-flow",
	topServices: "statistics-top-services",
	topDrugs: "statistics-top-drugs",
	staff: "statistics-staff",
} as const

/** Three columns: period + two numbers (census, average stay). */
const THREE_WIDTHS = ["*", "auto", "auto"]

/** Four columns: period + three numbers (revenue, admissions vs discharges). */
const TREND_WIDTHS = ["*", "auto", "auto", "auto"]

/** Top-N table: name + usage + quantity + revenue. */
const TOP_WIDTHS = ["*", "auto", "auto", "auto"]

function imageNode(image: string | undefined): PdfNode | null {
	if (!image) return null
	return {
		image,
		fit: [500, 250],
		alignment: "center",
		margin: [0, 0, 0, 6],
	}
}

/** Section heading + optional bitmap + the table behind it. */
function chartSection(
	heading: string,
	meta: string,
	image: string | undefined,
	table: PdfNode | null
): PdfNode[] {
	const nodes: PdfNode[] = [sectionHeading(heading), sectionMeta(meta)]
	const picture = imageNode(image)
	if (picture) nodes.push(picture)
	if (table) nodes.push(table)
	return nodes
}

export function statisticsReportDocContent(
	payload: StatisticsReportExportPayload,
	images: Record<string, string | undefined> = {}
): PdfNode[] {
	const { kpis, range } = payload
	const period = `${formatEnGbDate(range.startDate)} - ${formatEnGbDate(range.endDate)}`
	const grouping = range.grouping
		? range.grouping.charAt(0).toUpperCase() + range.grouping.slice(1)
		: "-"

	const content: PdfNode[] = [
		{
			text: `Report Period: ${period}     •     Grouping: ${grouping}`,
			alignment: "center",
			fontSize: 9,
			color: PDF_COLORS.muted,
			margin: [0, 0, 0, 12],
		},
		sectionHeading("Summary"),
		{
			table: {
				widths: SUMMARY_TABLE_WIDTHS,
				body: [
					summaryRow("Total Patients", String(kpis.totalPatients)),
					summaryRow("Admissions", String(kpis.totalAdmissions)),
					summaryRow("Discharges", String(kpis.totalDischarges)),
					summaryRow("Avg Stay (Days)", formatNumberEn(kpis.avgStayDays)),
					summaryRow("Billed", formatCurrencyEn(kpis.totalBilled)),
					summaryRow("Collected", formatCurrencyEn(kpis.totalCollected)),
					summaryRow("Outstanding", formatCurrencyEn(kpis.totalOutstanding), {
						emphasis: true,
						tone: kpis.totalOutstanding > 0 ? "danger" : undefined,
					}),
				],
			},
			layout: reportTableLayout(),
			margin: [0, 0, 0, 8],
		},
	];

	/* Census + admissions -------------------------------------------------- */
	content.push(
		...chartSection(
			"Patient Census & Admissions",
			`Patients present in the ward vs. new admissions, per ${grouping.toLowerCase()}`,
			images[IMAGE_KEYS.census],
			payload.patientCensus.length > 0
				? {
						table: {
							headerRows: 1,
							widths: THREE_WIDTHS,
							body: [
								[
									headerCell("Period"),
									headerCell("Census", "end"),
									headerCell("Admissions", "end"),
								],
								...payload.patientCensus.map((point, index) =>
									[
										bodyCell(point.period, { zebra: index % 2 === 1 }),
										bodyCell(String(point.census), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(String(point.admissions), {
											align: "end",
											zebra: index % 2 === 1,
										}),
									] as PdfNode[]
								),
							],
						},
						layout: reportTableLayout(),
						margin: [0, 0, 0, 6],
					}
				: null
		)
	);

	/* Distribution --------------------------------------------------------- */
	const paymentTotal = payload.distribution.paymentType.reduce(
		(sum, entry) => sum + entry.count,
		0
	);
	const genderTotal = payload.distribution.gender.reduce(
		(sum, entry) => sum + entry.count,
		0
	);

	if (paymentTotal > 0 || genderTotal > 0) {
		const paymentRows = payload.distribution.paymentType.map((entry, index) => [
			bodyCell(entry.key.toUpperCase(), { zebra: index % 2 === 1 }),
			bodyCell(String(entry.count), { align: "end", zebra: index % 2 === 1 }),
			bodyCell(
				paymentTotal > 0
					? `${((entry.count / paymentTotal) * 100).toFixed(1)}%`
					: "-",
				{ align: "end", zebra: index % 2 === 1 }
			),
		] as PdfNode[]);

		const genderRows = payload.distribution.gender.map((entry, index) => [
			bodyCell(entry.key.toUpperCase(), { zebra: index % 2 === 1 }),
			bodyCell(String(entry.count), { align: "end", zebra: index % 2 === 1 }),
			bodyCell(
				genderTotal > 0
					? `${((entry.count / genderTotal) * 100).toFixed(1)}%`
					: "-",
				{ align: "end", zebra: index % 2 === 1 }
			),
		] as PdfNode[]);

		/**
		 * Two **stacked** full-width tables, not a `columns` block.
		 *
		 * The side-by-side version sized its columns as `50% + 8% + 42%` plus a
		 * `columnGap`, which is more than the content box: pdfmake then
		 * distributed a negative remainder to the last column and aborted while
		 * drawing the cell backgrounds ("unsupported number: NaN"). Stacking
		 * removes the arithmetic entirely and each table gets the full width,
		 * which also keeps long payment-type names from wrapping mid-word.
		 */
		content.push(
			...chartSection(
				"Patient Distribution",
				"Admissions in the period by payment type and gender",
				images[IMAGE_KEYS.distribution],
				{
					stack: [
						{
							table: {
								headerRows: 1,
								widths: ["*", "auto", "auto"],
								body: [
									[
										headerCell("Payment"),
										headerCell("Count", "end"),
										headerCell("Share", "end"),
									],
									...paymentRows,
								],
							},
							layout: reportTableLayout(),
						},
						{
							text: "By gender",
							fontSize: 8,
							bold: true,
							color: PDF_COLORS.muted,
							margin: [0, 8, 0, 3],
						},
						{
							table: {
								headerRows: 1,
								widths: ["*", "auto", "auto"],
								body: [
									[
										headerCell("Gender"),
										headerCell("Count", "end"),
										headerCell("Share", "end"),
									],
									...genderRows,
								],
							},
							layout: reportTableLayout(),
						},
					],
				}
			)
		);
	}

	/* Average stay --------------------------------------------------------- */
	const stayRows = payload.averageStay.filter((point) => point.discharges > 0);

	content.push(
		...chartSection(
			"Average Stay Duration",
			"Average of the admissions discharged in each period",
			images[IMAGE_KEYS.averageStay],
			stayRows.length > 0
				? {
						table: {
							headerRows: 1,
							widths: THREE_WIDTHS,
							body: [
								[
									headerCell("Period"),
									headerCell("Discharges", "end"),
									headerCell("Avg stay (days)", "end"),
								],
								...stayRows.map((point, index) =>
									[
										bodyCell(point.period, { zebra: index % 2 === 1 }),
										bodyCell(String(point.discharges), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(formatNumberEn(point.avgStayDays), {
											align: "end",
											zebra: index % 2 === 1,
										}),
									] as PdfNode[]
								),
							],
						},
						layout: reportTableLayout(),
						margin: [0, 0, 0, 6],
					}
				: null
		)
	);

	/* Revenue -------------------------------------------------------------- */
	const billedRows = payload.revenueTrends.filter((point) => point.billCount > 0);

	content.push(
		...chartSection(
			"Revenue Trends",
			"Billed, collected and outstanding per period (EGP)",
			images[IMAGE_KEYS.revenue],
			billedRows.length > 0
				? {
						table: {
							headerRows: 1,
							widths: TREND_WIDTHS,
							body: [
								[
									headerCell("Period"),
									headerCell("Billed", "end"),
									headerCell("Collected", "end"),
									headerCell("Outstanding", "end"),
								],
								...billedRows.map((point, index) =>
									[
										bodyCell(point.period, { zebra: index % 2 === 1 }),
										bodyCell(formatNumberEn(point.billed), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(formatNumberEn(point.collected), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(formatNumberEn(point.outstanding), {
											align: "end",
											zebra: index % 2 === 1,
										}),
									] as PdfNode[]
								),
								[
									{
										text: "TOTALS",
										bold: true,
										fontSize: 8,
										fillColor: PDF_COLORS.bandStrong,
									},
									{
										text: formatNumberEn(kpis.totalBilled),
										bold: true,
										fontSize: 8,
										alignment: "right",
										fillColor: PDF_COLORS.bandStrong,
									},
									{
										text: formatNumberEn(kpis.totalCollected),
										bold: true,
										fontSize: 8,
										alignment: "right",
										fillColor: PDF_COLORS.bandStrong,
									},
									{
										text: formatNumberEn(kpis.totalOutstanding),
										bold: true,
										fontSize: 8,
										alignment: "right",
										fillColor: PDF_COLORS.bandStrong,
									},
								],
							],
						},
						layout: reportTableLayout(),
						margin: [0, 0, 0, 6],
					}
				: null
		)
	);

	/* Admissions vs discharges --------------------------------------------- */
	const flowRows = payload.admissionDischarge.filter(
		(point) => point.admissions > 0 || point.discharges > 0
	);

	content.push(
		...chartSection(
			"Admissions vs Discharges",
			"Net change is admissions minus discharges",
			images[IMAGE_KEYS.flow],
			flowRows.length > 0
				? {
						table: {
							headerRows: 1,
							widths: TREND_WIDTHS,
							body: [
								[
									headerCell("Period"),
									headerCell("Admissions", "end"),
									headerCell("Discharges", "end"),
									headerCell("Net change", "end"),
								],
								...flowRows.map((point, index) =>
									[
										bodyCell(point.period, { zebra: index % 2 === 1 }),
										bodyCell(String(point.admissions), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(String(point.discharges), {
											align: "end",
											zebra: index % 2 === 1,
										}),
										bodyCell(
											point.netChange > 0 ? `+${point.netChange}` : String(point.netChange),
											{ align: "end", zebra: index % 2 === 1 }
										),
									] as PdfNode[]
								),
							],
						},
						layout: reportTableLayout(),
						margin: [0, 0, 0, 6],
					}
				: null
		)
	);

	/* Top services / drugs -------------------------------------------------- */
	if (payload.topServices.length > 0) {
		content.push(
			...chartSection(
				"Top 10 Services by Revenue",
				`${plural(payload.topServices.length, "service")} in the period`,
				images[IMAGE_KEYS.topServices],
				{
					table: {
						headerRows: 1,
						widths: TOP_WIDTHS,
						body: [
							[
								headerCell("Service"),
								headerCell("Usage", "end"),
								headerCell("Quantity", "end"),
								headerCell("Revenue", "end"),
							],
							...payload.topServices.map((row, index) =>
								[
									bodyCell(row.serviceName, { zebra: index % 2 === 1 }),
									bodyCell(String(row.usageCount), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(String(row.totalQuantity), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(formatNumberEn(row.totalRevenue), {
										align: "end",
										zebra: index % 2 === 1,
									}),
								] as PdfNode[]
							),
						],
					},
					layout: reportTableLayout(),
					margin: [0, 0, 0, 6],
				}
			)
		);
	}

	if (payload.topDrugs.length > 0) {
		content.push(
			...chartSection(
				"Top 10 Drugs by Revenue",
				`${plural(payload.topDrugs.length, "drug")} in the period`,
				images[IMAGE_KEYS.topDrugs],
				{
					table: {
						headerRows: 1,
						widths: TOP_WIDTHS,
						body: [
							[
								headerCell("Drug"),
								headerCell("Usage", "end"),
								headerCell("Quantity", "end"),
								headerCell("Revenue", "end"),
							],
							...payload.topDrugs.map((row, index) =>
								[
									bodyCell(row.drugName, { zebra: index % 2 === 1 }),
									bodyCell(String(row.usageCount), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(String(row.totalQuantity), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(formatNumberEn(row.totalRevenue), {
										align: "end",
										zebra: index % 2 === 1,
									}),
								] as PdfNode[]
							),
						],
					},
					layout: reportTableLayout(),
					margin: [0, 0, 0, 6],
				}
			)
		);
	}

	/* Staff utilisation ----------------------------------------------------- */
	if (payload.staffUtilization.length > 0) {
		content.push(
			...chartSection(
				"Staff Utilization",
				"Head-count on the left axis, hours worked on the right",
				images[IMAGE_KEYS.staff],
				{
					table: {
						headerRows: 1,
						widths: ["*", "auto", "auto", "auto", "auto"],
						body: [
							[
								headerCell("Employee type"),
								headerCell("Staff", "end"),
								headerCell("Patients", "end"),
								headerCell("Hours", "end"),
								headerCell("Avg hours/assignment", "end"),
							],
							...payload.staffUtilization.map((row, index) =>
								[
									bodyCell(row.employeeType.toUpperCase(), {
										zebra: index % 2 === 1,
									}),
									bodyCell(String(row.staffCount), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(String(row.patientsServed), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(formatNumberEn(row.totalHoursWorked), {
										align: "end",
										zebra: index % 2 === 1,
									}),
									bodyCell(formatNumberEn(row.avgHoursPerAssignment), {
										align: "end",
										zebra: index % 2 === 1,
									}),
								] as PdfNode[]
							),
						],
					},
					layout: reportTableLayout(),
					margin: [0, 0, 0, 6],
				}
			)
		);
	}

	if (
		payload.patientCensus.length === 0 ||
		(kpis.totalAdmissions === 0 && kpis.totalBilled === 0)
	) {
		content.push({
			text: "No data available for the selected period.",
			alignment: "center",
			italics: true,
			color: PDF_COLORS.muted,
			margin: [0, 24, 0, 0],
		});
	}

	return content;
}

export async function buildStatisticsReportPdf({
	payload,
	t,
	language,
	images,
}: BuildStatisticsReportPdfInputs): Promise<void> {
	await openPdfShellDoc(
		{
			title: "Statistics Report",
			content: statisticsReportDocContent(payload, images),
		},
		{ t, language }
	)
}
