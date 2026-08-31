import type {
  ClockedInEmployeeRow,
  ClockedInStaff,
  Doctor,
  EmployeeType,
  Nurse,
} from "@/pages/Patients/types/patient"

/**
 * T9.2 — Coerce wire rows from `/api/clock-ins/clocked-in` into the
 * enriched `ClockedInStaff` shape that the legacy staff overview
 * expects.
 *
 * The wire response only carries `clock_id, employee_id, clock_in,
 * clock_out, pay_deduction, shift_start_time, shift_end_time`. Name +
 * employee_type come from the locally-cached `listDoctors()` and
 * `listAvailableNurses()` lookups — the legacy rendered both lists
 * before any clocked-in fetch so the doctor/nurse dictionaries were
 * already in memory.
 *
 * Inputs are camelCase-only per the T7.5 contract. The returned
 * `ClockedInStaff` is still camelCase.
 */

function lookupEmployeeType(
  employeeId: number,
  doctors: Doctor[],
  nurses: Nurse[]
): { name: string; employeeType: EmployeeType } | null {
  const doctor = doctors.find((d) => d.employeeId === employeeId);
  if (doctor) return { name: doctor.name, employeeType: "doctor" };
  const nurse = nurses.find((n) => n.employeeId === employeeId);
  if (nurse) return { name: nurse.name, employeeType: "nurse" };
  return null;
}

export interface StaffAssignmentTargeting {
  /** Patient history ids where this employee is currently assigned. */
  byEmployee: Record<number, number[]>;
}

/**
 * Join clocked-in rows with the doctor/nurse lookups + current
 * assignment list so the resulting `ClockedInStaff` has `name`,
 * `employeeType`, `assignedPatientIds`, and `available`.
 *
 * If the matching doctor/nurse record isn't in either lookup the
 * employee falls back to "other"/"Unknown" so the card still
 * surfaces the clock-in time.
 */
export function enrichClockedIn(
  rows: ClockedInEmployeeRow[],
  doctors: Doctor[],
  nurses: Nurse[],
  assignmentTargeting: StaffAssignmentTargeting
): ClockedInStaff[] {
  return rows.map((row) => {
    const info = lookupEmployeeType(row.employeeId, doctors, nurses);
    const assignedPatientIds = [...(assignmentTargeting.byEmployee[row.employeeId] ?? [])];
    return {
      employeeId: row.employeeId,
      employeeType: info?.employeeType ?? "other",
      name: info?.name ?? `#${row.employeeId}`,
      clockInTime: row.clockIn,
      assignedPatientIds,
      available: assignedPatientIds.length === 0,
    } satisfies ClockedInStaff;
  });
}

/**
 * Build a `employeeId → assignedPatientId[]` map by indexing
 * admission rows on their `attendingDoctorIds` + `attendingNurseIds`.
 * Pure helper — separates a finger-friendly lookup from the
 * renderable card so re-renders don't re-scan the list.
 */
export function buildAssignmentTargeting<
  T extends {
    patientId: number;
    attendingDoctorIds: number[];
    attendingNurseIds: number[];
  }
>(admissions: T[]): StaffAssignmentTargeting {
  const byEmployee: Record<number, number[]> = {};
  for (const admission of admissions) {
    const ids = [
      ...admission.attendingDoctorIds,
      ...admission.attendingNurseIds,
    ];
    for (const empId of ids) {
      if (!byEmployee[empId]) byEmployee[empId] = [];
      if (!byEmployee[empId].includes(admission.patientId)) {
        byEmployee[empId].push(admission.patientId);
      }
    }
  }
  return { byEmployee };
}

/**
 * Renderer-shape counterpart of `CurrentAdmissionWithStaffRow`.
 * Carries the same flat arrays (so callers can index by id *or* by
 * name without merging); the field naming mirrors the wire so
 * downstream `extractFeatures(row)` helpers don't have to recast.
 */
export interface AssignmentSummary {
  patientHistoryId: number;
  patientId: number;
  patientName: string;
  diagnosis: string | null;
  admissionTime: string;
  quickCheck: boolean;
  attendingDoctorIds: number[];
  attendingDoctors: string[];
  attendingNurseIds: number[];
  attendingNurses: string[];
}

export function buildAssignmentSummary(
  row: import("@/pages/Patients/types/patient").CurrentAdmissionWithStaffRow
): AssignmentSummary {
  return {
    patientHistoryId: row.patientHistoryId,
    patientId: row.patientId,
    patientName: row.patientName,
    diagnosis: row.diagnosis,
    admissionTime: row.admissionTime,
    quickCheck: row.quickCheck,
    attendingDoctorIds: [...row.attendingDoctorIds],
    attendingDoctors: [...row.attendingDoctors],
    attendingNurseIds: [...row.attendingNurseIds],
    attendingNurses: [...row.attendingNurses],
  };
}
