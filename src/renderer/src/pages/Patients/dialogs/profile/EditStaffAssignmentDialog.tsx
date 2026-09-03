"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"

import {
  getCurrentAdmission,
} from "@/pages/Patients/api"
import type { PatientHistory } from "@/pages/Patients/types/patient"
import { useStaffLookups } from "@/pages/Patients/hooks/staffStatus/useStaffLookups"
import { useUpdateStaffAssignment } from "@/pages/Patients/hooks/profile/useUpdateStaffAssignment"

interface EditStaffAssignmentDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  patientId: number | null
  /** Pre-translated patient name (for the dialog header). */
  patientName: string
  onSaved?: () => void
}

/**
 * T10 — Edit Staff Assignment dialog, launched from two surfaces:
 *
 *   1. `<PatientProfilePanel>` ActionBar "Edit Staff" button
 *      (patient must be currently admitted for `patientId` to drive
 *      a current admission lookup).
 *   2. `<StaffStatusPanel>`: Users icon on each assignment card +
 *      patients-chip on each staff member card.
 *
 * Fetches `/api/patients/:id/admissions/current` lazily on `open`
 * to derive the baseline attending doctor/nurse ids. Computes the
 * diff on Save and calls `useUpdateStaffAssignment.submit()`; no-op
 * diffs close silently without a round-trip.
 */
export function EditStaffAssignmentDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  onSaved,
}: EditStaffAssignmentDialogProps) {
  const { t } = useTranslation()
  const { doctors, nurses, loading: staffLoading, error: staffError } =
    useStaffLookups()
  const { submit, submitting } = useUpdateStaffAssignment()

  const [admission, setAdmission] = useState<PatientHistory | null>(null)
  const [admissionLoading, setAdmissionLoading] = useState(false)
  const [admissionError, setAdmissionError] = useState<Error | null>(null)

  const [selectedDoctors, setSelectedDoctors] = useState<number[]>([])
  const [selectedNurses, setSelectedNurses] = useState<number[]>([])

  /* Lazy-load baseline admission when the dialog opens. */
  useEffect(() => {
    if (!open || !patientId || patientId <= 0) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdmissionLoading(true)
    setAdmissionError(null)
    getCurrentAdmission(patientId)
      .then((row) => {
        if (cancelled) return
        setAdmission(row)
        setSelectedDoctors(row?.attendingDoctorIds ?? [])
        setSelectedNurses(row?.attendingNurseIds ?? [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAdmission(null)
        setAdmissionError(
          err instanceof Error ? err : new Error(String(err))
        )
      })
      .finally(() => {
        if (!cancelled) setAdmissionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, patientId])

  /* Reset everything on close. */
  useEffect(() => {
    if (open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdmission(null)
    setAdmissionError(null)
    setSelectedDoctors([])
    setSelectedNurses([])
  }, [open])

  const baselineDoctorIds = admission?.attendingDoctorIds ?? []
  const baselineNurseIds = admission?.attendingNurseIds ?? []

  function toggleDoctor(id: number) {
    setSelectedDoctors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }
  function toggleNurse(id: number) {
    setSelectedNurses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit() {
    if (!patientId) return
    const doctorsToAdd = selectedDoctors.filter(
      (id) => !baselineDoctorIds.includes(id)
    )
    const doctorsToRemove = baselineDoctorIds.filter(
      (id) => !selectedDoctors.includes(id)
    )
    const nursesToAdd = selectedNurses.filter(
      (id) => !baselineNurseIds.includes(id)
    )
    const nursesToRemove = baselineNurseIds.filter(
      (id) => !selectedNurses.includes(id)
    )
    const changedRoles = await submit(patientId, {
      attendingDoctors: { add: doctorsToAdd, remove: doctorsToRemove },
      attendingNurses: { add: nursesToAdd, remove: nursesToRemove },
    })
    if (changedRoles) {
      onOpenChange(false)
      onSaved?.()
    } else {
      onOpenChange(false)
    }
  }

  /* No-op detection — disable Save if nothing actually differs. Server
     short-circuits no-op updates too, but the button is mostly for
     visual parity with the legacy. */
  const isDirty =
    !arraysEqual(selectedDoctors, baselineDoctorIds) ||
    !arraysEqual(selectedNurses, baselineNurseIds)

  function arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    const sorted = (x: number[]) => [...x].sort()
    const sa = sorted(a)
    const sb = sorted(b)
    return sa.every((v, i) => v === sb[i])
  }

  if (!patientId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("patients.modals.editStaffFor", { name: patientName })}
          </DialogTitle>
          <DialogDescription>
            {t("patients.help.editStaffAssignmentInfo")}
          </DialogDescription>
        </DialogHeader>

        {admissionLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner aria-hidden className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : admissionError ? (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>
              {admissionError.message ||
                t("patients.messages.loadStaffAssignmentError")}
            </AlertDescription>
          </Alert>
        ) : !admission ? (
          <Alert variant="default" className="my-2">
            <AlertDescription>
              {t("patients.messages.staffAssignmentRequiresAdmission")}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            {staffError ? (
              <Alert variant="destructive" className="my-2">
                <AlertDescription>
                  {staffError.message ||
                    t("patients.messages.loadStaffAssignmentError")}
                </AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel>{t("patients.fields.attendingDoctors")}</FieldLabel>
              {staffLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : doctors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("patients.messages.noDoctorsAvailable")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {doctors.map((d) => {
                    const selected = selectedDoctors.includes(d.employeeId)
                    return (
                      <button
                        key={d.employeeId}
                        type="button"
                        onClick={() => toggleDoctor(d.employeeId)}
                        className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        aria-pressed={selected}
                      >
                        <Badge
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer"
                        >
                          {d.name}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
              <FieldDescription>
                {selectionSummary(selectedDoctors.length, baselineDoctorIds.length, t, "doctors")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("patients.fields.attendingNurses")}</FieldLabel>
              {staffLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : nurses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("patients.messages.noNursesAvailable")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {nurses.map((n) => {
                    const selected = selectedNurses.includes(n.employeeId)
                    return (
                      <button
                        key={n.employeeId}
                        type="button"
                        onClick={() => toggleNurse(n.employeeId)}
                        className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        aria-pressed={selected}
                      >
                        <Badge
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer"
                        >
                          {n.name}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
              <FieldDescription>
                {selectionSummary(selectedNurses.length, baselineNurseIds.length, t, "nurses")}
              </FieldDescription>
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !isDirty || !admission}
          >
            {submitting ? (
              <>
                <Spinner aria-hidden className="me-2 size-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function selectionSummary(
  selected: number,
  baseline: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  kind: "doctors" | "nurses"
): string {
  const delta = selected - baseline
  if (delta === 0) return t("patients.messages.noStaffChange")
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`
  const key =
    kind === "doctors"
      ? "patients.messages.noDoctorsInAdmission"
      : "patients.messages.noNursesInAdmission"
  return `${t(key)}: ${selected} (${deltaLabel})`
}
