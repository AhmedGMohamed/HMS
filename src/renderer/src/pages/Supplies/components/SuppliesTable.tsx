"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PencilIcon, Trash2Icon, AlertTriangleIcon } from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatIntervalHuman, formatNumber, cn } from "@/lib/utils"

import type {
  EnrichedMedicalSupply,
  MedicalSupplyShipment,
} from "@/pages/Supplies/types/supply"
import type { KpiFilter } from "@/pages/Supplies/hooks/useSuppliesList"
import { SupplyShipmentsSubTable } from "./SupplyShipmentsSubTable"

interface SuppliesTableProps {
  supplies: EnrichedMedicalSupply[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  filter: KpiFilter
  onFilterChange: (f: KpiFilter) => void
  onEditSupply: (supply: EnrichedMedicalSupply) => void
  onDeleteSupply: (supply: EnrichedMedicalSupply) => void
  onAddShipment: (supply: EnrichedMedicalSupply) => void
  onDispense: (shipment: MedicalSupplyShipment) => void
  onEditShipment: (shipment: MedicalSupplyShipment) => void
  onDeleteShipment: (shipment: MedicalSupplyShipment) => void
}

type SortDir = "asc" | "desc"

const FILTER_CHIPS: { value: KpiFilter; key: string }[] = [
  { value: "all", key: "medicalSupplies.filters.all" },
  { value: "low-stock", key: "medicalSupplies.filters.lowStock" },
  { value: "near-expiry", key: "medicalSupplies.filters.expiringSoon" },
]

/**
 * Supplies inventory table (design plan §6.3.1) — built on
 * `DataTable`. Mirrors `DrugsTable` with two material differences:
 *
 *  - No `unit_conversion` column. Total Stock is a single integer
 *    (the plan's "eliminates conversion arithmetic" advantage).
 *  - Manufacturer + Provider collapse into a single secondary line
 *    under the supply name (not a separate column).
 *
 * The filter chips mirror the KPI strip's filter state — both call
 * the same `setFilter`. The expandable row reveals
 * `SupplyShipmentsSubTable`.
 */
export function SuppliesTable({
  supplies,
  loading,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onEditSupply,
  onDeleteSupply,
  onAddShipment,
  onDispense,
  onEditShipment,
  onDeleteShipment,
}: SuppliesTableProps) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sort, setSort] = useState<{
    columnId: string
    direction: SortDir
  } | null>(null)

  const columns = useMemo<ColumnDef<EnrichedMedicalSupply>[]>(
    () => [
      {
        id: "name",
        header: t("medicalSupplies.table.supplyName"),
        accessor: (s) => s.name,
        sortable: true,
        sortKey: (s) => s.name,
        cell: (s) => (
          <span className="font-medium text-foreground">{s.name}</span>
        ),
      },
      {
        id: "manufacturer",
        header: t("medicalSupplies.table.manufacturer"),
        sortable: true,
        sortKey: (s) => s.manufacturer ?? s.provider ?? "",
        cell: (s) => (
          <span className="text-sm text-muted-foreground">
            {s.manufacturer || (s.provider ? `— ${s.provider}` : "—")}
          </span>
        ),
      },
      {
        id: "frequency",
        header: t("medicalSupplies.fields.frequency"),
        sortable: true,
        sortKey: (s) => formatIntervalHuman(s.frequency),
        cell: (s) => {
          const human = formatIntervalHuman(s.frequency)
          if (!s.isObligatoryContinuous && human === "—") {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          return (
            <Badge variant="outline" className="gap-1">
              {s.isObligatoryContinuous
                ? t("medicalSupplies.fields.isObligatoryContinuous")
                : t("medicalSupplies.frequency.every")}
              {human !== "—" ? ` · ${human}` : ""}
            </Badge>
          )
        },
      },
      {
        id: "stock",
        header: t("medicalSupplies.table.totalStock"),
        sortable: true,
        sortKey: (s) =>
          s.totalQuantity != null ? s.totalQuantity : Number.NEGATIVE_INFINITY,
        cell: (s) => {
          if (s.totalQuantity == null) {
            return <span className="text-muted-foreground">—</span>
          }
          const stockLabel = formatNumber(s.totalQuantity)
          if (s.isLowStock) {
            return (
              <Badge
                variant="outline"
                className="gap-1 border-warning/40 bg-warning/5"
              >
                <AlertTriangleIcon
                  aria-hidden
                  className="size-3 text-warning"
                />
                {t("medicalSupplies.status.lowStock")} · {stockLabel}
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
        header: t("medicalSupplies.table.nearestExpiry"),
        sortable: true,
        sortKey: (s) => {
          if (s.nearestExpiryDate) return new Date(s.nearestExpiryDate).getTime()
          if (s.daysUntilExpiry != null) {
            return Date.now() + s.daysUntilExpiry * 86_400_000
          }
          return Number.MAX_SAFE_INTEGER
        },
        cell: (s) => {
          if (!s.nearestExpiryDate) {
            return <span className="text-muted-foreground">—</span>
          }
          const dateLabel = new Date(s.nearestExpiryDate).toLocaleDateString()
          if (s.daysUntilExpiry == null) {
            return <span className="tabular-nums">{dateLabel}</span>
          }
          const days = s.daysUntilExpiry
          if (days <= 7) {
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {dateLabel}
                </span>
                <Badge variant="destructive">
                  {t("medicalSupplies.daysRemaining", { days })}
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
                {t("medicalSupplies.daysRemaining", { days })}
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
        cell: (s) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.edit")}
              onClick={(e) => {
                e.stopPropagation()
                onEditSupply(s)
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
                onDeleteSupply(s)
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
    [t, onEditSupply, onDeleteSupply]
  )

  const sorted = useMemo(() => {
    if (!sort) return supplies
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortKey) return supplies
    const k = col.sortKey
    const direction = sort.direction === "asc" ? 1 : -1
    return [...supplies].sort((a, b) => {
      const av = k(a)
      const bv = k(b)
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * direction
      }
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [supplies, sort, columns])

  return (
    <DataTable<EnrichedMedicalSupply>
      data={sorted}
      columns={columns}
      loading={loading}
      getRowId={(s) => s.supplyId}
      search={{
        value: search,
        onChange: onSearchChange,
        placeholder: t("medicalSupplies.searchPlaceholder"),
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
      renderExpanded={(supply) => (
        <SupplyShipmentsSubTable
          supplyId={supply.supplyId}
          onDispense={onDispense}
          onEdit={onEditShipment}
          onDelete={onDeleteShipment}
          onAddShipment={() => onAddShipment(supply)}
        />
      )}
      emptyTitle={t("medicalSupplies.messages.noSupplies")}
      emptyDescription={
        filter !== "all"
          ? t("medicalSupplies.messages.noSuppliesMatchFilter")
          : t("medicalSupplies.messages.noSuppliesDesc")
      }
      ariaLabel={t("medicalSupplies.title")}
      sort={sort}
      onSortToggle={(_id, next) => setSort(next)}
    />
  )
}
