"use client"

import { useTranslation } from "react-i18next"
import {
  CalendarDaysIcon,
  CircleDollarSignIcon,
  ClockIcon,
  PencilIcon,
  PhoneIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDate, formatDateTime } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import {
  ActiveBadge,
  PaymentStatusBadge,
} from "@/pages/Employees/components/EmployeeDisplay"
import {
  useEmployeeLocale,
  usePaymentAmount,
} from "@/pages/Employees/hooks/useEmployeeDisplay"
import type {
  Doctor,
  Employee,
  EmployeePayment,
} from "@/pages/Employees/types/employee"

export type StaffSubject = Employee | Doctor

export interface EmployeeDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: StaffSubject | null
  /** All payments for this employee (pre-filtered by the caller). */
  payments: EmployeePayment[]
  paidByNames: Map<number, string>
  canViewPayments: boolean
  isAdmin: boolean
  onEdit: (subject: StaffSubject) => void
  onCreatePayment: (subject: StaffSubject) => void
  onMarkPaid: (payment: EmployeePayment) => void
  onVoid: (payment: EmployeePayment) => void
}

/**
 * Employee detail Sheet (Phase 6.7 UX package) — replaces the legacy
 * inline payment sub-rows. Right-side in LTR, left-side in RTL
 * (design.md §6.4 inline-start). Shows a profile summary plus the
 * employee's full payment history — filtered client-side from the
 * bulk payments fetch, so opening the sheet costs zero requests.
 */
