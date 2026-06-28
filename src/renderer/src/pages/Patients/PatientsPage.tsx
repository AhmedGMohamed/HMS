import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon, UsersIcon, StethoscopeIcon } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useListData } from "@/hooks/useListData"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import {
  listClockedInStaff,
  listCurrentAdmissionsWithStaff,
  listPatients,
} from "@/pages/Patients/api"
import type { Patient, PatientAssignment } from "@/pages/Patients/types/patient"
import { PatientListPanel } from "@/pages/Patients/PatientListPanel"
import { CreatePatientWizardDialog } from "@/pages/Patients/modals/CreatePatientWizard/CreatePatientWizardDialog"
import { useCreatePatientWizard } from "@/pages/Patients/modals/CreatePatientWizard/useCreatePatientWizard"

/**
 * /patients — Patients root.
 *
 * Layout:
 *
 *   <PageHeader title="Patients" action={Register btn} />
 *
 *   ⎡ <Sidebar> ⎤ ⎡ tabs (vertical)              ⎤
 *   ⎢           ⎥ ⎢ All Patients - Staff Status  ⎥
 *   ⎢           ⎥ ⎥ <Tab content>                ⎥
 *   ⎣           ⎦ ⎣ ListPanel                    ⎦
 *
 * The breadcrumb already shows the page name ("Patients") so we don't
 * duplicate it via a subtitle; the eyebrow slot gives a section kicker
 * (HMS). Each tab's `<TabsList>` is `orientation="vertical"` and
 * sized so the column stays compact — the table on the right takes the
 * bulk width.
 *
 * - Tabs #1 `all-patients`: `<PatientListPanel>` (server-driven, client-sorted).
 * - Tabs #2 `staff-status`: stub. T8 replaces it with a polling panel.
 */
export default function PatientsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const [tab, setTab] = useState<"all-patients" | "staff-status">(
    "all-patients"
  )
  const openCreateWizard = useCreatePatientWizard((s) => s.openDialog)

  /* `useListData` is loop-safe: the effect depends only on stable
     primitives (page/pageSize/debouncedSearch/nonce). The fetch
     closure is read through a ref + receives the latest params
     on every fire so server-driven search, paginate, sort updates
     actually reach the backend. */
  const list = useListData<Patient>({
    fetcher: {
      params: { page: 1, pageSize: 25, search: "" },
      fetch: async ({ page, pageSize, search }) => {
        const res = await listPatients({
          page,
          pageSize,
          q: search.trim() || undefined,
        })
        return { data: res.data, total: res.total }
      },
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("patients.title")}
        actions={
          <Button onClick={openCreateWizard}>
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("patients.buttons.registerPatient")}
          </Button>
        }
      />

      <Tabs
        orientation="vertical"
        value={tab}
        onValueChange={(v) =>
          setTab(v as "all-patients" | "staff-status")
        }
        className="flex w-full flex-col gap-6"
      >
        <TabsList className="w-full shrink-0 lg:w-56">
          <TabsTrigger
            value="all-patients"
            className="w-full justify-start"
          >
            <UsersIcon aria-hidden className="me-2 size-4" />
            {t("patients.allPatients")}
          </TabsTrigger>
          <TabsTrigger
            value="staff-status"
            className="w-full justify-start"
          >
            <StethoscopeIcon aria-hidden className="me-2 size-4" />
            {t("patients.tabs.staffStatus")}
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="all-patients" className="flex flex-col">
            <PatientListPanel list={list} />
          </TabsContent>

          <TabsContent value="staff-status">
            <StaffStatusStub />
          </TabsContent>
        </div>
      </Tabs>

      <CreatePatientWizardDialog onCreated={list.refresh} />
    </div>
  )
}

/**
 * T1 staff-status placeholder. T8 replaces it with a real panel
 * that polls every 30 s and renders doctor/nurse/assignment cards.
 */
function StaffStatusStub() {
  const { t } = useTranslation()
  const [clockedInCount, setClockedInCount] = useState(0)
  const [assignmentsCount, setAssignmentsCount] = useState(0)
  const [assignments, setAssignments] = useState<PatientAssignment[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchOnce() {
      try {
        const [ci, cur] = await Promise.all([
          listClockedInStaff(),
          listCurrentAdmissionsWithStaff(),
        ])
        if (cancelled) return
        setClockedInCount(ci.length)
        setAssignmentsCount(cur.length)
        setAssignments(cur)
      } catch {
        /* UI surface shows empty state */
      }
    }

    fetchOnce()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grid gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        {t("patients.tabs.staffStatus")}
      </p>
      <p>
        {clockedInCount} {t("sidebar.doctors")} ·{" "}
        {assignmentsCount} {t("patients.staffStatus.currentAssignments")}
      </p>
      {assignments.slice(0, 3).map((a) => (
        <p key={a.patientHistoryId} className="text-xs">
          #{a.patientId} — {a.patientName}
        </p>
      ))}
    </div>
  )
}
