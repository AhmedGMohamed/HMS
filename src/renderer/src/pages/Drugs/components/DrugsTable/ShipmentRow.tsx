"use client"

import { useTranslation } from "react-i18next"
import { PencilIcon, Trash2Icon, BadgeDollarSignIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { DrugShipment } from "@/pages/Drugs/types/drug"

interface ShipmentRowProps {
  shipment: DrugShipment
  onSell: (shipment: DrugShipment) => void
  onEdit: (shipment: DrugShipment) => void
  onDelete: (shipment: DrugShipment) => void
}

/**
 * A single shipment row inside the expanded drug sub-table (§6.3).
 *
 * Shows warehouse, per-unit stock (`X larger + Y smaller`), buy price,
 * expiry status badge, price-list chips, and quick actions
 * Sell / Edit / Delete.
 */
export function ShipmentRow({
  shipment,
  onSell,
  onEdit,
  onDelete,
}: ShipmentRowProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const uc = shipment.unitConversion

  const largerWhole = Math.floor(shipment.quantity / (uc?.ratio ?? 1))
  const smallerRemainder = shipment.quantity % (uc?.ratio ?? 1)

  const stockLabel =
    uc?.ratio != null
      ? `${largerWhole} ${uc.larger} + ${smallerRemainder} ${uc.smaller}`
      : formatNumber(shipment.quantity)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <span className="min-w-28 text-sm font-medium text-foreground">
        {shipment.warehouseName}
      </span>

      <span className="text-sm tabular-nums text-muted-foreground">
        {stockLabel}
      </span>

      <span className="text-sm tabular-nums text-muted-foreground">
        {t("pharmacy.fields.buyPrice")}:{" "}
        {formatCurrency(Number(shipment.buyPrice), resolveLocale(language))}
      </span>

      {shipment.expiryDate ? (
        <Badge variant="outline">{shipment.expiryDate}</Badge>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}

      {shipment.prices.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {shipment.prices.map((p) => (
            <Badge key={p.pricelistId} variant="secondary" className="tabular-nums">
              {formatCurrency(Number(p.price), resolveLocale(language))}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="ms-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSell(shipment)}
        >
          <BadgeDollarSignIcon aria-hidden className="me-1.5 size-3.5" />
          {t("pharmacy.buttons.sell")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.edit")}
          onClick={() => onEdit(shipment)}
        >
          <PencilIcon aria-hidden className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.delete")}
          onClick={() => onDelete(shipment)}
        >
          <Trash2Icon aria-hidden className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}