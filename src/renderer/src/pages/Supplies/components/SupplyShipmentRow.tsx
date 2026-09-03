"use client"

import { useTranslation } from "react-i18next"
import { PencilIcon, Trash2Icon, UserRoundIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { MedicalSupplyShipment } from "@/pages/Supplies/types/supply"

interface SupplyShipmentRowProps {
  shipment: MedicalSupplyShipment
  onDispense: (shipment: MedicalSupplyShipment) => void
  onEdit: (shipment: MedicalSupplyShipment) => void
  onDelete: (shipment: MedicalSupplyShipment) => void
}

/**
 * A single supply shipment row inside the expanded supply sub-table
 * (design plan §6.3.1).
 *
 * Stock displays as a single integer (supplies have no unit
 * conversion). Actions: **Dispense to Patient** (primary affordance
 * — supplies only dispense to admitted inpatients, never to
 * outside), Edit, Delete.
 */
export function SupplyShipmentRow({
  shipment,
  onDispense,
  onEdit,
  onDelete,
}: SupplyShipmentRowProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <span className="min-w-28 text-sm font-medium text-foreground">
        {shipment.warehouseName}
      </span>

      <span className="text-sm tabular-nums text-muted-foreground">
        {formatNumber(shipment.quantity)}
      </span>

      <span className="text-sm tabular-nums text-muted-foreground">
        {t("medicalSupplies.fields.buyPrice")}:{" "}
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
            <Badge
              key={p.pricelistId}
              variant="secondary"
              className="tabular-nums"
            >
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
          onClick={() => onDispense(shipment)}
        >
          <UserRoundIcon aria-hidden className="me-1.5 size-3.5" />
          {t("medicalSupplies.buttons.dispense")}
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
