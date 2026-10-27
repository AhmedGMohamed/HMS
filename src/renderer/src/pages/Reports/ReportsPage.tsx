"use client"

/**
 * Reports & Analytics — Phase 6.11 plan §4 (D2, D3, D5, D6).
 *
 * Composition root for the six report tabs. Responsibilities kept here (and
 * nowhere else):
 *   - page chrome (`PageHeader`) and the tab strip,
 *   - URL state: `?tab=…&from=…&to=…&group=…&run=1` plus tab filters,
 *   - the per-tab result cache (`useReportSession`),
 *   - permission gates: `view_reports` for the page (route), `manage_employees`
 *     for the payroll tab, `manage_reports` for exports,
 *   - filter options (`/api/reports/v2/options`).
 *
 * Everything below a tab — filters, KPIs, table, detail dialog, exports — is
 * owned by that tab's own component. Subphase 6.11.1 ships the patient tab and
 * leaves `TabPlaceholder` in place for the remaining five, which are replaced
 * one per subphase.
 *
 * The session cache lives here, not in the tabs, so a tab that unmounts on
 * switch and remounts on return reads the previous payload instead of firing
 * the same request again.
 *
 * References: plan §4.2 (URL contract), §4.4 (permission matrix), design.md
 * §6.1/§6.2/§6.4.
 */

import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/common/PageHeader"
import { TabsContent } from "@/components/ui/tabs"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { usePermission } from "@/hooks/usePermission"
import { ReportsTabs } from "@/pages/Reports/components/ReportsTabs"
import { TabPlaceholder } from "@/pages/Reports/components/TabPlaceholder"
import { useReportOptions } from "@/pages/Reports/hooks/useReportOptions"
import { DoctorReportTab } from "@/pages/Reports/doctors/DoctorReportTab"
import { PatientReportTab } from "@/pages/Reports/patients/PatientReportTab"
import { validateDraft } from "@/pages/Reports/state/reportParams"
import { TAB_META } from "@/pages/Reports/state/tabMeta"
import { useReportSession } from "@/pages/Reports/state/useReportSession"
import { useReportUrlState } from "@/pages/Reports/state/useReportUrlState"
import type { ReportTab } from "@/pages/Reports/types/reports"

export default function ReportsPage() {
  const { t } = useTranslation()
  useEnsureNamespace("reports")

  const { hasPermission } = usePermission()
  const canViewPayroll = hasPermission("manage_employees")
  /** Exports (and per-patient printing) need `manage_reports`. */
  const canExport = hasPermission("manage_reports")

  const url = useReportUrlState()
  const session = useReportSession()
  const { options, error: optionsError } = useReportOptions()

  const validationKey = validateDraft(url.draft, url.tab)
  const validationError = validationKey ? t(validationKey) : null

  const handleGenerate = () => {
    if (validationKey) return
    url.generate()
  }

  const renderTab = (tab: ReportTab) => {
    const tabMeta = TAB_META[tab]
    const isActive = url.tab === tab

    return (
      <TabsContent key={tab} value={tab} className="mt-0">
        {tab === "patients" ? (
          <PatientReportTab
            title={t(tabMeta.labelKey)}
            description={t(tabMeta.descriptionKey)}
            draft={url.draft}
            onDraftChange={url.setDraft}
            // Generated parameters are parsed for the *active* tab only; an
            // inactive tab must never read another tab's frozen filters.
            generated={isActive ? url.generated : null}
            generatedKey={isActive ? url.generatedKey : null}
            isGenerated={isActive && url.isGenerated}
            isStale={isActive && url.isStale}
            onGenerate={handleGenerate}
            validationError={isActive ? validationError : null}
            insuranceCompanies={options.insuranceCompanies}
            session={session}
            canExport={canExport}
          />
        ) : tab === "doctors" ? (
          <DoctorReportTab
            title={t(tabMeta.labelKey)}
            description={t(tabMeta.descriptionKey)}
            draft={url.draft}
            onDraftChange={url.setDraft}
            generated={isActive ? url.generated : null}
            generatedKey={isActive ? url.generatedKey : null}
            isGenerated={isActive && url.isGenerated}
            isStale={isActive && url.isStale}
            onGenerate={handleGenerate}
            validationError={isActive ? validationError : null}
            doctors={options.doctors}
            session={session}
            canExport={canExport}
          />
        ) : (
          <TabPlaceholder
            title={t(tabMeta.labelKey)}
            description={t(tabMeta.descriptionKey)}
            usesGrouping={tabMeta.usesGrouping}
            draft={url.draft}
            onRangeChange={(range) => url.setDraft({ range })}
            onGroupingChange={(grouping) => url.setDraft({ grouping })}
            onGenerate={handleGenerate}
            isGenerated={isActive && url.isGenerated}
            isStale={isActive && url.isStale}
            validationError={isActive ? validationError : null}
            blocked={tab === "payments" && !canViewPayroll}
          />
        )}
      </TabsContent>
    )
  }

  return (
    <div className="mx-auto flex flex-col gap-6">
      <PageHeader
        eyebrow={t("reports.page.eyebrow")}
        title={t("reports.title")}
        subtitle={t("reports.page.subtitle")}
      />

      {optionsError ? (
        <p className="text-xs text-text-secondary" role="status">
          {t("reports.messages.optionsError")}
        </p>
      ) : null}

      <ReportsTabs
        tab={url.tab}
        onTabChange={url.setTab}
        showPayroll={canViewPayroll}
      >
        {(["patients", "doctors", "nurses", "statistics", "payments", "clock-ins"] as ReportTab[]).map(
          (tab) => renderTab(tab)
        )}
      </ReportsTabs>
    </div>
  )
}
