"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { usePermission } from "@/hooks/usePermission"
import { ApiError } from "@/lib/errors"

import {
  deleteDoctor,
  deleteEmployee,
  markPaymentPaid,
  markPendingPaymentsPaid,
  voidPayment,
  voidPendingPayments,
  type PendingGroupSortKey,
} from "@/pages/Employees/api"
import {
  EmployeeFilterToolbar,
  type StatusFilter,
} from "@/pages/Employees/components/EmployeeFilterToolbar"
import { EmployeeTable } from "@/pages/Employees/components/EmployeeTable"
import { DoctorTable } from "@/pages/Employees/components/DoctorTable"
import {
  EmployeeDetailSheet,
  type StaffSubject,
} from "@/pages/Employees/components/EmployeeDetailSheet"
import {
  PaymentsTable,
  type DateRange,
} from "@/pages/Employees/components/PaymentsTable"
import { useDoctorList } from "@/pages/Employees/hooks/useDoctorList"
import { useEmployeePayments } from "@/pages/Employees/hooks/useEmployeePayments"
import { useEmployees } from "@/pages/Employees/hooks/useEmployees"
import { usePendingPaymentGroups } from "@/pages/Employees/hooks/usePendingPaymentGroups"
import { usePendingPaymentStats } from "@/pages/Employees/hooks/usePendingPaymentStats"
import { useTabSync } from "@/pages/Employees/hooks/useTabSync"
import { EmployeeModal } from "@/pages/Employees/modals/EmployeeModal"
import { PaymentModal } from "@/pages/Employees/modals/PaymentModal"
import type {
  EmployeePayment,
  EmployeeType,
  ShiftType,
} from "@/pages/Employees/types/employee"

const TABS = ["employees", "doctors", "nurses", "payments"] as const
type TabKey = (typeof TABS)[number]

type SortState = { columnId: string; direction: "asc" | "desc" } | null

const PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 10

/** Payments-table column ids → server sort keys. */
const PAYMENT_SORT_MAP: Record<string, PendingGroupSortKey> = {
  employeeName: "employee",
  totalAmount: "totalAmount",
  dateRange: "oldest",
}

/**
 * The page the list should fall back to after one row is removed —
 * used by the delete handlers so a trailing page cannot be left empty
 * (`react-hooks/set-state-in-effect` forbids clamping from an effect).
 */
function lastPageAfterRemoval(total: number, pageSize: number): number {
  const remaining = Math.max(0, total - 1)
  return Math.max(1, Math.ceil(remaining / pageSize))
}

/**
 * /employees — merged Employees | Doctors | Nurses | Payments page
 * (Phase 6.7, `phase_6.7-employees.md`).
 *
 * Tab state lives in the URL (`?tab=`); `/doctors` redirects here. All
 * four lists are server-side: every tab owns its page / page size /
 * sort state, the staff tabs share the search + status + shift
 * filters, and the payments queue adds its own employee-name search
 * and issue-date range. Rows are only fetched for the active tab.
 * Staff CRUD is admin-gated (server `adminOnly`); payments surfaces
 * require `manage_payments`.
 */
