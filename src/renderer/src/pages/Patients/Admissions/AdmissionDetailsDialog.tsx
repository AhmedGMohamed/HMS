"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  BanknoteIcon,
  PrinterIcon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { useAdmissionDetails } from "@/pages/Patients/Admissions/hooks/useAdmissionDetails"
import type { PastAdmissionSummary } from "@/pages/Patients/Admissions/hooks/usePastAdmissions"
import { dismissalBadgeVariant } from "@/pages/Patients/Admissions/lib/dismissalBadgeVariant"
import {
  calculateLengthOfStay,
  formatCurrency,
  formatDateTime,
} from "@/pages/Patients/Admissions/lib/admissionFormat"
import {
  groupAdmissionDrugs,
  groupAdmissionServices,
  groupAdmissionSupplies,
  type AdmissionDrugGroup,
  type AdmissionServiceGroup,
  type AdmissionSupplyGroup,
} from "@/pages/Patients/Admissions/lib/groupingAdmission"
import { useUIStore } from "@/store/uiStore"
import { usePermission } from "@/hooks/usePermission"
import { getPatient } from "@/pages/Patients/api"
import type { DiscountScope, Patient, VatScope } from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"

interface AdmissionDetailsDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number
  row: PastAdmissionSummary | null
  onSettle?: (row: PastAdmissionSummary) => void
  onPrint?: (row: PastAdmissionSummary) => void
}

/**
 * Admission details mirroring the legacy `#admissionDetailsModal`
 * with 5 sections:
 *   A — Admission Info + Financial Summary
 *   B — Assigned Doctors + Nurses
 *   C — Final Diagnosis (conditional)
 *   D — Services Used + Drugs Used tables
 *   E — Supplies Used table
 *
 * "Settle Bill" CTA opens a dedicated dialog (T7.5); the button is
 * disabled when the user lacks `manage_patients`. "Print Bill" lands T8.
 *
 * The hook hydrates the flat `getAdmissionDetails` payload into typed
 * renderer-domain shapes; this dialog only reads typed fields.
 */
