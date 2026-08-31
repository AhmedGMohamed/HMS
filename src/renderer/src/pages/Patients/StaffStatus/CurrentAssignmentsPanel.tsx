"use client"

import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  CalendarIcon,
  StethoscopeIcon,
  HospitalIcon,
  EyeIcon,
  UsersIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/EmptyState"
import type { AssignmentSummary } from "@/pages/Patients/StaffStatus/lib/enrichClockedIn"
import { formatDuration } from "@/pages/Patients/StaffStatus/lib/duration"

interface CurrentAssignmentsPanelProps {
  assignments: AssignmentSummary[]
  locale: "en" | "ar"
  /** Can the user mutate staff? (gates the change-staff affordance). */
  canManage: boolean
  onEditAssignment?: (patientId: number) => void
}

/**
 * T9.2 — Current Patient Assignments card grid. Renders one
 * admission per card with diagnosis chip + attending doctor/nurse
 * names + admission-so-far duration.
 *
 * Doctors and nurses render as comma-separated strings (server already
 * returns `attendingDoctors` / `attendingNurses` as parallel arrays of
 * names). Names map 1:1 to the ids, so misalignments (legacy behaviour
 * to slice mismatched-length arrays) are no longer possible.
 *
 * Each card links its `#id` header to
 * `/patients/:patientId?tab=admissions` for a single-click drill-down.
 */
export function CurrentAssignmentsPanel({
  assignments,
  locale,
  canManage,
  onEditAssignment,
}: CurrentAssignmentsPanelProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("patients.staffStatus.currentAssignments")}
          <span className="ms-2 text-sm font-normal text-muted-foreground tabular-nums">
            ({assignments.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <EmptyState
            title={t("patients.staffStatus.noCurrentAdmissions")}
            description="—"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.patientHistoryId}
                row={a}
                locale={locale}
                canManage={canManage}
                onEditAssignment={onEditAssignment}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface AssignmentCardProps {
  row: AssignmentSummary
  locale: "en" | "ar"
  canManage: boolean
  onEditAssignment?: (patientId: number) => void
}

function AssignmentCard({
  row,
  locale,
  canManage,
  onEditAssignment,
}: AssignmentCardProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border bg-surface p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Link
              to={`/patients/${row.patientId}?tab=admissions`}
              className="hover:underline"
            >
              {row.patientName}
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">
              #{row.patientId}
            </span>
          </div>
          {row.quickCheck ? (
            <Badge
              variant="secondary"
              className="ms-1 mt-1"
            >
              {t("patients.messages.quickCheckBadge")}
            </Badge>
          ) : null}
          {row.diagnosis ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {row.diagnosis}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {canManage && onEditAssignment ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              title={t("patients.staffStatus.changeStaff")}
              aria-label={t("patients.staffStatus.changeStaff")}
              onClick={() => onEditAssignment(row.patientId)}
            >
              <UsersIcon aria-hidden className="size-3.5" />
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            title={t("patients.staffStatus.viewPatient")}
            aria-label={t("patients.staffStatus.viewPatient")}
          >
            <Link to={`/patients/${row.patientId}?tab=admissions`}>
              <EyeIcon aria-hidden className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarIcon aria-hidden className="size-3.5" />
          <span>
            {t("patients.staffStatus.sinceAdmission", {
              duration: formatDuration(row.admissionTime),
            })}
          </span>
        </div>
        {row.attendingDoctors.length > 0 ? (
          <div className="flex items-start gap-2">
            <StethoscopeIcon
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span className="min-w-0 flex-1 wrap-break-word">
              <span className="text-foreground/80">
                {t("patients.fields.attendingDoctors")}:
              </span>{" "}
              {row.attendingDoctors.join(", ")}
            </span>
          </div>
        ) : null}
        {row.attendingNurses.length > 0 ? (
          <div className="flex items-start gap-2">
            <HospitalIcon
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span className="min-w-0 flex-1 wrap-break-word">
              <span className="text-foreground/80">
                {t("patients.fields.attendingNurses")}:
              </span>{" "}
              {row.attendingNurses.join(", ")}
            </span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <span>
            {t("patients.messages.admissionTime", {
              defaultValue: t("patients.staffStatus.admissionTime"),
            })}{" "}
            {formatLocalDateTime(row.admissionTime, locale)}
          </span>
        </div>
      </div>
    </div>
  )
}

function formatLocalDateTime(
  iso: string | null,
  locale: "en" | "ar"
): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
