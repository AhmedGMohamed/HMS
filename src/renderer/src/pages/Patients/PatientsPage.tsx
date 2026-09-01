import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon, UsersIcon, StethoscopeIcon } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useListData } from "@/hooks/useListData"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { listPatients } from "@/pages/Patients/api"
import type { Patient } from "@/pages/Patients/types/patient"
import { PatientListPanel } from "@/pages/Patients/PatientListPanel"
import { StaffStatusPanel } from "@/pages/Patients/StaffStatus/StaffStatusPanel"
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
 * - Tabs #2 `staff-status`: full migration T9.2 — `<StaffStatusPanel>`
 *   renders two clocked-in cards (doctors/nurses) plus a Current
 *   Patient Assignments panel, polled every 30s.
 */
export default function PatientsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("patients")
  const [tab, setTab] = useState<"all-patients" | "staff-status">(
    "all-patients"
  )
  const openCreateWizard = useCreatePatientWizard((s) => s.openDialog)

  const list = useListData<Patient>({
    fetcher: {
      params: { page: 1, pageSize: 25, search: "" },
      fetch: async ({ page, pageSize, search, sort }) => {
        const res = await listPatients({
          page,
          pageSize,
          q: search.trim() || undefined,
          sort: sort?.columnId,
          order: sort?.direction,
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
            <StaffStatusPanel />
          </TabsContent>
        </div>
      </Tabs>

      <CreatePatientWizardDialog onCreated={list.refresh} />
    </div>
  )
}
