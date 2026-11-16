"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { EyeIcon, PillIcon, SyringeIcon, StopCircleIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

import type {
  ActivePatientService,
  DrugUsage,
  MedicalSupplyUsage,
} from "@/pages/Patients/types/patient"

interface SharedBaseProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  titlePrefixKey:
    | "patients.sections.assignedServices"
    | "patients.sections.assignedDrugs"
    | "patients.sections.assignedSupplies"
  groupName: string
  canManage: boolean
}

interface ServiceOnlyProps extends SharedBaseProps {
  kind: "service"
  rows: ActivePatientService[]
  onStopService: (activeServiceId: number) => Promise<unknown> | void
  onRemoveService: (activeServiceId: number) => Promise<unknown> | void
}

interface DrugOnlyProps extends SharedBaseProps {
  kind: "drug"
  rows: DrugUsage[]
  onAdministerDrug: (usageId: number) => Promise<unknown> | void
  onRemoveDrug: (usageId: number) => Promise<unknown> | void
}

interface SupplyOnlyProps extends SharedBaseProps {
  kind: "supply"
  rows: MedicalSupplyUsage[]
  onRemoveSupply: (usageId: number) => Promise<unknown> | void
}

type ViewItemDetailsDialogProps =
  | ServiceOnlyProps
  | DrugOnlyProps
  | SupplyOnlyProps

/**
 * Polymorphic item-detail dialog used by every Assigned panel.
 *
 * The legacy page reused one Bootstrap modal across services /
 * drugs / supplies. T5 keeps that contract here: the dialog reads
 * `kind` and switches its columns + actions accordingly.
 *
 * Row-level mutations (Stop / Administer / Remove) live in the
 * page-managed `useMutation`-style hooks; this dialog just
 * delegates to them and lets each row own its confirmation state
 * via local `confirming` state and a `<ConfirmDialog>` peer's
 * `open` flag.
 */
