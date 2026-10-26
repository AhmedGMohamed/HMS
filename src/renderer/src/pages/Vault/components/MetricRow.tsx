"use client"

import type { ReportType } from "@/pages/Vault/types/vault"
import { reportButtonTitleKey, type VaultMetricSpec } from "@/pages/Vault/report/reportConfig"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { FileTextIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

interface MetricRowProps {
	metric: VaultMetricSpec
	value: number
	language: string
	/** Sign-aware tone for net-style rows (legacy colored them green/red by sign). */
	signTone?: boolean
	onOpenReport?: (reportType: ReportType) => void
}

const TONE_CLASSES: Record<VaultMetricSpec["tone"], string> = {
	success: "text-success",
	danger: "text-danger",
	warning: "text-warning",
	primary: "text-primary",
	neutral: "text-foreground",
}

/**
 * One summary metric line inside an accordion section (plan A7): label,
 * formatted value with tone, and an optional report drill icon-button whose
 * accessible name is the report title (plan A16).
 */
export function MetricRow({ metric, value, language, signTone = false, onOpenReport }: MetricRowProps) {
	const { t } = useTranslation()
	const formatted =
		metric.kind === "count"
			? formatNumber(value, 0)
			: formatCurrency(value, language === "ar" ? "ar-EG" : "en-US")
	const toneClass =
		signTone && value < 0 ? TONE_CLASSES.danger : signTone && value > 0 ? TONE_CLASSES.success : TONE_CLASSES[metric.tone]

	return (
		<div className="flex items-center justify-between gap-3 py-2">
			<span className="text-sm text-muted-foreground">{t(metric.labelKey)}</span>
			<span className="flex items-center gap-1.5">
				<span className={cn("text-sm font-semibold tabular-nums", toneClass)}>{formatted}</span>
				{metric.reportType && onOpenReport ? (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t(reportButtonTitleKey(metric.reportType))}
						title={t(reportButtonTitleKey(metric.reportType))}
						onClick={() => onOpenReport(metric.reportType as ReportType)}
					>
						<FileTextIcon aria-hidden className="size-4" />
					</Button>
				) : null}
			</span>
		</div>
	)
}
