/**
 * Date-range toolbar — Phase 6.9 plan A3/A4 (D2/D3).
 *
 * Popover + `Calendar mode="range"` (HistoryFilters pattern) with the
 * legacy Today / This Month presets that set the range and trigger a
 * refetch. Both boundaries inclusive (backend end-date-inclusive
 * semantics). Clear inside the popover resets to the default
 * current-month range (auto-load contract preserved).
 */
import { CalendarIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { currentMonthRange, thisMonthRange, todayRange } from "@/pages/Vault/dateRange"
import type { DateRange } from "@/pages/Vault/types/vault"

export interface DateRangeToolbarProps {
	range: DateRange
	onRangeChange: (range: DateRange) => void
}

export function DateRangeToolbar({ range, onRangeChange }: DateRangeToolbarProps) {
	const { t } = useTranslation()
	const language = useUIStore((s) => s.language) ?? "en"

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onClick={() => onRangeChange(todayRange())}
			>
				{t("vault.buttons.today")}
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={() => onRangeChange(thisMonthRange())}
			>
				{t("vault.buttons.thisMonth")}
			</Button>
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline" size="sm" className="gap-2">
						<CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
						<span>
							{formatDate(range.from, language)} – {formatDate(range.to, language)}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-auto p-0">
					<Calendar
						mode="range"
						// both boundaries inclusive — matches backend semantics
						selected={{ from: range.from, to: range.to }}
						onSelect={(next) => {
							if (next?.from && next?.to) {
								onRangeChange({ from: next.from, to: next.to })
							}
						}}
						numberOfMonths={2}
					/>
					<div className="border-t p-2">
						<Button
							variant="ghost"
							size="sm"
							className="w-full"
							onClick={() => onRangeChange(currentMonthRange())}
						>
							{t("vault.dateRangeSelection")}
						</Button>
					</div>
				</PopoverContent>
			</Popover>
	</div>
	)
}