export function AdmissionDetailsDialog({
  open,
  onOpenChange,
  patientId,
  row,
  onSettle,
  onPrint,
}: AdmissionDetailsDialogProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canManage = hasPermission("manage_patients")
  const language = useUIStore((s) => s.language) as "en" | "ar"
  const dismissLabel = dismissalBadgeVariant(row?.leaveReason ?? null)
  const isQuickCheck = row?.quickCheck === true

  const historyId = row?.patientHistoryId ?? null
  const detailsRes = useAdmissionDetails(patientId, historyId)
  const details = detailsRes.details

  /* ---- Lazy patient identity (header title) ---- */
  const [patient, setPatient] = useState<Patient | null>(null)
  const [patientLoading, setPatientLoading] = useState(false)
  useEffect(() => {
    if (!open || patientId <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPatient(null)
      return
    }
    let cancelled = false

    setPatientLoading(true)
    getPatient(patientId)
      .then((p) => {
        if (cancelled) return
        setPatient(p)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const ae = err instanceof ApiError ? err : null
        toast.warning(
          ae?.message ?? t("patients.messages.loadPatientError"),
          { id: "admission-patient-error" }
        )
      })
      .finally(() => {
        if (!cancelled) setPatientLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, patientId, t])

  const patientDisplayName =
    patient?.name ?? (patientLoading ? "—" : t("common.unknown"))

  const bill = details?.bill ?? null
  const admission = details?.admission ?? null
  const services = details?.services ?? []
  const drugs = details?.drugs ?? []
  const supplies = details?.supplies ?? []
  const assignedDoctors = details?.assignedDoctors ?? []
  const assignedNurses = details?.assignedNurses ?? []
  const servicesTotal = details?.servicesTotal ?? 0
  const drugsTotal = details?.drugsTotal ?? 0
  const suppliesTotal = details?.suppliesTotal ?? 0
  const testsTotal = details?.bill?.medicalTestsAmount ?? 0

  /* ---- Group rows by (id, unitPrice) — see lib/groupingAdmission.ts ---- */
  const groupedServices = useMemo(
    () => groupAdmissionServices(services),
    [services]
  )
  const groupedDrugs = useMemo(() => groupAdmissionDrugs(drugs), [drugs])
  const groupedSupplies = useMemo(
    () => groupAdmissionSupplies(supplies),
    [supplies]
  )

  const discountLabelText = `${t("patients.billing.discount")} ${getDiscountScopeString(bill?.discountScope)}`
  const vatLabelText = `${t("patients.billing.vatPercentage")} ${getVatScopeString(bill?.vatScopeCustom)}`

  function getDiscountScopeString(discountScope: DiscountScope | undefined) {
    let stringArr = [];
    
    if (discountScope?.onServices)
      stringArr.push(`${t("patients.billing.scope.services")}`)
    if (discountScope?.onDrugs)
      stringArr.push(`${t("patients.billing.scope.drugs")}`)
    if (discountScope?.onSupplies)
      stringArr.push(`${t("patients.billing.scope.supplies")}`)
    if (discountScope?.onTests)
      stringArr.push(`${t("patients.billing.scope.tests")}`)

    if (stringArr.length === 4)
      stringArr = [`${t("patients.billing.scope.all")}`]

    return `(${stringArr.join(" / ")})`
  }

  function getVatScopeString(vatScope: VatScope | undefined) {
    let stringArr = [];

    if (vatScope?.onServices)
      stringArr.push(`${t("patients.billing.scope.services")}`)
    if (vatScope?.onDrugs)
      stringArr.push(`${t("patients.billing.scope.drugs")}`)
    if (vatScope?.onSupplies)
      stringArr.push(`${t("patients.billing.scope.supplies")}`)
    if (vatScope?.onTests)
      stringArr.push(`${t("patients.billing.scope.tests")}`)

    if (stringArr.length === 4)
      stringArr = [`${t("patients.billing.scope.all")}`]

    return `(${stringArr.join(" / ")})`
  }

  function onSettleClick() {
    if (!canManage || !onSettle || !row) {
      toast.error(t("patients.messages.settleBillError"), {
        id: "settle-permission-error",
      })
      return
    }
    onSettle(row)
  }

  function onPrintClick() {
    if (!onPrint || !row) return
    onPrint(row)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {patientDisplayName}
            <span className="text-muted-foreground mx-1.5">·</span>
            {t("patients.modals.admissionDetails")}
          </DialogTitle>
          <DialogDescription>
            {t("patients.messages.admissionId")} #
            {admission?.patientHistoryId ?? row?.patientHistoryId ?? "—"}
          </DialogDescription>
        </DialogHeader>

        {detailsRes.loading ? (
          <div className="flex flex-col gap-4" aria-label={t("common.loading")}>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : detailsRes.error ? (
          <div className="py-6 text-center">
            <p className="text-destructive text-sm font-medium">
              {detailsRes.error.message}
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => detailsRes.refresh()}
            >
              {t("common.refresh")}
            </Button>
          </div>
        ) : details ? (
          <div className="flex max-h-[65vh] flex-col gap-6 overflow-y-auto pe-1">
            <SectionHeading>
              {t("patients.sections.admissionInfo")}
            </SectionHeading>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Left — Admission Info */}
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <DetailRow label={t("patients.messages.admissionDate")}>
                  {formatDateTime(admission?.admissionTime ?? null, language)}
                </DetailRow>
                <DetailRow label={t("patients.messages.dischargeDate")}>
                  {formatDateTime(admission?.dischargeTime ?? null, language)}
                </DetailRow>
                <DetailRow label={t("patients.messages.lengthOfStay")}>
                  {calculateLengthOfStay(
                    admission?.admissionTime ?? "",
                    admission?.dischargeTime ?? "",
                    t
                  )}
                </DetailRow>
                <div className="flex items-center justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    {t("patients.messages.dismissalReason")}
                  </span>
                  <Badge
                    variant={dismissLabel.variant}
                    className={dismissLabel.className}
                  >
                    {t(dismissLabel.labelKey)}
                  </Badge>
                </div>
                {isQuickCheck ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs" />
                    <Badge variant="secondary">
                      {t("patients.messages.quickCheckBadge")}
                    </Badge>
                  </div>
                ) : null}
              </div>

              {/* Right — Financial Summary */}
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <FeesLabelSmall>
                  {t("patients.sections.financialSummary")}
                </FeesLabelSmall>
                <p className="text-muted-foreground -mt-1 mb-1 text-xs">
                  {t("patients.print.billingSummary")}
                </p>
                <DetailRow label={t("patients.billing.servicesTotal")}>
                  {formatCurrency(servicesTotal, language)}
                </DetailRow>
                <DetailRow label={t("patients.billing.drugsTotal")}>
                  {formatCurrency(drugsTotal, language)}
                </DetailRow>
                <DetailRow label={t("patients.billing.suppliesTotal")}>
                  {formatCurrency(suppliesTotal, language)}
                </DetailRow>
                <DetailRow label={t("patients.billing.medicalTestsTotal")}>
                  {formatCurrency(testsTotal, language)}
                </DetailRow>
                <DetailRow label={discountLabelText}>
                  {bill?.discount != null
                    ? bill.discountType === "percent"
                      ? `${bill.discount}%`
                      : formatCurrency(bill.discount, language)
                    : formatCurrency(0, language)}
                </DetailRow>
                <DetailRow label={t("patients.billing.adminExpenses")}>
                  {formatCurrency(
                    bill?.administrativeExpenses ?? 0,
                    language
                  )}
                </DetailRow>
                <DetailRow label={vatLabelText}>
                  {bill?.vatPercentage != null
                    ? `${bill.vatPercentage}%`
                    : "—"}
                </DetailRow>
                <div className="mt-1 border-t pt-2">
                  <DetailRow
                    label={t("patients.billing.totalAmount")}
                    emphasis
                  >
                    {formatCurrency(bill?.totalAmount ?? 0, language)}
                  </DetailRow>
                  <DetailRow label={t("patients.billing.paidAmount")}>
                    {formatCurrency(bill?.paidAmount ?? 0, language)}
                  </DetailRow>
                  <DetailRow
                    label={t("patients.billing.balance")}
                    emphasis
                    className={
                      (bill?.totalAmount ?? 0) - (bill?.paidAmount ?? 0) > 0
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {formatCurrency(
                      Math.abs(
                        (bill?.totalAmount ?? 0) - (bill?.paidAmount ?? 0)
                      ),
                      language
                    )}{" "}
                    <span className="text-muted-foreground text-xs">
                      {(bill?.totalAmount ?? 0) - (bill?.paidAmount ?? 0) > 0
                        ? t("patients.messages.due")
                        : t("patients.messages.credit")}
                    </span>
                  </DetailRow>
                </div>
              </div>
            </div>

            {/* Section B — Doctors / Nurses */}
            {assignedDoctors.length > 0 || assignedNurses.length > 0 ? (
              <>
                <SectionHeading>
                  {t("patients.messages.assignedDoctors")} /{" "}
                  {t("patients.messages.assignedNurses")}
                </SectionHeading>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-sm">
                    <FeesLabelSmall>
                      {t("patients.messages.assignedDoctors")} (
                      {assignedDoctors.length})
                    </FeesLabelSmall>
                    {assignedDoctors.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("patients.messages.noDoctorsAssigned")}
                      </p>
                    ) : (
                      assignedDoctors.map((d, i) => (
                        <div
                          key={`doc-${d.employeeId ?? i}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>{d.name ?? `#${i}`}</span>
                          {/* The endpoint only emits `doctorType` strings; we surface
                              them as a small secondary badge so the legacy "Doctor
                              Type" column is preserved. The renderer-side
                              AssignedStaff.employeeType is the discriminator. */}
                          {d.employeeType === "doctor" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {d.employeeType}
                            </Badge>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-sm">
                    <FeesLabelSmall>
                      {t("patients.messages.assignedNurses")} (
                      {assignedNurses.length})
                    </FeesLabelSmall>
                    {assignedNurses.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("patients.messages.noNursesAssigned")}
                      </p>
                    ) : (
                      assignedNurses.map((n, i) => (
                        <span key={`nur-${n.employeeId ?? i}`}>
                          {n.name ?? `#${i}`}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {/* Section C — Diagnosis */}
            {admission?.diagnosis ? (
              <>
                <SectionHeading>
                  {t("patients.messages.finalDiagnosis")}
                </SectionHeading>
                <div className="rounded-md border-s-4 border-emerald-500 bg-emerald-500/5 p-3 text-sm">
                  {admission.diagnosis}
                </div>
              </>
            ) : null}

            {/* Section D — Services + Drugs */}
            <SectionHeading>
              {t("patients.messages.servicesUsed")} &{" "}
              {t("patients.messages.drugsUsed")}
            </SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <FeesLabelSmall>
                  {t("patients.messages.servicesUsed")} ({services.length})
                </FeesLabelSmall>
                {services.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("patients.messages.noServicesUsed")}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">
                          {t("patients.table.name")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.table.quantity")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.table.unitPrice")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.billing.totalAmount")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedServices.map((g, i) => (
                        <ServiceRow
                          key={`svc-${g.serviceId}-${g.unitPrice}-${i}`}
                          group={g}
                          language={language}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <FeesLabelSmall>
                  {t("patients.messages.drugsUsed")} ({drugs.length})
                </FeesLabelSmall>
                {drugs.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("patients.messages.noDrugsUsed")}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">
                          {t("patients.table.name")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.table.quantity")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.table.unitPrice")}
                        </TableHead>
                        <TableHead className="text-end text-xs">
                          {t("patients.billing.totalAmount")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedDrugs.map((g, i) => (
                        <DrugRow
                          key={`drug-${g.drugId}-${g.unitPrice}-${i}`}
                          group={g}
                          language={language}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Section E — Supplies */}
            <SectionHeading>
              {t("patients.messages.suppliesUsed")}
            </SectionHeading>
            {supplies.length === 0 ? (
              <p className="text-muted-foreground rounded-md border bg-muted/20 p-3 text-xs">
                {t("patients.messages.noSuppliesUsed")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">
                      {t("patients.table.name")}
                    </TableHead>
                    <TableHead className="text-xs">
                      {t("patients.table.type")}
                    </TableHead>
                    <TableHead className="text-end text-xs">
                      {t("patients.table.quantity")}
                    </TableHead>
                    <TableHead className="text-end text-xs">
                      {t("patients.table.unitPrice")}
                    </TableHead>
                    <TableHead className="text-end text-xs">
                      {t("patients.billing.totalAmount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedSupplies.map((g, i) => (
                    <SupplyRow
                      key={`sup-${g.supplyId}-${g.unitPrice}-${i}`}
                      group={g}
                      language={language}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" disabled onClick={onPrintClick}>
            <PrinterIcon aria-hidden className="me-1.5 size-4" />
            {t("patients.buttons.printBill")}
          </Button>

          {canManage ? (
            <Button
              type="button"
              variant="default"
              onClick={onSettleClick}
            >
              <BanknoteIcon aria-hidden className="me-1.5 size-4" />
              {t("patients.buttons.settleBill")}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="default"
                    disabled
                    aria-disabled
                  >
                    <BanknoteIcon aria-hidden className="me-1.5 size-4" />
                    {t("patients.buttons.settleBill")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("common.permission.requires_manage_patients")}
              </TooltipContent>
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="border-s-4 border-primary text-foreground ps-3 text-sm font-semibold uppercase tracking-wide">
      {children}
    </h6>
  )
}

function DetailRow({
  label,
  children,
  emphasis,
  className,
}: {
  label: string
  children: React.ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={
          (emphasis ? "font-semibold" : "") +
          " tabular-nums" +
          (className ? " " + className : "")
        }
      >
        {children}
      </span>
    </div>
  )
}

function FeesLabelSmall({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
      {children}
    </span>
  )
}

function ServiceRow({
  group,
  language,
}: {
  group: AdmissionServiceGroup
  language: "en" | "ar"
}) {
  return (
    <TableRow>
      <TableCell className="text-sm">{group.serviceName}</TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {group.quantity}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.unitPrice, language)}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.totalCost, language)}
      </TableCell>
    </TableRow>
  )
}

function DrugRow({
  group,
  language,
}: {
  group: AdmissionDrugGroup
  language: "en" | "ar"
}) {
  return (
    <TableRow>
      <TableCell className="text-sm">{group.drugName}</TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {group.quantity}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.unitPrice, language)}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.totalCost, language)}
      </TableCell>
    </TableRow>
  )
}

function SupplyRow({
  group,
  language,
}: {
  group: AdmissionSupplyGroup
  language: "en" | "ar"
}) {
  return (
    <TableRow>
      <TableCell className="text-sm">{group.supplyName}</TableCell>
      <TableCell className="text-xs">
        {/* Manufacturer/provider aren't part of the group shape (the
            first row carries them); we leave the column here for
            layout parity but render a thin "—" placeholder for
            past admissions where multiple source rows merged. */}
        —
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {group.quantity}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.unitPrice, language)}
      </TableCell>
      <TableCell className="text-end tabular-nums text-sm">
        {formatCurrency(group.totalCost, language)}
      </TableCell>
    </TableRow>
  )
}