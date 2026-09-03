"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  HistoryIcon,
  PackageIcon,
  PlusIcon,
  WarehouseIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { useSuppliesList } from "@/pages/Supplies/hooks/useSuppliesList"
import { useSuppliesKpi } from "@/pages/Supplies/hooks/useSuppliesKpi"
import { useSupplyUsageHistory } from "@/pages/Supplies/hooks/useSupplyUsageHistory"
import { useSharedWarehouses } from "@/pages/_shared/pharmacy/hooks/useSharedWarehouses"
import {
  createSupplyShipment,
  deleteSupply,
  deleteSupplyShipment,
  dispenseSupplyToPatient,
  listPriceLists,
  updateSupplyShipment,
} from "@/pages/Supplies/api"
import { SuppliesKpiStrip } from "@/pages/Supplies/components/SuppliesKpiStrip"
import { SuppliesTable } from "@/pages/Supplies/components/SuppliesTable"
import { SuppliesWarehousesPanel } from "@/pages/Supplies/components/Warehouses/SuppliesWarehousesPanel"
import { UsageHistoryPanel } from "@/pages/Supplies/components/UsageHistory/UsageHistoryPanel"
import { SupplyModal } from "@/pages/Supplies/modals/SupplyModal"
import { SupplyShipmentModal } from "@/pages/Supplies/modals/SupplyShipmentModal"
import { DispenseSupplyModal } from "@/pages/Supplies/modals/DispenseSupplyModal"
import { ApiError } from "@/lib/errors"
import type {
  EnrichedMedicalSupply,
  MedicalSupply,
  MedicalSupplyShipment,
  PriceList,
} from "@/pages/Supplies/types/supply"

type Tab = "inventory" | "warehouses" | "usage"

/**
 * /supplies — Medical Supplies root page.
 *
 * One page, three tabs: Supplies Inventory (default) → Warehouses →
 * Usage History. The KPI strip's active filter is a single source
 * of truth lifted here and shared by the KPI cards and the filter
 * chips.
 *
 * Composition (design plan §6.3):
 *  - PageHeader with [+ New Supply] action
 *  - Tabs: Inventory · Warehouses · Usage History
 *  - Inventory tab: KPI strip + filter chips + expandable DataTable
 *  - Warehouses tab: shared warehouse CRUD + supply-specific
 *    "View Inventory" dialog
 *  - Usage History tab: 3 summary cards + filter bar + audit table
 *
 * Modal state lives at the page level (not inside tabs) so it
 * survives tab switches.
 */
