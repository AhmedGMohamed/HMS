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
  DrugUsage,
  PatientHistory,
} from "@/pages/Patients/types/patient"
import { AssignedItemRow } from "@/pages/Patients/Assigned/AssignedItemRow"
import { ViewItemDetailsDialog } from "@/pages/Patients/Assigned/ViewItemDetailsDialog"
import {
  groupAssignedDrugs,
  type AssignedDrugGroup,
} from "@/pages/Patients/Assigned/grouping"
import { useAssignedDrugs } from "@/pages/Patients/Assigned/hooks/useAssignedDrugs"
import { AddDrugDialog } from "@/pages/Patients/Assigned/modals/AddDrugDialog"
import { usePermission } from "@/hooks/usePermission"

interface AssignedDrugsPanelProps {
  patientId: number
  currentAdmission: PatientHistory | null
}

/**
 * Drug panel sibling — read-only list of dispensed drugs (or drug
 * entries whose `remaining_quantity` will decrement as the user
 * administers them). Mutations: add / administer / remove.
 *
 * Patient must be admitted before any drug can be dispensed, so the
 * `+Add` button surfaces that requirement via a toast if the page
 * isn't admitted.
 */
export function AssignedDrugsPanel({
  patientId,
  currentAdmission,
}: AssignedDrugsPanelProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")
  const canAdd = canManage && currentAdmission != null

  const list = useAssignedDrugs(patientId, currentAdmission)
  const [addOpen, setAddOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<{
    name: string
    rows: DrugUsage[]
  } | null>(null)

  const grouped = groupAssignedDrugs(list.drugs)

  function openAdd() {
    if (!canAdd) {
      // mirrored gate — the dialog also disables; here we just toast
      return
    }
    setAddOpen(true)
  }

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{t("patients.sections.assignedDrugs")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAdd}
            onClick={openAdd}
            aria-label={t("patients.buttons.addDrug")}
            title={
              !canManage
                ? undefined
                : currentAdmission == null
                  ? t("patients.messages.patientMustBeAdmitted")
                  : undefined
            }
          >
            <PlusIcon aria-hidden className="me-1.5 size-3.5" />
            {t("patients.buttons.addDrug")}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {list.loading && list.drugs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : list.drugs.length === 0 ? (
          <EmptyState
            title={t("patients.messages.noDrugsAssigned")}
            description={t("patients.messages.noDrugsAssignedDesc")}
          />
        ) : (
          Array.from(grouped.entries()).map(([drugId, group]) => (
            <DrugGroupRow
              key={drugId}
              group={group}
              onView={() =>
                setActiveGroup({
                  name:
                    group.rows[0]?.drugName ??
                    "",
                  rows: group.rows,
                })
              }
            />
          ))
        )}
      </CardContent>

      <AddDrugDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        patientId={patientId}
        currentAdmission={currentAdmission}
        onAdded={list.add}
      />

      {activeGroup ? (
        <ViewItemDetailsDialog
          open={Boolean(activeGroup)}
          onOpenChange={(v) => {
            if (!v) setActiveGroup(null)
          }}
          titlePrefixKey="patients.sections.assignedDrugs"
          groupName={activeGroup.name}
          kind="drug"
          rows={activeGroup.rows}
          canManage={canManage}
          onAdministerDrug={list.administer}
          onRemoveDrug={list.remove}
        />
      ) : null}
    </Card>
  )
}

function DrugGroupRow({
  group,
  onView,
}: {
  group: AssignedDrugGroup
  onView: () => void
}) {
  const { t } = useTranslation()
  const drugName = group.rows[0]?.drugName ?? "—"
  const qty = group.totalInitial
  const remaining = group.totalRemaining
  return (
    <AssignedItemRow
      name={drugName}
      quantityLabel={t("patients.table.quantity")}
      quantityValue={`${qty}${group.unit ? ` ${group.unit}` : ""}`}
      remainingLabel={t("patients.table.remaining")}
      remainingValue={`${remaining}${group.unit ? ` ${group.unit}` : ""}`}
      footerHint={
        group.lastAdministered
          ? `${t("patients.table.lastAdministered")}: ${new Date(group.lastAdministered).toLocaleString()}`
          : undefined
      }
      viewLabel={t("patients.buttons.view")}
      onView={onView}
    />
  )
}
