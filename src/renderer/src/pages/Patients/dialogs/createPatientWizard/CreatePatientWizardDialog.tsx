"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { isNetworkError } from "@/lib/errors"

import { Stepper, type StepperStep } from "@/pages/Patients/components/Stepper"
import {
  VALIDATION_KEYS,
  wizardAdmissionSchema,
  wizardBasicSchema,
  wizardGuardianSchema,
  wizardMedicalSchema,
  wizardPaymentSchema,
  type WizardAdmissionValues,
  type WizardBasicValues,
  type WizardGuardianValues,
  type WizardMedicalValues,
  type WizardPaymentValues,
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

/**
 * Form-level schemas. The per-step schemas in `patient.schema.ts` are the
 * source of truth for field rules; these only adapt them to the wizard's
 * namespaced form shape (`basic.*`, `payment.*`, …) so a single RHF resolver
 * can validate, and so each step's `Next` gate uses the exact same rules.
 */
const wizardBasicFormSchema = wizardBasicSchema
  .extend({
    /* The form keeps `""` as the "not chosen yet" value (the select has an
       empty option); the real enum is enforced below rather than by
       `wizardBasicSchema` itself. */
    gender: z.union([
      z.literal("male"),
      z.literal("female"),
      z.literal("other"),
      z.literal(""),
    ]),
  })
  .superRefine((value, ctx) => {
    if (value.gender === "") {
      ctx.addIssue({
        code: "custom",
        path: ["gender"],
        message: VALIDATION_KEYS.gender,
      })
    }
  })

const wizardAdmissionFormSchema = wizardAdmissionSchema.superRefine(
  (value, ctx) => {
    /* Admission is only required when the user opts into admitting on save;
       `PatientWizardBasicStep` clears these values when the toggle goes off. */
    if (!value.admitOnSave) return
    if (!value.diagnosis || value.diagnosis.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["diagnosis"],
        message: VALIDATION_KEYS.diagnosis,
      })
    }
    if (value.attendingDoctorIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["attendingDoctorIds"],
        message: VALIDATION_KEYS.attendingDoctor,
      })
    }
  }
)

const wizardFormSchema = z.object({
  basic: wizardBasicFormSchema,
  guardian: wizardGuardianSchema,
  payment: wizardPaymentSchema,
  admission: wizardAdmissionFormSchema,
  medical: wizardMedicalSchema,
})

/** RHF path root for each internal step id (used by `trigger`). */
const STEP_FIELD = {
  [StepperStepIds.Basic]: "basic",
  [StepperStepIds.Guardian]: "guardian",
  [StepperStepIds.Payment]: "payment",
  [StepperStepIds.Admission]: "admission",
  [StepperStepIds.Medical]: "medical",
} as const

/** Same rules as the resolver, scoped to one step — drives `Next`'s disabled state. */
function isStepValid(step: number, values: WizardFormShape): boolean {
  switch (step) {
    case StepperStepIds.Basic:
      return wizardBasicFormSchema.safeParse(values.basic).success
    case StepperStepIds.Guardian:
      return wizardGuardianSchema.safeParse(values.guardian).success
    case StepperStepIds.Payment:
      return wizardPaymentSchema.safeParse(values.payment).success
    case StepperStepIds.Admission:
      return wizardAdmissionFormSchema.safeParse(values.admission).success
    case StepperStepIds.Medical:
      /* Optional step: referring doctor may stay empty. */
      return wizardMedicalSchema.safeParse(values.medical).success
    default:
      return false
  }
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
    resolver: zodResolver(wizardFormSchema),
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
        pricelistId: null,
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

  async function validateStep(target: number): Promise<boolean> {
    const field = STEP_FIELD[target as keyof typeof STEP_FIELD]
    if (!field) return false
    /* `trigger` with the resolver runs the real step rules and focuses the
       first invalid control (design.md §6.3). */
    return form.trigger(field, { shouldFocus: true })
  }

  async function goForward() {
    if (!(await validateStep(step))) return
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
      const ok = await validateStep(target)
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
        guardianInfo: {
          name: values.guardian.guardianName?.trim() || null,
          phone: values.guardian.guardianPhone?.trim() || null,
          nationalId: values.guardian.guardianNationalId?.trim() || null,
          address: values.guardian.guardianAddress?.trim() || null,
        },
        referringDoctorId:
          values.medical.referringDoctorId ?? null,
        admitPatient: values.admission.admitOnSave,
        attendingDoctorIds: values.admission.attendingDoctorIds,
        attendingNurseIds: values.admission.attendingNurseIds,
        diagnosis: values.admission.diagnosis || null,
        isActive: false,
        pricelistId: values.payment.pricelistId ?? null,
        quickCheck: values.admission.quickCheck || null,
      })
      toast.success(t("patients.messages.patientCreated"))
      form.reset()
      setStep(StepperStepIds.Basic)
      closeDialog()
      onCreated?.()
    } catch (err) {
      toast.error(
        isNetworkError(err)
          ? t("errors.networkError")
          : err instanceof Error
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
      actually creates the patient). `Next` is disabled until the current
      step passes the same schemas the resolver uses; `handleSubmit` still
      hard-guards on the Medical step so a stray submit can never POST from
      an earlier step. */
  const isOnLastStep = step === StepperStepIds.Medical

  /* Subscribing to the form values is what makes the `Next` gate live; the
     rules are the step schemas above, not a second copy. */
  const watchedValues = form.watch()
  const canGoForward = isStepValid(step, watchedValues)

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
           * Enter submits on the last step: the Save button is the form's
           * submit control and `onSubmit` delegates to `handleSubmit`, which
           * refuses to run anywhere except the Medical step. Earlier steps
           * keep `type="button"` controls, so implicit submission cannot POST.
           */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
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
                <Button type="submit" disabled={submitting}>
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
                  disabled={submitting || !canGoForward}
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
