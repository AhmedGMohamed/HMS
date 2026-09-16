"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  CheckIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency, formatNumber, resolveLocale } from "@/lib/utils"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"
import type {
  NormalizedService,
  ServicePrice,
} from "@/pages/_shared/services/types"

export interface ServicesTableProps {
  services: NormalizedService[]
  priceLists: PriceListWithStats[]
  loading: boolean
  /** Service-name search — wired into the DataTable search slot. */
  search: { value: string; onChange: (value: string) => void }
  /** Extra filters (type / price list / drug) rendered left of search. */
  toolbar: React.ReactNode
  sort: { columnId: string; direction: "asc" | "desc" } | null
  onSortToggle: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  onEdit: (service: NormalizedService) => void
  onDelete: (service: NormalizedService) => void
}

/**
 * Services DataTable (§3 of `phase_6.6_plan.md`): name, type badge,
 * auto-renew / auto-add flags, per-list price badges (prepayment info
 * on hover), associated-drug badges, and the actions column. Sorting
 * is client-side and caller-owned (`sort` + `onSortToggle`).
 */
export function ServicesTable({
  services,
  priceLists,
  loading,
  search,
  toolbar,
  sort,
  onSortToggle,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onEdit,
  onDelete,
}: ServicesTableProps) {
  const { t, i18n } = useTranslation()
  const locale = resolveLocale(i18n.language)

  const sorted = useMemo(() => {
    if (!sort) return services
    const direction = sort.direction === "asc" ? 1 : -1
    return [...services].sort((a, b) => {
      if (sort.columnId === "serviceType") {
        return a.serviceType.localeCompare(b.serviceType) * direction
      }
      return a.name.localeCompare(b.name) * direction
    })
  }, [services, sort])

  function priceListName(pricelistId: number): string {
    return (
      priceLists.find((pl) => pl.pricelistId === pricelistId)?.name ??
      `#${pricelistId}`
    )
  }

  function prepaymentText(price: ServicePrice): string | null {
    if (
      !price.requiresPrepayment ||
      price.prepaymentType == null ||
      price.prepaymentAmount == null
    ) {
      return null
    }
    const amount = Number(price.prepaymentAmount)
    if (!Number.isFinite(amount)) return null
    const amountLabel =
      price.prepaymentType === "percentage"
        ? `${formatNumber(amount)}%`
        : formatCurrency(amount, locale)
    return `${t(`services.prepaymentTypes.${price.prepaymentType}`)} — ${amountLabel}`
  }

  const columns: ColumnDef<NormalizedService>[] = [
    {
      id: "name",
      header: t("services.table.serviceName"),
      sortable: true,
      cell: (service) => (
        <span className="font-medium">{service.name}</span>
      ),
    },
    {
      id: "serviceType",
      header: t("services.table.type"),
      sortable: true,
      cell: (service) => (
        <Badge variant="secondary">
          {t(`services.serviceTypes.${service.serviceType}`)}
        </Badge>
      ),
    },
    {
      id: "autoRenew",
      header: t("services.table.autoRenew"),
      cell: (service) =>
        service.autoRenew ? (
          <CheckIcon aria-hidden className="size-4 text-primary" />
        ) : (
          <XIcon aria-hidden className="size-4 text-muted-foreground" />
        ),
    },
    {
      id: "autoAdd",
      header: t("services.table.autoAdd"),
      cell: (service) =>
        service.autoAddOnAdmission ? (
          <CheckIcon aria-hidden className="size-4 text-primary" />
        ) : (
          <XIcon aria-hidden className="size-4 text-muted-foreground" />
        ),
    },
    {
      id: "priceLists",
      header: t("services.table.priceLists"),
      cell: (service) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {service.prices.map((price) => {
            const prep = prepaymentText(price)
            const badge = (
              <Badge variant="outline" className="tabular-nums">
                {priceListName(price.pricelistId)}:{" "}
                {formatCurrency(Number(price.price), locale)}
              </Badge>
            )
            return prep ? (
              <Tooltip key={price.pricelistId}>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-default">
                    {badge}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("services.fields.prepaymentRequired")} — {prep}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={price.pricelistId} className="inline-flex">
                {badge}
              </span>
            )
          })}
          {service.prices.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "drugs",
      header: t("services.table.associatedDrugs"),
      cell: (service) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {service.drugs.map((drug) => (
            <Badge key={drug.drugId} variant="secondary">
              {drug.name}
            </Badge>
          ))}
          {service.drugs.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "end",
      className: "w-24",
      cell: (service) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.edit")}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(service)
            }}
          >
            <PencilIcon aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.delete")}
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(service)
            }}
          >
            <Trash2Icon aria-hidden className="size-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DataTable<NormalizedService>
      data={sorted}
      columns={columns}
      loading={loading}
      search={{ value: search.value, onChange: search.onChange }}
      toolbar={toolbar}
      getRowId={(service) => service.serviceId}
      sort={sort}
      onSortToggle={onSortToggle}
      emptyTitle={
        emptyTitle ??
        (search.value.trim()
          ? t("common.noData")
          : t("services.messages.noServices"))
      }
      emptyDescription={
        emptyDescription ??
        (search.value.trim()
          ? undefined
          : t("services.messages.noServicesDesc"))
      }
      emptyAction={emptyAction}
      ariaLabel={t("services.title")}
    />
  )
}
