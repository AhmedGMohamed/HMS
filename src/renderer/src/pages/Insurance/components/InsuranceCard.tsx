"use client"

import type { KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRightIcon, ShieldCheckIcon, TagsIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"
import type { InsuranceCompanySummary } from "@/pages/Insurance/types/insurance"

export interface InsuranceCardProps {
  company: InsuranceCompanySummary
  onSelect: () => void
}

/**
 * Company card in the list view (Phase 6.10 plan §3).
 *
 * Content is deliberately limited to what the list endpoint actually
 * returns: name, default price list and patient count. The legacy card
 * also rendered a "Last Cleared" row (always "N/A" — the list SQL omits
 * the column) and a contact-info row (never rendered for the same
 * reason). Both are dropped (plan §5 #3).
 *
 * The `<Card>` itself carries `role="button"` + keyboard handling rather
 * than being wrapped in a `<button>`: the card contains block-level flow
 * content, which is invalid inside a button element.
 */
export function InsuranceCard({ company, onSelect }: InsuranceCardProps) {
  const { t } = useTranslation()

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${company.name} — ${t("insurance.buttons.viewDetails")}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className="group flex h-full cursor-pointer flex-col gap-4 border-border p-5 text-start transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary">
          <ShieldCheckIcon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium text-foreground">{company.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TagsIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {company.pricelistName ||
                t("insurance.messages.noPriceListsAvailable")}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {formatNumber(company.patientCount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("insurance.statistics.totalPatients")}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          {t("insurance.buttons.viewDetails")}
          <ArrowRightIcon aria-hidden className="size-3.5 rtl:rotate-180" />
        </span>
      </div>
    </Card>
  )
}
