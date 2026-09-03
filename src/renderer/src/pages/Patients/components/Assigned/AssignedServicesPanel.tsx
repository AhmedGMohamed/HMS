import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/common/EmptyState"

import type {
  ActivePatientService,
  PatientHistory
} from "@/pages/Patients/types/patient"
import { AssignedItemRow } from "@/pages/Patients/components/Assigned/AssignedItemRow"
import {
  ViewItemDetailsDialog,
} from "@/pages/Patients/components/Assigned/ViewItemDetailsDialog"
import {
  groupAssignedServices,
  type AssignedServiceGroup,
} from "@/pages/Patients/components/Assigned/grouping"
import { useAssignedServices } from "@/pages/Patients/hooks/assigned/useAssignedServices"
import { AddServiceDialog } from "@/pages/Patients/dialogs/assigned/AddServiceDialog"
import { usePermission } from "@/hooks/usePermission"


interface AssignedServicesPanelProps {
  patientId: number;
  currentAdmission: PatientHistory | null
}

/**
 * One of the three sibling cards on the `assigned` tab. Renders the
 * list of services the patient has added (or that auto-added on
 * admission). Mutations: add / stop / remove. Stop- & Remove-only
 * when the user has `manage_patients`.
 */
export function AssignedServicesPanel({
  patientId,
  currentAdmission
}: AssignedServicesPanelProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")
  const canAdd = canManage && currentAdmission != null

  const list = useAssignedServices(patientId)
  const [addOpen, setAddOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<{
    name: string
    rows: ActivePatientService[]
  } | null>(null)

  const grouped = groupAssignedServices(list.services)

  function openAdd() {
    if (!canAdd) {
      return
    }
    setAddOpen(true)
  }

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{t("patients.sections.assignedServices")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAdd}
            onClick={openAdd}
          >
            <PlusIcon aria-hidden className="me-1.5 size-3.5" />
            {t("patients.buttons.addService")}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {list.loading && list.services.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : list.services.length === 0 ? (
          <EmptyState
            title={t("patients.messages.noServicesAssigned")}
            description={t("patients.messages.noServicesAssignedDesc")}
          />
        ) : (
          Array.from(grouped.entries()).map(([serviceId, group]) => (
            <ServiceGroupRow
              key={serviceId}
              group={group}
              onView={() =>
                setActiveGroup({
                  name:
                    group.rows[0]?.name ??
                    t("patients.buttons.view"),
                  rows: group.rows,
                })
              }
            />
          ))
        )}
      </CardContent>

      <AddServiceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        patientId={patientId}
        onAdded={list.add}
        excludedServiceIds={Array.from(grouped.entries())
          .filter(([, group]) => group.isActive)
          .map(([id]) => id)}
      />

      {activeGroup ? (
        <ViewItemDetailsDialog
          open={Boolean(activeGroup)}
          onOpenChange={(v) => {
            if (!v) setActiveGroup(null)
          }}
          titlePrefixKey="patients.sections.assignedServices"
          groupName={activeGroup.name}
          kind="service"
          rows={activeGroup.rows}
          canManage={canManage}
          onStopService={list.stop}
          onRemoveService={list.remove}
        />
      ) : null}
    </Card>
  )
}

function ServiceGroupRow({
  group,
  onView,
}: {
  group: AssignedServiceGroup
  onView: () => void
}) {
  const { t } = useTranslation()
  const name = group.rows[0]?.name ?? "—"
  const statusLabel = group.isFullyStopped
    ? t("patients.status.stopped")
    : group.isActive
      ? t("patients.status.active")
      : null
  return (
    <AssignedItemRow
      name={name}
      statusLabel={statusLabel}
      statusVariant={group.isFullyStopped ? "secondary" : "default"}
      quantityLabel={t("patients.table.quantity")}
      quantityValue={String(group.quantity)}
      viewLabel={t("patients.buttons.view")}
      onView={onView}
    />
  )
}
