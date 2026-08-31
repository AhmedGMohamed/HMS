"use client"

import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/common/EmptyState"
import type { ClockedInStaff } from "@/pages/Patients/types/patient"
import { StaffMemberCard } from "@/pages/Patients/StaffStatus/StaffMemberCard"

interface StaffSectionListProps {
  titleKey: string
  emptyKey: string
  items: ClockedInStaff[]
  locale: "en" | "ar"
  onEditAssignment?: (patientId: number) => void
}

/**
 * T9.2 — Two-card stack used for Clocked-In Doctors + Nurses. The
 * panel is data-agnostic: it forwards `items` straight through. The
 * outer `<StaffStatusPanel>` composes two of these (doctors / nurses).
 */
export function StaffSectionList({
  titleKey,
  emptyKey,
  items,
  locale,
  onEditAssignment,
}: StaffSectionListProps) {
  const { t } = useTranslation()
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t(titleKey)}
          <Badge variant="secondary" className="ms-1 tabular-nums">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title={t(emptyKey)}
            description="—"
          />
        ) : (
          <div className="grid gap-3">
            {items.map((s) => (
              <StaffMemberCard
                key={s.employeeId}
                staff={s}
                locale={locale}
                onEditAssignment={onEditAssignment}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
