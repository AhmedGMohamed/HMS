import { lazy, Suspense } from "react"
import { ModulePlaceholder } from "@/pages/_shared/ModulePlaceholder"

/**
 * Reports is lazy-loaded per type (Phase 6g) to keep the entry bundle
 * out of the 80KB-per-page bundle budget. Phase 2 routes the URL here
 * so `PermissionRoute` locks the page behind `view_reports` from day 1.
 */
const ReportsTypes = lazy(() => import("@/pages/Reports/types/ReportsPlaceholder"))

export default function ReportsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <ModulePlaceholder
        titleKey="sidebar.reports"
        phase="Phase 6g"
        description="Each report type is split into a lazy-loaded module to keep the bundle small."
      />
      <Suspense fallback={null}>
        <ReportsTypes />
      </Suspense>
    </div>
  )
}
