import { lazy, Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { PrivateRoute } from "@/components/common/PrivateRoute"
import { PermissionRoute } from "@/components/common/PermissionRoute"
import { AdminRoute } from "@/components/common/AdminRoute"
import { RTLSync } from "@/components/common/RTLSync"
import { DevOnly } from "@/components/common/DevOnly"
import { TooltipProvider } from "@/components/ui/tooltip"
import { lazyLoadWithNamespace } from "@/lib/localeLoader"

const LoginPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Login/LoginPage"),
    "login"
  )
)
const DashboardPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Dashboard/DashboardPage"),
    "dashboard"
  )
)
const PatientsPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Patients/PatientsPage"),
    "patients"
  )
)
const DrugsPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Drugs/DrugsPage"),
    "pharmacy"
  )
)
const SuppliesPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Supplies/SuppliesPage"),
    "medicalSupplies"
  )
)
const EmployeesPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Employees/EmployeesPage"),
    "employees"
  )
)
const DoctorsPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Doctors/DoctorsPage"),
    "employees"
  )
)
const ClockingPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Clocking/ClockingPage"),
    "clocking"
  )
)
const VaultPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Vault/VaultPage"),
    "vault"
  )
)
const InsurancePage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Insurance/InsurancePage"),
    "insurance"
  )
)
const ReportsPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Reports/ReportsPage"),
    "reports"
  )
)
const ServicesPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Services/ServicesPage"),
    "services"
  )
)
const PriceListsPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/PriceLists/PriceListsPage"),
    "priceLists"
  )
)
const UsersPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Admin/Users/UsersPage"),
    "users"
  )
)
const RolesPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/Admin/Roles/RolesPage"),
    "roles"
  )
)
const NotFoundPage = lazy(() => import("@/pages/NotFound/NotFoundPage"))
const ComponentsDemoPage = lazy(
  lazyLoadWithNamespace(
    () => import("@/pages/_dev/ComponentsDemo/ComponentsDemoPage"),
    ["dashboard", "patients"]
  )
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
        <TooltipProvider>
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
        </TooltipProvider>
      </Suspense>
    </>
  )
}
