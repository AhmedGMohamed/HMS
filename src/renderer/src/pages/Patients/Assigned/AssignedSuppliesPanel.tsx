"use client"

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
  MedicalSupplyUsage,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { AssignedItemRow } from "@/pages/Patients/Assigned/AssignedItemRow"
import { ViewItemDetailsDialog } from "@/pages/Patients/Assigned/ViewItemDetailsDialog"
import {
  groupAssignedSupplies,
  type AssignedSupplyGroup,
} from "@/pages/Patients/Assigned/grouping"
import { useAssignedSupplies } from "@/pages/Patients/Assigned/hooks/useAssignedSupplies"
import { AddSupplyDialog } from "@/pages/Patients/Assigned/modals/AddSupplyDialog"
import { usePermission } from "@/hooks/usePermission"

interface AssignedSuppliesPanelProps {
  patientId: number
  currentAdmission: PatientHistory | null
}

export function AssignedSuppliesPanel({
  patientId,
  currentAdmission,
}: AssignedSuppliesPanelProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")
  const canAdd = canManage && currentAdmission != null

  const list = useAssignedSupplies(patientId, currentAdmission)
  const [addOpen, setAddOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<{
    name: string
    rows: MedicalSupplyUsage[]
  } | null>(null)

  const grouped = groupAssignedSupplies(list.supplies)

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{t("patients.sections.assignedSupplies")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAdd}
            onClick={() => {
              if (canAdd) setAddOpen(true)
            }}
            title={
              !canManage
                ? undefined
                : currentAdmission == null
                  ? t("patients.messages.patientMustBeAdmitted")
                  : undefined
            }
          >
            <PlusIcon aria-hidden className="me-1.5 size-3.5" />
            {t("patients.buttons.addSupply")}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {list.loading && list.supplies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : list.supplies.length === 0 ? (
          <EmptyState
            title={t("patients.messages.noSuppliesAssigned")}
            description={t("patients.messages.noSuppliesAssignedDesc")}
          />
        ) : (
          Array.from(grouped.entries()).map(([supplyId, group]) => (
            <SupplyGroupRow
              key={supplyId}
              group={group}
              onView={() =>
                setActiveGroup({
                  name:
                    list.supplies.find((r) => r.supplyId === supplyId)?.supply
                      ?.name ?? "",
                  rows: group.rows,
                })
              }
            />
          ))
        )}
      </CardContent>

      <AddSupplyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        patientId={patientId}
        currentAdmissionId={currentAdmission?.patientHistoryId ?? null}
        onAdded={() => {
          list.refresh()
        }}
      />

      {activeGroup ? (
        <ViewItemDetailsDialog
          open={Boolean(activeGroup)}
          onOpenChange={(v) => {
            if (!v) setActiveGroup(null)
          }}
          titlePrefixKey="patients.sections.assignedSupplies"
          groupName={activeGroup.name}
          kind="supply"
          rows={activeGroup.rows}
          canManage={canManage}
          onRemoveSupply={list.remove}
        />
      ) : null}
    </Card>
  )
}

function SupplyGroupRow({
  group,
  onView,
}: {
  group: AssignedSupplyGroup
  onView: () => void
}) {
  const { t } = useTranslation()
  const name = group.rows[0]?.supply?.name ?? "—"
  return (
    <AssignedItemRow
      name={name}
      quantityLabel={t("patients.table.quantity")}
      quantityValue={String(group.totalInitial)}
      remainingLabel={t("patients.table.remaining")}
      remainingValue={String(group.totalRemaining)}
      viewLabel={t("patients.buttons.view")}
      onView={onView}
    />
  )
}