export default function EmployeesPage() {
  const { t } = useTranslation()
  useEnsureNamespace("employees")
  const { hasPermission, isAdmin } = usePermission()
  const canViewPayments = hasPermission("manage_payments")

  const [tab, setTab] = useTabSync(TABS, "employees")

  /* Per-tab filters. */
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [shiftFilter, setShiftFilter] = useState<ShiftType | "">("")
  const [doctorTypeFilter, setDoctorTypeFilter] = useState("")
  const [paymentSearch, setPaymentSearch] = useState("")
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" })

  /* Per-tab pagination + sorting (server-side). */
  const [employeePage, setEmployeePage] = useState(1)
  const [employeePageSize, setEmployeePageSize] = useState(DEFAULT_PAGE_SIZE)
  const [employeeSort, setEmployeeSort] = useState<SortState>(null)
  const [nursePage, setNursePage] = useState(1)
  const [nursePageSize, setNursePageSize] = useState(DEFAULT_PAGE_SIZE)
  const [nurseSort, setNurseSort] = useState<SortState>(null)
  const [doctorPage, setDoctorPage] = useState(1)
  const [doctorPageSize, setDoctorPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [doctorSort, setDoctorSort] = useState<SortState>(null)
  const [paymentPage, setPaymentPage] = useState(1)
  const [paymentPageSize, setPaymentPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [paymentSort, setPaymentSort] = useState<SortState>(null)

  const staffFilters = {
    search,
    isActive:
      statusFilter === "all" ? undefined : statusFilter === "active",
    shiftType: shiftFilter,
  }

  const employeesList = useEmployees({
    enabled: tab === "employees",
    page: employeePage,
    pageSize: employeePageSize,
    type: "other",
    sort: employeeSort,
    ...staffFilters,
  })

  const nursesList = useEmployees({
    enabled: tab === "nurses",
    page: nursePage,
    pageSize: nursePageSize,
    type: "nurse",
    sort: nurseSort,
    ...staffFilters,
  })

  const doctorsList = useDoctorList({
    enabled: tab === "doctors",
    page: doctorPage,
    pageSize: doctorPageSize,
    doctorType: doctorTypeFilter,
    sort: doctorSort,
    ...staffFilters,
  })

  const paymentsEnabled = tab === "payments" && canViewPayments
  const pendingGroups = usePendingPaymentGroups({
    enabled: paymentsEnabled,
    page: paymentPage,
    pageSize: paymentPageSize,
    from: dateRange.from,
    to: dateRange.to,
    search: paymentSearch,
    sort: paymentSort
      ? PAYMENT_SORT_MAP[paymentSort.columnId]
      : undefined,
    dir: paymentSort?.direction,
  })
  const pendingStats = usePendingPaymentStats({
    enabled: paymentsEnabled,
    from: dateRange.from,
    to: dateRange.to,
    search: paymentSearch,
  })

  /* Modal / sheet / confirm state. */
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffSubject | null>(null)
  const [creatingType, setCreatingType] = useState<EmployeeType>("other")
  const [paymentFor, setPaymentFor] = useState<StaffSubject | null>(null)
  const [deleting, setDeleting] = useState<StaffSubject | null>(null)
  const [sheetSubject, setSheetSubject] = useState<StaffSubject | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [markPaidTarget, setMarkPaidTarget] =
    useState<EmployeePayment | null>(null)
  const [voidTarget, setVoidTarget] = useState<EmployeePayment | null>(null)
  const [markAllFor, setMarkAllFor] = useState<number | null>(null)
  const [voidAllFor, setVoidAllFor] = useState<number | null>(null)

  /* The detail sheet fetches only the open employee's payments. */
  const sheetPayments = useEmployeePayments(
    sheetOpen ? (sheetSubject?.employeeId ?? null) : null,
    sheetOpen && canViewPayments
  )

  /* --------------------------- Page handlers --------------------------- */

  function handleSearchChange(value: string) {
    setSearch(value)
    setEmployeePage(1)
    setNursePage(1)
    setDoctorPage(1)
  }

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setEmployeePage(1)
    setNursePage(1)
    setDoctorPage(1)
  }

  function handleShiftFilterChange(value: ShiftType | "") {
    setShiftFilter(value)
    setEmployeePage(1)
    setNursePage(1)
    setDoctorPage(1)
  }

  function handleDoctorTypeFilterChange(value: string) {
    setDoctorTypeFilter(value)
    setDoctorPage(1)
  }

  function handleEmployeeSortToggle(_id: string, next: SortState) {
    setEmployeeSort(next)
    setEmployeePage(1)
  }

  function handleNurseSortToggle(_id: string, next: SortState) {
    setNurseSort(next)
    setNursePage(1)
  }

  function handleDoctorSortToggle(_id: string, next: SortState) {
    setDoctorSort(next)
    setDoctorPage(1)
  }

  function handlePaymentSortToggle(_id: string, next: SortState) {
    setPaymentSort(next)
    setPaymentPage(1)
  }

  function handlePaymentSearchChange(value: string) {
    setPaymentSearch(value)
    setPaymentPage(1)
  }

  function handleDateRangeChange(range: DateRange) {
    setDateRange(range)
    setPaymentPage(1)
  }

  /* ------------------------------ Mutations ------------------------------ */

  function refreshAll() {
    employeesList.refresh()
    nursesList.refresh()
    doctorsList.refresh()
    if (canViewPayments) {
      pendingGroups.refresh()
      pendingStats.refresh()
    }
  }

  function errorMessage(err: unknown, fallbackKey: string): string {
    return err instanceof ApiError ? err.message : t(fallbackKey)
  }

  function openCreate() {
    setEditing(null)
    setCreatingType(
      tab === "doctors" ? "doctor" : tab === "nurses" ? "nurse" : "other"
    )
    setModalOpen(true)
  }

  function openSheet(subject: StaffSubject) {
    setSheetSubject(subject)
    setSheetOpen(true)
  }

  /** Step back one page when the deletion empties a trailing page. */
  function clampAfterDelete(type: EmployeeType) {
    if (type === "doctor") {
      const lastPage = lastPageAfterRemoval(doctorsList.total, doctorPageSize)
      if (doctorPage > lastPage) setDoctorPage(lastPage)
      return
    }
    if (type === "nurse") {
      const lastPage = lastPageAfterRemoval(nursesList.total, nursePageSize)
      if (nursePage > lastPage) setNursePage(lastPage)
      return
    }
    const lastPage = lastPageAfterRemoval(
      employeesList.total,
      employeePageSize
    )
    if (employeePage > lastPage) setEmployeePage(lastPage)
  }

  function clampAfterGroupRemoval() {
    const lastPage = lastPageAfterRemoval(
      pendingGroups.total,
      paymentPageSize
    )
    if (paymentPage > lastPage) setPaymentPage(lastPage)
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      if (deleting.employeeType === "doctor") {
        await deleteDoctor(deleting.employeeId)
      } else {
        await deleteEmployee(deleting.employeeId)
      }
      toast.success(t("employees.messages.deleteSuccess"))
      setDeleting(null)
      setSheetOpen(false)
      clampAfterDelete(deleting.employeeType)
      refreshAll()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.deleteError"))
      throw err
    }
  }

  async function confirmMarkPaid() {
    if (!markPaidTarget) return
    try {
      await markPaymentPaid(markPaidTarget.paymentId)
      toast.success(t("employees.messages.markPaidSuccess"))
      setMarkPaidTarget(null)
      pendingGroups.refresh()
      pendingStats.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.markPaidError"))
      throw err
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return
    try {
      await voidPayment(voidTarget.paymentId)
      toast.success(t("employees.messages.voidSuccess"))
      setVoidTarget(null)
      pendingGroups.refresh()
      pendingStats.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.voidError"))
      throw err
    }
  }

  async function confirmMarkAllPaid() {
    if (markAllFor == null) return
    try {
      await markPendingPaymentsPaid(markAllFor)
      toast.success(t("employees.messages.markAllPaidSuccess"))
      setMarkAllFor(null)
      clampAfterGroupRemoval()
      pendingGroups.refresh()
      pendingStats.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.markAllPaidError"))
      throw err
    }
  }

  async function confirmVoidAll() {
    if (voidAllFor == null) return
    try {
      await voidPendingPayments(voidAllFor)
      toast.success(t("employees.messages.voidAllSuccess"))
      setVoidAllFor(null)
      clampAfterGroupRemoval()
      pendingGroups.refresh()
      pendingStats.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.voidAllError"))
      throw err
    }
  }

  /* -------------------------------- Render -------------------------------- */

  /**
   * Shared empty-state copy: load failures win, then "no matches"
   * once a filter or search is active, otherwise the table default.
   */
  function emptyStateFor(
    query: { loading: boolean; error: Error | null; refresh: () => void },
    hasFilters: boolean
  ): {
    emptyTitle?: string
    emptyDescription?: string
    emptyAction?: React.ReactNode
  } {
    if (query.error) {
      return {
        emptyTitle: t("employees.messages.loadError"),
        emptyAction: (
          <Button onClick={query.refresh}>{t("employees.buttons.retry")}</Button>
        ),
      }
    }
    if (hasFilters && !query.loading) {
      return {
        emptyTitle: t("employees.messages.noMatchesStaff"),
        emptyDescription: t("employees.messages.noMatchesStaffDesc"),
      }
    }
    return {}
  }

  const staffHasFilters = Boolean(
    search.trim() || statusFilter !== "all" || shiftFilter
  )
  const employeesEmpty = emptyStateFor(employeesList, staffHasFilters)
  const nursesEmpty = emptyStateFor(nursesList, staffHasFilters)
  const doctorsEmpty = emptyStateFor(
    doctorsList,
    staffHasFilters || Boolean(doctorTypeFilter)
  )
  const paymentsFiltered = Boolean(
    paymentSearch.trim() || dateRange.from || dateRange.to
  )

  const createLabel =
    tab === "doctors"
      ? t("employees.createNewDoctor")
      : tab === "nurses"
        ? t("employees.createNewNurse")
        : t("employees.createNew")

  const staffToolbar = (showDoctorType: boolean) => (
    <EmployeeFilterToolbar
      statusFilter={statusFilter}
      onStatusFilterChange={handleStatusFilterChange}
      shiftFilter={shiftFilter}
      onShiftFilterChange={handleShiftFilterChange}
      doctorTypeFilter={doctorTypeFilter}
      onDoctorTypeFilterChange={handleDoctorTypeFilterChange}
      showDoctorType={showDoctorType}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("employees.title")}
        subtitle={t("employees.subtitle")}
        eyebrow={t("sidebar.employees")}
        actions={
          tab !== "payments" && isAdmin() ? (
            <Button onClick={openCreate}>
              <PlusIcon aria-hidden className="me-2 size-4" />
              {createLabel}
            </Button>
          ) : null
        }
      />

      {/* Explicit flex-col: the shared Tabs primitive styles orientation
          via `data-horizontal:` variants that are not defined in
          index.css (dead classes), so without this override the root
          renders as a row and the tab list lands beside the content. */}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabKey)}
        className="flex flex-col gap-4"
      >
        <TabsList className="w-fit max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="employees">
            {t("employees.tabs.employees")}
          </TabsTrigger>
          <TabsTrigger value="doctors">
            {t("employees.tabs.doctors")}
          </TabsTrigger>
          <TabsTrigger value="nurses">{t("employees.tabs.nurses")}</TabsTrigger>
          {canViewPayments ? (
            <TabsTrigger value="payments">
              {t("employees.tabs.payments")}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="employees">
          <EmployeeTable
            employees={employeesList.employees}
            loading={employeesList.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{
              value: search,
              onChange: handleSearchChange,
              placeholder: t("employees.searchPlaceholder"),
            }}
            toolbar={staffToolbar(false)}
            pagination={{
              page: employeePage,
              pageSize: employeePageSize,
              total: employeesList.total,
              onPageChange: setEmployeePage,
              onPageSizeChange: (size) => {
                setEmployeePageSize(size)
                setEmployeePage(1)
              },
              pageSizes: PAGE_SIZES,
            }}
            sort={employeeSort}
            onSortToggle={handleEmployeeSortToggle}
            emptyTitle={employeesEmpty.emptyTitle}
            emptyDescription={employeesEmpty.emptyDescription}
            emptyAction={employeesEmpty.emptyAction}
            onView={openSheet}
            onEdit={(employee) => {
              setEditing(employee)
              setModalOpen(true)
            }}
            onDelete={setDeleting}
            onCreatePayment={setPaymentFor}
          />
        </TabsContent>

        <TabsContent value="doctors">
          <DoctorTable
            doctors={doctorsList.doctors}
            loading={doctorsList.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{
              value: search,
              onChange: handleSearchChange,
              placeholder: t("employees.searchDoctorsPlaceholder"),
            }}
            toolbar={staffToolbar(true)}
            pagination={{
              page: doctorPage,
              pageSize: doctorPageSize,
              total: doctorsList.total,
              onPageChange: setDoctorPage,
              onPageSizeChange: (size) => {
                setDoctorPageSize(size)
                setDoctorPage(1)
              },
              pageSizes: PAGE_SIZES,
            }}
            sort={doctorSort}
            onSortToggle={handleDoctorSortToggle}
            emptyTitle={doctorsEmpty.emptyTitle}
            emptyDescription={doctorsEmpty.emptyDescription}
            emptyAction={doctorsEmpty.emptyAction}
            onView={openSheet}
            onEdit={(doctor) => {
              setEditing(doctor)
              setModalOpen(true)
            }}
            onDelete={setDeleting}
            onCreatePayment={setPaymentFor}
          />
        </TabsContent>

        <TabsContent value="nurses">
          <EmployeeTable
            employees={nursesList.employees}
            loading={nursesList.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{
              value: search,
              onChange: handleSearchChange,
              placeholder: t("employees.searchNursesPlaceholder"),
            }}
            toolbar={staffToolbar(false)}
            pagination={{
              page: nursePage,
              pageSize: nursePageSize,
              total: nursesList.total,
              onPageChange: setNursePage,
              onPageSizeChange: (size) => {
                setNursePageSize(size)
                setNursePage(1)
              },
              pageSizes: PAGE_SIZES,
            }}
            sort={nurseSort}
            onSortToggle={handleNurseSortToggle}
            emptyTitle={nursesEmpty.emptyTitle}
            emptyDescription={nursesEmpty.emptyDescription}
            emptyAction={nursesEmpty.emptyAction}
            onView={openSheet}
            onEdit={(employee) => {
              setEditing(employee)
              setModalOpen(true)
            }}
            onDelete={setDeleting}
            onCreatePayment={setPaymentFor}
          />
        </TabsContent>

        {canViewPayments ? (
          <TabsContent value="payments">
            <PaymentsTable
              groups={pendingGroups.groups}
              loading={pendingGroups.loading}
              pagination={{
                page: paymentPage,
                pageSize: paymentPageSize,
                total: pendingGroups.total,
                onPageChange: setPaymentPage,
                onPageSizeChange: (size) => {
                  setPaymentPageSize(size)
                  setPaymentPage(1)
                },
                pageSizes: PAGE_SIZES,
              }}
              search={{
                value: paymentSearch,
                onChange: handlePaymentSearchChange,
                placeholder: t("employees.searchPaymentsPlaceholder"),
              }}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              sort={paymentSort}
              onSortToggle={handlePaymentSortToggle}
              pendingCount={pendingStats.pendingCount}
              emptyTitle={
                pendingGroups.error
                  ? t("employees.messages.loadError")
                  : paymentsFiltered && !pendingGroups.loading
                    ? t("employees.messages.noMatchingPayments")
                    : undefined
              }
              emptyDescription={
                pendingGroups.error
                  ? undefined
                  : paymentsFiltered && !pendingGroups.loading
                    ? t("employees.messages.noMatchesStaffDesc")
                    : undefined
              }
              onMarkPaid={setMarkPaidTarget}
              onVoid={setVoidTarget}
              onMarkAllPaid={setMarkAllFor}
              onVoidAll={setVoidAllFor}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Employee create/edit */}
      <EmployeeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialType={creatingType}
        editing={editing}
        onSaved={refreshAll}
      />

      {/* Manual payment */}
      <PaymentModal
        open={paymentFor != null}
        onOpenChange={(open) => {
          if (!open) setPaymentFor(null)
        }}
        employee={paymentFor}
        onSaved={refreshAll}
      />

      {/* Employee detail sheet — fetches this employee's payments on open */}
      <EmployeeDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        subject={sheetSubject}
        payments={sheetPayments.payments}
        paymentsLoading={sheetPayments.loading}
        paidByNames={sheetPayments.paidByNames}
        canViewPayments={canViewPayments}
        isAdmin={isAdmin()}
        onEdit={(subject) => {
          setSheetOpen(false)
          setEditing(subject)
          setModalOpen(true)
        }}
        onCreatePayment={(subject) => setPaymentFor(subject)}
        onMarkPaid={setMarkPaidTarget}
        onVoid={setVoidTarget}
      />

      {/* Delete employee/doctor */}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        variant="danger"
        title={t("employees.messages.deleteConfirmTitle")}
        description={t("employees.messages.deleteConfirmText")}
        confirmLabel={t("common.deleteConfirm")}
        onConfirm={confirmDelete}
      />

      {/* Mark paid / void (single) */}
      <ConfirmDialog
        open={markPaidTarget != null}
        onOpenChange={(open) => {
          if (!open) setMarkPaidTarget(null)
        }}
        variant="warning"
        destructiveIcon={false}
        title={t("employees.messages.markPaidConfirmTitle")}
        description={t("employees.messages.markPaidConfirmText")}
        confirmLabel={t("common.confirm")}
        onConfirm={confirmMarkPaid}
      />
      <ConfirmDialog
        open={voidTarget != null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null)
        }}
        variant="danger"
        title={t("employees.messages.voidConfirmTitle")}
        description={t("employees.messages.voidConfirmText")}
        confirmLabel={t("common.confirm")}
        onConfirm={confirmVoid}
      />

      {/* Bulk mark paid / void all */}
      <ConfirmDialog
        open={markAllFor != null}
        onOpenChange={(open) => {
          if (!open) setMarkAllFor(null)
        }}
        variant="warning"
        destructiveIcon={false}
        title={t("employees.messages.markAllPaidConfirmTitle")}
        description={t("employees.messages.markAllPaidConfirmText")}
        confirmLabel={t("common.confirm")}
        onConfirm={confirmMarkAllPaid}
      />
      <ConfirmDialog
        open={voidAllFor != null}
        onOpenChange={(open) => {
          if (!open) setVoidAllFor(null)
        }}
        variant="danger"
        title={t("employees.messages.voidAllConfirmTitle")}
        description={t("employees.messages.voidAllConfirmText")}
        confirmLabel={t("common.confirm")}
        onConfirm={confirmVoidAll}
      />
    </div>
  )
}
