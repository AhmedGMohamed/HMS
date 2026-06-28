"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { Stepper, type StepperStep } from "@/pages/Patients/components/Stepper"
import type {
  WizardAdmissionValues,
  WizardBasicValues,
  WizardGuardianValues,
  WizardMedicalValues,
  WizardPaymentValues,
} from "@/pages/Patients/schemas/patient.schema"
import { StepperStepIds } from "./StepperStepIds"
import { createPatient } from "@/pages/Patients/api"

import { PatientWizardBasicStep } from "./PatientWizardBasicStep"
import { PatientWizardGuardianStep } from "./PatientWizardGuardianStep"
import { PatientWizardPaymentStep } from "./PatientWizardPaymentStep"
import { PatientWizardAdmissionStep } from "./PatientWizardAdmissionStep"
import { PatientWizardMedicalStep } from "./PatientWizardMedicalStep"
import { useCreatePatientWizard } from "./useCreatePatientWizard"

/**
 * Create Patient Wizard — Phase 6.2 T3.
 *
 * 5 positions; the Admission step is dropped from the visible flow
 * when the user keeps `admitOnSave=false`:
 *
 *   1. Basic info      — name, gender, natId, phone, address,
 *                        plus the "Admit on register" checkbox.
 *   2. Guardian info   — optional fields.
 *   3. Payment         — type + conditional insurance fields + pricelist.
 *   4. Admission       — diagnosis, attending staff (visible iff admit-on-register).
 *   5. Medical         — referring doctor (optional).
 *
 * The wizard owns the open/close state through a Zustand store so the
 * page header can flip it open via a callback ref. The submit posts
 * to `/api/patients` and dispatches a toast on success/failure. After
 * a successful POST the dialog stays closed; the list refresh is
 * delegated to the parent via the onCreated callback.
 *
 * Flow diagram (admit-on-register == true):
 *
 *   Step 0 → 1 → 2 → 3 → 4    (save at step 4)
 *
 * Flow diagram (admit-on-register == false):
 *
 *   Step 0 → 1 → 2 → 4       (step 3 is hidden; save at step 4)
 */

export type WizardFormShape = {
  basic: Omit<WizardBasicValues, "gender"> & {
    gender: "" | WizardBasicValues["gender"]
  }
  guardian: WizardGuardianValues
  payment: WizardPaymentValues
  admission: WizardAdmissionValues
  medical: WizardMedicalValues
}

interface CreatePatientWizardDialogProps {
  onCreated?: () => void
}

