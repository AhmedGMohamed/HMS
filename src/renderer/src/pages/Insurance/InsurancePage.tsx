"use client"

/**
 * Insurance page — Phase 6.10.
 *
 * Composition root for the two-view module: a paginated card grid of
 * insurance companies (`/insurance`) ↔ a detail view
 * (`/insurance/:companyId`). The selected company lives in the URL rather
 * than component state so the view is deep-linkable, survives refresh, and
 * gives the breadcrumb a real third level (`Dashboard / Insurance
 * Companies / <name>`); the name itself is published through
 * `useBreadcrumbLabel` because `lib/breadcrumbs.ts` only sees the path.
 *
 * All dialogs are wired here:
 *
 *   CompanyModal          add / edit (manage_insurance)
 *   PaymentModal          record a payment
 *   PaymentHistoryDialog  payment ledger
 *   ClearBalanceModal     advance `last_cleared_date`
 *   ReportModal           company report options   (manage_reports)
 *   ReportDetailsModal    company report result    (PDF + CSV)
 *   PatientReportModal    per-patient options      (manage_reports)
 *   PatientReportDetails  per-patient result       (PDF + CSV)
 *
 * References: plan §1.2 (contract), §3 (UX), §4 (steps), §5 (legacy bugs
 * not replicated), design.md §6.1/§6.2/§6.4.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, Navigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { DataTablePagination } from "@/components/common/DataTablePagination"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/errors"
import { useBreadcrumbLabel } from "@/hooks/useBreadcrumbLabel"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { usePermission } from "@/hooks/usePermission"

import { InsuranceCardsGrid } from "@/pages/Insurance/components/InsuranceCardsGrid"
import { CompanyDetailsCard } from "@/pages/Insurance/components/CompanyDetailsCard"
import { StatisticsKpiStrip } from "@/pages/Insurance/components/StatisticsKpiStrip"
import { PatientsGrid } from "@/pages/Insurance/components/PatientsGrid"

import { CompanyModal } from "@/pages/Insurance/modals/CompanyModal"
import { PaymentModal } from "@/pages/Insurance/modals/PaymentModal"
import { PaymentHistoryDialog } from "@/pages/Insurance/modals/PaymentHistoryDialog"
import { ClearBalanceModal } from "@/pages/Insurance/modals/ClearBalanceModal"
import { ReportModal } from "@/pages/Insurance/modals/ReportModal"
import { PatientReportModal } from "@/pages/Insurance/modals/PatientReportModal"
import { ReportDetailsModal } from "@/pages/Insurance/modals/ReportDetailsModal"
import { PatientReportDetailsModal } from "@/pages/Insurance/modals/PatientReportDetailsModal"

import { useInsuranceCompanies } from "@/pages/Insurance/hooks/useInsuranceCompanies"
import { useInsuranceDetail } from "@/pages/Insurance/hooks/useInsuranceDetail"
import {
  useCompanyReport,
  usePatientReport,
} from "@/pages/Insurance/hooks/useInsuranceReports"
import type {
  InsurancePatient,
  ReportPayload,
} from "@/pages/Insurance/types/insurance"

export default function InsurancePage() {
  const { t } = useTranslation()
  useEnsureNamespace("insurance")

  const { hasPermission } = usePermission()
  /* Report endpoints sit behind `manage_reports` on top of
     `manage_insurance`, so the two report entry points are gated. */
  const canManageReports = hasPermission("manage_reports")

  const companies = useInsuranceCompanies()

  const { companyId } = useParams<{ companyId: string }>()

  /** `null` → list view. A malformed segment is treated as "not selected". */
  const selectedId = useMemo(() => {
    if (!companyId) return null
    const parsed = Number(companyId)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }, [companyId])
  const invalidCompanyId = companyId != null && selectedId == null

  const detail = useInsuranceDetail(selectedId)

  /* Feeds the third breadcrumb (`/insurance/:companyId` → company name). */
  useBreadcrumbLabel(detail.company?.name ?? null)

  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [reportOptionsOpen, setReportOptionsOpen] = useState(false)
  const [patientReportTarget, setPatientReportTarget] =
    useState<InsurancePatient | null>(null)
  const [reportSubmitting, setReportSubmitting] = useState(false)

  const companyReport = useCompanyReport()
  const patientReport = usePatientReport()

  /* Persistent toast, once per load failure (Vault 6.9 pattern). */
  const listErrorToasted = useRef(false)
  useEffect(() => {
    if (companies.error && !listErrorToasted.current) {
      listErrorToasted.current = true
      toast.error(
        companies.error instanceof ApiError
          ? companies.error.message
          : t("insurance.messages.loadError"),
        { duration: Number.POSITIVE_INFINITY }
      )
    }
    if (!companies.error) listErrorToasted.current = false
  }, [companies.error, t])

  const detailErrorToasted = useRef(false)
  useEffect(() => {
    if (detail.error && !detailErrorToasted.current) {
      detailErrorToasted.current = true
      toast.error(
        detail.error instanceof ApiError
          ? detail.error.message
          : t("insurance.messages.loadDetailsError"),
        { duration: Number.POSITIVE_INFINITY }
      )
    }
    if (!detail.error) detailErrorToasted.current = false
  }, [detail.error, t])

  const refreshAfterMutation = useCallback(() => {
    companies.refresh()
    if (selectedId != null) detail.refresh()
  }, [companies, detail, selectedId])

  const handleCompanyReportSubmit = useCallback(
    async (payload: ReportPayload) => {
      if (selectedId == null) return
      setReportSubmitting(true)
      const error = await companyReport.generate(selectedId, payload)
      setReportSubmitting(false)
      if (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : t("insurance.messages.reportError")
        )
        return
      }
      setReportOptionsOpen(false)
    },
    [selectedId, companyReport, t]
  )

  const handlePatientReportSubmit = useCallback(
    async (payload: ReportPayload) => {
      if (selectedId == null || !patientReportTarget) return
      setReportSubmitting(true)
      const error = await patientReport.generate(
        selectedId,
        patientReportTarget.patientId,
        payload
      )
      setReportSubmitting(false)
      if (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : t("insurance.messages.reportError")
        )
        return
      }
      setPatientReportTarget(null)
    },
    [selectedId, patientReportTarget, patientReport, t]
  )

  /* `/insurance/not-a-number` → canonical list URL. */
  if (invalidCompanyId) {
    return <Navigate to="/insurance" replace />
  }

  /* ----------------------------------------------------------------
     List view
     ---------------------------------------------------------------- */
  if (selectedId == null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("insurance.title")}
          actions={
            <Button type="button" onClick={() => setCompanyModalOpen(true)}>
              <PlusIcon aria-hidden className="me-1.5 size-4" />
              {t("insurance.buttons.addCompany")}
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 inset-s-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={companies.search}
              onChange={(event) => companies.setSearch(event.currentTarget.value)}
              placeholder={t("insurance.messages.searchPlaceholder")}
              aria-label={t("common.search")}
              className="ps-9 pe-9"
            />
            {companies.search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("common.clear")}
                className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
                onClick={() => companies.setSearch("")}
              >
                <XIcon aria-hidden />
              </Button>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={companies.refresh}
            disabled={companies.loading}
          >
            <RotateCcwIcon aria-hidden className="me-1.5 size-4" />
            {t("common.refresh")}
          </Button>
        </div>

        {companies.error && !companies.loading ? (
          <Alert variant="destructive">
            <AlertDescription>
              {companies.error instanceof ApiError
                ? companies.error.message
                : t("insurance.messages.loadError")}
            </AlertDescription>
          </Alert>
        ) : null}

        {companies.isEmpty && !companies.search ? (
          <EmptyState
            title={t("insurance.emptyState.title")}
            description={t("insurance.emptyState.description")}
            icon={<ShieldCheckIcon className="size-8" />}
            action={
              <Button type="button" onClick={() => setCompanyModalOpen(true)}>
                <PlusIcon aria-hidden className="me-1.5 size-4" />
                {t("insurance.buttons.addCompany")}
              </Button>
            }
          />
        ) : companies.isEmpty ? (
          <EmptyState
            title={t("common.noData")}
            description={t("insurance.messages.searchEmpty")}
            icon={<SearchIcon className="size-8" />}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => companies.setSearch("")}
              >
                {t("common.clear")}
              </Button>
            }
          />
        ) : (
          <InsuranceCardsGrid
            companies={companies.data}
            loading={companies.loading && companies.data.length === 0}
          />
        )}

        {companies.total > 0 ? (
          <DataTablePagination
            page={companies.page}
            pageSize={companies.pageSize}
            total={companies.total}
            onPageChange={companies.setPage}
            onPageSizeChange={companies.setPageSize}
          />
        ) : null}

        <CompanyModal
          open={companyModalOpen}
          onOpenChange={setCompanyModalOpen}
          company={null}
          onSaved={refreshAfterMutation}
        />
      </div>
    )
  }

  /* ----------------------------------------------------------------
     Detail view
     ---------------------------------------------------------------- */
  const company = detail.company
  const companyName = company?.name ?? ""

  return (
    <div className="space-y-6">
      <PageHeader
        title={companyName || t("insurance.title")}
        subtitle={t("insurance.companyDetails")}
        actions={
          <Button variant="outline" asChild>
            <Link to="/insurance">
              <ArrowLeftIcon
                aria-hidden
                className="me-1.5 size-4 rtl:rotate-180"
              />
              {t("insurance.buttons.backToList")}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <CompanyDetailsCard
          company={company}
          loading={detail.loading}
          canManageReports={canManageReports}
          onEdit={() => setCompanyModalOpen(true)}
          onPayment={() => setPaymentModalOpen(true)}
          onReport={() => setReportOptionsOpen(true)}
        />

        <div className="lg:col-span-2">
          {detail.error && !detail.loading ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {detail.error instanceof ApiError
                    ? detail.error.message
                    : t("insurance.messages.loadDetailsError")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={detail.refresh}
                >
                  <RotateCcwIcon aria-hidden className="me-1.5 size-4" />
                  {t("common.refresh")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <StatisticsKpiStrip
              statistics={detail.statistics}
              lastClearedDate={company?.lastClearedDate ?? null}
              loading={detail.loading}
              onClearBalance={() => setClearOpen(true)}
              onViewPayments={() => setHistoryOpen(true)}
            />
          )}
        </div>
      </div>

      <PatientsGrid
        patients={detail.patients}
        loading={detail.loading}
        canManageReports={canManageReports}
        onGenerateReport={(patient) => setPatientReportTarget(patient)}
      />

      <CompanyModal
        open={companyModalOpen}
        onOpenChange={setCompanyModalOpen}
        company={company}
        onSaved={refreshAfterMutation}
      />

      <PaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        companyId={selectedId}
        companyName={companyName}
        onSaved={refreshAfterMutation}
      />

      <PaymentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        companyId={selectedId}
        companyName={companyName}
      />

      <ClearBalanceModal
        open={clearOpen}
        onOpenChange={setClearOpen}
        companyId={selectedId}
        companyName={companyName}
        onSaved={refreshAfterMutation}
      />

      <ReportModal
        open={reportOptionsOpen}
        onOpenChange={setReportOptionsOpen}
        companyName={companyName}
        submitting={reportSubmitting}
        onSubmit={handleCompanyReportSubmit}
      />

      <PatientReportModal
        open={patientReportTarget != null}
        onOpenChange={(next) => {
          if (!next) setPatientReportTarget(null)
        }}
        patientName={patientReportTarget?.name ?? ""}
        submitting={reportSubmitting}
        onSubmit={handlePatientReportSubmit}
      />

      <ReportDetailsModal
        open={companyReport.open}
        report={companyReport.data}
        loading={companyReport.loading}
        error={companyReport.error}
        onClose={companyReport.close}
      />

      <PatientReportDetailsModal
        open={patientReport.open}
        report={patientReport.data}
        loading={patientReport.loading}
        error={patientReport.error}
        onClose={patientReport.close}
      />
    </div>
  )
}
