"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  voidPayment,
} from "@/pages/Employees/api"
import { EmployeeFilterToolbar, type StatusFilter } from "@/pages/Employees/components/EmployeeFilterToolbar"
import { EmployeeTable } from "@/pages/Employees/components/EmployeeTable"
import { DoctorTable } from "@/pages/Employees/components/DoctorTable"
import { EmployeeDetailSheet, type StaffSubject } from "@/pages/Employees/components/EmployeeDetailSheet"
import { PaymentsTable, type DateRange, type PaymentGroup } from "@/pages/Employees/components/PaymentsTable"
import { useEmployees } from "@/pages/Employees/hooks/useEmployees"
import { useEmployeePayments } from "@/pages/Employees/hooks/useEmployeePayments"
import { useTabSync } from "@/pages/Employees/hooks/useTabSync"
import { EmployeeModal } from "@/pages/Employees/modals/EmployeeModal"
import { PaymentModal } from "@/pages/Employees/modals/PaymentModal"
import type {
  Employee,
  EmployeePayment,
  EmployeeType,
  ShiftType,
} from "@/pages/Employees/types/employee"

const TABS = ["employees", "doctors", "nurses", "payments"] as const
type TabKey = (typeof TABS)[number]

function matchesDateRange(timestamp: string, range: DateRange): boolean {
  const time = new Date(timestamp).getTime()
  if (range.from) {
    const from = new Date(`${range.from}T00:00:00`).getTime()
    if (Number.isFinite(from) && time < from) return false
  }
  if (range.to) {
    const to = new Date(`${range.to}T23:59:59.999`).getTime()
    if (Number.isFinite(to) && time > to) return false
  }
  return true
}

/**
 * /employees — merged Employees | Doctors | Nurses | Payments page
 * (Phase 6.7, `phase_6.7-employees.md`). Tab state lives in the URL
 * (`?tab=`); `/doctors` redirects here. Staff CRUD is admin-gated
 * (server `adminOnly`); payments surfaces require `manage_payments`.
 */
