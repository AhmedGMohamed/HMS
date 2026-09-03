import { z } from "zod"

/**
 * Direct inpatient dispense schema for medical supplies.
 *
 * Unlike drugs, supplies are dispensed ONLY to admitted inpatients —
 * there is no `transactionType` radio (no outside sales, no medical
 * check charges). The modal collects patient, quantity, and selling
 * price, then submits to `POST /api/pharmacy/medical-supply-usages/
 * patient/:patientId`. The server writes the `MedicalSupplyUsage`,
 * the `MedicalSupplyTransaction`, and a `BillDetail` row in the same
 * transaction.
 */

export const dispenseSupplySchema = z
  .object({
    patientId: z
      .number({ message: "medicalSupplies.dispense.patientRequired" })
      .int()
      .positive("medicalSupplies.dispense.patientRequired"),
    /**
     * `patientHistoryId` is sourced from the admitted patient's
     * `ActivePatient.activePatientHistoryId` (the server joins
     * `PatientHistory WHERE discharge_time IS NULL`).
     */
    patientHistoryId: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    quantity: z
      .number({ message: "medicalSupplies.dispense.quantityMin" })
      .int("medicalSupplies.dispense.quantityMin")
      .positive("medicalSupplies.dispense.quantityMin"),
    price: z
      .number({ message: "medicalSupplies.validation.invalidPrice" })
      .nonnegative("medicalSupplies.validation.invalidPrice"),
  })
  .superRefine((v, ctx) => {
    if (v.patientId > 0 && (v.patientHistoryId == null || v.patientHistoryId <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["patientHistoryId"],
        message: "medicalSupplies.dispense.patientAdmissionRequired",
      })
    }
  })

export type DispenseSupplyValues = z.infer<typeof dispenseSupplySchema>
