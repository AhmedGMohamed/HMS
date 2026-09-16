"use client"

import { useTranslation } from "react-i18next"
import { ListIcon, PlusIcon, RotateCcwIcon } from "lucide-react"

import { EmptyState } from "@/components/common/EmptyState"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { PriceListCard } from "@/pages/PriceLists/components/PriceListCard"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"

interface PriceListsGridProps {
  priceLists: PriceListWithStats[]
  loading: boolean
  error: Error | null
  onAddPrices: (priceList: PriceListWithStats) => void
  onEdit: (priceList: PriceListWithStats) => void
  onDelete: (priceList: PriceListWithStats) => void
  onCreate: () => void
  onRetry: () => void
}

/**
 * Responsive card grid for price lists (1/2/3 columns) with the
 * create-first empty state and a load-error retry affordance
 * (decision #2 of `phase_6.6_plan.md`).
 */
export function PriceListsGrid({
  priceLists,
  loading,
  error,
  onAddPrices,
  onEdit,
  onDelete,
  onCreate,
  onRetry,
}: PriceListsGridProps) {
  const { t } = useTranslation()

  if (loading && priceLists.length === 0) {
    return (
      <div className="flex justify-center py-12" role="status">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={<ListIcon aria-hidden />}
        title={t("priceLists.messages.loadError")}
        description={error.message}
        action={
          <Button variant="outline" onClick={onRetry}>
            <RotateCcwIcon aria-hidden className="me-2 size-4" />
            {t("priceLists.buttons.retry")}
          </Button>
        }
      />
    )
  }

  if (priceLists.length === 0) {
    return (
      <EmptyState
        icon={<ListIcon aria-hidden />}
        title={t("priceLists.messages.noPriceLists")}
        action={
          <Button onClick={onCreate}>
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("priceLists.buttons.createFirst")}
          </Button>
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {priceLists.map((priceList) => (
        <PriceListCard
          key={priceList.pricelistId}
          priceList={priceList}
          onAddPrices={onAddPrices}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