export default function EmployeesPage() {
  const { t } = useTranslation()
  useEnsureNamespace("employees")
  const { hasPermission, isAdmin } = usePermission()
  const canViewPayments = hasPermission("manage_payments")

  const staff = useEmployees()
  const payments = useEmployeePayments(canViewPayments)
  const [tab, setTab] = useTabSync(TABS, "employees")

  /* Per-tab filters. */
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [shiftFilter, setShiftFilter] = useState<ShiftType | "">("")
  const [doctorTypeFilter, setDoctorTypeFilter] = useState("")
  const [sort, setSort] = useState<{
    columnId: string
    direction: "asc" | "desc"
  } | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" })

  /* Modal / sheet / confirm state. */
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffSubject | null>(null)
  const [creatingType, setCreatingType] = useState<EmployeeType>("other")
  const [paymentFor, setPaymentFor] = useState<StaffSubject | null>(null)
  const [deleting, setDeleting] = useState<StaffSubject | null>(null)
  const [sheetSubject, setSheetSubject] = useState<StaffSubject | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [markPaidTarget, setMarkPaidTarget] = useState<EmployeePayment | null>(null)
  const [voidTarget, setVoidTarget] = useState<EmployeePayment | null>(null)
  const [markAllFor, setMarkAllFor] = useState<number | null>(null)
  const [voidAllFor, setVoidAllFor] = useState<number | null>(null)

  /* Legacy `shown.bs.tab` behavior: refetch when the active tab
     changes (skipped on first mount — the hooks load on mount). */
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    staff.refresh()
    if (canViewPayments) payments.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /* ------------------------------ Filtering ------------------------------ */

  const staffFilters = useCallback(
    (employee: Employee): boolean => {
      if (statusFilter === "active" && !employee.isActive) return false
      if (statusFilter === "inactive" && employee.isActive) return false
      if (shiftFilter && employee.shiftType !== shiftFilter) return false
      return true
    },
    [statusFilter, shiftFilter]
  )

  const tabEmployees = useMemo(
    () =>
      tab === "nurses"
        ? staff.employees.filter((e) => e.employeeType === "nurse")
        : staff.employees.filter((e) => e.employeeType === "other"),
    [tab, staff.employees]
  )

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tabEmployees.filter(
      (employee) =>
        staffFilters(employee) &&
        (!query || employee.name.toLowerCase().includes(query))
    )
  }, [tabEmployees, search, staffFilters])

  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff.doctors.filter(
      (doctor) =>
        staffFilters(doctor) &&
        (!doctorTypeFilter || doctor.doctorType === doctorTypeFilter) &&
        (!query || doctor.name.toLowerCase().includes(query))
    )
  }, [staff.doctors, search, staffFilters, doctorTypeFilter])

  /* Work-queue groups: pending system payments, known employees only,
     date-range filtered (legacy unpaid-system equivalent). */
  const workQueueGroups = useMemo(() => {
    const knownIds = new Set([
      ...staff.employees.map((e) => e.employeeId),
      ...staff.doctors.map((d) => d.employeeId),
    ])
    const filtered = payments.pendingSystemPayments.filter(
      (p) => knownIds.has(p.employeeId) && matchesDateRange(p.issuedTimestamp, dateRange)
    )
    const grouped = new Map<number, EmployeePayment[]>()
    for (const payment of filtered) {
      const bucket = grouped.get(payment.employeeId)
      if (bucket) bucket.push(payment)
      else grouped.set(payment.employeeId, [payment])
    }
    const groups: PaymentGroup[] = [...grouped.entries()].map(
      ([employeeId, list]) => ({ employeeId, payments: list })
    )
    /* Oldest-first groups (list itself is already oldest-first). */
    groups.sort((a, b) =>
      issuedTimeOf(a.payments[0]) - issuedTimeOf(b.payments[0])
    )
    return groups
  }, [payments.pendingSystemPayments, staff.employees, staff.doctors, dateRange])

  const employeeNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const e of staff.employees) map.set(e.employeeId, e.name)
    for (const d of staff.doctors) map.set(d.employeeId, d.name)
    return map
  }, [staff.employees, staff.doctors])

  /* ------------------------------ Mutations ------------------------------ */

  function refreshAll() {
    staff.refresh()
    if (canViewPayments) payments.refresh()
  }

  function errorMessage(err: unknown, fallbackKey: string): string {
    return err instanceof ApiError ? err.message : t(fallbackKey)
  }

  function openCreate() {
    setEditing(null)
    setCreatingType(tab === "doctors" ? "doctor" : tab === "nurses" ? "nurse" : "other")
    setModalOpen(true)
  }

  function openSheet(subject: StaffSubject) {
    setSheetSubject(subject)
    setSheetOpen(true)
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
      payments.refresh()
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
      payments.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.voidError"))
      throw err
    }
  }

  async function confirmMarkAllPaid() {
    if (markAllFor == null) return
    const targets = pendingForEmployee(markAllFor)
    try {
      for (const payment of targets) {
        await markPaymentPaid(payment.paymentId)
      }
      toast.success(t("employees.messages.markAllPaidSuccess"))
      setMarkAllFor(null)
      payments.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.markAllPaidError"))
      payments.refresh()
      throw err
    }
  }

  async function confirmVoidAll() {
    if (voidAllFor == null) return
    const targets = pendingForEmployee(voidAllFor)
    try {
      for (const payment of targets) {
        await voidPayment(payment.paymentId)
      }
      toast.success(t("employees.messages.voidAllSuccess"))
      setVoidAllFor(null)
      payments.refresh()
    } catch (err) {
      toast.error(errorMessage(err, "employees.messages.voidAllError"))
      payments.refresh()
      throw err
    }
  }

  /** Payments the bulk action applies to — mirrors the legacy
   *  `getFilteredPaymentsForEmployee` (respects the date range). */
  function pendingForEmployee(employeeId: number): EmployeePayment[] {
    return payments.pendingSystemPayments.filter(
      (p) =>
        p.employeeId === employeeId &&
        matchesDateRange(p.issuedTimestamp, dateRange)
    )
  }

  /* -------------------------------- Render -------------------------------- */

  const createLabel =
    tab === "doctors"
      ? t("employees.createNewDoctor")
      : tab === "nurses"
        ? t("employees.createNewNurse")
        : t("employees.createNew")

  const staffToolbar = (showDoctorType: boolean) => (
    <EmployeeFilterToolbar
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      shiftFilter={shiftFilter}
      onShiftFilterChange={setShiftFilter}
      doctorTypeFilter={doctorTypeFilter}
      onDoctorTypeFilterChange={setDoctorTypeFilter}
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
          tab !== "payments" && isAdmin ? (
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
          <TabsTrigger value="employees">{t("employees.tabs.employees")}</TabsTrigger>
          <TabsTrigger value="doctors">{t("employees.tabs.doctors")}</TabsTrigger>
          <TabsTrigger value="nurses">{t("employees.tabs.nurses")}</TabsTrigger>
          {canViewPayments ? (
            <TabsTrigger value="payments">{t("employees.tabs.payments")}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="employees">
          <EmployeeTable
            employees={filteredEmployees}
            loading={staff.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{ value: search, onChange: setSearch }}
            toolbar={staffToolbar(false)}
            sort={sort}
            onSortToggle={(_id, next) => setSort(next)}
            emptyAction={
              staff.error ? (
                <Button onClick={staff.refresh}>{t("common.refresh")}</Button>
              ) : undefined
            }
            emptyTitle={
              staff.error ? t("employees.messages.loadError") : undefined
            }
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
            doctors={filteredDoctors}
            loading={staff.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{ value: search, onChange: setSearch }}
            toolbar={staffToolbar(true)}
            sort={sort}
            onSortToggle={(_id, next) => setSort(next)}
            emptyAction={
              staff.error ? (
                <Button onClick={staff.refresh}>{t("common.refresh")}</Button>
              ) : undefined
            }
            emptyTitle={
              staff.error ? t("employees.messages.loadError") : undefined
            }
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
            employees={filteredEmployees}
            loading={staff.loading}
            canViewPayments={canViewPayments}
            isAdmin={isAdmin()}
            search={{ value: search, onChange: setSearch }}
            toolbar={staffToolbar(false)}
            sort={sort}
            onSortToggle={(_id, next) => setSort(next)}
            emptyAction={
              staff.error ? (
                <Button onClick={staff.refresh}>{t("common.refresh")}</Button>
              ) : undefined
            }
            emptyTitle={
              staff.error ? t("employees.messages.loadError") : undefined
            }
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
              groups={workQueueGroups}
              employeeNames={employeeNames}
              loading={payments.loading}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
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
        onSaved={payments.refresh}
      />

      {/* Employee detail sheet */}
      <EmployeeDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        subject={sheetSubject}
        payments={
          sheetSubject
            ? (payments.paymentsByEmployee.get(sheetSubject.employeeId) ?? [])
            : []
        }
        paidByNames={payments.paidByNames}
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

function issuedTimeOf(payment: EmployeePayment | undefined): number {
  return payment ? new Date(payment.issuedTimestamp).getTime() : 0
}
