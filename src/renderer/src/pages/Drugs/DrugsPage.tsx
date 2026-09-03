"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { HistoryIcon, PillIcon, PlusIcon, WarehouseIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { useDrugsList } from "@/pages/Drugs/hooks/useDrugsList"
import { useWarehouses } from "@/pages/Drugs/hooks/useWarehouses"
import { usePharmacyKpi } from "@/pages/Drugs/hooks/usePharmacyKpi"
import {
  addDrugToPatient,
  createShipment,
  createTransaction,
  deleteDrugCard,
  deleteShipment,
  listPriceLists,
  updateShipment,
} from "@/pages/Drugs/api"
import { PharmacyKpiStrip } from "@/pages/Drugs/components/PharmacyKpiStrip"
import { DrugsTable } from "@/pages/Drugs/components/DrugsTable/DrugsTable"
import { WarehousesPanel } from "@/pages/Drugs/components/Warehouses/WarehousesPanel"
import { TransactionsPanel } from "@/pages/Drugs/components/Transactions/TransactionsPanel"
import { DrugCardModal } from "@/pages/Drugs/modals/DrugCardModal"
import { ShipmentModal } from "@/pages/Drugs/modals/ShipmentModal"
import { SellDrugModal } from "@/pages/Drugs/modals/SellDrugModal"
import { ApiError } from "@/lib/errors"
import type {
  DrugCard,
  DrugShipment,
  EnrichedDrugCard,
  PriceList,
} from "@/pages/Drugs/types/drug"

type Tab = "inventory" | "warehouses" | "transactions"

/**
 * /drugs — Pharmacy (Drugs) root (§6.1).
 *
 * One page, three tabs: Drugs Inventory (default) → Warehouses →
 * Transactions History. The KPI strip's active filter is a single source
 * of truth lifted here and shared by the KPI cards and the filter chips.
 */
