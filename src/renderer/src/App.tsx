import { lazy, Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { PrivateRoute } from "@/components/common/PrivateRoute"
import { PermissionRoute } from "@/components/common/PermissionRoute"
import { AdminRoute } from "@/components/common/AdminRoute"
import { RTLSync } from "@/components/common/RTLSync"
import { DevOnly } from "@/components/common/DevOnly"

const LoginPage = lazy(() => import("@/pages/Login/LoginPage"))
const DashboardPage = lazy(() => import("@/pages/Dashboard/DashboardPage"))
const PatientsPage = lazy(() => import("@/pages/Patients/PatientsPage"))
const DrugsPage = lazy(() => import("@/pages/Drugs/DrugsPage"))
const SuppliesPage = lazy(() => import("@/pages/Supplies/SuppliesPage"))
const EmployeesPage = lazy(() => import("@/pages/Employees/EmployeesPage"))
const DoctorsPage = lazy(() => import("@/pages/Doctors/DoctorsPage"))
const ClockingPage = lazy(() => import("@/pages/Clocking/ClockingPage"))
const VaultPage = lazy(() => import("@/pages/Vault/VaultPage"))
const InsurancePage = lazy(() => import("@/pages/Insurance/InsurancePage"))
const ReportsPage = lazy(() => import("@/pages/Reports/ReportsPage"))
const ServicesPage = lazy(() => import("@/pages/Services/ServicesPage"))
const PriceListsPage = lazy(() => import("@/pages/PriceLists/PriceListsPage"))
const UsersPage = lazy(() => import("@/pages/Admin/Users/UsersPage"))
const RolesPage = lazy(() => import("@/pages/Admin/Roles/RolesPage"))
const NotFoundPage = lazy(() => import("@/pages/NotFound/NotFoundPage"))
const ComponentsDemoPage = lazy(
  () => import("@/pages/_dev/ComponentsDemo/ComponentsDemoPage")
)

/**
 * Suspense fallback for lazy chunks. Renders nothing visible — the
 * surrounding pages keep their own loading chrome. Avoids a layout
 * shift on chunk swaps.
 */
function SilentFallback() {
  return <div className="min-h-svh animate-pulse bg-background" />
}

export default function App() {
  return (
    <>
      <RTLSync />
      <Suspense fallback={<SilentFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<PrivateRoute />}>
            <Route element={<PermissionRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/drugs" element={<DrugsPage />} />
                <Route path="/supplies" element={<SuppliesPage />} />
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/doctors" element={<DoctorsPage />} />
                <Route path="/clocking" element={<ClockingPage />} />
                <Route path="/vault" element={<VaultPage />} />
                <Route path="/insurance" element={<InsurancePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/price-lists" element={<PriceListsPage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/roles" element={<RolesPage />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />

          {/* Phase-4 component demo. Visible only in dev builds; production
              redirects to /dashboard (handled inside DevOnly). */}
          <Route
            path="/__dev/components"
            element={
              <DevOnly>
                <ComponentsDemoPage />
              </DevOnly>
            }
          />
        </Routes>
      </Suspense>
    </>
  )
}
