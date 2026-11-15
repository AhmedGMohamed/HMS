"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DataTablePagination } from "@/components/common/DataTablePagination"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { usePriceLists, useAllPriceLists } from "@/pages/PriceLists/hooks/usePriceLists"
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
 * /price-lists — Price Lists Management root page.
 *
 * Server-paginated card grid (legacy parity) with CRUD + the
 * default-list invariant + the transactional Add Prices flow. Search
 * and pagination are server-driven; modal/confirm state lives at the
 * page level and the grid itself stays presentational.
 */
export default function PriceListsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("priceLists")

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const lists = usePriceLists({ page, pageSize, search })
  // The current default may live on another page/slice, so resolve it from
  // the full list (`?all=true`) and fall back to the loaded page only while
  // the full lookup is unavailable.
  const allLists = useAllPriceLists()
  const defaultKnown = !allLists.loading && allLists.error == null
  const currentDefault = defaultKnown
    ? (allLists.priceLists.find((pl) => pl.isDefault) ?? null)
    : (lists.priceLists.find((pl) => pl.isDefault) ?? null)

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

      <div className="relative max-w-sm">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder={t("priceLists.placeholders.searchPriceLists")}
          aria-label={t("priceLists.placeholders.searchPriceLists")}
          className="ps-9"
        />
      </div>

      <PriceListsGrid
        priceLists={lists.priceLists}
        loading={lists.loading}
        error={lists.error}
        searchActive={Boolean(search.trim())}
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

      {lists.total > 0 ? (
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={lists.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          pageSizes={[10, 25, 50, 100]}
        />
      ) : null}

      {/* Create / edit price list */}
      <PriceListModal
        open={listModalOpen}
        onOpenChange={(next) => {
          setListModalOpen(next)
          // An edit may have moved the default; keep the full-list lookup fresh.
          if (!next) allLists.refresh()
        }}
        priceList={editingList}
        currentDefault={currentDefault}
        defaultKnown={defaultKnown}
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
            // Deleting the last row on a trailing page would strand the
            // user on an empty page — step back one page in that case.
            const remaining = Math.max(0, lists.total - 1)
            const lastPage = Math.max(1, Math.ceil(remaining / pageSize))
            if (page > lastPage) setPage(lastPage)
            lists.refresh()
            allLists.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("priceLists.messages.deleteError")
            )
            /* Keep the dialog open: the delete failed. */
            return false
          }
        }}
      />
    </div>
  )
}
