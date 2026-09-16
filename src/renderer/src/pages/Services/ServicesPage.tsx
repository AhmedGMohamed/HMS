"use client"

import { useMemo, useState } from "react"
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
import { usePriceLists } from "@/pages/PriceLists/hooks/usePriceLists"
import type { NormalizedService } from "@/pages/_shared/services/types"
import type { ServiceType } from "@/pages/_shared/services/types"
import { ApiError } from "@/lib/errors"

/**
 * /services — Services Management root page (Stage 2 of
 * `phase_6.6_plan.md`).
 *
 * DataTable + toolbar filters (search, type, price list, drug — all
 * client-side), create/edit modal with the per-price-list price
 * matrix + drug picker, and a guarded delete (server 409 for
 * referenced services surfaces the server message).
 */
export default function ServicesPage() {
  const { t } = useTranslation()
  useEnsureNamespace("services")

  const services = useServices()
  const lists = usePriceLists()

  // Filters (all client-side)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<ServiceType | "">("")
  const [priceListFilter, setPriceListFilter] = useState<number | "">("")
  const [drugFilter, setDrugFilter] = useState("")
  const [sort, setSort] = useState<{
    columnId: string
    direction: "asc" | "desc"
  } | null>(null)

  // Modal / confirm state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] =
    useState<NormalizedService | null>(null)
  const [deletingService, setDeletingService] =
    useState<NormalizedService | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const drugQuery = drugFilter.trim().toLowerCase()
    return services.services.filter((service) => {
      if (query && !service.name.toLowerCase().includes(query)) {
        return false
      }
      if (typeFilter && service.serviceType !== typeFilter) return false
      if (
        priceListFilter !== "" &&
        !service.prices.some((p) => p.pricelistId === priceListFilter)
      ) {
        return false
      }
      if (
        drugQuery &&
        !service.drugs.some((d) => d.name.toLowerCase().includes(drugQuery))
      ) {
        return false
      }
      return true
    })
  }, [
    services.services,
    search,
    typeFilter,
    priceListFilter,
    drugFilter,
  ])

  function openCreate() {
    setEditingService(null)
    setModalOpen(true)
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
        services={filtered}
        priceLists={lists.priceLists}
        loading={services.loading}
        search={{ value: search, onChange: setSearch }}
        toolbar={
          <ServiceFilters
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            priceListFilter={priceListFilter}
            onPriceListFilterChange={setPriceListFilter}
            drugFilter={drugFilter}
            onDrugFilterChange={setDrugFilter}
            priceLists={lists.priceLists}
          />
        }
        sort={sort}
        onSortToggle={(_id, next) => setSort(next)}
        emptyTitle={
          services.error
            ? t("services.messages.loadServicesError")
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
