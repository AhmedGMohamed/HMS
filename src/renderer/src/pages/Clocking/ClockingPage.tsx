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
import { resolveLocale } from "@/lib/utils"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { useUIStore } from "@/store/uiStore"
import {
  quickClockOut,
  deleteClockIn,
} from "@/pages/Clocking/api"
import {
  countMissingClockOut,
  countOver12h,
  duplicateActiveEmployeeIds,
  isMissingClockOut,
} from "@/pages/Clocking/components/anomaly"
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
import { useClockIns } from "@/pages/Clocking/hooks/useClockIns"
import { useClockingEmployees } from "@/pages/Clocking/hooks/useClockingEmployees"
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

const HISTORY_PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_HISTORY_PAGE_SIZE = 25

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toSortable(rows: ClockIn[], sort: SortState): ClockIn[] {
  if (!sort) return rows
  const factor = sort.direction === "asc" ? 1 : -1
  const sorted = [...rows]
  sorted.sort((a, b) => {
    switch (sort.columnId) {
      case "employee":
        // Employee name sort falls back to id order for missing names.
        return factor
      case "clockIn":
        return factor * (new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime())
      case "clockOut": {
        const av = a.clockOut ? new Date(a.clockOut).getTime() : 0
        const bv = b.clockOut ? new Date(b.clockOut).getTime() : 0
        return factor * (av - bv)
      }
      case "duration": {
        const av =
          (a.clockOut ? new Date(a.clockOut).getTime() : Date.now()) -
          new Date(a.clockIn).getTime()
        const bv =
          (b.clockOut ? new Date(b.clockOut).getTime() : Date.now()) -
          new Date(b.clockIn).getTime()
        return factor * (av - bv)
      }
      case "payDeduction":
        return factor * (a.payDeduction - b.payDeduction)
      default:
        return 0
    }
  })
  return sorted
}

/**
 * Clocking page (§3.5 of `phase_6.8_plan.md`, §A/B of
 * `phase_6.8_ux_research.md`) — replaces the legacy
 * `views/employees/clocking.ts` page and the `ModulePlaceholder`
 * stub.
 *
 * Composition root: owns filter state (missingOnly chip, history
 * search + date range + sort + pagination), modal/confirm state, and
 * mutation handlers. All data derives client-side from the single
 * `GET /api/clock-ins` payload (backend has no query support) plus
 * the `manage_clocking`-scoped employee list (D1a). One shared 1s
 * tick feeds every live duration (legacy per-row interval leak fixed).
 */
