"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { TabsContent } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { ApiError } from "@/lib/errors"
import { resolveLocale, toLocalDateString } from "@/lib/utils"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { useUIStore } from "@/store/uiStore"
import {
  quickClockOut,
  deleteClockIn,
} from "@/pages/Clocking/api"
import {
  ActiveClockInsTable,
} from "@/pages/Clocking/components/ActiveClockInsTable"
import {
  ClockingKpiStrip,
} from "@/pages/Clocking/components/ClockingKpiStrip"
import { ClockingTabs } from "@/pages/Clocking/components/ClockingTabs"
import { HistoryFilters } from "@/pages/Clocking/components/HistoryFilters"
import {
  HistoryTable,
} from "@/pages/Clocking/components/HistoryTable"
import { ClockInModal } from "@/pages/Clocking/modals/ClockInModal"
import { useActiveClockIns } from "@/pages/Clocking/hooks/useActiveClockIns"
import { useClockIns } from "@/pages/Clocking/hooks/useClockIns"
import { useClockingEmployees } from "@/pages/Clocking/hooks/useClockingEmployees"
import { useClockingStats } from "@/pages/Clocking/hooks/useClockingStats"
import { useNowTick } from "@/pages/Clocking/hooks/useNowTick"
import type {
  ClockIn,
  ClockingTab,
  EligibleEmployee,
  HistoryFilters as HistoryFiltersState,
} from "@/pages/Clocking/types/clocking"

type SortState = { columnId: string; direction: "asc" | "desc" } | null

interface ModalState {
  mode: "create" | "edit"
  clockIn: ClockIn | null
}

const PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

/**
 * Last page that still has rows once `total` current rows shrink by
 * one. Used after mutations so deleting/clocking out the only row on a
 * trailing page does not strand the user on an empty page.
 */
function lastPageAfterRemoval(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total - 1) / pageSize))
}

/**
 * Clocking page (§3.5 of `phase_6.8_plan.md`, §A/B of
 * `phase_6.8_ux_research.md`) — replaces the legacy
 * `views/employees/clocking.ts` page and the `ModulePlaceholder`
 * stub.
 *
 * Composition root. Both tabs are server-paginated:
 *  - Active  → `GET /api/clock-ins/clocked-in`
 *  - History → `GET /api/clock-ins` (`status=closed`)
 * Filters (missingOnly, employee search, date range), sorting, and
 * paging are query parameters, so the tables only ever hold one page.
 * The KPI strip, tab badge, duplicate badges, and the new-clock-in
 * picker guard read the separate `/clocked-in/stats` aggregate — the
 * figures stay correct even though the page subset is small. One
 * shared 1s tick feeds every live duration (legacy per-row interval
 * leak fixed).
 */
