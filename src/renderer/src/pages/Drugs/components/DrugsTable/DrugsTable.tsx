"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PencilIcon, Trash2Icon, AlertTriangleIcon } from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, formatIntervalHuman, formatNumber } from "@/lib/utils"

import type { EnrichedDrugCard, DrugShipment } from "@/pages/Drugs/types/drug"
import type { KpiFilter } from "@/pages/Drugs/hooks/useDrugsList"
import { DrugShipmentsSubTable } from "./DrugShipmentsSubTable"

interface DrugsTableProps {
  drugs: EnrichedDrugCard[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  filter: KpiFilter
  onFilterChange: (f: KpiFilter) => void
  onEditDrug: (drug: EnrichedDrugCard) => void
  onDeleteDrug: (drug: EnrichedDrugCard) => void
  onAddShipment: (drug: EnrichedDrugCard) => void
  onSell: (shipment: DrugShipment) => void
  onEditShipment: (shipment: DrugShipment) => void
  onDeleteShipment: (shipment: DrugShipment) => void
}

type SortDir = "asc" | "desc"

const FILTER_CHIPS: { value: KpiFilter; key: string }[] = [
  { value: "all", key: "pharmacy.filters.all" },
  { value: "low-stock", key: "pharmacy.filters.lowStock" },
  { value: "near-expiry", key: "pharmacy.filters.nearExpiry" },
]

/**
 * Drugs inventory table (§6.3) — built on `DataTable`.
 *
 * Columns: name · manufacturer/provider · auto-renew/frequency ·
 * total stock · nearest expiry · actions. The leading cell is the
 * expand chevron (handled by DataTable's expand API); a sub-row reveals
 * `DrugShipmentsSubTable` for the expanded drug.
 *
 * Filter chips live in the `toolbar` slot. Click handlers stay the
 * same as the legacy table so parent state is untouched.
 */
export function DrugsTable({
  drugs,
  loading,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onEditDrug,
  onDeleteDrug,
  onAddShipment,
  onSell,
  onEditShipment,
  onDeleteShipment,
}: DrugsTableProps) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sort, setSort] = useState<{
    columnId: string
    direction: SortDir
  } | null>(null)

  const columns = useMemo<ColumnDef<EnrichedDrugCard>[]>(
    () => [
      {
        id: "name",
        header: t("pharmacy.table.drugName"),
        accessor: (d) => d.name,
        sortable: true,
        sortKey: (d) => d.name,
        cell: (d) => (
          <span className="font-medium text-foreground">{d.name}</span>
        ),
      },
      {
        id: "manufacturer",
        header: t("pharmacy.table.manufacturer"),
        sortable: true,
        sortKey: (d) => d.manufacturer ?? d.provider ?? "",
        cell: (d) => (
          <span className="text-sm text-muted-foreground">
            {d.manufacturer || (d.provider ? `— ${d.provider}` : "—")}
          </span>
        ),
      },
      {
        id: "frequency",
        header: t("pharmacy.fields.frequency"),
        sortable: true,
        sortKey: (d) => formatIntervalHuman(d.frequency),
        cell: (d) => {
          const human = formatIntervalHuman(d.frequency)
          if (!d.isObligatoryContinuous && human === "—") {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          return (
            <Badge variant="outline" className="gap-1">
              {d.isObligatoryContinuous
                ? t("pharmacy.fields.isObligatoryContinuous")
                : t("pharmacy.frequency.every")}
              {human !== "—" ? ` · ${human}` : ""}
            </Badge>
          )
        },
      },
      {
        id: "stock",
        header: t("pharmacy.table.totalStock"),
        sortable: true,
        sortKey: (d) =>
          d.totalQuantity != null ? d.totalQuantity : Number.NEGATIVE_INFINITY,
        cell: (d) => {
          if (d.totalQuantity == null) {
            return <span className="text-muted-foreground">—</span>
          }
          const stockLabel = formatNumber(d.totalQuantity)
          if (d.isLowStock) {
            return (
              <Badge
                variant="outline"
                className="gap-1 border-warning/40 bg-warning/5"
              >
                <AlertTriangleIcon
                  aria-hidden
                  className="size-3 text-warning"
                />
                {t("pharmacy.status.lowStock")} · {stockLabel}
              </Badge>
            )
          }
          return (
            <span className="text-foreground tabular-nums">{stockLabel}</span>
          )
        },
      },
      {
        id: "expiry",
        header: t("pharmacy.table.nearestExpiry"),
        sortable: true,
        sortKey: (d) => {
          if (d.nearestExpiryDate) return new Date(d.nearestExpiryDate).getTime()
          if (d.daysUntilExpiry != null) {
            return Date.now() + d.daysUntilExpiry * 86_400_000
          }
          return Number.MAX_SAFE_INTEGER
        },
        cell: (d) => {
          if (!d.nearestExpiryDate) {
            return <span className="text-muted-foreground">—</span>
          }
          const dateLabel = new Date(d.nearestExpiryDate).toLocaleDateString()
          if (d.daysUntilExpiry == null) {
            return <span className="tabular-nums">{dateLabel}</span>
          }
          const days = d.daysUntilExpiry
          if (days <= 7) {
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {dateLabel}
                </span>
                <Badge variant="destructive">
                  {t("pharmacy.daysRemaining", { days })}
                </Badge>
              </div>
            )
          }
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs tabular-nums text-muted-foreground">
                {dateLabel}
              </span>
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/5"
              >
                <AlertTriangleIcon
                  aria-hidden
                  className="size-3 text-warning"
                />
                {t("pharmacy.daysRemaining", { days })}
              </Badge>
            </div>
          )
        },
      },
      {
        id: "actions",
        header: "",
        align: "end",
        className: "w-24",
        cell: (d) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.edit")}
              onClick={(e) => {
                e.stopPropagation()
                onEditDrug(d)
              }}
            >
              <PencilIcon aria-hidden className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.delete")}
              onClick={(e) => {
                e.stopPropagation()
                onDeleteDrug(d)
              }}
            >
              <Trash2Icon
                aria-hidden
                className="size-4 text-destructive"
              />
            </Button>
          </div>
        ),
      },
    ],
    [t, onEditDrug, onDeleteDrug]
  )

  const sorted = useMemo(() => {
    if (!sort) return drugs
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortKey) return drugs
    const k = col.sortKey
    const direction = sort.direction === "asc" ? 1 : -1
    return [...drugs].sort((a, b) => {
      const av = k(a)
      const bv = k(b)
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * direction
      }
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [drugs, sort, columns])

  return (
    <DataTable<EnrichedDrugCard>
      data={sorted}
      columns={columns}
      loading={loading}
      getRowId={(d) => d.drugId}
      search={{
        value: search,
        onChange: onSearchChange,
        placeholder: t("pharmacy.searchPlaceholder"),
      }}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_CHIPS.map((chip) => (
            <Button
              key={chip.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFilterChange(chip.value)}
              className={cn(
                filter === chip.value &&
                  "border-primary bg-primary-light text-primary"
              )}
            >
              {t(chip.key)}
            </Button>
          ))}
        </div>
      }
      expandedRowIds={expandedId != null ? new Set([expandedId]) : new Set()}
      onExpandedChange={(id, next) =>
        setExpandedId(next ? (id as number) : null)
      }
      renderExpanded={(drug) => (
        <DrugShipmentsSubTable
          drugId={drug.drugId}
          onSell={onSell}
          onEdit={onEditShipment}
          onDelete={onDeleteShipment}
          onAddShipment={() => onAddShipment(drug)}
        />
      )}
      emptyTitle={t("pharmacy.messages.noDrugs")}
      emptyDescription={
        filter !== "all"
          ? t("pharmacy.messages.noDrugsMatchFilter")
          : t("pharmacy.messages.noDrugsDesc")
      }
      ariaLabel={t("pharmacy.title")}
      sort={sort}
      onSortToggle={(_id, next) => setSort(next)}
    />
  )
}