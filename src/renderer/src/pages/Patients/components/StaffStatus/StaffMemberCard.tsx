"use client"

import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  CalendarIcon,
  CheckCircle2Icon,
  HospitalIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ClockedInStaff } from "@/pages/Patients/types/patient"
import { formatDuration } from "@/pages/Patients/lib/staffStatus/duration"

/**
 * Format a clock-in timestamp into a locale-aware HH:MM string.
 * Returns "—" for null/unparseable input instead of throwing.
 * "ar-EG" keeps Latin digits; "en-GB" mirrors DMY formatting
 * already adopted by `formatCurrency`.
 */
function formatLocalTime(
  iso: string | null,
  locale: "en" | "ar"
): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface StaffMemberCardProps {
  staff: ClockedInStaff
  locale: "en" | "ar"
  /** Optional callback — renders a per-patient "change staff" chip. */
  onEditAssignment?: (patientId: number) => void
}

export function StaffMemberCard({
  staff,
  locale,
  onEditAssignment,
}: StaffMemberCardProps) {
  const { t } = useTranslation()
  const isAvailable = staff.available
  const count = staff.assignedPatientIds.length

  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-3 text-sm transition-colors",
        isAvailable
          ? "border-success/40 bg-success/5"
          : "border-warning/40 bg-warning/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            {staff.employeeType === "doctor" ? (
              <UserIcon aria-hidden className="size-4 shrink-0 text-primary" />
            ) : (
              <HospitalIcon aria-hidden className="size-4 shrink-0 text-primary" />
            )}
            <span className="truncate">{staff.name}</span>
          </div>
        </div>
        <Badge variant={isAvailable ? "default" : "secondary"}>
          {isAvailable
            ? t("patients.staffStatus.available")
            : t("patients.staffStatus.assignedToPatients", { count })}
        </Badge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2Icon aria-hidden className="size-3.5" />
          <span>
            {t("patients.staffStatus.clockedInAt")}{" "}
            {formatLocalTime(staff.clockInTime, locale)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon aria-hidden className="size-3.5" />
          <span>
            {t("patients.staffStatus.clockedInDuration", {
              duration: formatDuration(staff.clockInTime),
            })}
          </span>
        </div>
      </div>

      {count > 0 ? (
        <div className="mt-3 border-t border-border/60 pt-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t("patients.staffStatus.assignedPatients")}:
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {staff.assignedPatientIds.map((pid) => (
              <li key={pid} className="flex items-center gap-0.5">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-6 rounded-e-none px-2 text-xs"
                >
                  <Link to={`/patients/${pid}?tab=admissions`}>#{pid}</Link>
                </Button>
                {onEditAssignment ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 rounded-s-none border-s-0 px-1.5 text-xs"
                    onClick={() => onEditAssignment(pid)}
                    title={t("patients.staffStatus.changeStaff")}
                    aria-label={t("patients.staffStatus.changeStaff")}
                  >
                    <UsersIcon aria-hidden className="size-3" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
