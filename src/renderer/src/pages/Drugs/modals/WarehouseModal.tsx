"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import {
  warehouseSchema,
  type WarehouseValues,
} from "@/pages/Drugs/schemas/warehouse.schema"
import { ApiError } from "@/lib/errors"

interface WarehouseModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** When set, edits this warehouse; otherwise creates a new one. */
  name?: string
  location?: string
  warehouseId?: number
  onSubmit: (values: WarehouseValues) => Promise<void>
}

/**
 * Add / Edit Warehouse dialog (§6.5 header action).
 *
 * Mutations are delegated to the parent (`useWarehouses`), which owns
 * the toasts and list refresh; this dialog only collects name + location
 * and validates.
 */
export function WarehouseModal({
  open,
  onOpenChange,
  name,
  location,
  warehouseId,
  onSubmit,
}: WarehouseModalProps) {
  const { t } = useTranslation()
  const isEdit = warehouseId != null

  const form = useForm<WarehouseValues>({
    resolver: zodResolver(warehouseSchema),
    mode: "onBlur",
    defaultValues: { name: name ?? "", location: location ?? "" },
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) form.reset({ name: name ?? "", location: location ?? "" })
  }, [open, name, location, form])

  async function handleSubmit(values: WarehouseValues) {
    setSubmitting(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("pharmacy.messages.warehouseSaveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("pharmacy.modals.editWarehouse")
              : t("pharmacy.modals.addWarehouse")}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="wh-name">
              {t("pharmacy.fields.warehouseName")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="wh-name" {...form.register("name")} />
            <FieldError
              errors={
                form.formState.errors.name
                  ? [{ message: t(form.formState.errors.name.message ?? "") }]
                  : undefined
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="wh-location">
              {t("pharmacy.fields.location")}
              <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="wh-location" {...form.register("location")} />
            <FieldError
              errors={
                form.formState.errors.location
                  ? [{ message: t(form.formState.errors.location.message ?? "") }]
                  : undefined
              }
            />
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
                  {t("pharmacy.buttons.saving")}
                </>
              ) : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}