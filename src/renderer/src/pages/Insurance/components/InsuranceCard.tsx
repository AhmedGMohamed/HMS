"use client"

import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { ArrowRightIcon, ShieldCheckIcon, TagsIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"
import type { InsuranceCompanySummary } from "@/pages/Insurance/types/insurance"

export interface InsuranceCardProps {
  company: InsuranceCompanySummary
  /** Detail route for this company (`/insurance/:companyId`). */
  to: string
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
 * The card is a real `<Link>`: it carries an href, so ctrl/cmd-click and
 * middle-click open the detail view in a new tab and the browser owns
 * focus + Enter. An `<a>` may wrap block-level flow content, so the
 * `<Card>` stays inside the link instead of a `role="button"` div with
 * JS-only navigation.
 */
export function InsuranceCard({ company, to }: InsuranceCardProps) {
  const { t } = useTranslation()

  return (
    <Link
      to={to}
      aria-label={`${company.name} — ${t("insurance.buttons.viewDetails")}`}
      className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col gap-4 border-border p-5 text-start transition-shadow group-hover:shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary">
            <ShieldCheckIcon aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium text-foreground">
              {company.name}
            </p>
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
    </Link>
  )
}
