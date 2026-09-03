"use client"

import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"

import { useSupplyShipments } from "@/pages/Supplies/hooks/useSupplyShipments"
import type { MedicalSupplyShipment } from "@/pages/Supplies/types/supply"
import { SupplyShipmentRow } from "./SupplyShipmentRow"

interface SupplyShipmentsSubTableProps {
  supplyId: number
  onDispense: (shipment: MedicalSupplyShipment) => void
  onEdit: (shipment: MedicalSupplyShipment) => void
  onDelete: (shipment: MedicalSupplyShipment) => void
  onAddShipment: () => void
}

/**
 * Inline shipment sub-table revealed by expanding a supply row
 * (design plan §6.3.1).
 *
 * Expand-on-demand: fetches the supply's shipments only when the
 * parent row is expanded. Mirrors `DrugShipmentsSubTable`, with one
 * material difference — supplies have no unit conversion, so the
 * stock column is a single integer.
 */
export function SupplyShipmentsSubTable({
  supplyId,
  onDispense,
  onEdit,
  onDelete,
  onAddShipment,
}: SupplyShipmentsSubTableProps) {
  const { t } = useTranslation()
  const { shipments, loading, error } = useSupplyShipments(supplyId)

  return (
    <div className="border-t border-border bg-surface-muted/40">
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Spinner aria-hidden className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="px-4 py-3 text-sm text-destructive">
          {t("medicalSupplies.shipment.loadShipmentError")}
        </p>
      ) : shipments.length === 0 ? (
        <EmptyState
          title={t("medicalSupplies.shipment.noShipments")}
          action={
            <Button type="button" size="sm" onClick={onAddShipment}>
              <PlusIcon aria-hidden className="me-1.5 size-3.5" />
              {t("medicalSupplies.buttons.addShipment")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col">
          {shipments.map((s) => (
            <SupplyShipmentRow
              key={s.shipmentId}
              shipment={s}
              onDispense={onDispense}
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
              {t("medicalSupplies.buttons.addShipment")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
