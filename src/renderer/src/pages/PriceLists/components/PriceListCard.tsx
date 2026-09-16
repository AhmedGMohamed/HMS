"use client"

import { useTranslation } from "react-i18next"
import { PencilIcon, PillIcon, PlusIcon, StethoscopeIcon, SyringeIcon, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"

interface PriceListCardProps {
  priceList: PriceListWithStats
  onAddPrices: (priceList: PriceListWithStats) => void
  onEdit: (priceList: PriceListWithStats) => void
  onDelete: (priceList: PriceListWithStats) => void
}

/**
 * One price-list card (decision #2): name, Default badge, the three
 * priced-item counts from the Stage 0 batch stats, and the
 * Add Prices / Edit / Delete actions. Delete is hidden for the
 * default list (backend rejects it with a 400).
 */
export function PriceListCard({
  priceList,
  onAddPrices,
  onEdit,
  onDelete,
}: PriceListCardProps) {
  const { t } = useTranslation()

  const counts = [
    {
      icon: StethoscopeIcon,
      label: t("priceLists.stats.services"),
      value: priceList.totalServices,
    },
    {
      icon: PillIcon,
      label: t("priceLists.stats.drugs"),
      value: priceList.totalDrugs,
    },
    {
      icon: SyringeIcon,
      label: t("priceLists.stats.supplies"),
      value: priceList.totalSupplies,
    },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="truncate">{priceList.name}</span>
          {priceList.isDefault ? (
            <Badge>{t("priceLists.status.default")}</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        {counts.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Icon aria-hidden className="size-4" />
              {label}
            </span>
            <span className="font-medium tabular-nums">
              {formatNumber(value)}
            </span>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => onAddPrices(priceList)}>
          <PlusIcon aria-hidden className="me-2 size-4" />
          {t("priceLists.buttons.addPrices")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onEdit(priceList)}>
          <PencilIcon aria-hidden className="me-2 size-4" />
          {t("common.edit")}
        </Button>
        {priceList.isDefault ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(priceList)}
          >
            <Trash2Icon aria-hidden className="me-2 size-4" />
            {t("common.delete")}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
