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
import { Badge } from "@/components/ui/badge"

import {
  listDrugCards,
  listDrugShipments,
} from "@/pages/Patients/api"
import type {
  DrugCard,
  DrugShipment,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { AddDrugQuantityDialog } from "@/pages/Patients/Assigned/modals/AddDrugQuantityDialog"

interface AddDrugDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number
  currentAdmission: PatientHistory | null
  /**
   * Submit is delegated to the upstream hook which owns toasts /
   * refresh. We only collect the click + hand off the qty.
   */
  onAdded: (args: {
    drugId: number
    shipmentId: number
    quantity: number
    price: number
  }) => Promise<unknown>
}

/**
 * Drug picker. Step 1: select a drug (cards from `listDrugCards()`,
 * which already carries `unitConversion` & `unit_conversion` info).
 * Step 2: select a shipment (FIFO from `listDrugShipments(drugId)`).
 * Step 3: hand off to `<AddDrugQuantityDialog>` with the smaller-unit
 * cap (`sumQuantity` is the shipment's available remainder; with
 * `unitConversion.ratio`, the larger-unit input caps at
 * `floor(remaining / ratio)`).
 */
export function AddDrugDialog({
  open,
  onOpenChange,
  patientId: _patientId,
  currentAdmission,
  onAdded,
}: AddDrugDialogProps) {
  void _patientId
  const { t } = useTranslation()
  const [drugs, setDrugs] = useState<DrugCard[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedDrugId, setSelectedDrugId] = useState<number | null>(null)
  const [shipments, setShipments] = useState<DrugShipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [qtyDrugId, setQtyDrugId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSearch("")
      setSelectedDrugId(null)
      setShipments([])
      setQtyDrugId(null)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    listDrugCards()
      .then((rows) => {
        if (cancelled) return
        setDrugs(rows)
      })
      .catch(() => {
        /* ignored */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (selectedDrugId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipments([])
      return
    }
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShipmentsLoading(true)
    listDrugShipments(selectedDrugId)
      .then((rows) => {
        if (cancelled) return
        setShipments(rows)
      })
      .catch(() => {
        /* ignored */
      })
      .finally(() => {
        if (!cancelled) setShipmentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedDrugId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drugs.filter((d) =>
      q.length === 0
        ? true
        : (d.name ?? "").toLowerCase().includes(q) ||
          (d.manufacturer ?? "").toLowerCase().includes(q)
    )
  }, [drugs, search])

  const selectedDrug = drugs.find((d) => d.drugId === selectedDrugId) ?? null
  const availableShipments = shipments.filter((s) => s.remainingQuantity > 0)

  function onDrugPicked(drugId: number) {
    setSelectedDrugId(drugId)
  }

  function onShipmentPicked(shipmentId: number) {
    if (!selectedDrug) return
    setQtyDrugId(shipmentId)
  }

  return (
    <>
      <Dialog open={open && qtyDrugId == null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("patients.modals.addDrug")}</DialogTitle>
          </DialogHeader>

          {!selectedDrugId ? (
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
                  title={t("patients.messages.noAvailableDrugs")}
                  description={t("patients.searchPlaceholder")}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-start font-medium">
                        {t("patients.table.dateAdded")}
                      </th>
                      <th className="py-2 text-end font-medium">
                        {t("common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr key={d.drugId} className="border-t border-border">
                        <td className="py-2 font-medium text-foreground">
                          {d.name}
                          {d.manufacturer ? (
                            <Badge variant="outline" className="ms-2">
                              {d.manufacturer}
                            </Badge>
                          ) : null}
                          {d.unitConversion ? (
                            <Badge variant="outline" className="ms-2">
                              {d.unitConversion.smallerUnit}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-2 text-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onDrugPicked(d.drugId)}
                            disabled={
                              currentAdmission == null
                            }
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
                {selectedDrug?.name ?? "—"}
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
                        <td className="py-2 tabular-nums">
                          #{s.shipmentId}
                        </td>
                        <td className="py-2 tabular-nums">
                          {s.remainingQuantity}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {s.unitCost}
                        </td>
                        <td className="py-2 text-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onShipmentPicked(s.shipmentId)}
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
                  onClick={() => setSelectedDrugId(null)}
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

      {qtyDrugId != null && selectedDrug ? (
        <AddDrugQuantityDialog
          open={qtyDrugId != null}
          onOpenChange={(v) => {
            if (!v) setQtyDrugId(null)
          }}
          drug={selectedDrug}
          shipment={
            shipments.find((s) => s.shipmentId === qtyDrugId) ?? null
          }
          onConfirm={async (quantity, total) => {
            const shipment = shipments.find(
              (s) => s.shipmentId === qtyDrugId
            )
            if (!shipment) return
            await onAdded({
              drugId: selectedDrug.drugId,
              shipmentId: shipment.shipmentId,
              quantity,
              price: shipment.unitCost * total,
            })
            setQtyDrugId(null)
            setSelectedDrugId(null)
            onOpenChange(false)
          }}
        />
      ) : null}
    </>
  )
}