export function CreatePatientWizardDialog({
  onCreated,
}: CreatePatientWizardDialogProps) {
  const { t } = useTranslation()
  const { open, closeDialog } = useCreatePatientWizard()
  const [step, setStep] = useState<number>(StepperStepIds.Basic)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<WizardFormShape>({
    defaultValues: {
      basic: { name: "", gender: "", address: "" },
      guardian: {
        guardianName: "",
        guardianPhone: "",
        guardianNationalId: "",
        guardianAddress: "",
      },
      payment: {
        paymentType: "cash",
        insuranceId: null,
        insuranceCardId: "",
        insuranceFormId: "",
        pricingListId: null,
      },
      admission: {
        admitOnSave: false,
        diagnosis: "",
        quickCheck: false,
        attendingDoctorIds: [],
        attendingNurseIds: [],
      },
      medical: { referringDoctorId: null },
    },
    mode: "onBlur",
  })

  const stepsConfig: StepperStep[] = [
    { id: "basic", label: t("patients.sections.basicInfo") },
    { id: "guardian", label: t("patients.sections.guardianInfo") },
    { id: "payment", label: t("patients.sections.paymentInfo") },
    { id: "admission", label: t("patients.sections.admissionInfo") },
    { id: "medical", label: t("patients.sections.medicalInfo") },
  ]

  const admitOnSave = form.watch("admission.admitOnSave")

  const stepList: StepperStep[] = stepsConfig.filter(
    (s) => s.id !== "admission" || admitOnSave,
  )

  /**
   * Map our internal `step` (5 positions) onto the visible
   * index of the rendered step list (4 positions when admission hidden).
   * The "basic" step is always index 0; "guardian" / "payment" /
   * "admission" / "medical" each find their index dynamically.
   */
  const stepIndexById = new Map<string, number>()
  stepList.forEach((s, idx) => stepIndexById.set(s.id, idx))

  function visibleIndexFor(internalStep: number): number {
    if (stepList.length === 0) return 0
    const idKey = idForInternalStep(internalStep)
    return idKey
      ? stepIndexById.get(idKey) ?? 0
      : 0
  }

  function idForInternalStep(s: number): string | null {
    switch (s) {
      case StepperStepIds.Basic:
        return "basic"
      case StepperStepIds.Guardian:
        return "guardian"
      case StepperStepIds.Payment:
        return "payment"
      case StepperStepIds.Admission:
        return "admission"
      case StepperStepIds.Medical:
        return "medical"
      default:
        return null
    }
  }

  function nextStep(current: number): number | null {
    switch (current) {
      case StepperStepIds.Basic:
        return StepperStepIds.Guardian
      case StepperStepIds.Guardian:
        return StepperStepIds.Payment
      case StepperStepIds.Payment:
        return admitOnSave
          ? StepperStepIds.Admission
          : StepperStepIds.Medical
      case StepperStepIds.Admission:
        return StepperStepIds.Medical
      default:
        return null
    }
  }

  function prevStep(current: number): number | null {
    switch (current) {
      case StepperStepIds.Guardian:
        return StepperStepIds.Basic
      case StepperStepIds.Payment:
        return StepperStepIds.Guardian
      case StepperStepIds.Medical:
        return admitOnSave
          ? StepperStepIds.Admission
          : StepperStepIds.Payment
      case StepperStepIds.Admission:
        return StepperStepIds.Payment
      default:
        return null
    }
  }

  async function validateInternal(target: number): Promise<boolean> {
    switch (target) {
      case StepperStepIds.Basic:
        return form.trigger("basic", { shouldFocus: true })
      case StepperStepIds.Guardian:
        return form.trigger("guardian", { shouldFocus: true })
      case StepperStepIds.Payment:
        return form.trigger("payment", { shouldFocus: true })
      case StepperStepIds.Admission:
        if (!form.getValues("admission.admitOnSave")) return true
        return form.trigger("admission", { shouldFocus: true })
      case StepperStepIds.Medical:
        /* Medical step is optional — referring-doctor select CAN
           be empty. No validation gate enforces values. */
        return true
      default:
        return false
    }
  }

  async function goForward() {
    if (!(await validateInternal(step))) return
    const next = nextStep(step)
    if (next != null) setStep(next)
  }

  function goBack() {
    const prev = prevStep(step)
    if (prev != null) setStep(prev)
  }

  async function handleSubmit() {
    /* Hard guard: the form is only allowed to submit when the
       wizard is parked on the Medical step. Any other code path
       that triggers a form-submit (a default-button hijack, the
       browser's Enter-key default behaviour, …) silently drops
       the call. This prevents accidental POSTs the moment the
       Medical tab opens and any keyboard-driven edge case. */
    if (step !== StepperStepIds.Medical) return
    if (submitting) return

    /* Sequence-through-validate: any failing step soft-redirects
       the dialog to that step. We must NOT call `setSubmitting`
       until validation has cleared. */
    for (const target of [
      StepperStepIds.Basic,
      StepperStepIds.Guardian,
      StepperStepIds.Payment,
      ...(admitOnSave ? [StepperStepIds.Admission] : []),
      StepperStepIds.Medical,
    ]) {
      const ok = await validateInternal(target)
      if (!ok) {
        setStep(target)
        return
      }
    }

    const values = form.getValues()
    setSubmitting(true)
    try {
      await createPatient({
        name: values.basic.name.trim(),
        nationalId: values.basic.nationalId?.trim() || null,
        gender: values.basic.gender as WizardBasicValues["gender"],
        phone: values.basic.phone?.trim() || null,
        address: values.basic.address?.trim() || null,
        paymentType: values.payment.paymentType,
        insuranceId:
          values.payment.paymentType === "insurance"
            ? values.payment.insuranceId ?? null
            : null,
        insuranceCardId:
          values.payment.paymentType === "insurance"
            ? values.payment.insuranceCardId ?? null
            : null,
        insuranceFormId:
          values.payment.paymentType === "insurance"
            ? values.payment.insuranceFormId ?? null
            : null,
        guardianName:
          values.guardian.guardianName?.trim() || null,
        guardianPhone:
          values.guardian.guardianPhone?.trim() || null,
        guardianNationalId:
          values.guardian.guardianNationalId?.trim() || null,
        guardianAddress:
          values.guardian.guardianAddress?.trim() || null,
        referringDoctorId:
          values.medical.referringDoctorId ?? null,
        admitPatient: values.admission.admitOnSave,
        attendingDoctorIds: values.admission.attendingDoctorIds,
        attendingNurseIds: values.admission.attendingNurseIds,
        diagnosis: values.admission.diagnosis || null,
        isActive: false,
        pricingListId: values.payment.pricingListId ?? null,
        quickCheck: values.admission.quickCheck || null,
      })
      toast.success(t("patients.messages.patientCreated"))
      form.reset()
      setStep(StepperStepIds.Basic)
      closeDialog()
      onCreated?.()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("patients.messages.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep(StepperStepIds.Basic)
      form.reset()
      closeDialog()
    }
  }

  /** Save button is only the LAST visible step. When the internal
      step is "Medical", render as Save Patient (the only path that
      actually creates the patient). Every step renders its
      respective Submit/Reject with `type="button"` + onClick so a
      stray form-submit never fires handleSubmit behind our back. */
  const isOnLastStep = step === StepperStepIds.Medical

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleOpenChange(false)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("patients.modals.registerPatient")}</DialogTitle>
        </DialogHeader>

        <Stepper steps={stepList} current={visibleIndexFor(step)} />

        <FormProvider {...form}>
          {/*
           * IMPORTANT: The <form> onSubmit is intentionally non-functional
           * — we never auto-submit. All submits go through the Save
           * Patient button's onClick handler, which guards against
           * accidental calls (see `if (step !== Medical) return`). The
           * form's only job is to scope RHF's onSubmit behaviour if the
           * browser ever falls back to its defaults.
           */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-6"
          >
            {step === StepperStepIds.Basic ? (
              <PatientWizardBasicStep />
            ) : null}
            {step === StepperStepIds.Guardian ? (
              <PatientWizardGuardianStep />
            ) : null}
            {step === StepperStepIds.Payment ? (
              <PatientWizardPaymentStep />
            ) : null}
            {step === StepperStepIds.Admission ? (
              <PatientWizardAdmissionStep />
            ) : null}
            {step === StepperStepIds.Medical ? (
              <PatientWizardMedicalStep />
            ) : null}

            <DialogFooter className="flex flex-row justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === StepperStepIds.Basic || submitting}
              >
                <ArrowLeftIcon aria-hidden className="me-2 size-4" />
                {t("common.previous")}
              </Button>

              {isOnLastStep ? (
                <Button
                  type="button"
                  onClick={() => {
                    void handleSubmit()
                  }}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Spinner aria-hidden className="me-2 size-4" />
                  ) : (
                    <CheckIcon aria-hidden className="me-2 size-4" />
                  )}
                  {t("patients.buttons.savePatient")}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    void goForward()
                  }}
                  disabled={submitting}
                >
                  {t("common.next")}
                  <ArrowRightIcon aria-hidden className="ms-2 size-4" />
                </Button>
              )}
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
