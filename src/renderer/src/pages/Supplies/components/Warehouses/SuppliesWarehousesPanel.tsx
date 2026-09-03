"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  EyeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { formatNumber } from "@/lib/utils"

import type { WarehouseWithStats } from "@/pages/_shared/pharmacy/types"
import { WarehouseModal } from "@/pages/Drugs/modals/WarehouseModal"
import { WarehouseSupplyInventoryDialog } from "@/pages/Supplies/modals/WarehouseSupplyInventoryDialog"

interface SuppliesWarehousesPanelProps {
  warehouses: WarehouseWithStats[]
  loading: boolean
  onCreate: (values: { name: string; location: string }) => Promise<void>
  onUpdate: (
    id: number,
    values: { name: string; location: string }
  ) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

/**
 * Warehouses tab for the Supplies module (design plan §6.3.2).
 *
 * Mirrors `WarehousesPanel` from the Drugs page — same flat CRUD
 * table, same add/edit/delete actions, but the "View Inventory"
 * action opens `WarehouseSupplyInventoryDialog` (supply-specific
 * stats) instead of the drugs dialog.
 */
export function SuppliesWarehousesPanel({
  warehouses,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: SuppliesWarehousesPanelProps) {
  const { t } = useTranslation()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseWithStats | null>(null)
  const [deleting, setDeleting] = useState<WarehouseWithStats | null>(null)
  const [viewing, setViewing] = useState<WarehouseWithStats | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(w: WarehouseWithStats) {
    setEditing(w)
    setModalOpen(true)
  }

  return (
    <Card className="overflow-hidden border border-border shadow-xs">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">
            {t("medicalSupplies.warehouses.title")}
          </span>
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon aria-hidden className="me-1.5 size-4" />
            {t("medicalSupplies.warehouses.addWarehouse")}
          </Button>
        </div>

        <div role="region" className="overflow-x-auto">
          <Table aria-label={t("medicalSupplies.warehouses.title")}>
            <TableHeader className="sticky top-0 bg-surface-muted">
              <TableRow className="hover:bg-transparent">
                <TableCell className="p-2 h-12 font-medium text-muted-foreground">
                  {t("medicalSupplies.table.warehouseName")}
                </TableCell>
                <TableCell className="p-2 h-12 font-medium text-muted-foreground">
                  {t("medicalSupplies.table.location")}
                </TableCell>
                <TableCell className="p-2 h-12 font-medium text-muted-foreground text-end">
                  {t("medicalSupplies.table.totalShipments")}
                </TableCell>
                <TableCell className="p-2 h-12 text-end" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="p-2 h-12">
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell className="p-2 h-12">
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell className="p-2 h-12">
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell className="p-2 h-12">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              ) : warehouses.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-32 p-0 align-middle">
                    <EmptyState
                      title={t("medicalSupplies.warehouses.noWarehousesTitle")}
                      description={t("medicalSupplies.warehouses.noWarehouses")}
                      action={
                        <Button type="button" size="sm" onClick={openCreate}>
                          <PlusIcon aria-hidden className="me-1.5 size-3.5" />
                          {t("medicalSupplies.buttons.addFirstWarehouse")}
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                warehouses.map((w) => (
                  <TableRow
                    key={w.warehouseId}
                    className="transition-colors hover:bg-primary-light/60"
                  >
                    <TableCell className="p-2 h-12 font-medium text-foreground">
                      {w.name}
                    </TableCell>
                    <TableCell className="p-2 h-12 text-muted-foreground">
                      {w.location}
                    </TableCell>
                    <TableCell className="p-2 h-12 text-end tabular-nums">
                      {formatNumber(w.totalShipments)}
                    </TableCell>
                    <TableCell className="p-2 h-12 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("medicalSupplies.warehouses.viewInventory")}
                          onClick={() => setViewing(w)}
                        >
                          <EyeIcon aria-hidden className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("common.edit")}
                          onClick={() => openEdit(w)}
                        >
                          <PencilIcon aria-hidden className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("common.delete")}
                          onClick={() => setDeleting(w)}
                        >
                          <Trash2Icon aria-hidden className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <WarehouseModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        warehouseId={editing?.warehouseId}
        name={editing?.name}
        location={editing?.location}
        onSubmit={async (values) => {
          if (editing) {
            await onUpdate(editing.warehouseId, values)
          } else {
            await onCreate(values)
          }
        }}
      />

      <WarehouseSupplyInventoryDialog
        open={viewing != null}
        onOpenChange={(v) => {
          if (!v) setViewing(null)
        }}
        warehouse={viewing}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(v) => {
          if (!v) setDeleting(null)
        }}
        title={t("medicalSupplies.warehouses.deleteTitle")}
        description={t("medicalSupplies.warehouses.deleteText", {
          name: deleting?.name ?? "",
        })}
        onConfirm={async () => {
          if (deleting) {
            await onDelete(deleting.warehouseId)
            setDeleting(null)
          }
        }}
      />
    </Card>
  )
}
