"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  EyeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

import { formatNumber } from "@/lib/utils"
import type { WarehouseWithStats } from "@/pages/Drugs/types/drug"
import { WarehouseModal } from "@/pages/Drugs/modals/WarehouseModal"
import { WarehouseInventoryDialog } from "@/pages/Drugs/modals/WarehouseInventoryDialog"

interface WarehousesPanelProps {
  warehouses: WarehouseWithStats[]
  loading: boolean
  onCreate: (values: { name: string; location: string }) => Promise<void>
  onUpdate: (
    id: number,
    values: { name: string; location: string }
  ) => Promise<void>
  onDelete: (id: number) => Promise<void>
  loadInventory: (id: number) => Promise<import("@/pages/Drugs/types/drug").DrugShipment[]>
}

/**
 * Warehouses tab (§6.5) — flat CRUD table.
 *
 * Columns: Name · Location · Total Shipments (`tabular-nums`) · Actions
 * (Edit / View Inventory / Delete). "View Inventory" opens the summary +
 * breakdown dialog; delete is gated by `ConfirmDialog`.
 */
export function WarehousesPanel({
  warehouses,
  loading,
  onCreate,
  onUpdate,
  onDelete,
  loadInventory,
}: WarehousesPanelProps) {
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
            {t("pharmacy.sections.existingWarehouses")}
          </span>
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon aria-hidden className="me-1.5 size-4" />
            {t("pharmacy.buttons.addWarehouse")}
          </Button>
        </div>

        <div role="region" className="overflow-x-auto">
          <Table aria-label={t("pharmacy.sections.existingWarehouses")}>
            <TableHeader className="sticky top-0 bg-surface-muted">
              <TableRow className="hover:bg-transparent">
                <TableCell className="p-2 h-12 font-medium text-muted-foreground">
                  {t("pharmacy.table.warehouseName")}
                </TableCell>
                <TableCell className="p-2 h-12 font-medium text-muted-foreground">
                  {t("pharmacy.table.location")}
                </TableCell>
                <TableCell className="p-2 h-12 font-medium text-muted-foreground text-end">
                  {t("pharmacy.table.totalShipments")}
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
                      title={t("pharmacy.messages.noWarehousesTitle")}
                      description={t("pharmacy.messages.noWarehouses")}
                      action={
                        <Button type="button" size="sm" onClick={openCreate}>
                          <PlusIcon aria-hidden className="me-1.5 size-3.5" />
                          {t("pharmacy.buttons.addFirstWarehouse")}
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
                          aria-label={t("pharmacy.buttons.viewInventory")}
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

      <WarehouseInventoryDialog
        open={viewing != null}
        onOpenChange={(v) => {
          if (!v) setViewing(null)
        }}
        warehouse={viewing}
        loadInventory={loadInventory}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(v) => {
          if (!v) setDeleting(null)
        }}
        title={t("pharmacy.messages.deleteWarehouseTitle")}
        description={t("pharmacy.messages.deleteWarehouseText", {
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