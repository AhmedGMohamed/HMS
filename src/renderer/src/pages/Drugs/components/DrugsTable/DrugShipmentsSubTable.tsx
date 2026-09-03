"use client"

import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { useDrugShipments } from "@/pages/Drugs/hooks/useDrugShipments"
import type { DrugShipment } from "@/pages/Drugs/types/drug"
import { ShipmentRow } from "./ShipmentRow"

interface DrugShipmentsSubTableProps {
  drugId: number
  onSell: (shipment: DrugShipment) => void
  onEdit: (shipment: DrugShipment) => void
  onDelete: (shipment: DrugShipment) => void
  onAddShipment: () => void
}

/**
 * Inline shipment sub-table revealed by expanding a drug row (§6.3).
 *
 * Expand-on-demand: fetches the drug's shipments only when the parent
 * row is expanded (avoiding the legacy N+1 over every drug).
 */
export function DrugShipmentsSubTable({
  drugId,
  onSell,
  onEdit,
  onDelete,
  onAddShipment,
}: DrugShipmentsSubTableProps) {
  const { t } = useTranslation()
  const { shipments, loading, error } = useDrugShipments(drugId)

  return (
    <div className="border-t border-border bg-surface-muted/40">
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Spinner aria-hidden className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="px-4 py-3 text-sm text-destructive">
          {t("pharmacy.messages.loadShipmentError")}
        </p>
      ) : shipments.length === 0 ? (
        <EmptyState
          title={t("pharmacy.messages.noShipments")}
          action={
            <Button type="button" size="sm" onClick={onAddShipment}>
              <PlusIcon aria-hidden className="me-1.5 size-3.5" />
              {t("pharmacy.buttons.addShipment")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col">
          {shipments.map((s) => (
            <ShipmentRow
              key={s.shipmentId}
              shipment={s}
              onSell={onSell}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <div className="px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddShipment}
            >
              <PlusIcon aria-hidden className="me-1.5 size-3.5" />
              {t("pharmacy.buttons.addShipment")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}