"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusCircleIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { Input } from "@/components/ui/input"

import {
  addSupply,
  listAvailableSupplies,
  listSupplyShipments,
} from "@/pages/Patients/api"
import type {
  MedicalSupply,
  MedicalSupplyShipment,
} from "@/pages/Patients/types/patient"

interface AddSupplyDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number
  /**
   * Patient's current admission (needed because `addSupply`'s payload
   * requires `patientHistoryId: number` even though the controller
   * strips it before insert).
   */
  currentAdmissionId: number | null
  /**
   * Fired after a successful mutation so the parent can refresh its
   * `useAssignedSupplies` hook.
   */
  onAdded?: () => void
}

/**
 * Pick-a-supply picker. Step 1: choose a supply. Step 2: pick a
 * shipment (FIFO by available remainder). Step 3: enter quantity
 * (single input — supplies have no unit_conversion). On confirm
 * POST and close.
 *
 * Server expects `{ supplyId, shipmentId, quantity, price }` — the
 * controller strips `price` and `patientHistoryId` (server fetches
 * the active admission). We pass a sensible `price` for inspection
 * hooks that read the server response and to stay aligned with the
 * legacy client.
 */
export function AddSupplyDialog({
  open,
  onOpenChange,
  patientId,
  currentAdmissionId,
  onAdded,
}: AddSupplyDialogProps) {
  const { t } = useTranslation()
  const [supplies, setSupplies] = useState<MedicalSupply[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedSupplyId, setSelectedSupplyId] = useState<number | null>(
    null
  )
  const [shipments, setShipments] = useState<MedicalSupplyShipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [qtyShipmentId, setQtyShipmentId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSearch("")
      setSelectedSupplyId(null)
      setShipments([])
      setQtyShipmentId(null)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    listAvailableSupplies()
      .then((rows) => {
        if (cancelled) return
        setSupplies(rows)
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (selectedSupplyId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipments([])
      return
    }
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShipmentsLoading(true)
    listSupplyShipments(selectedSupplyId)
      .then((rows) => {
        if (cancelled) return
        setShipments(rows)
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setShipmentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSupplyId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return supplies.filter((s) =>
      q.length === 0 ? true : (s.name ?? "").toLowerCase().includes(q)
    )
  }, [supplies, search])

  const selectedSupply =
    supplies.find((s) => s.supplyId === selectedSupplyId) ?? null
  const availableShipments = shipments.filter((s) => s.quantity > 0)

  async function handleAddSubmit(quantity: number) {
    if (!selectedSupply) return
    const shipment = shipments.find((s) => s.shipmentId === qtyShipmentId)
    if (!shipment) return
    if (currentAdmissionId == null) return
    await addSupply(patientId, {
      supplyId: selectedSupply.supplyId,
      shipmentId: shipment.shipmentId,
      quantity,
      price: shipment.unitCost * quantity,
      patientHistoryId: currentAdmissionId,
    })
    onOpenChange(false)
    onAdded?.()
  }

  return (
    <>
      <Dialog open={open && qtyShipmentId == null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("patients.modals.addSupply")}</DialogTitle>
          </DialogHeader>

          {selectedSupplyId == null ? (
            <>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("patients.searchPlaceholder")}
                aria-label={t("patients.searchPlaceholder")}
              />
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner aria-hidden className="size-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title={t("patients.messages.noSuppliesFound")}
                  description={t("patients.searchPlaceholder")}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-start font-medium">
                        {t("patients.fields.fullName")}
                      </th>
                      <th className="py-2 text-start font-medium">
                        {t("patients.table.type")}
                      </th>
                      <th className="py-2 text-end font-medium">
                        {t("common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.supplyId} className="border-t border-border">
                        <td className="py-2 font-medium text-foreground">
                          {s.name}
                          {s.manufacturer ? (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {s.manufacturer}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-muted-foreground">—</td>
                        <td className="py-2 text-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setSelectedSupplyId(s.supplyId)}
                          >
                            <PlusCircleIcon
                              aria-hidden
                              className="me-1.5 size-3.5"
                            />
                            {t("common.add")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {selectedSupply?.name ?? "—"}
              </p>
              {shipmentsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner aria-hidden className="size-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : availableShipments.length === 0 ? (
                <EmptyState
                  title={t("patients.messages.outOfStock")}
                  description={t("patients.messages.outOfStock")}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-start font-medium">Shipment</th>
                      <th className="py-2 text-start font-medium">
                        {t("patients.table.available")}
                      </th>
                      <th className="py-2 text-start font-medium">
                        {t("patients.table.type")}
                      </th>
                      <th className="py-2 text-end font-medium">
                        {t("common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableShipments.map((s) => (
                      <tr key={s.shipmentId} className="border-t border-border">
                        <td className="py-2 tabular-nums">#{s.shipmentId}</td>
                        <td className="py-2 tabular-nums">{s.quantity}</td>
                        <td className="py-2 text-muted-foreground">
                          {s.unitCost}
                        </td>
                        <td className="py-2 text-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setQtyShipmentId(s.shipmentId)}
                          >
                            <PlusCircleIcon
                              aria-hidden
                              className="me-1.5 size-3.5"
                            />
                            {t("common.add")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedSupplyId(null)}
                >
                  {t("common.back")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {qtyShipmentId != null && selectedSupply ? (
        <QuantityDialog
          open={qtyShipmentId != null}
          onOpenChange={(v) => {
            if (!v) setQtyShipmentId(null)
          }}
          supply={selectedSupply}
          shipment={
            shipments.find((s) => s.shipmentId === qtyShipmentId) ?? null
          }
          onConfirm={handleAddSubmit}
        />
      ) : null}
    </>
  )
}

function QuantityDialog({
  open,
  onOpenChange,
  supply,
  shipment,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  supply: MedicalSupply
  shipment: MedicalSupplyShipment | null
  onConfirm: (qty: number) => Promise<void>
}) {
  const { t } = useTranslation()
  void supply
  const [qty, setQty] = useState<number>(1)
  const [submitting, setSubmitting] = useState(false)
  const max = shipment?.quantity ?? 0
  const valid = qty > 0 && qty <= max

  async function handleSubmit() {
    if (!valid) return
    setSubmitting(true)
    try {
      await onConfirm(qty)
    } finally {
      setSubmitting(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("patients.messages.addSupplyTitle", {
              supplyName: shipment?.shipmentId ?? "—",
            })}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("patients.messages.availableQuantity", {
            quantity: max,
            unit: "—",
          })}
        </p>
        <Input
          type="number"
          min={1}
          max={max}
          step={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !valid}
          >
            {submitting ? t("common.loading") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
