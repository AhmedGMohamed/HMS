import { api } from "@/lib/api"
import type {
  ActivePatientService,
  Bill,
  BillDetail,
  ClockedInStaff,
  Doctor,
  DrugCard,
  DrugShipment,
  DrugUsage,
  EmployeeType,
  InsuranceCompany,
  MedicalSupply,
  MedicalSupplyShipment,
  MedicalSupplyUsage,
  Nurse,
  Patient,
  PatientHistory,
  PriceList,
  Service,
} from "@/pages/Patients/types/patient"
import { PaginatedResponse } from "@/types"

/* ----------------------------------------------------------------
   Patients — list / detail
   ---------------------------------------------------------------- */

/**
 * Maps a renderer column id to the backend's `?sort=` column key. The
 * server whitelist (`Patient.model.ts:SORTABLE_COLUMNS`) keys by
 * snake_case wire names; `listPatients` converts here so callers can
 * keep renderer ids in their view state.
 */
const SORT_COLUMN_MAP: Record<string, string> = {
  patientId: "patient_id",
  name: "name",
  nationalId: "national_id",
  insuranceCompanyName: "insurance_company_name",
  paymentType: "payment_type",
  registrationDate: "registration_date",
}

export function listPatients(args: {
  page: number
  pageSize: number
  q?: string
  sort?: string
  order?: "asc" | "desc"
  paymentType?: string
  insuranceId?: number
  isActive?: boolean
  registeredFrom?: string
  registeredTo?: string
}) {
  return api.get<PaginatedResponse<Patient>>("/patients", {
    page: args.page,
    pageSize: args.pageSize,
    q: args.q || undefined,
    sort: args.sort ? SORT_COLUMN_MAP[args.sort] : undefined,
    order: args.order || undefined,
    paymentType: args.paymentType || undefined,
    insuranceId: args.insuranceId,
    isActive:
      args.isActive === undefined ? undefined : String(args.isActive),
    registeredFrom: args.registeredFrom || undefined,
    registeredTo: args.registeredTo || undefined,
  })
}

export function getActivePatients() {
  return api.get<Patient[]>("/patients/active")
}

export function getPatient(id: number) {
  return api.get<Patient>(`/patients/${id}`)
}

export function createPatient(payload: CreatePatientPayload) {
  return api.post<Patient | { patient: Patient; admission: PatientHistory; bill: Bill }>(
    "/patients",
    payload
  )
}

export function updatePatient(id: number, payload: UpdatePatientPayload) {
  return api.put<Patient>(`/patients/${id}`, payload)
}

/* diagnose-only update — server-side complete but UI lands in a later phase.
   Kept here so the constants.ts surface aligns with the docs.         */
export function updateDiagnosis(id: number, diagnosis: string) {
  return api.put<Patient>(`/patients/${id}/diagnosis`, { diagnosis })
}

/* ----------------------------------------------------------------
   Admission lifecycle
   ---------------------------------------------------------------- */

export function admitPatient(id: number, payload: AdmitPatientPayload) {
  return api.post<{ admission: PatientHistory; bill: Bill }>(
    `/patients/${id}/admit`,
    payload
  )
}

export function dischargePatient(id: number, payload: DischargePatientPayload) {
  return api.post<{ patient: Patient; finalBill: Bill }>(
    `/patients/${id}/discharge`,
    payload
  )
}

export function getCurrentAdmission(id: number) {
  return api.get<PatientHistory | null>(`/patients/${id}/admissions/current`)
}

export function listPastAdmissions(id: number) {
  return api.get<
    import("@/pages/Patients/hooks/admissions/usePastAdmissions").PastAdmissionSummary[]
  >(`/patients/${id}/admissions/past`)
}

export function getAdmissionDetails(id: number, historyId: number) {
  return api.get<
    import("@/pages/Patients/types/patient").AdmissionDetails
  >(`/patients/${id}/admissions/${historyId}/details`)
}

export function listCurrentAdmissionsWithStaff() {
  return api.get<
    import("@/pages/Patients/types/patient").CurrentAdmissionWithStaffRow[]
  >("/patients/admissions/current")
}

