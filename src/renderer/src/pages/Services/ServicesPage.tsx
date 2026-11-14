"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { useServices } from "@/pages/Services/hooks/useServices"
import { ServiceFilters } from "@/pages/Services/components/ServiceFilters"
import { ServicesTable } from "@/pages/Services/components/ServicesTable"
import { ServiceModal } from "@/pages/Services/modals/ServiceModal"
import { deleteService } from "@/pages/Services/api"
import { useAllPriceLists } from "@/pages/PriceLists/hooks/usePriceLists"
import type { NormalizedService } from "@/pages/_shared/services/types"
import type { ServiceType } from "@/pages/_shared/services/types"
import { ApiError } from "@/lib/errors"

/**
 * /services — Services Management root page.
 *
 * Server-driven DataTable: search, type, price-list, drug, sort,
 * page, and page size all become `/api/services` query parameters.
 * The create/edit modal keeps the per-price-list price matrix + drug
 * picker, and deletion is guarded (server 409 for referenced
 * services surfaces the server message).
 */
export default function ServicesPage() {
  const { t } = useTranslation()
  useEnsureNamespace("services")

  // Filters (server-side) + pagination
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<ServiceType | "">("")
  const [priceListFilter, setPriceListFilter] = useState<number | "">("")
  const [drugFilter, setDrugFilter] = useState("")
  const [sort, setSort] = useState<{
    columnId: string
    direction: "asc" | "desc"
  } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const services = useServices({
    page,
    pageSize,
    search,
    serviceType: typeFilter,
    pricelistId: priceListFilter,
    drug: drugFilter,
    sort,
  })
  const lists = useAllPriceLists()

  const hasFilters = Boolean(
    search.trim() || typeFilter || priceListFilter !== "" || drugFilter.trim()
  )

  // Modal / confirm state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] =
    useState<NormalizedService | null>(null)
  const [deletingService, setDeletingService] =
    useState<NormalizedService | null>(null)

  function openCreate() {
    setEditingService(null)
    setModalOpen(true)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleTypeFilterChange(value: ServiceType | "") {
    setTypeFilter(value)
    setPage(1)
  }

  function handlePriceListFilterChange(value: number | "") {
    setPriceListFilter(value)
    setPage(1)
  }

  function handleDrugFilterChange(value: string) {
    setDrugFilter(value)
    setPage(1)
  }

  function handleSortToggle(
    _id: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) {
    setSort(next)
    setPage(1)
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("services.title")}
        eyebrow={t("sidebar.services")}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("services.buttons.createService")}
          </Button>
        }
      />

      <ServicesTable
        services={services.services}
        priceLists={lists.priceLists}
        loading={services.loading}
        search={{ value: search, onChange: handleSearchChange }}
        toolbar={
          <ServiceFilters
            typeFilter={typeFilter}
            onTypeFilterChange={handleTypeFilterChange}
            priceListFilter={priceListFilter}
            onPriceListFilterChange={handlePriceListFilterChange}
            drugFilter={drugFilter}
            onDrugFilterChange={handleDrugFilterChange}
            priceLists={lists.priceLists}
          />
        }
        pagination={{
          page,
          pageSize,
          total: services.total,
          onPageChange: setPage,
          onPageSizeChange: handlePageSizeChange,
          pageSizes: [10, 25, 50, 100],
        }}
        sort={sort}
        onSortToggle={handleSortToggle}
        emptyTitle={
          services.error
            ? t("services.messages.loadServicesError")
            : hasFilters && !services.loading
              ? t("services.messages.noMatches")
              : undefined
        }
        emptyDescription={
          services.error
            ? undefined
            : hasFilters && !services.loading
              ? t("services.messages.noMatchesDesc")
              : undefined
        }
        emptyAction={
          services.error ? (
            <Button onClick={services.refresh}>
              {t("services.buttons.retry")}
            </Button>
          ) : undefined
        }
        onEdit={(service) => {
          setEditingService(service)
          setModalOpen(true)
        }}
        onDelete={(service) => setDeletingService(service)}
      />

      {/* Create / edit service */}
      <ServiceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        service={editingService}
        priceLists={lists.priceLists}
        onSaved={services.refresh}
      />

      {/* Delete service */}
      <ConfirmDialog
        open={deletingService != null}
        onOpenChange={(v) => {
          if (!v) setDeletingService(null)
        }}
        variant="danger"
        title={t("services.messages.deleteConfirmTitle")}
        description={t("services.messages.deleteConfirmText")}
        onConfirm={async () => {
          if (!deletingService) return
          try {
            await deleteService(deletingService.serviceId)
            toast.success(t("services.messages.deleteSuccess"))
            setDeletingService(null)
            services.refresh()
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : t("services.messages.deleteError")
            )
          }
        }}
      />
    </div>
  )
}
