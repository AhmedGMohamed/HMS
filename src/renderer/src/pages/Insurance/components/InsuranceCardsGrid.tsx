"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { InsuranceCard } from "@/pages/Insurance/components/InsuranceCard"
import type { InsuranceCompanySummary } from "@/pages/Insurance/types/insurance"

export interface InsuranceCardsGridProps {
  companies: InsuranceCompanySummary[]
  loading: boolean
  onSelect: (companyId: number) => void
}

/**
 * Responsive card grid for the insurance list (Phase 6.10 plan §3).
 *
 * Skeletons mirror the real card silhouette (icon block, name, meta row,
 * footer stat) so the layout does not jump when data lands.
 */
export function InsuranceCardsGrid({
  companies,
  loading,
  onSelect,
}: InsuranceCardsGridProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="mt-auto flex items-end justify-between border-t border-border pt-3">
              <div className="space-y-2">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {companies.map((company) => (
        <InsuranceCard
          key={company.insuranceId}
          company={company}
          onSelect={() => onSelect(company.insuranceId)}
        />
      ))}
    </div>
  )
}