/* ----------------------------------------------------------------
   Services
   ---------------------------------------------------------------- */

export function listAssignedServices(id: number) {
  return api.get<ActivePatientService[]>(`/patients/${id}/admissions/current/services`)
}

export function addService(id: number, payload: { serviceId: number; startDate?: string }) {
  return api.post<{ service: ActivePatientService; billDetail: BillDetail | null }>(
    `/patients/${id}/services`,
    payload
  )
}

export function stopService(id: number, activeServiceId: number) {
  return api.patch<void>(
    `/patients/${id}/services/${activeServiceId}/stop`
  )
}

export function removeService(id: number, activeServiceId: number) {
  return api.delete<ActivePatientService>(`/patients/${id}/services/${activeServiceId}`)
}

/* ----------------------------------------------------------------
   Drugs
   ---------------------------------------------------------------- */

export function listAssignedDrugs(id: number) {
  return api.get<DrugUsage[]>(`/patients/${id}/admissions/current/drugs`)
}

export function addDrug(id: number, payload: AddDrugPayload) {
  return api.post<DrugUsage>(`/patients/${id}/drugs`, payload)
}

export function administerDrug(usageId: number, payload: { remainingQuantity: number }) {
  return api.put<DrugUsage>(`/pharmacy/drugs/usages/${usageId}`, payload)
}

export function removeDrug(id: number, usageId: number) {
  return api.delete<DrugUsage & { shipmentId: number; transactionId: number; transactionQuantity: number }>(
    `/patients/${id}/drugs/${usageId}`
  )
}

/* ----------------------------------------------------------------
   Supplies
   ---------------------------------------------------------------- */

export async function listAssignedSupplies(id: number): Promise<MedicalSupplyUsage[]> {
  const { data } = await api.get<PaginatedResponse<MedicalSupplyUsage>>(
    "/pharmacy/medical-supply-usages/history",
    { patientId: id, pageSize: 100 }
  )
  return data
}

export function addSupply(id: number, payload: AddSupplyPayload) {
  return api.post<{ usageId: number; billDetailId: number; transactionId: number }>(
    `/pharmacy/medical-supply-usages/patient/${id}`,
    payload
  )
}

export function removeSupply(id: number, usageId: number) {
  return api.delete<void>(
    `/pharmacy/medical-supply-usages/patient/${id}/${usageId}`
  )
}

/* ----------------------------------------------------------------
   Bill
   ---------------------------------------------------------------- */

export function getBill(billId: number) {
  return api.get<Bill>(`/bills/${billId}`)
}

export function updateBill(billId: number, payload: UpdateBillPayload) {
  return api.put<Bill>(`/bills/${billId}`, payload)
}

/* ----------------------------------------------------------------
   Lookups
   ---------------------------------------------------------------- */

export function listDoctors() {
  return api.get<Doctor[]>(`/doctors`)
}

export function listAvailableNurses() {
  return api.get<Nurse[]>(`/employees/nurses/available`)
}

export async function listInsuranceCompanies() {
  /**
   * The Patient.controller endpoints + Insurance.controller are
   * different. Insurance page exposes a paginated envelope; the
   * patient page's `loadInsuranceCompanies` reads `result.data`
   * (legacy `result.data || []` pattern). We accept either shape.
   */
  const res = await api
    .get<InsuranceCompany[] | PaginatedResponse<InsuranceCompany>>(`/insurance-companies`)
  return parseLegacyList<InsuranceCompany>(res)
}

export function listPriceLists() {
  return api.get<PriceList[] | PaginatedResponse<PriceList>>(
    "/price-lists"
  ).then((res) => parseLegacyList<PriceList>(res))
}

export function getDefaultPriceList() {
  return api.get<PriceList>("/price-lists/default")
}

export function listPriceListServices(priceListId: number) {
  return api.get<{ pricelistId: number; price: number }[]>(
    `/price-lists/${priceListId}/services`
  )
}

