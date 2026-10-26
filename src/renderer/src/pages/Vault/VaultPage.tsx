"use client"

/**
 * Vault page — Phase 6.9 plan §3.5 (A13, D3, D6, D7, D9).
 *
 * Composition root (Clocking pattern): auto-loads the summary for the
 * default current-month range, renders the KPI strip + accordion sections,
 * wires the report dialog (on-demand fetches via `useVaultReport`) and the
 * manage_vault-gated manual payment modal.
 *
 * References: plan §1.2 (D1–D10), design.md §6.1/§6.2/§6.4/§6.6/§10.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PlusIcon, RotateCcwIcon } from "lucide-react"
import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/errors"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { usePermission } from "@/hooks/usePermission"
import { useUIStore } from "@/store/uiStore"
import { useVaultSummary } from "@/pages/Vault/hooks/useVaultSummary"
import { useVaultReport } from "@/pages/Vault/hooks/useVaultReport"
import { currentMonthRange } from "@/pages/Vault/dateRange"
import { DateRangeToolbar } from "@/pages/Vault/components/DateRangeToolbar"
import { VaultKpiStrip } from "@/pages/Vault/components/VaultKpiStrip"
import { VaultSummarySections } from "@/pages/Vault/components/VaultSummarySections"
import { ReportDialog } from "@/pages/Vault/modals/ReportDialog"
import { ManualPaymentModal } from "@/pages/Vault/modals/ManualPaymentModal"
import type { DateRange, ReportType } from "@/pages/Vault/types/vault"

const ALL_SECTION_IDS = [
	"vault-section-patient-revenue",
	"vault-section-manual-payments",
	"vault-section-insurance-payments",
	"vault-section-pharmacy-supplies",
	"vault-section-employee-wages",
]

export default function VaultPage() {
	const { t } = useTranslation()
	useEnsureNamespace("vault")

	const language = useUIStore((s) => s.language) ?? "en"
	const { hasPermission } = usePermission()
	const canManageVault = hasPermission("manage_vault")

	const [range, setRange] = useState<DateRange>(() => currentMonthRange())
	const [openSections, setOpenSections] = useState<string[]>(() => [...ALL_SECTION_IDS])
	const [paymentModalOpen, setPaymentModalOpen] = useState(false)
	const errorToastedRef = useRef(false)

	const { summary, loading, error, refresh } = useVaultSummary(range)
	const { type: reportType, range: reportRange, data, loading: reportLoading, open: openReport, close: closeReport } = useVaultReport()

	// Persistent toast once per load failure (plan A14); retry via the EmptyState action.
	useEffect(() => {
		if (error && !errorToastedRef.current) {
			errorToastedRef.current = true
			const message = error instanceof ApiError ? error.message : t("vault.messages.loadError")
			toast.error(message, { duration: Number.POSITIVE_INFINITY })
		}
		if (!error) {
			errorToastedRef.current = false
		}
	}, [error, t])

	/** D9 — expands the target section and scrolls it into view. */
	const handleSectionNavigate = useCallback((sectionId: string) => {
		setOpenSections((current) => (current.includes(sectionId) ? current : [...current, sectionId]))
		// Deferred so the AccordionContent mounts before measuring.
		window.setTimeout(() => {
			const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
			document
				.getElementById(sectionId)
				?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
		}, 50)
	}, [])

	const handleOpenReport = useCallback(
		(type: ReportType) => {
			void openReport(type, range)
		},
		[openReport, range]
	)

	const retryLoad = useCallback(() => {
		void refresh()
	}, [refresh])

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("vault.pageTitle")}
				subtitle={t("vault.title")}
				actions={
					<>
						<DateRangeToolbar range={range} onRangeChange={setRange} />
						{canManageVault ? (
							<Button size="sm" onClick={() => setPaymentModalOpen(true)}>
								<PlusIcon aria-hidden className="size-4" />
								{t("vault.buttons.addManualPayment")}
							</Button>
						) : null}
					</>
				}
			/>

			{error && !summary ? (
				<EmptyState
					title={t("vault.emptyState.title")}
					description={t("vault.emptyState.description")}
					action={
						<Button variant="outline" size="sm" onClick={retryLoad}>
							<RotateCcwIcon aria-hidden className="size-4" />
							{t("vault.messages.retry")}
						</Button>
					}
				/>
			) : (
				<>
					<VaultKpiStrip summary={summary} loading={loading} onSectionNavigate={handleSectionNavigate} />
					<VaultSummarySections
						summary={summary}
						loading={loading}
						openSections={openSections}
						onOpenChange={setOpenSections}
						language={language}
						onOpenReport={handleOpenReport}
					/>
				</>
			)}

			<ReportDialog
				open={reportType !== null}
				reportType={reportType}
				range={reportRange}
				data={data}
				loading={reportLoading}
				language={language}
				onClose={() => closeReport()}
			/>

			<ManualPaymentModal
				open={paymentModalOpen}
				onClose={() => setPaymentModalOpen(false)}
				onSaved={retryLoad}
			/>
		</div>
	)
}