export function ViewItemDetailsDialog(props: ViewItemDetailsDialogProps) {
  const { t } = useTranslation()
  const title = `${t(props.titlePrefixKey)} — ${props.groupName}`

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {props.kind === "service" ? (
              <EyeIcon aria-hidden className="size-4" />
            ) : props.kind === "drug" ? (
              <PillIcon aria-hidden className="size-4" />
            ) : (
              <SyringeIcon aria-hidden className="size-4" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {props.rows.length} {t(props.titlePrefixKey)}
          </DialogDescription>
        </DialogHeader>

        {props.kind === "service" ? (
          <ServiceTable
            rows={props.rows}
            canManage={props.canManage}
            onStopService={props.onStopService}
            onRemoveService={props.onRemoveService}
          />
        ) : null}
        {props.kind === "drug" ? (
          <DrugTable
            rows={props.rows}
            canManage={props.canManage}
            onAdministerDrug={props.onAdministerDrug}
            onRemoveDrug={props.onRemoveDrug}
          />
        ) : null}
        {props.kind === "supply" ? (
          <SupplyTable
            rows={props.rows}
            canManage={props.canManage}
            onRemoveSupply={props.onRemoveSupply}
          />
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------
   Service table + row
   ---------------------------------------------------------------- */

function ServiceTable(
  props: {
    rows: ActivePatientService[]
    canManage: boolean
    onStopService: ServiceOnlyProps["onStopService"]
    onRemoveService: ServiceOnlyProps["onRemoveService"]
  }
) {
  const { t } = useTranslation()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 text-start font-medium">
            {t("patients.table.dateAdded")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.type")}
          </th>
          <th className="py-2 text-start font-medium">{t("common.status")}</th>
          <th className="py-2 text-end font-medium">{t("common.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <ServiceRow
            key={row.activeServiceId}
            row={row}
            canManage={props.canManage}
            onStop={props.onStopService}
            onRemove={props.onRemoveService}
          />
        ))}
      </tbody>
    </table>
  )
}

function ServiceRow({
  row,
  canManage,
  onStop,
  onRemove,
}: {
  row: ActivePatientService
  canManage: boolean
  onStop: ServiceOnlyProps["onStopService"]
  onRemove: ServiceOnlyProps["onRemoveService"]
}) {
  const { t } = useTranslation()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handleStop = async () => {
    setStopping(true)
    try {
      await onStop(row.activeServiceId)
    } finally {
      setStopping(false)
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2">
          {new Date(row.startDate).toLocaleString()}
        </td>
        <td className="py-2">{row.serviceType}</td>
        <td className="py-2">
          <Badge variant={row.isActive ? "default" : "secondary"}>
            {t(
              row.isActive
                ? "patients.status.active"
                : "patients.status.stopped"
            )}
          </Badge>
        </td>
        <td className="py-2 text-end">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canManage || !row.isActive || stopping}
              onClick={handleStop}
              title={t("patients.messages.stopServiceText")}
            >
              <StopCircleIcon aria-hidden className="me-1.5 size-3.5" />
              {t("patients.buttons.stop")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canManage || removing}
              onClick={() => setConfirmRemove(true)}
            >
              {t("patients.buttons.remove")}
            </Button>
          </div>
        </td>
      </tr>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(v) => {
          setConfirmRemove(v)
          if (!v) setRemoving(false)
        }}
        title={t("patients.messages.removeServiceTitle")}
        description={t("patients.messages.removeServiceText")}
        confirmLabel={t("patients.buttons.remove")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={removing}
        onConfirm={async () => {
          setRemoving(true)
          try {
            await onRemove(row.activeServiceId)
            setConfirmRemove(false)
          } catch {
            setRemoving(false)
            throw new Error()
          }
        }}
      />
    </>
  )
}

/* ----------------------------------------------------------------
   Drug table + row
   ---------------------------------------------------------------- */

function DrugTable(
  props: {
    rows: DrugUsage[]
    canManage: boolean
    onAdministerDrug: DrugOnlyProps["onAdministerDrug"]
    onRemoveDrug: DrugOnlyProps["onRemoveDrug"]
  }
) {
  const { t } = useTranslation()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 text-start font-medium">
            {t("patients.table.dateAdded")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.quantity")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.remaining")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.lastAdministered")}
          </th>
          <th className="py-2 text-end font-medium">{t("common.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <DrugRow
            key={row.usageId}
            row={row}
            canManage={props.canManage}
            onAdminister={props.onAdministerDrug}
            onRemove={props.onRemoveDrug}
          />
        ))}
      </tbody>
    </table>
  )
}

function DrugRow({
  row,
  canManage,
  onAdminister,
  onRemove,
}: {
  row: DrugUsage
  canManage: boolean
  onAdminister: DrugOnlyProps["onAdministerDrug"]
  onRemove: DrugOnlyProps["onRemoveDrug"]
}) {
  const { t } = useTranslation()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [administering, setAdministering] = useState(false)
  const [removing, setRemoving] = useState(false)
  const remainingZero = row.remainingQuantity <= 0

  const handleAdminister = async () => {
    setAdministering(true)
    try {
      await onAdminister(row.usageId)
    } finally {
      setAdministering(false)
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2">
          {row.startDate ? new Date(row.startDate).toLocaleString() : "—"}
        </td>
        <td className="py-2 tabular-nums">{row.initialQuantity}</td>
        <td className="py-2 tabular-nums">{row.remainingQuantity}</td>
        <td className="py-2">
          {row.lastAdministered
            ? new Date(row.lastAdministered).toLocaleString()
            : t("patients.table.notAdministeredYet")}
        </td>
        <td className="py-2 text-end">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canManage || remainingZero || administering}
              onClick={handleAdminister}
              title={
                remainingZero
                  ? t("patients.messages.noRemainingQuantity")
                  : undefined
              }
            >
              {t("patients.buttons.administer")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canManage || removing}
              onClick={() => setConfirmRemove(true)}
            >
              {t("patients.buttons.remove")}
            </Button>
          </div>
        </td>
      </tr>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(v) => {
          setConfirmRemove(v)
          if (!v) setRemoving(false)
        }}
        title={t("patients.messages.removeDrugTitle")}
        description={t("patients.messages.removeDrugText")}
        confirmLabel={t("patients.buttons.remove")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={removing}
        onConfirm={async () => {
          setRemoving(true)
          try {
            await onRemove(row.usageId)
            setConfirmRemove(false)
          } catch {
            setRemoving(false)
            throw new Error()
          }
        }}
      />
    </>
  )
}

/* ----------------------------------------------------------------
   Supply table + row
   ---------------------------------------------------------------- */

function SupplyTable(
  props: {
    rows: MedicalSupplyUsage[]
    canManage: boolean
    onRemoveSupply: SupplyOnlyProps["onRemoveSupply"]
  }
) {
  const { t } = useTranslation()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 text-start font-medium">
            {t("patients.table.dateAdded")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.quantity")}
          </th>
          <th className="py-2 text-start font-medium">
            {t("patients.table.remaining")}
          </th>
          <th className="py-2 text-end font-medium">{t("common.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <SupplyRow
            key={row.usageId}
            row={row}
            canManage={props.canManage}
            onRemove={props.onRemoveSupply}
          />
        ))}
      </tbody>
    </table>
  )
}

function SupplyRow({
  row,
  canManage,
  onRemove,
}: {
  row: MedicalSupplyUsage
  canManage: boolean
  onRemove: SupplyOnlyProps["onRemoveSupply"]
}) {
  const { t } = useTranslation()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2">
          {row.startDate ? new Date(row.startDate).toLocaleString() : "—"}
        </td>
        <td className="py-2 tabular-nums">{row.initialQuantity}</td>
        <td className="py-2 tabular-nums">{row.remainingQuantity}</td>
        <td className="py-2 text-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canManage || removing}
            onClick={() => setConfirmRemove(true)}
          >
            {t("patients.buttons.remove")}
          </Button>
        </td>
      </tr>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(v) => {
          setConfirmRemove(v)
          if (!v) setRemoving(false)
        }}
        title={t("patients.messages.removeSupplyTitle")}
        description={t("patients.messages.removeSupplyText")}
        confirmLabel={t("patients.buttons.remove")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={removing}
        onConfirm={async () => {
          setRemoving(true)
          try {
            await onRemove(row.usageId)
            setConfirmRemove(false)
          } catch {
            setRemoving(false)
            throw new Error()
          }
        }}
      />
    </>
  )
}
