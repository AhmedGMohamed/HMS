import { Outlet } from "react-router-dom"

/**
 * Phase 2 placeholder. The authenticated chrome — sidebar + topbar +
 * sticky main column — is implemented in Phase 3. The wrapper exists
 * now so lazy-loaded page components have a stable container while
 * Phase 2 work is in flight.
 *
 * Once Phase 3 lands the placeholder body will be replaced with
 * `<Sidebar />`, `<TopBar />`, and a scrollable `<main>` outlet with
 * the `p-6 md:p-8` density rules from design.md §4.3.
 */
export function AppShell() {
  return (
    <div className="flex min-h-svh bg-background">
      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-6 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
