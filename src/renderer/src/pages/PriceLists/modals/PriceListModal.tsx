"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
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
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

import { createPriceList, updatePriceList } from "@/pages/PriceLists/api"
import {
  priceListSchema,
  type PriceListValues,
} from "@/pages/PriceLists/schemas/priceList.schema"
import type { PriceList } from "@/pages/PriceLists/types/priceList"
import { ApiError } from "@/lib/errors"

interface PriceListModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** `null` = create. */
  priceList?: PriceList | null
  /** The list currently flagged default (drives the invariant UI). */
  currentDefault?: PriceList | null
  /** Called after a successful create (not edit) — the page uses it to
   *  offer the "Add Prices Now?" flow. */
  onSaved?: (created: PriceList) => void
}

function toDefaults(
  priceList?: PriceList | null,
  currentDefault?: PriceList | null
): PriceListValues {
  return {
    name: priceList?.name ?? "",
    isDefault: priceList
      ? priceList.isDefault
      : (currentDefault == null && priceList == null),
  }
}

/**
 * Create / Edit price list dialog (§2).
 *
 * Default-list invariant (decision #4): editing the current default
 * renders the checkbox checked + disabled — the default moves by
 * setting it on another list, never by unsetting. Checking the box
 * while another list holds the default asks for confirmation first.
 */
export function PriceListModal({
  open,
  onOpenChange,
  priceList,
  currentDefault,
  onSaved,
}: PriceListModalProps) {
  const { t } = useTranslation()
  const isEdit = priceList != null

  const form = useForm<PriceListValues>({
    resolver: zodResolver(priceListSchema),
    mode: "onBlur",
    defaultValues: toDefaults(priceList, currentDefault),
  })

  const [submitting, setSubmitting] = useState(false)
  const [confirmDefaultOpen, setConfirmDefaultOpen] = useState(false)

  useEffect(() => {
    if (open) form.reset(toDefaults(priceList, currentDefault))
  }, [open, priceList, currentDefault, form])

  const isDefault = form.watch("isDefault")
  /** Editing the current default: the checkbox cannot be unchecked. */
  const defaultLocked =
    isEdit && currentDefault?.pricelistId === priceList.pricelistId

  function handleDefaultToggle(next: boolean) {
    if (!next) {
      form.setValue("isDefault", false)
      return
    }
    const steals = currentDefault != null && !defaultLocked
    if (steals) {
      setConfirmDefaultOpen(true)
      return
    }
    form.setValue("isDefault", true)
  }

  async function onSubmit(values: PriceListValues) {
    setSubmitting(true)
    try {
      const payload = { name: values.name.trim(), isDefault: values.isDefault }
      if (isEdit) {
        await updatePriceList(priceList.pricelistId, payload)
        toast.success(t("priceLists.messages.updateSuccess"))
      } else {
        const created = await createPriceList(payload)
        toast.success(t("priceLists.messages.createSuccess"))
        onOpenChange(false)
        onSaved?.(created)
        return
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError &&
          err.message.includes("Cannot unset the default price list")
          ? t("priceLists.messages.defaultGuardError")
          : err instanceof ApiError
            ? err.message
            : t("priceLists.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? t("priceLists.modals.editPriceList")
                : t("priceLists.modals.createPriceList")}
            </DialogTitle>
            {isEdit ? (
              <DialogDescription>{priceList.name}</DialogDescription>
            ) : null}
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <Field>
              <FieldLabel htmlFor="pl-name">
                {t("priceLists.fields.priceListName")}
                <span className="text-danger">*</span>
              </FieldLabel>
              <Input id="pl-name" {...form.register("name")} />
              <FieldError
                errors={
                  form.formState.errors.name
                    ? [
                        {
                          message: t(
                            form.formState.errors.name.message ?? ""
                          ),
                        },
                      ]
                    : undefined
                }
              />
            </Field>

            <div className="flex flex-col gap-2">
              <Field orientation="horizontal" className="items-center">
                <Checkbox
                  id="pl-default"
                  checked={isDefault}
                  disabled={defaultLocked || submitting}
                  onCheckedChange={(v) => handleDefaultToggle(v === true)}
                />
                <FieldLabel htmlFor="pl-default">
                  {t("priceLists.fields.setAsDefault")}
                </FieldLabel>
              </Field>
              <p className="text-xs text-muted-foreground">
                {t("priceLists.help.defaultNote")}
              </p>
            </div>

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
                    {t("priceLists.buttons.saving")}
                  </>
                ) : (
                  t("common.save")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Making this list default while another holds it */}
      <ConfirmDialog
        open={confirmDefaultOpen}
        onOpenChange={setConfirmDefaultOpen}
        variant="warning"
        title={t("priceLists.messages.changeDefaultTitle")}
        description={t("priceLists.messages.changeDefaultText")}
        confirmLabel={t("priceLists.buttons.makeDefault")}
        onConfirm={() => {
          form.setValue("isDefault", true)
          setConfirmDefaultOpen(false)
        }}
      />
    </>
  )
}
