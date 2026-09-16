"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { ApiError } from "@/lib/errors"
import {
  buildDoctorPayload,
  createDoctor,
  createEmployee,
  listDoctorServicePrices,
  listServices,
  updateDoctor,
  updateEmployee,
} from "@/pages/Employees/api"
import {
  emptyEmployeeForm,
  employeeFormSchema,
  type EmployeeFormValues,
} from "@/pages/Employees/schemas/employee.schema"
import type {
  Doctor,
  DoctorServicePriceEntry,
  EmployeeType,
  ExtraPaymentType,
  PaymentCalculation,
  PercentageScope,
  PerPatientPaymentType,
  ShiftType,
} from "@/pages/Employees/types/employee"
import type { StaffSubject } from "@/pages/Employees/components/EmployeeDetailSheet"

export interface EmployeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selected type for the create flow (from the active tab). */
  initialType: EmployeeType
  /** When set, the modal edits this employee/doctor. */
  editing: StaffSubject | null
  onSaved: () => void
}

function toNumberOrNull(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Unified adaptive employee modal (Phase 6.7 Decision #6) with the
 * sectioned form layout (design.md §6.3): Profile / Shift /
 * Compensation (nurse-other vs doctor variant) / Service prices
 * (doctor only, with explicit price removal — `price: null`).
 */
export function EmployeeModal({
  open,
  onOpenChange,
  initialType,
  editing,
  onSaved,
}: EmployeeModalProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [serviceSearch, setServiceSearch] = useState("")
  const [showServicePrices, setShowServicePrices] = useState(false)
  /** serviceId → persisted price at open time (diff baseline). */
  const [baselinePrices, setBaselinePrices] = useState<Map<number, number>>(
    new Map()
  )
  const [saving, setSaving] = useState(false)

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: emptyEmployeeForm(initialType),
    mode: "onSubmit",
  })
  const { register, handleSubmit, reset, watch, setValue, formState } = form
  const { errors } = formState

  const employeeType = watch("employeeType")
  const extraPaymentType = watch("extraPaymentType") as ExtraPaymentType
  const perPatientPaymentType = watch("perPatientPaymentType")
  const servicePriceRows = watch("servicePriceRows")
  const isDoctor = employeeType === "doctor"
  const isEdit = editing != null

  /* Open/close: pre-fill or reset, and load services for doctors. */
  useEffect(() => {
    if (!open) return
    setError(null)
    setServiceSearch("")
    if (editing) {
      const isDoctorEdit = editing.employeeType === "doctor"
      const base = {
        employeeType: editing.employeeType,
        name: editing.name,
        phone: editing.phone ?? "",
        hireDate: editing.hireDate,
        needClockIn: editing.needClockIn,
        isActive: editing.isActive,
        isFacilityEmployee: editing.isFacilityEmployee,
        shiftType: (editing.shiftType ?? "") as ShiftType | "",
        shiftStartTime: editing.shiftStartTime ?? "",
        shiftEndTime: editing.shiftEndTime ?? "",
        basePay: editing.basePay != null ? String(editing.basePay) : "",
        extraPaymentType: (editing.extraPaymentType ?? "none") as ExtraPaymentType,
        extraAmount: editing.extraAmount != null ? String(editing.extraAmount) : "",
        perPatientPaymentType: (editing.perPatientPaymentType ?? "") as PerPatientPaymentType | "",
        percentageScope: (editing.percentageScope ?? "") as PercentageScope | "",
        doctorType: isDoctorEdit ? (editing as Doctor).doctorType : "",
        dailyPay:
          isDoctorEdit && (editing as Doctor).dailyPay != null
            ? String((editing as Doctor).dailyPay)
            : "",
        perPatientPay:
          isDoctorEdit && (editing as Doctor).perPatientPay != null
            ? String((editing as Doctor).perPatientPay)
            : "",
        referralBonus:
          isDoctorEdit && (editing as Doctor).referralBonus != null
            ? String((editing as Doctor).referralBonus)
            : "",
        paymentCalculation: (isDoctorEdit
          ? (editing as Doctor).paymentCalculation
          : "fixed") as PaymentCalculation,
        servicePriceRows: [],
      }
      reset(base)
      if (isDoctorEdit) {
        void loadServicePrices(editing.employeeId)
      }
    } else {
      reset(emptyEmployeeForm(initialType))
      setBaselinePrices(new Map())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, initialType])

  async function loadServicePrices(doctorId: number) {
    setServicesLoading(true)
    try {
      const [services, prices] = await Promise.all([
        listServices(),
        listDoctorServicePrices(doctorId),
      ])
      const baseline = new Map<number, number>()
      for (const price of prices) {
        baseline.set(price.serviceId, Number(price.price))
      }
      setBaselinePrices(baseline)
      reset((values) => ({
        ...values,
        servicePriceRows: services.map((service) => ({
          serviceId: service.serviceId,
          serviceName: service.name,
          price:
            baseline.get(service.serviceId) != null
              ? String(baseline.get(service.serviceId))
              : "",
          removed: false,
        })),
      }))
    } catch {
      /* Grid stays empty — save still works (prices omitted). */
      setBaselinePrices(new Map())
    } finally {
      setServicesLoading(false)
    }
  }

  const filteredServiceRows = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase()
    if (!query) return servicePriceRows ?? []
    return (servicePriceRows ?? []).filter((row) =>
      row.serviceName.toLowerCase().includes(query)
    )
  }, [servicePriceRows, serviceSearch])

  const pricedCount = useMemo(
    () => (servicePriceRows ?? []).filter((row) => !row.removed && row.price.trim() !== "").length,
    [servicePriceRows]
  )

  /** Diff against the baseline: untouched rows send nothing; removed
   *  rows send `price: null` (backend deletes the override). */
  function collectServicePrices(): DoctorServicePriceEntry[] | undefined {
    const entries: DoctorServicePriceEntry[] = []
    for (const row of servicePriceRows ?? []) {
      const initial = baselinePrices.get(row.serviceId)
      const parsed = row.price.trim() === "" ? null : Number(row.price)
      if (row.removed) {
        if (initial != null) entries.push({ serviceId: row.serviceId, price: null })
        continue
      }
      if (parsed == null) continue
      if (initial != null && initial === parsed) continue
      entries.push({ serviceId: row.serviceId, price: parsed })
    }
    return entries.length > 0 ? entries : undefined
  }

  function setRowPrice(serviceId: number, price: string) {
    setValue(
      "servicePriceRows",
      (servicePriceRows ?? []).map((row) =>
        row.serviceId === serviceId ? { ...row, price } : row
      ),
      { shouldValidate: false }
    )
  }

  function setRowRemoved(serviceId: number, removed: boolean) {
    setValue(
      "servicePriceRows",
      (servicePriceRows ?? []).map((row) =>
        row.serviceId === serviceId ? { ...row, removed } : row
      ),
      { shouldValidate: false }
    )
  }

  const onSubmit = handleSubmit(
    async (values) => {
      setSaving(true)
      setError(null)
      try {
        if (values.employeeType === "doctor") {
          const payload = buildDoctorPayload({
            name: values.name,
            phone: values.phone || undefined,
            hireDate: values.hireDate,
            employeeType: "doctor",
            isActive: values.isActive,
            needClockIn: values.needClockIn,
            isFacilityEmployee: values.isFacilityEmployee,
            shiftType: (values.shiftType || undefined) as ShiftType | undefined,
            shiftStartTime: values.shiftStartTime || undefined,
            shiftEndTime: values.shiftEndTime || undefined,
            doctorType: values.doctorType as EmployeeModalDoctorType,
            dailyPay: toNumberOrNull(values.dailyPay),
            perPatientPay: toNumberOrNull(values.perPatientPay),
            referralBonus: toNumberOrNull(values.referralBonus),
            paymentCalculation: values.paymentCalculation,
            servicePrices: collectServicePrices(),
          })
          if (isEdit && editing) {
            await updateDoctor(editing.employeeId, payload)
            toast.success(t("employees.messages.updateSuccess"))
          } else {
            await createDoctor(payload)
            toast.success(t("employees.messages.createSuccess"))
          }
        } else {
          const payload = {
            name: values.name,
            phone: values.phone || undefined,
            hireDate: values.hireDate,
            employeeType: values.employeeType as "nurse" | "other",
            isActive: values.isActive,
            needClockIn: values.needClockIn,
            isFacilityEmployee: true,
            shiftType: (values.shiftType || undefined) as ShiftType | undefined,
            shiftStartTime: values.shiftStartTime || undefined,
            shiftEndTime: values.shiftEndTime || undefined,
            basePay: toNumberOrNull(values.basePay),
            extraAmount: toNumberOrNull(values.extraAmount),
            extraPaymentType: values.extraPaymentType,
            perPatientPaymentType:
              (values.perPatientPaymentType || undefined) as PerPatientPaymentType | undefined,
            percentageScope: (values.percentageScope || undefined) as PercentageScope | undefined,
          }
          if (isEdit && editing) {
            await updateEmployee(editing.employeeId, payload)
            toast.success(t("employees.messages.updateSuccess"))
          } else {
            await createEmployee(payload)
            toast.success(t("employees.messages.createSuccess"))
          }
        }
        onOpenChange(false)
        onSaved()
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : t("employees.messages.saveError")
        )
      } finally {
        setSaving(false)
      }
    },
    /* Validation failed — focus the first invalid field (design.md §6.3). */
    (fieldErrors) => {
      const firstKey = Object.keys(fieldErrors)[0]
      if (firstKey === "servicePriceRows") {
        const firstRow = document.querySelector<HTMLElement>(
          "[data-service-price-input]"
        )
        firstRow?.focus()
        return
      }
      if (firstKey) form.setFocus(firstKey as keyof EmployeeFormValues)
    }
  )

  const sectionClass = "flex flex-col gap-4"
  const legendClass = "text-sm font-semibold text-foreground"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("employees.editEmployee") : createTitle(employeeType, t)}
          </DialogTitle>
          <DialogDescription>
            {t("employees.messages.employeeFormHint")}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
          {/* Profile */}
          <fieldset className={sectionClass}>
            <legend className={legendClass}>{t("employees.sections.profile")}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t("employees.fields.name")}
                htmlFor="employee-name"
                error={errors.name?.message}
              >
                <Input id="employee-name" {...register("name")} />
              </Field>
              <Field
                label={t("employees.fields.phone")}
                htmlFor="employee-phone"
                optional
                error={errors.phone?.message}
              >
                <Input id="employee-phone" type="tel" dir="ltr" {...register("phone")} />
              </Field>
              <Field
                label={t("employees.fields.hireDate")}
                htmlFor="employee-hire-date"
                error={errors.hireDate?.message}
              >
                <Input id="employee-hire-date" type="date" {...register("hireDate")} />
              </Field>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <CheckboxField
                  id="employee-need-clock-in"
                  label={t("employees.fields.needClockIn")}
                  checked={watch("needClockIn")}
                  onChange={(checked) => setValue("needClockIn", checked)}
                />
                <CheckboxField
                  id="employee-is-active"
                  label={t("employees.fields.isActive")}
                  checked={watch("isActive")}
                  onChange={(checked) => setValue("isActive", checked)}
                />
                {isDoctor ? (
                  <CheckboxField
                    id="employee-facility"
                    label={t("employees.fields.isFacilityEmployee")}
                    checked={watch("isFacilityEmployee")}
                    onChange={(checked) => setValue("isFacilityEmployee", checked)}
                  />
                ) : null}
              </div>
            </div>
          </fieldset>

          {/* Shift */}
          <fieldset className={sectionClass}>
            <legend className={legendClass}>{t("employees.sections.shift")}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label={t("employees.fields.shiftType")}
                htmlFor="employee-shift-type"
                optional
                error={errors.shiftType?.message}
              >
                <NativeSelect id="employee-shift-type" {...register("shiftType")}>
                  <NativeSelectOption value="">
                    {t("employees.shiftTypes.select")}
                  </NativeSelectOption>
                  <NativeSelectOption value="morning">
                    {t("employees.shiftTypes.morning")}
                  </NativeSelectOption>
                  <NativeSelectOption value="night">
                    {t("employees.shiftTypes.night")}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field
                label={t("employees.fields.shiftStartTime")}
                htmlFor="employee-shift-start"
                error={errors.shiftStartTime?.message}
              >
                <Input
                  id="employee-shift-start"
                  type="time"
                  {...register("shiftStartTime")}
                />
              </Field>
              <Field
                label={t("employees.fields.shiftEndTime")}
                htmlFor="employee-shift-end"
                error={errors.shiftEndTime?.message}
              >
                <Input
                  id="employee-shift-end"
                  type="time"
                  {...register("shiftEndTime")}
                />
              </Field>
            </div>
          </fieldset>

          {/* Compensation — adaptive */}
          <fieldset className={sectionClass}>
            <legend className={legendClass}>
              {t("employees.sections.compensation")}
            </legend>
            {isDoctor ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={t("employees.fields.doctorType")}
                  htmlFor="employee-doctor-type"
                  error={errors.doctorType?.message}
                >
                  <NativeSelect id="employee-doctor-type" {...register("doctorType")}>
                    <NativeSelectOption value="">
                      {t("employees.fields.doctorType")}
                    </NativeSelectOption>
                    <NativeSelectOption value="attending">
                      {t("employees.doctorTypes.attending")}
                    </NativeSelectOption>
                    <NativeSelectOption value="supervising">
                      {t("employees.doctorTypes.supervising")}
                    </NativeSelectOption>
                    <NativeSelectOption value="referring">
                      {t("employees.doctorTypes.referring")}
                    </NativeSelectOption>
                    <NativeSelectOption value="outside">
                      {t("employees.doctorTypes.outside")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field
                  label={t("employees.fields.paymentCalculation")}
                  htmlFor="employee-payment-calculation"
                  error={errors.paymentCalculation?.message}
                >
                  <NativeSelect
                    id="employee-payment-calculation"
                    {...register("paymentCalculation")}
                  >
                    <NativeSelectOption value="fixed">
                      {t("employees.paymentCalculation.fixed")}
                    </NativeSelectOption>
                    <NativeSelectOption value="per_patient">
                      {t("employees.paymentCalculation.per_patient")}
                    </NativeSelectOption>
                    <NativeSelectOption value="both">
                      {t("employees.paymentCalculation.both")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field
                  label={t("employees.fields.dailyPay")}
                  htmlFor="employee-daily-pay"
                  optional
                  error={errors.dailyPay?.message}
                >
                  <Input
                    id="employee-daily-pay"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("dailyPay")}
                  />
                </Field>
                <Field
                  label={t("employees.fields.perPatientPay")}
                  htmlFor="employee-per-patient-pay"
                  optional
                  error={errors.perPatientPay?.message}
                >
                  <Input
                    id="employee-per-patient-pay"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("perPatientPay")}
                  />
                </Field>
                <Field
                  label={t("employees.fields.referralBonus")}
                  htmlFor="employee-referral-bonus"
                  optional
                  error={errors.referralBonus?.message}
                >
                  <Input
                    id="employee-referral-bonus"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("referralBonus")}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={t("employees.fields.basePay")}
                  htmlFor="employee-base-pay"
                  optional
                  error={errors.basePay?.message}
                >
                  <Input
                    id="employee-base-pay"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("basePay")}
                  />
                </Field>
                <Field
                  label={t("employees.fields.extraPaymentType")}
                  htmlFor="employee-extra-payment-type"
                  error={errors.extraPaymentType?.message}
                >
                  <NativeSelect
                    id="employee-extra-payment-type"
                    {...register("extraPaymentType")}
                  >
                    <NativeSelectOption value="none">
                      {t("employees.paymentTypes.none")}
                    </NativeSelectOption>
                    <NativeSelectOption value="per_patient">
                      {t("employees.paymentTypes.per_patient")}
                    </NativeSelectOption>
                    <NativeSelectOption value="income">
                      {t("employees.paymentTypes.income")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                {(extraPaymentType === "per_patient" ||
                  extraPaymentType === "income") && (
                  <Field
                    label={t("employees.fields.extraAmount")}
                    htmlFor="employee-extra-amount"
                    error={errors.extraAmount?.message}
                  >
                    <Input
                      id="employee-extra-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("extraAmount")}
                    />
                  </Field>
                )}
                {extraPaymentType === "per_patient" && (
                  <Field
                    label={t("employees.fields.perPatientPaymentType")}
                    htmlFor="employee-per-patient-type"
                    error={errors.perPatientPaymentType?.message}
                  >
                    <NativeSelect
                      id="employee-per-patient-type"
                      {...register("perPatientPaymentType")}
                    >
                      <NativeSelectOption value="">
                        {t("employees.perPatientPaymentTypes.select")}
                      </NativeSelectOption>
                      <NativeSelectOption value="fixed">
                        {t("employees.perPatientPaymentTypes.fixed")}
                      </NativeSelectOption>
                      <NativeSelectOption value="percentage">
                        {t("employees.perPatientPaymentTypes.percentage")}
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                )}
                {(perPatientPaymentType === "percentage" ||
                  extraPaymentType === "income") && (
                  <Field
                    label={t("employees.fields.percentageScope")}
                    htmlFor="employee-percentage-scope"
                    error={errors.percentageScope?.message}
                  >
                    <NativeSelect
                      id="employee-percentage-scope"
                      {...register("percentageScope")}
                    >
                      <NativeSelectOption value="">
                        {t("employees.percentageScopes.select")}
                      </NativeSelectOption>
                      <NativeSelectOption value="before_deductions">
                        {t("employees.percentageScopes.before_deductions")}
                      </NativeSelectOption>
                      <NativeSelectOption value="after_deductions">
                        {t("employees.percentageScopes.after_deductions")}
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                )}
              </div>
            )}
          </fieldset>

          {/* Service prices (doctor only) */}
          {isDoctor ? (
            <fieldset className={sectionClass}>
              <legend className={legendClass}>
                {t("employees.servicePrices")}
                <PricedCountBadge pricedCount={pricedCount} />
              </legend>
              <button
                type="button"
                className="text-start text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => setShowServicePrices((v) => !v)}
              >
                {showServicePrices
                  ? t("employees.servicePriceGrid.hide")
                  : t("employees.servicePriceGrid.show")}
              </button>
              {showServicePrices ? (
                servicesLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2Icon aria-hidden className="size-4 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : (servicePriceRows ?? []).length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {t("common.noData")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Input
                      type="search"
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.currentTarget.value)}
                      placeholder={t("employees.servicePriceGrid.searchPlaceholder")}
                      aria-label={t("employees.servicePriceGrid.searchPlaceholder")}
                      className="max-w-xs"
                    />
                    <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
                      <div className="flex flex-col gap-2">
                        {filteredServiceRows.map((row) => (
                          <div
                            key={row.serviceId}
                            className="flex items-center gap-2"
                          >
                            <span
                              className="flex-1 truncate text-sm"
                              title={row.serviceName}
                            >
                              {row.serviceName}
                            </span>
                            {row.removed ? (
                              <>
                                <span className="text-xs text-destructive">
                                  {t("employees.servicePriceGrid.willBeRemoved")}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("employees.servicePriceGrid.undoRemove")}
                                  onClick={() => setRowRemoved(row.serviceId, false)}
                                >
                                  <RotateCcwIcon aria-hidden className="size-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Input
                                  data-service-price-input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={row.price}
                                  onChange={(e) =>
                                    setRowPrice(row.serviceId, e.currentTarget.value)
                                  }
                                  aria-label={`${row.serviceName} — ${t("employees.servicePriceGrid.priceAria")}`}
                                  className="w-32"
                                />
                                {baselinePrices.get(row.serviceId) != null ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("employees.servicePriceGrid.removeAria", {
                                      name: row.serviceName,
                                    })}
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setRowRemoved(row.serviceId, true)}
                                  >
                                    <Trash2Icon aria-hidden className="size-4" />
                                  </Button>
                                ) : null}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              ) : null}
            </fieldset>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon aria-hidden className="me-2 size-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type EmployeeModalDoctorType = "attending" | "supervising" | "referring" | "outside"

function createTitle(
  type: EmployeeType,
  t: (key: string) => string
): string {
  if (type === "doctor") return t("employees.createNewDoctor")
  if (type === "nurse") return t("employees.createNewNurse")
  return t("employees.createNew")
}

/** Labeled field with top-aligned label + inline error (design.md §6.3). */
function Field({
  label,
  htmlFor,
  error,
  optional = false,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  optional?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="text-muted-foreground"> ({t("common.optional")})</span>
        ) : (
          <span aria-hidden className="text-destructive">
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{t(error)}</p>
      ) : null}
    </div>
  )
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}

/** Small count badge for the service-prices legend. */
function PricedCountBadge({ pricedCount }: { pricedCount: number }) {
  if (pricedCount === 0) return null
  return (
    <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums">
      {pricedCount}
    </span>
  )
}