export function listServices() {
  return api.get<Service[]>("/services")
}

export function listDrugCards() {
  return api
    .get<DrugCard[] | PaginatedResponse<DrugCard>>(("/pharmacy/drugs/cards"))
    .then((res) => parseLegacyList<DrugCard>(res))
}

export function listDrugShipments(drugId: number) {
  return api.get<DrugShipment[]>(`/pharmacy/drugs/shipments/drug/${drugId}`)
}

/* ----------------------------------------------------------------
   Medical-supply admin endpoints (pacakged-envelope paginated)
   ---------------------------------------------------------------- */

export function listAvailableSupplies() {
  return api
    .get<
      MedicalSupply[] | PaginatedResponse<MedicalSupply>
    >("/pharmacy/medical-supplies")
    .then((res) => parseLegacyList<MedicalSupply>(res))
}

export function listSupplyShipments(supplyId: number) {
  return api.get<MedicalSupplyShipment[]>(
    `/pharmacy/medical-supply-usages/available-shipments/${supplyId}`
  )
}

/* ----------------------------------------------------------------
   Staff status
   ---------------------------------------------------------------- */

export function listClockedInStaff() {
  return api.get<
    import("@/pages/Patients/types/patient").ClockedInEmployeeRow[]
  >("/clock-ins/clocked-in")
}

/* ----------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------- */

function parseLegacyList<T>(res: T[] | PaginatedResponse<T>): T[] {
  if (Array.isArray(res)) return res
  return res.data
}

/* ----------------------------------------------------------------
   Payload types
   ---------------------------------------------------------------- */

export interface GuardianPayload {
  name?: string | null
  phone?: string | null
  nationalId?: string | null
  address?: string | null
}

export interface CreatePatientPayload {
  name: string
  nationalId?: string | null
  gender: import("@/pages/Patients/types/patient").Gender
  phone?: string | null
  address?: string | null
  paymentType: import("@/pages/Patients/types/patient").PaymentType
  insuranceId?: number | null
  insuranceCardId?: string | null
  insuranceFormId?: string | null
  /**
   * Guardian fields compiled into the JSONB column
   * `Patient.guardian_info`. Server writes via `JSON.stringify(...)`
   * inside `Patient.model.updatePatient`. After `toSnake`, this key
   * becomes `guardian_info` server-side — matching the column name.
   */
  guardianInfo?: GuardianPayload | null
  referringDoctorId?: number | null
  admitPatient: boolean
  attendingDoctorIds: number[]
  attendingNurseIds: number[]
  diagnosis?: string | null
  isActive?: boolean
  pricelistId?: number | null
  quickCheck?: boolean | null
}

export type UpdatePatientPayload = Partial<CreatePatientPayload> & {
  attendingDoctors?: { add: number[]; remove: number[] }
  attendingNurses?: { add: number[]; remove: number[] }
}

export interface AdmitPatientPayload {
  diagnosis: string
  quickCheck?: boolean | null
  attendingDoctors: number[]
  attendingNurses: number[]
  pricelistId?: number | null
}

export interface DischargePatientPayload {
  leaveReason: import("@/pages/Patients/types/patient").LeaveReason
  dischargeTime?: string | null
}

export interface AddDrugPayload {
  drugId: number
  shipmentId: number
  quantity: number
  price: number
  patientHistoryId: number
}

export interface AddSupplyPayload {
  supplyId: number
  shipmentId: number
  quantity: number
  price: number
  patientHistoryId: number
}

export interface UpdateBillPayload {
  discountType?: "percentage" | "fixed"
  discount?: number
  discountScope?: import("@/pages/Patients/types/patient").DiscountScope
  administrativeExpenses?: number
  medicalTestsAmount?: number
  vatPercentage?: number
  vatScope?: import("@/pages/Patients/types/patient").VatScope
  paidAmount?: number
}

/* ----------------------------------------------------------------
   Re-exports for callers that need to drive `useListData` directly
   ---------------------------------------------------------------- */

export type { EmployeeType, ClockedInStaff }
