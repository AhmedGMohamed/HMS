"use client"

/**
 * Daily staff assignments for one admission — Phase 6.11.1.
 *
 * `DailyStaffAssignment.work_date` is a DATE, so a day belongs to the
 * admission when the work date falls between the admission and discharge
 * **calendar dates** (the server already did that filtering). The table is a
 * display of that decision, not a second calculation.
 *
 * Doctors and nurses are separate columns so the reader can see at a glance
 * who covered the patient and for how many hours; a day with only nurses
 * renders an em dash in the doctor column rather than an empty cell.
 */

import { useTranslation } from "react-i18next"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type {
  PatientReportStaffDay,
  PatientReportStaffMember,
} from "@/pages/Reports/types/patientReport"

export interface DailyStaffTableProps {
  days: PatientReportStaffDay[]
}

function StaffList({
  members,
  emptyLabel,
  hoursSuffix,
}: {
  members: PatientReportStaffMember[]
  /** Already translated em dash / "none" label. */
  emptyLabel: string
  /** Localized hour unit (`reports.units.hours`). */
  hoursSuffix: string
}) {
  if (members.length === 0) {
    return <span className="text-muted-foreground">{emptyLabel}</span>
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {members.map((member) => (
        <li key={member.employeeId} className="flex items-baseline gap-1.5">
          <span className="text-foreground">{member.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
            {member.hoursWorked}
            {hoursSuffix}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function DailyStaffTable({ days }: DailyStaffTableProps) {
  const { t } = useTranslation()
  const language = useUIStore((state) => state.language) ?? "en"
  const hoursSuffix = t("reports.units.hours")

  if (days.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {t("reports.detail.noStaff")}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader className="bg-surface-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-32">{t("reports.table.workDate")}</TableHead>
            <TableHead>{t("reports.admissionCard.doctors")}</TableHead>
            <TableHead>{t("reports.admissionCard.nurses")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.workDate}>
              <TableCell className="align-top whitespace-nowrap">
                {formatDate(new Date(`${day.workDate}T00:00:00`), language)}
              </TableCell>
              <TableCell className="align-top">
                <StaffList
                  members={day.doctors}
                  emptyLabel="—"
                  hoursSuffix={hoursSuffix}
                />
              </TableCell>
              <TableCell className="align-top">
                <StaffList
                  members={day.nurses}
                  emptyLabel="—"
                  hoursSuffix={hoursSuffix}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
