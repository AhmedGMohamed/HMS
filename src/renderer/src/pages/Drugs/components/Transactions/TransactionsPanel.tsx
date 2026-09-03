"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Badge } from "@/components/ui/badge"

import { formatNumber, formatCurrency, resolveLocale, formatDateTime } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import { useDrugTransactions } from "@/pages/Drugs/hooks/useDrugTransactions"
import type {
  DrugTransaction,
  TransactionFilters,
  TransactionType,
} from "@/pages/Drugs/types/drug"
import { TransactionSummaryCards } from "./TransactionSummaryCards"

type SortDir = "asc" | "desc"

const typeVariant: Record<
  TransactionType,
  "default" | "secondary" | "outline"
> = {
  patient: "default",
  check: "secondary",
  outside: "outline",
}

/**
 * Transactions tab (§6.6) — filter bar + summary cards + table.
 *
 * Filters: date range (start/end), type, drug, warehouse. Patient
 * name is rendered for patient/check sales (the `patientName` field
 * comes from the `DrugTransaction.patient_id` join). Outside sales
 * (no patient) render an em dash. Built on `DataTable` for column sort
 * + consistent toolbar.
 */
export function TransactionsPanel() {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const { transactions, summary, loading, loadingSummary, setFilters } =
    useDrugTransactions()

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [type, setType] = useState<"" | TransactionType>("")
  const [drugId, setDrugId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")

  const [sort, setSort] = useState<{
    columnId: string
    direction: SortDir
  } | null>({
    columnId: "timestamp",
    direction: "desc",
  })

  function applyFilters() {
    const next: TransactionFilters = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      transactionType: type || undefined,
      drugId: drugId ? Number(drugId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
    }
    setFilters(next)
  }

  function resetFilters() {
    setStartDate("")
    setEndDate("")
    setType("")
    setDrugId("")
    setWarehouseId("")
    setFilters({})
  }

  const columns = useMemo<ColumnDef<DrugTransaction>[]>(
    () => [
      {
        id: "timestamp",
        header: t("pharmacy.transactions.timestamp"),
        sortable: true,
        sortKey: (tx) => new Date(tx.timestamp).getTime(),
        cell: (tx) => (
          <span className="text-muted-foreground">
            {formatDateTime(new Date(tx.timestamp), language)}
          </span>
        ),
      },
      {
        id: "drug",
        header: t("pharmacy.transactions.drug"),
        sortable: true,
        sortKey: (tx) => tx.drugName,
        cell: (tx) => (
          <span className="font-medium text-foreground">{tx.drugName}</span>
        ),
      },
      {
        id: "warehouse",
        header: t("pharmacy.transactions.warehouse"),
        sortable: true,
        sortKey: (tx) => tx.warehouseName,
        cell: (tx) => (
          <span className="text-muted-foreground">{tx.warehouseName}</span>
        ),
      },
      {
        id: "quantity",
        header: t("common.quantity"),
        numeric: true,
        sortable: true,
        sortKey: (tx) => tx.quantity,
        cell: (tx) => (
          <span className="tabular-nums">{formatNumber(tx.quantity)}</span>
        ),
      },
      {
        id: "price",
        header: t("pharmacy.transactions.price"),
        numeric: true,
        sortable: true,
        sortKey: (tx) => tx.price,
        cell: (tx) => (
          <span className="tabular-nums">
            {formatCurrency(tx.price, resolveLocale(language))}
          </span>
        ),
      },
      {
        id: "type",
        header: t("pharmacy.transactions.type"),
        sortable: true,
        sortKey: (tx) => tx.transactionType,
        cell: (tx) => (
          <Badge variant={typeVariant[tx.transactionType]}>
            {t(`pharmacy.transactionTypes.${tx.transactionType}`)}
          </Badge>
        ),
      },
      {
        id: "patient",
        header: t("pharmacy.transactions.patient"),
        cell: (tx) => (
          <span className="text-muted-foreground">{tx.patientName ?? "—"}</span>
        ),
      },
    ],
    [t, language]
  )

  const sorted = useMemo(() => {
    if (!sort) return transactions
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortKey) return transactions
    const k = col.sortKey
    const direction = sort.direction === "asc" ? 1 : -1
    return [...transactions].sort((a, b) => {
      const av = k(a)
      const bv = k(b)
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * direction
      }
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [transactions, sort, columns])

  return (
    <div className="flex flex-col gap-6">
      <TransactionSummaryCards summary={summary} loading={loadingSummary} />

      <DataTable<DrugTransaction>
        data={sorted}
        columns={columns}
        loading={loading}
        getRowId={(tx) => tx.transactionId}
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pharmacy.transactions.startDate")}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pharmacy.transactions.endDate")}
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pharmacy.transactions.type")}
              </label>
              <NativeSelect
                value={type}
                onChange={(e) => setType(e.target.value as "" | TransactionType)}
              >
                <NativeSelectOption value="">
                  {t("pharmacy.transactions.typeAll")}
                </NativeSelectOption>
                <NativeSelectOption value="patient">
                  {t("pharmacy.transactions.typePatient")}
                </NativeSelectOption>
                <NativeSelectOption value="check">
                  {t("pharmacy.transactions.typeCheck")}
                </NativeSelectOption>
                <NativeSelectOption value="outside">
                  {t("pharmacy.transactions.typeOutside")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pharmacy.transactions.drug")}
              </label>
              <Input
                type="number"
                value={drugId}
                onChange={(e) => setDrugId(e.target.value)}
                placeholder="ID"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t("pharmacy.transactions.warehouse")}
              </label>
              <Input
                type="number"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                placeholder="ID"
              />
            </div>
            <Button type="button" size="sm" onClick={applyFilters}>
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
        emptyTitle={t("pharmacy.transactions.empty")}
        ariaLabel={t("pharmacy.transactions.title")}
        sort={sort}
        onSortToggle={(_id, next) => setSort(next)}
      />
    </div>
  )
}