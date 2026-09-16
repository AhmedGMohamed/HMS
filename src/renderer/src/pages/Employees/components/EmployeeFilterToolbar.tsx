"use client"

import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import type { ShiftType } from "@/pages/Employees/types/employee"

export type StatusFilter = "all" | "active" | "inactive"

export interface EmployeeFilterToolbarProps {
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  shiftFilter: ShiftType | ""
  onShiftFilterChange: (value: ShiftType | "") => void
  /** Doctors tab only. */
  doctorTypeFilter?: string
  onDoctorTypeFilterChange?: (value: string) => void
  showDoctorType?: boolean
}

/**
 * Filter-chip toolbar for the staff tabs (Phase 6.7 UX package):
 * status chips + shift-type select (+ doctor-type select on the
 * Doctors tab). All client-side. Legacy always-visible date-range
 * inputs are dropped — issued-date filtering lives on the Payments
 * tab only.
 */
export function EmployeeFilterToolbar({
  statusFilter,
  onStatusFilterChange,
  shiftFilter,
  onShiftFilterChange,
  doctorTypeFilter = "",
  onDoctorTypeFilterChange,
  showDoctorType = false,
}: EmployeeFilterToolbarProps) {
  const { t } = useTranslation()

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("employees.filters.all") },
    { value: "active", label: t("employees.filters.active") },
    { value: "inactive", label: t("employees.filters.inactive") },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={t("employees.filters.statusGroup")}
        className="flex items-center rounded-md border border-border p-0.5"
      >
        {statusOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={statusFilter === option.value ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={statusFilter === option.value}
            className="h-7 px-2.5 text-xs"
            onClick={() => onStatusFilterChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <NativeSelect
        aria-label={t("employees.fields.shiftType")}
        value={shiftFilter}
        onChange={(e) =>
          onShiftFilterChange(e.currentTarget.value as ShiftType | "")
        }
        className="w-36"
      >
        <NativeSelectOption value="">
          {t("employees.filters.allShifts")}
        </NativeSelectOption>
        <NativeSelectOption value="morning">
          {t("employees.shiftTypes.morning")}
        </NativeSelectOption>
        <NativeSelectOption value="night">
          {t("employees.shiftTypes.night")}
        </NativeSelectOption>
      </NativeSelect>

      {showDoctorType ? (
        <NativeSelect
          aria-label={t("employees.fields.doctorType")}
          value={doctorTypeFilter}
          onChange={(e) => onDoctorTypeFilterChange?.(e.currentTarget.value)}
          className="w-40"
        >
          <NativeSelectOption value="">
            {t("employees.filters.allDoctorTypes")}
          </NativeSelectOption>
          <NativeSelectOption value="attending">
            {t("employees.doctorTypes.attending")}
          </NativeSelectOption>
          <NativeSelectOption value="supervising">
            {t("employees.doctorTypes.supervising")}
          </NativeSelectOption>
          <NativeSelectOption value="referring">
            {t("employees.doctorTypes.referring")}
          </NativeSelectOption>
          <NativeSelectOption value="outside">
            {t("employees.doctorTypes.outside")}
          </NativeSelectOption>
        </NativeSelect>
      ) : null}
    </div>
  )
}
