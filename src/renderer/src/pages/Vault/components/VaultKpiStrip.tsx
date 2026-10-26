/**
 * Vault KPI strip — Phase 6.9 plan §3.5 (A1, D6, D9).
 *
 * Three `EditorialKpiCard`s: Total Revenue / Total Expenses / Net Profit.
 * D9: cards are interactive — clicking one expands and scrolls to its linked
 * accordion section (`scrollIntoView`; instant jump under reduced motion).
 */
import { useTranslation } from "react-i18next"
import { BookOpenIcon, TrendingDownIcon, TrendingUpIcon, WalletIcon } from "lucide-react"
import { EditorialKpiCard } from "@/components/common/EditorialKpiCard"
import { formatCurrency } from "@/lib/utils"
import type { VaultSummary } from "@/pages/Vault/types/vault"
import { useUIStore } from "@/store/uiStore"

export interface VaultKpiStripProps {
	summary: VaultSummary | null
	loading: boolean
	/** D9 — called with the target AccordionItem id (and whether it is already expanded). */
	onSectionNavigate: (sectionId: string) => void
}

export function VaultKpiStrip({ summary, loading, onSectionNavigate }: VaultKpiStripProps) {
	const { t } = useTranslation()
	const language = useUIStore((s) => s.language) ?? "en";
	const currencyLocale = language === "ar" ? "ar-EG" : "en-US";
	const netProfit = summary?.netProfit ?? 0

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
			<EditorialKpiCard
				label={t("vault.summary.totalRevenue")}
				value={formatCurrency(summary?.totalRevenue ?? 0, currencyLocale)}
				hint={t("vault.summary.includesInsurancePayments")}
				tone="primary"
				loading={loading}
				icon={<WalletIcon aria-hidden className="size-4" />}
				onClick={() => onSectionNavigate("vault-section-patient-revenue")}
			/>
			<EditorialKpiCard
				label={t("vault.summary.totalExpenses")}
				value={formatCurrency(summary?.totalExpenses ?? 0, currencyLocale)}
				hint={t("vault.summary.allExpenditures")}
				tone="danger"
				loading={loading}
				icon={<TrendingDownIcon aria-hidden className="size-4" />}
				onClick={() => onSectionNavigate("vault-section-pharmacy-supplies")}
			/>
			<EditorialKpiCard
				label={t("vault.summary.netProfit")}
				value={formatCurrency(netProfit, currencyLocale)}
				hint={t("vault.summary.revenueMinusExpenses")}
				tone={netProfit >= 0 ? "primary" : "danger"}
				loading={loading}
				icon={netProfit >= 0 ? <TrendingUpIcon aria-hidden className="size-4" /> : <BookOpenIcon aria-hidden className="size-4" />}
				onClick={() => onSectionNavigate("vault-section-patient-revenue")}
			/>
		</div>
	)
}
