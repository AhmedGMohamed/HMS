"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { usePriceLists } from "@/pages/PriceLists/hooks/usePriceLists"
import { PriceListsGrid } from "@/pages/PriceLists/components/PriceListsGrid"
import { PriceListModal } from "@/pages/PriceLists/modals/PriceListModal"
import { AddPricesModal } from "@/pages/PriceLists/modals/AddPricesModal"
import { deletePriceList } from "@/pages/PriceLists/api"
import type {
  BulkPricesResult,
  PriceList,
  PriceListWithStats,
} from "@/pages/PriceLists/types/priceList"
import { ApiError } from "@/lib/errors"

/**
 * /price-lists — Price Lists Management root page (Stage 1).
 *
 * Card grid (legacy parity) with CRUD + the default-list invariant +
 * the transactional Add Prices flow. Modal/confirm state lives at the
 * page level; the grid itself stays presentational.
 */
export default function PriceListsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("priceLists")

  const lists = usePriceLists()
  const currentDefault =
    lists.priceLists.find((pl) => pl.isDefault) ?? null

  // Create / edit list modal
  const [listModalOpen, setListModalOpen] = useState(false)
  const [editingList, setEditingList] = useState<PriceList | null>(null)

  // Delete confirm
  const [deletingList, setDeletingList] = useState<PriceListWithStats | null>(
    null
  )

  // Add Prices modal (target is the base PriceList shape)
  const [addPricesList, setAddPricesList] = useState<PriceList | null>(null)
  const [addPricesOpen, setAddPricesOpen] = useState(false)
  const [showSkip, setShowSkip] = useState(false)

  // Post-create "Add Prices Now?" confirm
  const [pendingNewList, setPendingNewList] = useState<PriceList | null>(null)
  const [addPricesNowOpen, setAddPricesNowOpen] = useState(false)

  function openCreate() {
    setEditingList(null)
    setListModalOpen(true)
  }

  function handleBulkSaved(result: BulkPricesResult) {
    if (!addPricesList) return
    lists.patchStats(addPricesList.pricelistId, {
      totalServices: result.totalServices,
      totalDrugs: result.totalDrugs,
      totalSupplies: result.totalSupplies,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("priceLists.title")}
        eyebrow={t("sidebar.priceLists")}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("priceLists.buttons.createPriceList")}
          </Button>
        }
      />

      <PriceListsGrid
        priceLists={lists.priceLists}
        loading={lists.loading}
        error={lists.error}
        onAddPrices={(pl) => {
          setAddPricesList(pl)
          setShowSkip(false)
          setAddPricesOpen(true)
        }}
        onEdit={(pl) => {
          setEditingList(pl)
          setListModalOpen(true)
        }}
        onDelete={(pl) => setDeletingList(pl)}
        onCreate={openCreate}
        onRetry={lists.refresh}
      />

      {/* Create / edit price list */}
      <PriceListModal
        open={listModalOpen}
        onOpenChange={setListModalOpen}
        priceList={editingList}
        currentDefault={currentDefault}
        onSaved={(created) => {
          lists.refresh()
          setPendingNewList(created)
          setAddPricesNowOpen(true)
        }}
      />

      {/* Post-create: offer the Add Prices flow */}
      <ConfirmDialog
        open={addPricesNowOpen}
        onOpenChange={setAddPricesNowOpen}
        variant="warning"
        title={t("priceLists.messages.addPricesNow")}
        description={t("priceLists.messages.addPricesNowText")}
        confirmLabel={t("priceLists.buttons.addPrices")}
        onConfirm={() => {
          setAddPricesList(pendingNewList)
          setShowSkip(true)
          setAddPricesOpen(true)
          setAddPricesNowOpen(false)
        }}
      />

      {/* Add Prices (bulk transactional save) */}
      {addPricesList ? (
        <AddPricesModal
          open={addPricesOpen}
          onOpenChange={setAddPricesOpen}
          priceList={addPricesList}
          showSkip={showSkip}
          onSaved={handleBulkSaved}
        />
      ) : null}

      {/* Delete price list */}
      <ConfirmDialog
        open={deletingList != null}
        onOpenChange={(v) => {
          if (!v) setDeletingList(null)
        }}
        title={t("priceLists.messages.deleteConfirmTitle")}
        description={
          deletingList &&
          (deletingList.totalServices > 0 ||
            deletingList.totalDrugs > 0 ||
            deletingList.totalSupplies > 0)
            ? t("priceLists.messages.deleteWithAssociationsWarning", {
                services: deletingList.totalServices,
                drugs: deletingList.totalDrugs,
                supplies: deletingList.totalSupplies,
              })
            : t("priceLists.messages.deleteConfirmText")
        }
        onConfirm={async () => {
          if (!deletingList) return
          try {
            await deletePriceList(deletingList.pricelistId)
            toast.success(t("priceLists.messages.deleteSuccess"))
            setDeletingList(null)
            lists.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("priceLists.messages.deleteError")
            )
          }
        }}
      />
    </div>
  )
}