export function EmployeeDetailSheet({
  open,
  onOpenChange,
  subject,
  payments,
  paidByNames,
  canViewPayments,
  isAdmin,
  onEdit,
  onCreatePayment,
  onMarkPaid,
  onVoid,
}: EmployeeDetailSheetProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const locale = useEmployeeLocale()
  const paymentAmount = usePaymentAmount()

  const isDoctor = subject?.employeeType === "doctor"
  const typeLabel = subject
    ? isDoctor
      ? t(`employees.doctorTypes.${(subject as Doctor).doctorType}`)
      : t(`employees.types.${subject.employeeType}`)
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={language === "ar" ? "left" : "right"}
        className="w-full gap-0 sm:max-w-xl sm:w-[26rem] md:max-w-xl"
      >
        {subject ? (
          <>
            <SheetHeader className="gap-2 pb-4">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">{subject.name}</SheetTitle>
                <Badge variant="secondary">{typeLabel}</Badge>
                <ActiveBadge active={subject.isActive} />
              </div>
              <SheetDescription>
                {t("employees.messages.employeeDetails")}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDaysIcon aria-hidden className="size-4" />
                  {formatDate(new Date(subject.hireDate), locale)}
                </span>
                {subject.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneIcon aria-hidden className="size-4" />
                    <span dir="ltr">{subject.phone}</span>
                  </span>
                ) : null}
                {subject.shiftType ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon aria-hidden className="size-4" />
                    {t(`employees.shiftTypes.${subject.shiftType}`)}
                    {subject.shiftStartTime && subject.shiftEndTime
                      ? ` · ${subject.shiftStartTime.slice(0, 5)}–${subject.shiftEndTime.slice(0, 5)}`
                      : ""}
                  </span>
                ) : null}
              </div>
            </SheetHeader>

            <div className="flex flex-wrap justify-end items-center gap-2 border-y border-border py-3">
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(subject)}
                >
                  <PencilIcon aria-hidden className="me-1.5 size-4" />
                  {t("employees.buttons.edit")}
                </Button>
              ) : null}
              {canViewPayments ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onCreatePayment(subject)}
                >
                  <CircleDollarSignIcon aria-hidden className="me-1.5 size-4" />
                  {t("employees.buttons.createPayment")}
                </Button>
              ) : null}
            </div>

            {/* Profile summary */}
            <div className="flex-1 overflow-y-auto px-4">
              <section className="py-4" aria-label={t("employees.title")}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {isDoctor ? (
                    <>
                      <Detail
                        label={t("employees.fields.dailyPay")}
                        hidden={!canViewPayments}
                        value={
                          (subject as Doctor).dailyPay != null
                            ? formatCurrencySafe((subject as Doctor).dailyPay, locale)
                            : undefined
                        }
                      />
                      <Detail
                        label={t("employees.fields.perPatientPay")}
                        hidden={!canViewPayments}
                        value={
                          (subject as Doctor).perPatientPay != null
                            ? formatCurrencySafe((subject as Doctor).perPatientPay, locale)
                            : undefined
                        }
                      />
                      <Detail
                        label={t("employees.fields.referralBonus")}
                        hidden={!canViewPayments}
                        value={
                          (subject as Doctor).referralBonus != null
                            ? formatCurrencySafe((subject as Doctor).referralBonus, locale)
                            : undefined
                        }
                      />
                      <Detail
                        label={t("employees.fields.paymentCalculation")}
                        value={
                          (subject as Doctor).paymentCalculation
                            ? t(
                                `employees.paymentCalculation.${(subject as Doctor).paymentCalculation}`
                              )
                            : undefined
                        }
                      />
                      <Detail
                        label={t("employees.fields.isFacilityEmployee")}
                        value={subject.isFacilityEmployee ? t("common.yes") : t("common.no")}
                      />
                    </>
                  ) : (
                    <>
                      <Detail
                        label={t("employees.fields.basePay")}
                        hidden={!canViewPayments}
                        value={
                          subject.basePay != null
                            ? formatCurrencySafe(subject.basePay, locale)
                            : undefined
                        }
                      />
                      <Detail
                        label={t("employees.fields.extraPaymentType")}
                        value={
                          subject.extraPaymentType &&
                          subject.extraPaymentType !== "none"
                            ? t(`employees.paymentTypes.${subject.extraPaymentType}`)
                            : t("employees.paymentTypes.none")
                        }
                      />
                      {subject.perPatientPaymentType ? (
                        <Detail
                          label={t("employees.fields.perPatientPaymentType")}
                          value={t(
                            `employees.perPatientPaymentTypes.${subject.perPatientPaymentType}`
                          )}
                        />
                      ) : null}
                      {subject.percentageScope ? (
                        <Detail
                          label={t("employees.fields.percentageScope")}
                          value={t(
                            `employees.percentageScopes.${subject.percentageScope}`
                          )}
                        />
                      ) : null}
                    </>
                  )}
                  <Detail
                    label={t("employees.fields.needClockIn")}
                    value={subject.needClockIn ? t("common.yes") : t("common.no")}
                  />
                </dl>
              </section>

              {canViewPayments ? (
                <>
                  <Separator />
                  <section className="py-4" aria-label={t("employees.servicePayments")}>
                    <h3 className="mb-3 text-sm font-semibold">
                      {t("employees.servicePayments")}
                      <Badge variant="outline" className="ms-2 tabular-nums">
                        {payments.length}
                      </Badge>
                    </h3>
                    {payments.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {t("common.noData")}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {payments.map((payment) => {
                          const { total, breakdown } = paymentAmount(payment)
                          return (
                            <li
                              key={payment.paymentId}
                              className="rounded-lg border border-border p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium tabular-nums">
                                    {total}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {breakdown}
                                  </p>
                                </div>
                                <PaymentStatusBadge payment={payment} />
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  {t("employees.table.issued")}:{" "}
                                  {formatDateTime(
                                    new Date(payment.issuedTimestamp),
                                    locale
                                  )}
                                </span>
                                <span>
                                  {t("employees.table.type")}:{" "}
                                  {payment.extraPaymentType &&
                                  payment.extraPaymentType !== "none"
                                    ? t(
                                        `employees.paymentTypes.${payment.extraPaymentType}`
                                      )
                                    : t("employees.paymentTypes.none")}
                                </span>
                                {payment.isPaid && payment.paidTimestamp ? (
                                  <span>
                                    {t("employees.table.paidOn")}:{" "}
                                    {formatDateTime(
                                      new Date(payment.paidTimestamp),
                                      locale
                                    )}
                                  </span>
                                ) : null}
                                {payment.isPaid && payment.paidByUserId != null ? (
                                  <span>
                                    {t("employees.table.paidBy")}:{" "}
                                    {paidByNames.get(payment.paidByUserId) ??
                                      "—"}
                                  </span>
                                ) : null}
                              </div>
                              {!payment.isVoid ? (
                                <div className="mt-2 flex items-center gap-2">
                                  {!payment.isPaid ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => onMarkPaid(payment)}
                                    >
                                      {t("employees.buttons.markPaid")}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-destructive hover:text-destructive"
                                    onClick={() => onVoid(payment)}
                                  >
                                    {t("employees.buttons.void")}
                                  </Button>
                                </div>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function formatCurrencySafe(
  value: number | null | undefined,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
  }).format(Number(value))
}

function Detail({
  label,
  value,
  hidden = false,
}: {
  label: string
  value?: string
  /** Sensitive (payments-permission-gated) — renders a hint instead. */
  hidden?: boolean
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums">
        {hidden ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          (value ?? <span className="text-muted-foreground">—</span>)
        )}
      </dd>
    </div>
  )
}

