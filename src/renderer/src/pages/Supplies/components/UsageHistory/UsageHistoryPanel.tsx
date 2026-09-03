"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIcon, CheckCircle2Icon, SearchIcon } from "lucide-react"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  formatNumber,
  formatCurrency,
  formatDateTime,
  resolveLocale,
  cn,
} from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"

import type {
  MedicalSupplyUsageRow,
  SupplyUsageFilters,
} from "@/pages/Supplies/types/supply"
import { UsageSummaryCards } from "./UsageSummaryCards"

type SortDir = "asc" | "desc"
type StatusFilter = "all" | "active" | "completed"

interface UsageHistoryPanelProps {
  rows: MedicalSupplyUsageRow[]
  loading: boolean
  error: Error | null
  summary: import("@/pages/Supplies/types/supply").SupplyUsageSummaryMetrics | null
  loadingSummary: boolean
  setFilters: (f: SupplyUsageFilters) => void
}

/**
 * Usage History tab (design plan §6.3.3).
 *
 * Composition: 3 summary cards on top, then a filter bar (date range,
 * patient search, status chip group), then a paginated DataTable of
 * audit rows. Filters are mirrored on `SupplyUsageFilters` so the
 * table and the summary always reflect the same scope.
 */
export function UsageHistoryPanel({
  rows,
  loading,
  error,
  summary,
  loadingSummary,
  setFilters,
}: UsageHistoryPanelProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [patient, setPatient] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")

  const [sort, setSort] = useState<{
    columnId: string
    direction: SortDir
  } | null>({
    columnId: "date",
    direction: "desc",
  })

  function applyFilters() {
    setFilters({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      isActive:
        status === "all"
          ? undefined
          : status === "active",
      search: patient.trim() || undefined,
    })
  }

  function resetFilters() {
    setStartDate("")
    setEndDate("")
    setPatient("")
    setStatus("all")
    setFilters({})
  }

  // The backend now supports the `search` query parameter as a
  // substring match on `Patient.name` (see `phase_6.5_backend_plan.md`
  // §5.1 + the `MedicalSupplyUsageFilters.search` field). The
  // previous client-side fallback was removed because it silently
  // dropped matches outside the first 25-row page.
  const filtered = useMemo<MedicalSupplyUsageRow[]>(() => {
    return rows
  }, [rows])

  const columns = useMemo<ColumnDef<MedicalSupplyUsageRow>[]>(
    () => [
      {
        id: "date",
        header: t("medicalSupplies.usage.date"),
        sortable: true,
        sortKey: (r) => new Date(r.startDate).getTime(),
        cell: (r) => (
          <span className="text-muted-foreground">
            {formatDateTime(new Date(r.startDate), language)}
          </span>
        ),
      },
      {
        id: "patient",
        header: t("medicalSupplies.usage.patient"),
        sortable: true,
        sortKey: (r) => r.patientName,
        cell: (r) => (
          <span className="font-medium text-foreground">{r.patientName}</span>
        ),
      },
      {
        id: "supply",
        header: t("medicalSupplies.usage.supply"),
        sortable: true,
        sortKey: (r) => r.supplyName,
        cell: (r) => <span className="text-foreground">{r.supplyName}</span>,
      },
      {
        id: "initialQty",
        header: t("medicalSupplies.usage.initialQty"),
        numeric: true,
        sortable: true,
        sortKey: (r) => r.initialQuantity,
        cell: (r) => (
          <span className="tabular-nums">{formatNumber(r.initialQuantity)}</span>
        ),
      },
      {
        id: "remainingQty",
        header: t("medicalSupplies.usage.remainingQty"),
        numeric: true,
        sortable: true,
        sortKey: (r) => r.remainingQuantity,
        cell: (r) => (
          <span className="tabular-nums">{formatNumber(r.remainingQuantity)}</span>
        ),
      },
      {
        id: "unitPrice",
        header: t("medicalSupplies.fields.unitPrice"),
        numeric: true,
        sortable: true,
        sortKey: (r) => Number(r.unitPrice ?? 0),
        cell: (r) => (
          <span className="tabular-nums">
            {r.unitPrice != null
              ? formatCurrency(Number(r.unitPrice), resolveLocale(language))
              : "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: t("medicalSupplies.usage.status"),
        sortable: true,
        sortKey: (r) => (r.isActive ? 1 : 0),
        cell: (r) =>
          r.isActive ? (
            <Badge variant="default" className="gap-1">
              <ActivityIcon aria-hidden className="size-3" />
              {t("medicalSupplies.usage.statusActive")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2Icon aria-hidden className="size-3" />
              {t("medicalSupplies.usage.statusCompleted")}
            </Badge>
          ),
      },
    ],
    [t, language]
  )

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortKey) return filtered
    const k = col.sortKey
    const direction = sort.direction === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = k(a)
      const bv = k(b)
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * direction
      }
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [filtered, sort, columns])

  return (
    <div className="flex flex-col gap-6">
      <UsageSummaryCards summary={summary} loading={loadingSummary} />

      <DataTable<MedicalSupplyUsageRow>
        data={sorted}
        columns={columns}
        loading={loading}
        getRowId={(r) => r.usageId}
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("common.startDate")}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("common.endDate")}
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("medicalSupplies.usage.patient")}
              </label>
              <div className="relative">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 inset-s-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                  placeholder={t("medicalSupplies.usage.patient")}
                  className="ps-9"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t("medicalSupplies.usage.statusFilter")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "active", "completed"] as StatusFilter[]).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus(s)}
                    className={cn(
                      status === s && "border-primary bg-primary-light text-primary"
                    )}
                  >
                    {s === "all"
                      ? t("medicalSupplies.usage.statusAll")
                      : s === "active"
                        ? t("medicalSupplies.usage.statusActive")
                        : t("medicalSupplies.usage.statusCompleted")}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={applyFilters}
              disabled={loading}
            >
              {t("common.apply")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
            >
              {t("common.reset")}
            </Button>
          </div>
        }
        emptyTitle={t("medicalSupplies.usage.empty")}
        emptyDescription={
          error
            ? t("medicalSupplies.usage.loadError")
            : t("medicalSupplies.usage.empty")
        }
        ariaLabel={t("medicalSupplies.usage.title")}
        sort={sort}
        onSortToggle={(_id, next) => setSort(next)}
      />
    </div>
  )
}