export function ClockingPage() {
  const { t } = useTranslation()
  useEnsureNamespace("clocking")
  const language = (useUIStore((s) => s.language) ?? "en") as "en" | "ar"
  const locale = resolveLocale(language)

  const { clockIns, loading, error, refresh } = useClockIns()
  const {
    employees,
    loading: employeesLoading,
    error: employeesError,
  } = useClockingEmployees()
  const now = useNowTick(1000)

  // ── Filter / UI state ────────────────────────────────────────
  const [tab, setTab] = useState<ClockingTab>("active")
  const [missingOnly, setMissingOnly] = useState(false)
  const [activeSort, setActiveSort] = useState<SortState>({
    columnId: "clockIn",
    direction: "asc",
  })
  const [historySort, setHistorySort] = useState<SortState>({
    columnId: "clockIn",
    direction: "desc",
  })
  const [historySearch, setHistorySearch] = useState("")
  const [historyRange, setHistoryRange] = useState<HistoryFiltersState["range"]>({})
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(
    DEFAULT_HISTORY_PAGE_SIZE,
  )

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

  const openEmployeeIds = useMemo(() => {
    const ids = new Set<number>()
    for (const row of clockIns) {
      if (!row.clockOut) ids.add(row.employeeId)
    }
    return ids
  }, [clockIns])

  const duplicateIds = useMemo(() => duplicateActiveEmployeeIds(clockIns), [clockIns])

  const active = useMemo(
    () => clockIns.filter((row) => !row.clockOut),
    [clockIns],
  )
  const history = useMemo(
    () => clockIns.filter((row) => row.clockOut),
    [clockIns],
  )

  const missingCount = useMemo(
    () => countMissingClockOut(clockIns, now),
    [clockIns, now],
  )
  const over12hCount = useMemo(
    () => countOver12h(clockIns, now),
    [clockIns, now],
  )

  const activeRows = useMemo(() => {
    const filtered = missingOnly
      ? active.filter((row) => isMissingClockOut(row, now))
      : active
    return toSortable(filtered, activeSort)
  }, [active, missingOnly, now, activeSort])

  const historyRows = useMemo(() => {
    const search = historySearch.trim().toLowerCase()
    const from = historyRange.from ? startOfDay(historyRange.from).getTime() : null
    const to = historyRange.to
      ? startOfDay(historyRange.to).getTime() + 86_399_999
      : null
    const filtered = history.filter((row) => {
      if (search) {
        const name = employeeMap.get(row.employeeId)?.name ?? ""
        if (!name.toLowerCase().includes(search)) return false
      }
      const clockInMs = new Date(row.clockIn).getTime()
      if (from !== null && clockInMs < from) return false
      if (to !== null && clockInMs > to) return false
      return true
    })
    return toSortable(filtered, historySort)
  }, [history, historySearch, historyRange, historySort, employeeMap])

  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize
    return historyRows.slice(start, start + historyPageSize)
  }, [historyRows, historyPage, historyPageSize])

  // Reset to page 1 whenever the filter set changes under the user.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived-key reset, same pattern as useServices
    setHistoryPage(1)
  }, [historySearch, historyRange, historySort, historyPageSize])

  // ── Load errors → persistent toasts + retryable empty states ──
  useEffect(() => {
    if (error) {
      toast.error(t("clocking.messages.loadClockInsError"))
    }
  }, [error, t])

  useEffect(() => {
    if (employeesError) {
      toast.error(t("clocking.messages.loadEmployeesError"))
    }
  }, [employeesError, t])

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
      refresh()
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
      setDeleteTarget(null)
      refresh()
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

  const loadFailed = Boolean(error)

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
        activeCount={active.length}
        missingCount={missingCount}
        over12hCount={over12hCount}
        missingFilterActive={missingOnly}
        loading={loading}
        onResetFilter={() => {
          setMissingOnly(false)
          setTab("active")
        }}
        onToggleMissingOnly={() => {
          setMissingOnly((value) => !value)
          setTab("active")
        }}
      />

      <ClockingTabs
        tab={tab}
        onTabChange={setTab}
        activeCount={active.length}
      >
        <TabsContent value="active" className="mt-0">
          <ActiveClockInsTable
            rows={activeRows}
            loading={loading}
            now={now}
            employeeMap={employeeMap}
            duplicateIds={duplicateIds}
            locale={locale}
            sort={activeSort}
            onSortToggle={(_id, next) => setActiveSort(next)}
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
                <Button type="button" variant="outline" onClick={refresh}>
                  {t("clocking.messages.retry")}
                </Button>
              ) : undefined
            }
          />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <HistoryTable
            rows={pagedHistory}
            loading={loading}
            now={now}
            employeeMap={employeeMap}
            locale={locale}
            sort={historySort}
            onSortToggle={(_id, next) => setHistorySort(next)}
            pagination={{
              page: historyPage,
              pageSize: historyPageSize,
              total: historyRows.length,
              onPageChange: setHistoryPage,
              onPageSizeChange: setHistoryPageSize,
              pageSizes: HISTORY_PAGE_SIZES,
            }}
            onEdit={(row) => setModal({ mode: "edit", clockIn: row })}
            onDelete={setDeleteTarget}
            toolbar={
              <HistoryFilters
                range={historyRange}
                onChange={setHistoryRange}
              />
            }
            search={{
              value: historySearch,
              onChange: setHistorySearch,
              placeholder: t("clocking.placeholders.searchEmployee"),
              debounceMs: 300,
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
                <Button type="button" variant="outline" onClick={refresh}>
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
        openEmployeeIds={openEmployeeIds}
        onSaved={refresh}
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
