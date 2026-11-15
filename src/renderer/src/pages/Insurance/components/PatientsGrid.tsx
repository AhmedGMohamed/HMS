"use client"

import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { ArrowLeftIcon, UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/common/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { PatientCard } from "@/pages/Insurance/components/PatientCard"
import type { InsurancePatient } from "@/pages/Insurance/types/insurance"

export interface PatientsGridProps {
  patients: InsurancePatient[]
  loading: boolean
  canManageReports: boolean
  onGenerateReport: (patient: InsurancePatient) => void
}

/**
 * Patients section of the detail view (Phase 6.10 plan §3).
 *
 * Header carries the live count (legacy `#patientCount`) plus the
 * Back-to-List link that returns to the card grid. Empty/loading
 * states are explicit — the legacy page rendered a "No data" block with
 * the wrong i18n key (`loadPatientsError`).
 */
export function PatientsGrid({
  patients,
  loading,
  canManageReports,
  onGenerateReport,
}: PatientsGridProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon aria-hidden className="size-4 text-muted-foreground" />
          {t("insurance.patients")}
          <Badge variant="secondary" className="tabular-nums">
            {patients.length}
          </Badge>
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link to="/insurance">
            <ArrowLeftIcon aria-hidden className="me-1.5 size-4 rtl:rotate-180" />
            {t("insurance.buttons.backToList")}
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="space-y-3 rounded-lg border border-border p-4"
              >
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : patients.length === 0 ? (
          <EmptyState
            title={t("insurance.emptyPatients.title")}
            description={t("insurance.emptyPatients.description")}
            icon={<UsersIcon className="size-8" />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {patients.map((patient) => (
              <PatientCard
                key={patient.patientId}
                patient={patient}
                canManageReports={canManageReports}
                onGenerateReport={onGenerateReport}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
