"use client"

import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { ApiError } from "@/lib/errors"
import { createCompany, updateCompany } from "@/pages/Insurance/api"
import { listAllPriceLists } from "@/pages/PriceLists/api"
import {
  companySchema,
  type CompanyValues,
} from "@/pages/Insurance/schemas/company.schema"
import type {
  CompanyPayload,
  InsuranceCompany,
} from "@/pages/Insurance/types/insurance"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"

export interface CompanyModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** `null` = create. */
  company: InsuranceCompany | null
  /** Fired after a successful create/update (parent refreshes list/detail). */
  onSaved: () => void
}

/** Sentinel for the "no default price list" option (Radix forbids ""). */
const NO_PRICE_LIST = "none"

function toDefaults(company: InsuranceCompany | null): CompanyValues {
  return {
    name: company?.name ?? "",
    contactInfo: company?.contactInfo ?? "",
    pricelistId:
      company?.pricelistId != null ? String(company.pricelistId) : "",
  }
}

/**
 * Add / Edit insurance company dialog (Phase 6.10 plan §3).
 *
 * Only the three fields the backend actually supports: `name`
 * (required, ≤255), `contactInfo` (optional, ≤1000) and `pricelistId`
 * (optional). The umbrella sketch's "coverage type / discount rate /
 * AR+EN name" fields do not exist anywhere in the legacy page or the
 * schema and are intentionally not implemented (plan Decision #1).
 *
 * Price lists load lazily when the dialog opens; a failure degrades to an
 * empty list (the field is optional) instead of blocking the form.
 */
export function CompanyModal({
  open,
  onOpenChange,
  company,
  onSaved,
}: CompanyModalProps) {
  const { t } = useTranslation()
  const isEdit = company != null

  const form = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    mode: "onBlur",
    defaultValues: toDefaults(company),
  })

  const [submitting, setSubmitting] = useState(false)
  const [priceLists, setPriceLists] = useState<PriceListWithStats[]>([])

  useEffect(() => {
    if (open) form.reset(toDefaults(company))
  }, [open, company, form])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    listAllPriceLists()
      .then((rows) => {
        if (!cancelled) setPriceLists(rows)
      })
      .catch(() => {
        if (!cancelled) setPriceLists([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function onSubmit(values: CompanyValues) {
    setSubmitting(true)
    try {
      const payload: CompanyPayload = {
        name: values.name.trim(),
        contactInfo: values.contactInfo.trim() ? values.contactInfo.trim() : null,
        pricelistId: values.pricelistId ? Number(values.pricelistId) : null,
      }

      if (isEdit) {
        await updateCompany(company.insuranceId, payload)
        toast.success(t("insurance.messages.updateSuccess"))
      } else {
        await createCompany(payload)
        toast.success(t("insurance.messages.createSuccess"))
      }

      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t("insurance.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("insurance.modals.editCompany")
              : t("insurance.modals.addCompany")}
          </DialogTitle>
          {isEdit ? (
            <DialogDescription>{company.name}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          <Field>
            <FieldLabel htmlFor="company-name">
              {t("insurance.fields.companyName")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input
              id="company-name"
              maxLength={255}
              autoComplete="organization"
              {...form.register("name")}
            />
            <FieldError
              errors={
                form.formState.errors.name
                  ? [{ message: t(form.formState.errors.name.message ?? "") }]
                  : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="company-contact">
              {t("insurance.fields.contactInfo")}
            </FieldLabel>
            <Textarea
              id="company-contact"
              rows={3}
              maxLength={1000}
              placeholder={t("insurance.fields.contactInfoPlaceholder")}
              {...form.register("contactInfo")}
            />
            <FieldDescription>
              {t("insurance.fields.contactInfoHelp")}
            </FieldDescription>
            <FieldError
              errors={
                form.formState.errors.contactInfo
                  ? [
                      {
                        message: t(
                          form.formState.errors.contactInfo.message ?? ""
                        ),
                      },
                    ]
                  : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="company-price-list">
              {t("insurance.fields.defaultPriceList")}
            </FieldLabel>
            <Controller
              control={form.control}
              name="pricelistId"
              render={({ field }) => (
                <Select
                  value={field.value || NO_PRICE_LIST}
                  onValueChange={(next) =>
                    field.onChange(next === NO_PRICE_LIST ? "" : next)
                  }
                  disabled={submitting}
                >
                  <SelectTrigger id="company-price-list" className="w-full">
                    <SelectValue
                      placeholder={t("insurance.fields.selectPriceList")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRICE_LIST}>
                      {t("insurance.fields.selectPriceList")}
                    </SelectItem>
                    {priceLists.map((priceList) => (
                      <SelectItem
                        key={priceList.pricelistId}
                        value={String(priceList.pricelistId)}
                      >
                        {priceList.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>
              {t("insurance.fields.priceListHelp")}
            </FieldDescription>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner aria-hidden className="me-1.5" />
                  {t("insurance.buttons.saveCompany")}
                </>
              ) : (
                t("insurance.buttons.saveCompany")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
