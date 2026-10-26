"use client"

/**
 * Vault summary accordion — Phase 6.9 plan §3.5 (A1, A7, D6, D9).
 *
 * Five collapsible sections (all open by default — legacy showed everything
 * at once; collapsibility is additive). Section value/ids come from
 * `VAULT_SECTIONS`; the controlled accordion value is lifted to the page so
 * the D9 KPI clicks can expand + scroll to a target section.
 */
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { MetricRow } from "@/pages/Vault/components/MetricRow"
import { VAULT_SECTIONS } from "@/pages/Vault/report/reportConfig"
import type { ReportType, VaultSummary } from "@/pages/Vault/types/vault"
import { useTranslation } from "react-i18next"

export interface VaultSummarySectionsProps {
	summary: VaultSummary | null
	loading: boolean
	/** Controlled accordion state (lifted for D9). */
	openSections: string[]
	onOpenChange: (open: string[]) => void
	language: string
	onOpenReport: (reportType: ReportType) => void
}

export function VaultSummarySections({ summary, loading, openSections, onOpenChange, language, onOpenReport }: VaultSummarySectionsProps) {
	const { t } = useTranslation()

	return (
		<Accordion type="multiple" value={openSections} onValueChange={onOpenChange} className="space-y-4">
			{VAULT_SECTIONS.map((section) => (
				<AccordionItem key={section.id} value={section.id} className="rounded-xl border bg-card px-4">
					<AccordionTrigger className="py-4 text-base font-semibold">{t(section.titleKey)}</AccordionTrigger>
					{/* `h-auto` overrides the inner `h-(--radix-accordion-content-height)` pin
					    (tailwind-merge keeps the last h-*): the measured height goes stale
					    whenever the content swaps (loading skeleton → rows), clipping taller
					    content under `overflow-hidden`. The radix opening animation still
					    resolves on the Content element itself, so this is safe. */}
					<AccordionContent className="h-auto">
						{loading && !summary ? (
							<div className="space-y-2 py-2" aria-hidden>
								{Array.from({ length: Math.min(section.metrics.length, 4) }).map((_, index) => (
									<div key={index} className="h-4 animate-pulse rounded bg-muted" />
								))}
							</div>
						) : (
							<div className="divide-y divide-border/60">
								{section.metrics.map((metric) => (
									<MetricRow
										key={metric.labelKey}
										metric={metric}
										value={metric.value((summary ?? {}) as Record<string, number>)}
										language={language}
										signTone={metric.labelKey === "vault.metrics.netManual"}
										onOpenReport={onOpenReport}
									/>
								))}
							</div>
						)}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	)
}
