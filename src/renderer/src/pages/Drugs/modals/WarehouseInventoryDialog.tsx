"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { StatCard } from "@/components/common/StatCard"
import { EmptyState } from "@/components/common/EmptyState"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"

import type { DrugShipment, WarehouseWithStats } from "@/pages/Drugs/types/drug"

interface WarehouseInventoryDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  warehouse: WarehouseWithStats | null
  /** Per-shipment breakdown loader (from useWarehouses.inventory). */
  loadInventory: (id: number) => Promise<DrugShipment[]>
}

/**
 * "View Inventory" dialog (§6.5).
 *
 * Shows the warehouse's aggregate stats as `StatCard`s (from the parent
 * `WarehouseWithStats`), followed by a per-shipment breakdown (fetched
 * via `listShipmentsByWarehouse` because the dedicated inventory route
 * isn't mounted — §3.2 caveat).
 */
export function WarehouseInventoryDialog({
  open,
  onOpenChange,
  warehouse,
  loadInventory,
}: WarehouseInventoryDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const [shipments, setShipments] = useState<DrugShipment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !warehouse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipments([])
      return
    }
    let cancelled = false
    setLoading(true)
    loadInventory(warehouse.warehouseId)
      .then((rows) => {
        if (cancelled) return
        setShipments(rows)
      })
      .catch(() => {
        if (!cancelled) setShipments([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, warehouse, loadInventory])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("pharmacy.warehouseInventory.title", {
              name: warehouse?.name ?? "",
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label={t("pharmacy.warehouseInventory.totalShipments")}
            value={formatNumber(warehouse?.totalShipments ?? 0)}
          />
          <StatCard
            label={t("pharmacy.warehouseInventory.totalDrugs")}
            value={formatNumber(warehouse?.totalDrugs ?? 0)}
          />
          <StatCard
            label={t("pharmacy.warehouseInventory.totalValue")}
            value={formatCurrency(
              Number(warehouse?.totalStockValue ?? 0),
              resolveLocale(language)
            )}
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : shipments.length === 0 ? (
          <EmptyState title={t("pharmacy.messages.noShipments")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-start font-medium">
                  {t("pharmacy.table.drugName")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("pharmacy.fields.quantity")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("pharmacy.fields.buyPrice")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("pharmacy.fields.expiry")}
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.shipmentId} className="border-t border-border">
                  <td className="py-2 font-medium text-foreground">
                    {s.drugName}
                  </td>
                  <td className="py-2 text-end tabular-nums">{s.quantity}</td>
                  <td className="py-2 text-end tabular-nums">
                    {formatCurrency(Number(s.buyPrice), resolveLocale(language))}
                  </td>
                  <td className="py-2 text-end">
                    {s.expiryDate ? (
                      <Badge variant="outline">{s.expiryDate}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  )
}