export function ClockingPage() {
  const { t } = useTranslation()
  useEnsureNamespace("clocking")
  const language = (useUIStore((s) => s.language) ?? "en") as "en" | "ar"
  const locale = resolveLocale(language)

  const {
    employees,
    loading: employeesLoading,
    error: employeesError,
  } = useClockingEmployees()
  const now = useNowTick(1000)
  /** Ticking local day — rolls the missing-clock-out filters at midnight. */
  const today = toLocalDateString(now)

  // ── Filter / UI state ────────────────────────────────────────
  const [tab, setTab] = useState<ClockingTab>("active")
  const [missingOnly, setMissingOnly] = useState(false)
  const [activeSort, setActiveSort] = useState<SortState>({
    columnId: "clockIn",
    direction: "asc",
  })
  const [activePage, setActivePage] = useState(1)
  const [activePageSize, setActivePageSize] = useState(DEFAULT_PAGE_SIZE)
  const [historySort, setHistorySort] = useState<SortState>({
    columnId: "clockIn",
    direction: "desc",
  })
  const [historySearch, setHistorySearch] = useState("")
  const [historyRange, setHistoryRange] = useState<HistoryFiltersState["range"]>({})
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ── Server state ─────────────────────────────────────────────
  const active = useActiveClockIns({
    page: activePage,
    pageSize: activePageSize,
    missingOnly,
    sort: activeSort,
    today,
  })
  const history = useClockIns({
    page: historyPage,
    pageSize: historyPageSize,
    search: historySearch,
    from: historyRange.from ? toLocalDateString(historyRange.from) : undefined,
    to: historyRange.to ? toLocalDateString(historyRange.to) : undefined,
    sort: historySort,
  })
  const stats = useClockingStats(today)

  // ── Modal / confirm state ────────────────────────────────────
  const [modal, setModal] = useState<ModalState | null>(null)
  const [clockOutTarget, setClockOutTarget] = useState<ClockIn | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClockIn | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // ── Derived data ─────────────────────────────────────────────
  const employeeMap = useMemo(() => {
    const map = new Map<number, EligibleEmployee>()
    for (const employee of employees) map.set(employee.employeeId, employee)
    return map
  }, [employees])

  /** Picker options — needClockIn && isActive, client-side (A18). */
  const pickerEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => employee.needClockIn && employee.isActive,
      ),
    [employees],
  )

  // ── Filter handlers (each resets its tab's page) ─────────────
  function handleMissingOnlyToggle() {
    setMissingOnly((value) => !value)
    setTab("active")
    setActivePage(1)
  }

  function handleActiveSortToggle(
    _id: string,
    next: { columnId: string; direction: "asc" | "desc" },
  ) {
    setActiveSort(next)
    setActivePage(1)
  }

  function handleActivePageSize(size: number) {
    setActivePageSize(size)
    setActivePage(1)
  }

  function handleHistorySearch(value: string) {
    setHistorySearch(value)
    setHistoryPage(1)
  }

  function handleHistoryRange(next: HistoryFiltersState["range"]) {
    setHistoryRange(next)
    setHistoryPage(1)
  }

  function handleHistorySortToggle(
    _id: string,
    next: { columnId: string; direction: "asc" | "desc" },
  ) {
    setHistorySort(next)
    setHistoryPage(1)
  }

  function handleHistoryPageSize(size: number) {
    setHistoryPageSize(size)
    setHistoryPage(1)
  }

  // ── Load errors → persistent toasts + retryable empty states ──
  // One toast for all three list sources so a network blip cannot
  // stack three identical messages.
  useEffect(() => {
    if (history.error || active.error || stats.error) {
      toast.error(t("clocking.messages.loadClockInsError"))
    }
  }, [history.error, active.error, stats.error, t])

  useEffect(() => {
    if (employeesError) {
      toast.error(t("clocking.messages.loadEmployeesError"))
    }
  }, [employeesError, t])

  /** Every mutation moves rows between the tabs and shifts the KPIs. */
  function refreshAll() {
    history.refresh()
    active.refresh()
    stats.refresh()
  }

  // ── Mutation handlers ────────────────────────────────────────
  function handleClockOut(row: ClockIn) {
    // Future-dated clock-in: quick clock-out now would create a
    // non-positive duration — block client-side (plan §3.7).
    if (new Date(row.clockIn).getTime() > now.getTime()) {
      toast.error(t("clocking.validation.clockOutAfterClockIn"))
      return
    }
    setClockOutTarget(row)
  }

  async function confirmClockOut() {
    if (!clockOutTarget) return
    setConfirmBusy(true)
    try {
      await quickClockOut(clockOutTarget.clockId, toWallNow())
      toast.success(t("clocking.messages.clockOutSuccess"))
      setClockOutTarget(null)
      // The row leaves the Active list — step back off a trailing page.
      const last = lastPageAfterRemoval(active.total, activePageSize)
      if (activePage > last) setActivePage(last)
      refreshAll()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t("clocking.messages.clockOutError"),
      )
    } finally {
      setConfirmBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setConfirmBusy(true)
    try {
      // 204 even for an already-deleted row — treated as success.
      await deleteClockIn(deleteTarget.clockId)
      toast.success(t("clocking.messages.deleteSuccess"))
      // An open row disappears from Active, a closed one from History.
      if (deleteTarget.clockOut) {
        const last = lastPageAfterRemoval(history.total, historyPageSize)
        if (historyPage > last) setHistoryPage(last)
      } else {
        const last = lastPageAfterRemoval(active.total, activePageSize)
        if (activePage > last) setActivePage(last)
      }
      setDeleteTarget(null)
      refreshAll()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t("clocking.messages.deleteError"),
      )
    } finally {
      setConfirmBusy(false)
    }
  }

  /** Local wall clock as `"YYYY-MM-DDTHH:mm"` (minute precision). */
  function toWallNow(): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return (
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `T${pad(now.getHours())}:${pad(now.getMinutes())}`
    )
  }

  const loadFailed = Boolean(history.error || active.error)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("clocking.title")}
        subtitle={t("clocking.subtitle")}
        eyebrow={t("sidebar.employees")}
        actions={
          <Button
            type="button"
            onClick={() => setModal({ mode: "create", clockIn: null })}
          >
            <PlusIcon aria-hidden className="me-2 size-4" />
            {t("clocking.buttons.newClockIn")}
          </Button>
        }
      />

      <ClockingKpiStrip
        activeCount={stats.activeCount}
        missingCount={stats.missingCount}
        over12hCount={stats.over12hCount}
        missingFilterActive={missingOnly}
        loading={stats.loading}
        onResetFilter={() => {
          setMissingOnly(false)
          setActivePage(1)
          setTab("active")
        }}
        onToggleMissingOnly={handleMissingOnlyToggle}
      />

      <ClockingTabs
        tab={tab}
        onTabChange={setTab}
        activeCount={stats.activeCount}
      >
        <TabsContent value="active" className="mt-0">
          <ActiveClockInsTable
            rows={active.rows}
            loading={active.loading}
            now={now}
            employeeMap={employeeMap}
            duplicateIds={stats.duplicateIds}
            locale={locale}
            sort={activeSort}
            onSortToggle={handleActiveSortToggle}
            pagination={{
              page: activePage,
              pageSize: activePageSize,
              total: active.total,
              onPageChange: setActivePage,
              onPageSizeChange: handleActivePageSize,
              pageSizes: PAGE_SIZES,
            }}
            onClockOut={handleClockOut}
            onEdit={(row) => setModal({ mode: "edit", clockIn: row })}
            onDelete={setDeleteTarget}
            emptyTitle={
              loadFailed
                ? t("clocking.messages.loadClockInsError")
                : t("clocking.messages.noActiveClockIns")
            }
            emptyDescription={
              loadFailed
                ? undefined
                : t("clocking.kpi.missingClockOutHintCalm")
            }
            emptyAction={
              loadFailed ? (
                <Button type="button" variant="outline" onClick={refreshAll}>
                  {t("clocking.messages.retry")}
                </Button>
              ) : undefined
            }
          />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <HistoryTable
            rows={history.clockIns}
            loading={history.loading}
            now={now}
            employeeMap={employeeMap}
            locale={locale}
            sort={historySort}
            onSortToggle={handleHistorySortToggle}
            pagination={{
              page: historyPage,
              pageSize: historyPageSize,
              total: history.total,
              onPageChange: setHistoryPage,
              onPageSizeChange: handleHistoryPageSize,
              pageSizes: PAGE_SIZES,
            }}
            onEdit={(row) => setModal({ mode: "edit", clockIn: row })}
            onDelete={setDeleteTarget}
            toolbar={
              <HistoryFilters
                range={historyRange}
                onChange={handleHistoryRange}
              />
            }
            search={{
              value: historySearch,
              onChange: handleHistorySearch,
              placeholder: t("clocking.placeholders.searchEmployee"),
            }}
            emptyTitle={
              loadFailed
                ? t("clocking.messages.loadClockInsError")
                : t("clocking.messages.noHistoryFound")
            }
            emptyDescription={
              loadFailed
                ? undefined
                : t("clocking.messages.noHistoryFound")
            }
            emptyAction={
              loadFailed ? (
                <Button type="button" variant="outline" onClick={refreshAll}>
                  {t("clocking.messages.retry")}
                </Button>
              ) : undefined
            }
          />
        </TabsContent>
      </ClockingTabs>

      <ClockInModal
        open={modal != null}
        onOpenChange={(open) => {
          if (!open) setModal(null)
        }}
        clockIn={modal?.mode === "edit" ? modal.clockIn : null}
        employees={pickerEmployees}
        employeesLoading={employeesLoading}
        openEmployeeIds={stats.openEmployeeIds}
        onSaved={refreshAll}
      />

      {/* Quick clock-out — warning tier, no destructive icon (markPaid
          pattern); finalizes the duration for payroll. */}
      <ConfirmDialog
        open={clockOutTarget != null}
        onOpenChange={(open) => {
          if (!open) setClockOutTarget(null)
        }}
        variant="warning"
        destructiveIcon={false}
        title={t("clocking.messages.clockOutConfirmTitle")}
        description={t("clocking.messages.clockOutConfirmText")}
        confirmLabel={t("clocking.buttons.confirmClockOut")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmClockOut}
        loading={confirmBusy}
      />

      {/* Delete — danger tier w/ payroll-consequence copy; active rows
          get the stronger "currently clocked in" description. */}
      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        variant="danger"
        destructiveIcon
        title={t("clocking.messages.deleteConfirmTitle")}
        description={
          deleteTarget && !deleteTarget.clockOut
            ? t("clocking.messages.deleteActiveConfirmText")
            : t("clocking.messages.deleteConfirmText")
        }
        confirmLabel={t("clocking.buttons.confirmDelete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDelete}
        loading={confirmBusy}
      />
    </div>
  )
}

export default ClockingPage