export default function DrugsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("pharmacy")

  const [tab, setTab] = useState<Tab>("inventory")

  const drugsList = useDrugsList()
  const warehouses = useWarehouses()

  const totalInventoryValue = warehouses.warehouses.reduce(
    (sum, w) => sum + Number(w.totalStockValue ?? 0),
    0
  )
  const kpi = usePharmacyKpi(drugsList.drugs, totalInventoryValue)

  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  // Modal state
  const [drugModalOpen, setDrugModalOpen] = useState(false)
  const [editingDrug, setEditingDrug] = useState<DrugCard | null>(null)
  const [deletingDrug, setDeletingDrug] = useState<EnrichedDrugCard | null>(null)

  const [shipmentModalOpen, setShipmentModalOpen] = useState(false)
  const [shipmentDrug, setShipmentDrug] = useState<DrugCard | null>(null)
  const [editingShipment, setEditingShipment] = useState<
    | { shipmentId: number; warehouseId: number; quantity: number; buyPrice: number | string; expiryDate: string | null; prices: DrugShipment["prices"] }
    | null
  >(null)

  const [sellShipment, setSellShipment] = useState<DrugShipment | null>(null)

  const [deletingShipment, setDeletingShipment] = useState<DrugShipment | null>(null)

  useEffect(() => {
    listPriceLists()
      .then(setPriceLists)
      .catch(() => {
        /* price lists are non-critical; surfaces as empty selector */
      })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("pharmacy.title")}
        eyebrow={t("sidebar.pharmacy")}
        actions={
          <Button onClick={() => {
            setEditingDrug(null)
            setDrugModalOpen(true)
          }}>
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("pharmacy.buttons.createDrug")}
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex w-full flex-col gap-6"
      >
        <TabsList className="w-full">
          <TabsTrigger value="inventory" className="w-full justify-center">
            <PillIcon aria-hidden className="me-2 size-4" />
            {t("pharmacy.tabs.inventory")}
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="w-full justify-center">
            <WarehouseIcon aria-hidden className="me-2 size-4" />
            {t("pharmacy.tabs.warehouses")}
          </TabsTrigger>
          <TabsTrigger value="transactions" className="w-full justify-center">
            <HistoryIcon aria-hidden className="me-2 size-4" />
            {t("pharmacy.tabs.transactions")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="flex flex-col gap-6">
          <PharmacyKpiStrip
            kpi={kpi}
            loading={drugsList.loading}
            filter={drugsList.filter}
            onFilterChange={drugsList.setFilter}
          />
          <DrugsTable
            drugs={drugsList.drugs}
            loading={drugsList.loading}
            search={drugsList.search}
            onSearchChange={drugsList.setSearch}
            filter={drugsList.filter}
            onFilterChange={drugsList.setFilter}
            onEditDrug={(drug) => {
              setEditingDrug(drug)
              setDrugModalOpen(true)
            }}
            onDeleteDrug={(drug) => setDeletingDrug(drug)}
            onAddShipment={(drug) => {
              setShipmentDrug(drug)
              setEditingShipment(null)
              setShipmentModalOpen(true)
            }}
            onSell={(shipment) => setSellShipment(shipment)}
            onEditShipment={(shipment) => {
              const drug = drugsList.drugs.find((d) => d.drugId === shipment.drugId)
              if (!drug) return
              setShipmentDrug(drug)
              setEditingShipment({
                shipmentId: shipment.shipmentId,
                warehouseId: shipment.warehouseId,
                quantity: shipment.quantity,
                buyPrice: shipment.buyPrice,
                expiryDate: shipment.expiryDate,
                prices: shipment.prices,
              })
              setShipmentModalOpen(true)
            }}
            onDeleteShipment={(shipment) => setDeletingShipment(shipment)}
          />
        </TabsContent>

        <TabsContent value="warehouses">
          <WarehousesPanel
            warehouses={warehouses.warehouses}
            loading={warehouses.loading}
            onCreate={warehouses.create}
            onUpdate={warehouses.update}
            onDelete={warehouses.remove}
            loadInventory={warehouses.inventory}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsPanel />
        </TabsContent>
      </Tabs>

      {/* Create / edit drug card */}
      <DrugCardModal
        open={drugModalOpen}
        onOpenChange={setDrugModalOpen}
        drug={editingDrug}
        onSaved={drugsList.refresh}
      />

      {/* Create / edit shipment */}
      {shipmentDrug ? (
        <ShipmentModal
          open={shipmentModalOpen}
          onOpenChange={setShipmentModalOpen}
          drug={shipmentDrug}
          warehouses={warehouses.warehouses}
          priceLists={priceLists}
          shipment={editingShipment}
          onSubmit={async (payload) => {
            if (editingShipment) {
              await updateShipment(editingShipment.shipmentId, payload)
              toast.success(t("pharmacy.messages.shipmentUpdateSuccess"))
            } else {
              await createShipment(payload)
              toast.success(t("pharmacy.messages.shipmentCreateSuccess"))
            }
            drugsList.refresh()
          }}
        />
      ) : null}

      {/* Sell — routes differ by transaction type (§6.4.4):
            - `outside` → /pharmacy/drugs/transactions (creates a
              DrugTransaction only, no bill).
            - `patient` / `check` → /patients/:id/drugs
              (DrugUsage + BillDetail on the patient's active
              admission bill). The modal guarantees `patientId` and
              `patientHistoryId` are set for the patient/check branch
              or it never calls onSubmit. */}
      {sellShipment ? (
        <SellDrugModal
          open={sellShipment != null}
          onOpenChange={(v) => {
            if (!v) setSellShipment(null)
          }}
          shipment={sellShipment}
          priceLists={priceLists}
          onSubmit={async (payload) => {
            if (payload.transactionType === "outside") {
              await createTransaction({
                shipmentId: payload.shipmentId,
                transactionType: payload.transactionType,
                quantity: payload.quantity,
                price: payload.price,
                patientId: null,
              })
            } else {
              if (
                payload.patientId == null ||
                payload.patientHistoryId == null
              ) {
                throw new Error("Patient and admission are required")
              }
              await addDrugToPatient(payload.patientId, {
                drugId: sellShipment.drugId,
                shipmentId: payload.shipmentId,
                quantity: payload.quantity,
                price: payload.price,
                patientHistoryId: payload.patientHistoryId,
              })
            }
            toast.success(t("pharmacy.messages.saleSuccess"))
            drugsList.refresh()
          }}
        />
      ) : null}

      {/* Delete drug */}
      <ConfirmDialog
        open={deletingDrug != null}
        onOpenChange={(v) => {
          if (!v) setDeletingDrug(null)
        }}
        title={t("pharmacy.messages.deleteConfirmTitle")}
        description={
          deletingDrug?.stock?.totalQuantity
            ? t("pharmacy.messages.deleteWithStockWarning", {
                quantity: deletingDrug.stock.totalQuantity,
              })
            : t("pharmacy.messages.deleteConfirmText")
        }
        onConfirm={async () => {
          if (!deletingDrug) return
          try {
            await deleteDrugCard(deletingDrug.drugId)
            toast.success(t("pharmacy.messages.deleteSuccess"))
            setDeletingDrug(null)
            drugsList.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("pharmacy.messages.deleteError")
            )
          }
        }}
      />

      {/* Delete shipment */}
      <ConfirmDialog
        open={deletingShipment != null}
        onOpenChange={(v) => {
          if (!v) setDeletingShipment(null)
        }}
        title={t("pharmacy.messages.deleteShipmentTitle")}
        description={
          <>
            {t("pharmacy.messages.deleteShipmentConfirm")}{" "}
            {t("pharmacy.messages.deleteShipmentConfirmText")}
          </>
        }
        onConfirm={async () => {
          if (!deletingShipment) return
          try {
            await deleteShipment(deletingShipment.shipmentId)
            toast.success(t("pharmacy.messages.shipmentDeleteSuccess"))
            setDeletingShipment(null)
            drugsList.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("pharmacy.messages.shipmentDeleteError")
            )
          }
        }}
      />
    </div>
  )
}