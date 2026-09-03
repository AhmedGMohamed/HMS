"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatCard } from "@/components/common/StatCard"
import { EmptyState } from "@/components/common/EmptyState"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { formatNumber, formatCurrency, resolveLocale } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"

import { listWarehouseSupplyShipments } from "@/pages/Supplies/api"
import type {
  WarehouseSupplyInventoryItem,
  WarehouseWithStats,
} from "@/pages/Supplies/types/supply"

interface WarehouseSupplyInventoryDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  warehouse: WarehouseWithStats | null
}

const NEAR_EXPIRY_DAYS = 30

function statusFor(
  expiryDate: string | null
): "ok" | "warning" | "expired" {
  if (!expiryDate) return "ok"
  const expiry = new Date(expiryDate).getTime()
  if (Number.isNaN(expiry)) return "ok"
  const now = Date.now()
  if (expiry < now) return "expired"
  const days = (expiry - now) / 86_400_000
  return days <= NEAR_EXPIRY_DAYS ? "warning" : "ok"
}

/**
 * "View Inventory" dialog (design plan §6.3.2) — supply-specific.
 *
 * Top: 3 `StatCard`s (Total Supply Shipments, Total Units in
 * Stock, Total Stock Value) computed from the loaded shipments.
 * Below: flat table of supply shipments in the warehouse with
 * quantity, buy price, expiry, and computed status (ok / near
 * expiry / expired).
 */
export function WarehouseSupplyInventoryDialog({
  open,
  onOpenChange,
  warehouse,
}: WarehouseSupplyInventoryDialogProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const [items, setItems] = useState<WarehouseSupplyInventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !warehouse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    listWarehouseSupplyShipments(warehouse.warehouseId)
      .then((rows) => {
        if (cancelled) return
        setItems(
          rows.map((r) => ({
            ...r,
            quantity: Number(r.quantity ?? 0),
            buyPrice: Number(r.buyPrice ?? 0),
            status: statusFor(r.expiryDate),
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, warehouse])

  const totalUnits = items.reduce((sum, it) => sum + Number(it.quantity ?? 0), 0)
  const totalValue = items.reduce(
    (sum, it) => sum + Number(it.quantity ?? 0) * Number(it.buyPrice ?? 0),
    0
  )

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
            label={t("medicalSupplies.warehouses.totalShipments")}
            value={formatNumber(items.length)}
          />
          <StatCard
            label={t("medicalSupplies.warehouses.totalUnits")}
            value={formatNumber(totalUnits)}
          />
          <StatCard
            label={t("medicalSupplies.warehouses.totalValue")}
            value={formatCurrency(totalValue, resolveLocale(language))}
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t("medicalSupplies.shipment.noShipments")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-start font-medium">
                  {t("medicalSupplies.warehouses.supplyName")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("medicalSupplies.fields.quantity")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("medicalSupplies.fields.buyPrice")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("medicalSupplies.warehouses.expiry")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("medicalSupplies.warehouses.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.shipmentId} className="border-t border-border">
                  <td className="py-2 font-medium text-foreground">
                    {s.supplyName}
                  </td>
                  <td className="py-2 text-end tabular-nums">
                    {formatNumber(s.quantity)}
                  </td>
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
                  <td className="py-2 text-end">
                    {s.status === "expired" ? (
                      <Badge variant="destructive">
                        {t("medicalSupplies.warehouses.statusExpired")}
                      </Badge>
                    ) : s.status === "warning" ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 bg-warning/5"
                      >
                        {t("medicalSupplies.warehouses.statusWarning")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t("medicalSupplies.warehouses.statusOk")}
                      </Badge>
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
