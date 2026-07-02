"use client"

import { useMemo } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  UserIcon,
  CalendarIcon,
  CreditCardIcon,
  ActivityIcon,
  ChevronLeftIcon,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { EmptyState } from "@/components/common/EmptyState"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { usePatientProfile } from "@/pages/Patients/Profile/usePatientProfile"
import { PatientProfilePanel } from "@/pages/Patients/Profile/PatientProfilePanel"
import { AssignedServicesPanel } from "@/pages/Patients/Assigned/AssignedServicesPanel"
import { AssignedDrugsPanel } from "@/pages/Patients/Assigned/AssignedDrugsPanel"
import { AssignedSuppliesPanel } from "@/pages/Patients/Assigned/AssignedSuppliesPanel"

type DetailTab = "profile" | "assigned" | "billing" | "admissions"

const VALID_TABS: readonly DetailTab[] = [
  "profile",
  "assigned",
  "billing",
  "admissions",
] as const

/**
 * /patients/:id — patient detail page.
 *
 * Layout mirrors the page-list's vertical-tab side rail from T3
 * (sidebar at `lg:w-56`, content takes the rest). The activeServiceRoutes
 * permission gate (T4.1) resolves `/patients/:id` to `view_patients`
 * via the longest-prefix matcher.
 *
 * Tabs ship in T4-T7:
 *   - Profile       (T4)        PatientProfilePanel
 *   - Assigned      (T5)        EmptyState placeholder
 *   - Billing       (T6)        EmptyState placeholder
 *   - Admissions    (T7)        EmptyState placeholder
 *
 * The active tab is reflected in the URL via `?tab=` so back-nav
 * restores user state.
 */
export default function PatientDetailPage() {
  const { t } = useTranslation()
  useEnsureNamespace("patients")

  const { id } = useParams<{ id: string }>()
  const patientId = Number(id)

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab") as DetailTab | null
  const tab: DetailTab = useMemo(() => {
    if (tabParam && (VALID_TABS as readonly string[]).includes(tabParam)) {
      return tabParam
    }
    return "profile"
  }, [tabParam])

  function setTab(next: DetailTab) {
    setSearchParams(
      (prev) => {
        if (next === "profile") {
          prev.delete("tab")
        } else {
          prev.set("tab", next)
        }
        return prev
      },
      { replace: true }
    )
  }

  const profile = usePatientProfile(patientId)

  if (!Number.isFinite(patientId) || patientId <= 0) {
    return <PatientDetailNotFound />
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        orientation="vertical"
        value={tab}
        onValueChange={(v) => setTab(v as DetailTab)}
        className="flex w-full flex-col gap-6"
      >
        <PageHeader
          eyebrow={t("sidebar.patients")}
          title={t("patients.patientDetails")}
          actions={
            profile.patient ? (
              <div className="flex flex-col items-end gap-1 text-end">
                <span className="text-base font-medium text-foreground">
                  {profile.patient.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  #{profile.patient.patientId}
                </span>
              </div>
            ) : null
          }
        />
        
        <div className="flex w-full justify-between">
          <Button asChild variant="ghost" size="sm" className="self-start p-0">
            <Link to="/patients">
              <ChevronLeftIcon aria-hidden className="me-2 size-4" />
              {t("common.back")}
            </Link>
          </Button>

          <TabsList className="w-full shrink-0 lg:w-md ">
            <TabsTrigger value="profile" className="w-full justify-start">
              <UserIcon aria-hidden className="me-2 size-4" />
              {t("patients.tabLabels.profile")}
            </TabsTrigger>
            <TabsTrigger value="assigned" className="w-full justify-start">
              <ActivityIcon aria-hidden className="me-2 size-4" />
              {t("patients.tabLabels.assigned")}
            </TabsTrigger>
            <TabsTrigger value="billing" className="w-full justify-start">
              <CreditCardIcon aria-hidden className="me-2 size-4" />
              {t("patients.tabLabels.billing")}
            </TabsTrigger>
            <TabsTrigger value="admissions" className="w-full justify-start">
              <CalendarIcon aria-hidden className="me-2 size-4" />
              {t("patients.tabLabels.admissions")}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-w-0 flex-1">
          <TabsContent value="profile" className="flex flex-col gap-4">
            <PatientProfilePanel
              patient={profile.patient}
              admission={profile.admission}
              loading={profile.loading}
              error={profile.error}
              onRefresh={profile.refresh}
            />
          </TabsContent>

          <TabsContent value="assigned" className="flex flex-col gap-4">
            <AssignedLayout
              patientId={patientId}
              admission={profile.admission}
            />
          </TabsContent>

          <TabsContent value="billing">
            <EmptyState
              title={t("patients.tabLabels.billing")}
              description={t("patients.tabLabels.billingDescription")}
            />
          </TabsContent>

          <TabsContent value="admissions">
            <EmptyState
              title={t("patients.tabLabels.admissions")}
              description={t("patients.tabLabels.admissionsDescription")}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

/**
 * Used when `useParams().id` doesn't resolve to a finite positive
 * number — a defensive case the route permission gate should have
 * rejected, but the page renders this when the URL is `/patients/abc`.
 */
function PatientDetailNotFound() {
  const { t } = useTranslation()
  return (
    <EmptyState
      title={t("patients.title")}
      description={t("patients.messages.editPatientMissing")}
      action={
        <Button asChild variant="outline">
          <Link to="/patients">{t("common.back")}</Link>
        </Button>
      }
    />
  )
}

/**
 * T5.5 — Wrapper for the Assigned tab body: three sibling cards
 * (Services / Drugs / Supplies). Each card mounts its own hook so
 * loading states don't block the others. Permission gating is
 * delegated to each panel.
 */
function AssignedLayout({
  patientId,
  admission,
}: {
  patientId: number
  admission: import("@/pages/Patients/types/patient").PatientHistory | null
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AssignedServicesPanel patientId={patientId} currentAdmission={admission} />
      <AssignedDrugsPanel patientId={patientId} currentAdmission={admission} />
      <AssignedSuppliesPanel patientId={patientId} currentAdmission={admission} />
    </div>
  )
}
