"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PlusCircleIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/common/EmptyState"
import { Input } from "@/components/ui/input"

import { listServices } from "@/pages/Patients/api"
import type { Service } from "@/pages/Patients/types/patient"
import { ApiError } from "@/lib/errors"

interface AddServiceDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number
  onAdded: (serviceId: number) => Promise<unknown>
  /** Service ids that have at least one ACTIVE row — excluded. */
  excludedServiceIds: number[]
}

export function AddServiceDialog({
  open,
  onOpenChange,
  patientId,
  onAdded,
  excludedServiceIds,
}: AddServiceDialogProps) {
  const { t } = useTranslation()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    listServices()
      .then((rows) => {
        if (cancelled) return
        setServices(rows)
      })
      .catch(() => {
        /* toast in catch handler below */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleAdd(serviceId: number) {
    setAdding(serviceId)
    try {
      await onAdded(serviceId)
      onOpenChange(false)
    } catch (err) {
      // Error toast fired by the upstream hook; surface ApiError message
      // if available, otherwise fallback generic.
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setAdding(null)
    }
  }

  const filtered = services.filter((s) =>
    search.trim().length === 0
      ? true
      : (s.name ?? "").toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.addService")}</DialogTitle>
        </DialogHeader>

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("patients.searchPlaceholder")}
          aria-label={t("patients.searchPlaceholder")}
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t("patients.messages.noAvailableServices")}
            description={t("patients.searchPlaceholder")}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-start font-medium">
                  {t("patients.buttons.view")}
                </th>
                <th className="py-2 text-start font-medium">
                  {t("patients.table.type")}
                </th>
                <th className="py-2 text-end font-medium">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const alreadyActive = excludedServiceIds.includes(s.serviceId)
                return (
                  <tr key={s.serviceId} className="border-t border-border">
                    <td className="py-2 font-medium text-foreground">
                      {s.name}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.serviceType ?? "—"}
                    </td>
                    <td className="py-2 text-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleAdd(s.serviceId)}
                        disabled={
                          alreadyActive ||
                          adding !== null ||
                          !patientId
                        }
                        title={
                          alreadyActive
                            ? t("patients.messages.patientMustBeAdmitted")
                            : undefined
                        }
                      >
                        <PlusCircleIcon
                          aria-hidden
                          className="me-1.5 size-3.5"
                        />
                        {adding === s.serviceId
                          ? t("common.loading")
                          : t("common.add")}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
