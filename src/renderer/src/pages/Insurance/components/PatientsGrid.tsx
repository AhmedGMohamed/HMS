"use client"

import { useState } from "react"
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

/** Cards rendered per reveal step — the list is not paginated server-side. */
const PAGE_SIZE = 25

/**
 * Patients section of the detail view (Phase 6.10 plan §3).
 *
 * Header carries the live count (legacy `#patientCount`) plus the
 * Back-to-List link that returns to the card grid. Empty/loading
 * states are explicit — the legacy page rendered a "No data" block with
 * the wrong i18n key (`loadPatientsError`).
 *
 * `GET /:id/patients` returns the whole roster, so the grid reveals it in
 * bounded steps of `PAGE_SIZE` instead of mounting every card at once
 * (a company with hundreds of patients froze the detail view). The parent
 * remounts this component per company (`key={companyId}`), which resets
 * the reveal count between companies.
 */
export function PatientsGrid({
  patients,
  loading,
  canManageReports,
  onGenerateReport,
}: PatientsGridProps) {
  const { t } = useTranslation()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const visiblePatients = patients.slice(0, visibleCount)
  const hasMore = patients.length > visibleCount

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
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
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePatients.map((patient) => (
                <PatientCard
                  key={patient.patientId}
                  patient={patient}
                  canManageReports={canManageReports}
                  onGenerateReport={onGenerateReport}
                />
              ))}
            </div>

            {hasMore ? (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("insurance.messages.showingPatients", {
                    shown: visiblePatients.length,
                    total: patients.length,
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  {t("insurance.buttons.showMorePatients")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
