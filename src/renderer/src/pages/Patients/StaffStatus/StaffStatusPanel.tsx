"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCwIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { usePermission } from "@/hooks/usePermission"
import { useUIStore } from "@/store/uiStore"

import { useStaffStatus } from "@/pages/Patients/StaffStatus/hooks/useStaffStatus"
import { StaffSectionList } from "@/pages/Patients/StaffStatus/StaffSectionList"
import { CurrentAssignmentsPanel } from "@/pages/Patients/StaffStatus/CurrentAssignmentsPanel"
import { EditStaffAssignmentDialog } from "@/pages/Patients/Profile/Dialogs/EditStaffAssignmentDialog"

/**
 * T9.2 — Top-level composer for the Staff Status tab on `/patients`.
 *
 * Layout:
 *   <Header (Refresh button + last-update label)>
 *   <Spinner block while loading the first paint>
 *   2-col grid (Doctors, Nurses)        ← <StaffSectionList> x2
 *   <Current Assignments full-width>    ← CurrentAssignmentsPanel
 *   <EditStaffAssignmentDialog>          ← hosted here (T10)
 *
 * T10 adds the staff-edit dialog: launchable from the Users icons on
 * assignment cards *and* each staff member card's assigned-patient
 * chips. `patientName` is resolved from the assignments list by id;
 * on save the hook re-fetches so polling + manual refresh stay in
 * sync.
 */
export function StaffStatusPanel() {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const language = (useUIStore((s) => s.language) ?? "en") as "en" | "ar"
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")

  const {
    doctors,
    nurses,
    assignments,
    loading,
    error,
    lastUpdatedAt,
    refresh,
  } = useStaffStatus()

  const [editingPatientId, setEditingPatientId] = useState<number | null>(null)
  const [staffEditOpen, setStaffEditOpen] = useState(false)

  const editingPatientName = useMemo(() => {
    if (editingPatientId == null) return ""
    const found = assignments.find((a) => a.patientId === editingPatientId)
    return found?.patientName ?? `#${editingPatientId}`
  }, [editingPatientId, assignments])

  function openStaffEdit(patientId: number) {
    setEditingPatientId(patientId)
    setStaffEditOpen(true)
  }

  function closeStaffEdit(next: boolean) {
    if (!next) {
      setEditingPatientId(null)
    }
    setStaffEditOpen(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("patients.staffStatus.lastUpdate")}
            </span>
            <span className="tabular-nums">
              {lastUpdatedAt
                ? new Date(lastUpdatedAt).toLocaleTimeString(
                  language === "ar" ? "ar-EG" : "en-GB",
                  { hour: "2-digit", minute: "2-digit" }
                )
                : "—"}
            </span>
            <span className="text-[11px] italic">
              {t("patients.staffStatus.pollingHint")}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner aria-hidden className="me-2 size-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <RefreshCwIcon aria-hidden className="me-2 size-4" />
                {t("common.refresh")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && !loading ? (
        <EmptyState
          title={t("patients.messages.loadStaffStatusError")}
          description={error.message || t("common.error")}
          action={
            <Button variant="outline" onClick={refresh}>
              {t("common.refresh")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <StaffSectionList
              titleKey="patients.staffStatus.clockedInDoctors"
              emptyKey="patients.staffStatus.noClockedInDoctors"
              items={doctors}
              locale={language}
              onEditAssignment={canManage ? openStaffEdit : undefined}
            />
            <StaffSectionList
              titleKey="patients.staffStatus.clockedInNurses"
              emptyKey="patients.staffStatus.noClockedInNurses"
              items={nurses}
              locale={language}
              onEditAssignment={canManage ? openStaffEdit : undefined}
            />
          </div>
          <CurrentAssignmentsPanel
            assignments={assignments}
            locale={language}
            canManage={canManage}
            onEditAssignment={openStaffEdit}
          />
        </div>
      )}

      <EditStaffAssignmentDialog
        open={staffEditOpen}
        onOpenChange={closeStaffEdit}
        patientId={editingPatientId}
        patientName={editingPatientName}
        onSaved={refresh}
      />
    </div>
  )
}