export default function SuppliesPage() {
  const { t } = useTranslation()
  useEnsureNamespace("medicalSupplies")

  const [tab, setTab] = useState<Tab>("inventory")

  const suppliesList = useSuppliesList()
  const warehouses = useSharedWarehouses()
  const usageHistory = useSupplyUsageHistory()

  /**
   * `totalInventoryValue` is sourced from the supply fan-out, NOT
   * from the `/api/warehouse` aggregate (which sums drug stock
   * value — the wrong number for this page).
   */
  const kpi = useSuppliesKpi(
    suppliesList.supplies,
    suppliesList.totalInventoryValue,
    usageHistory.summary
  )

  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  // Modal state
  const [supplyModalOpen, setSupplyModalOpen] = useState(false)
  const [editingSupply, setEditingSupply] = useState<MedicalSupply | null>(null)

  const [deletingSupply, setDeletingSupply] = useState<EnrichedMedicalSupply | null>(
    null
  )

  const [shipmentModalOpen, setShipmentModalOpen] = useState(false)
  const [shipmentSupply, setShipmentSupply] = useState<MedicalSupply | null>(null)
  const [editingShipment, setEditingShipment] = useState<
    | Pick<
        MedicalSupplyShipment,
        | "shipmentId"
        | "warehouseId"
        | "quantity"
        | "buyPrice"
        | "expiryDate"
        | "prices"
      >
    | null
  >(null)

  const [dispenseShipment, setDispenseShipment] =
    useState<MedicalSupplyShipment | null>(null)

  const [deletingShipment, setDeletingShipment] =
    useState<MedicalSupplyShipment | null>(null)

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
        title={t("medicalSupplies.title")}
        eyebrow={t("sidebar.pharmacy")}
        actions={
          <Button
            onClick={() => {
              setEditingSupply(null)
              setSupplyModalOpen(true)
            }}
          >
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("medicalSupplies.buttons.createSupply")}
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
            <PackageIcon aria-hidden className="me-2 size-4" />
            {t("medicalSupplies.tabs.inventory")}
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="w-full justify-center">
            <WarehouseIcon aria-hidden className="me-2 size-4" />
            {t("medicalSupplies.tabs.warehouses")}
          </TabsTrigger>
          <TabsTrigger value="usage" className="w-full justify-center">
            <HistoryIcon aria-hidden className="me-2 size-4" />
            {t("medicalSupplies.tabs.usageHistory")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="flex flex-col gap-6">
          <SuppliesKpiStrip
            kpi={kpi}
            loading={suppliesList.loading}
            filter={suppliesList.filter}
            onFilterChange={suppliesList.setFilter}
          />
          <SuppliesTable
            supplies={suppliesList.supplies}
            loading={suppliesList.loading}
            search={suppliesList.search}
            onSearchChange={suppliesList.setSearch}
            filter={suppliesList.filter}
            onFilterChange={suppliesList.setFilter}
            onEditSupply={(s) => {
              setEditingSupply(s)
              setSupplyModalOpen(true)
            }}
            onDeleteSupply={(s) => setDeletingSupply(s)}
            onAddShipment={(s) => {
              setShipmentSupply(s)
              setEditingShipment(null)
              setShipmentModalOpen(true)
            }}
            onDispense={(shipment) => setDispenseShipment(shipment)}
            onEditShipment={(shipment) => {
              const supply = suppliesList.supplies.find(
                (s) => s.supplyId === shipment.supplyId
              )
              if (!supply) return
              setShipmentSupply(supply)
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
          <SuppliesWarehousesPanel
            warehouses={warehouses.warehouses}
            loading={warehouses.loading}
            onCreate={warehouses.create}
            onUpdate={warehouses.update}
            onDelete={warehouses.remove}
          />
        </TabsContent>

        <TabsContent value="usage">
          <UsageHistoryPanel
            rows={usageHistory.rows}
            loading={usageHistory.loading}
            error={usageHistory.error}
            summary={usageHistory.summary}
            loadingSummary={usageHistory.loadingSummary}
            setFilters={usageHistory.setFilters}
          />
        </TabsContent>
      </Tabs>

      {/* Create / edit supply card */}
      <SupplyModal
        open={supplyModalOpen}
        onOpenChange={setSupplyModalOpen}
        supply={editingSupply}
        onSaved={suppliesList.refresh}
      />

      {/* Create / edit shipment */}
      {shipmentSupply ? (
        <SupplyShipmentModal
          open={shipmentModalOpen}
          onOpenChange={setShipmentModalOpen}
          supply={shipmentSupply}
          warehouses={warehouses.warehouses}
          priceLists={priceLists}
          shipment={editingShipment}
          onSubmit={async (payload) => {
            if (editingShipment) {
              await updateSupplyShipment(editingShipment.shipmentId, {
                warehouseId: payload.warehouseId,
                quantity: payload.quantity,
                buyPrice: payload.buyPrice,
                expiryDate: payload.expiryDate,
                prices: payload.prices.map((p) => ({
                  pricelistId: p.pricelistId,
                  price: p.price,
                })),
              })
              toast.success(t("medicalSupplies.messages.shipmentUpdateSuccess"))
            } else {
              await createSupplyShipment(payload)
              toast.success(t("medicalSupplies.messages.shipmentCreateSuccess"))
            }
            suppliesList.refresh()
          }}
        />
      ) : null}

      {/* Dispense to inpatient */}
      {dispenseShipment ? (
        <DispenseSupplyModal
          open={dispenseShipment != null}
          onOpenChange={(v) => {
            if (!v) setDispenseShipment(null)
          }}
          shipment={dispenseShipment}
          priceLists={priceLists}
          onSubmit={async (payload) => {
            await dispenseSupplyToPatient(payload.patientId, {
              supplyId: dispenseShipment.supplyId,
              shipmentId: payload.shipmentId,
              quantity: payload.quantity,
              price: payload.price,
            })
            toast.success(t("medicalSupplies.dispense.success"))
            suppliesList.refresh()
            usageHistory.refresh()
          }}
        />
      ) : null}

      {/* Delete supply */}
      <ConfirmDialog
        open={deletingSupply != null}
        onOpenChange={(v) => {
          if (!v) setDeletingSupply(null)
        }}
        title={t("medicalSupplies.confirmations.deleteSupplyTitle")}
        description={
          deletingSupply?.totalQuantity
            ? t("medicalSupplies.messages.deleteSupplyWithStockWarning", {
                quantity: deletingSupply.totalQuantity,
              })
            : t("medicalSupplies.confirmations.deleteSupplyText")
        }
        onConfirm={async () => {
          if (!deletingSupply) return
          try {
            await deleteSupply(deletingSupply.supplyId)
            toast.success(t("medicalSupplies.messages.deleteSuccess"))
            setDeletingSupply(null)
            suppliesList.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("medicalSupplies.messages.deleteError")
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
        title={t("medicalSupplies.confirmations.deleteShipmentTitle")}
        description={t("medicalSupplies.confirmations.deleteShipmentText")}
        onConfirm={async () => {
          if (!deletingShipment) return
          try {
            await deleteSupplyShipment(deletingShipment.shipmentId)
            toast.success(t("medicalSupplies.messages.shipmentDeleteSuccess"))
            setDeletingShipment(null)
            suppliesList.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("medicalSupplies.messages.shipmentDeleteError")
            )
          }
        }}
      />
    </div>
  )
}
