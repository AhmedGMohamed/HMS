/**
 * Vault page domain types — Phase 6.9 plan §3.1.
 *
 * Wire shapes mirror the backend `/api/vault/*` report endpoints (snake_case
 * columns are camelCased automatically by the `@/lib/api` client). DECIMAL
 * columns may arrive as strings from PostgreSQL (`pg` serializes NUMERIC as
 * string when raw pass-through) — money fields are therefore declared
 * `number | string` at the wire level and normalized to `number` in
 * `../api.ts` (`normalizeMoney`) before reaching the UI (plan A6).
 */

/** Inclusive date range (both boundaries inclusive — backend semantics). */
export interface DateRange {
	from: Date
	to: Date
}

/** The 17 report types exposed by the Vault page (plan §3.1/§3.3). */
export type ReportType =
	| "patient-services"
	| "patient-drugs"
	| "patient-supplies"
	| "patient-payments"
	| "patient-outstanding"
	| "patient-discounts"
	| "patient-medical-tests"
	| "patient-vat-admin"
	| "manual-payments"
	| "insurance-payments"
	| "drug-shipments"
	| "drug-sales"
	| "drug-profits"
	| "supply-shipments"
	| "supply-sales"
	| "supply-profits"
	| "wages-owed"
	| "wages-paid"

/**
 * Response of `GET /api/vault/summary?start_date&end_date`.
 * All totals are server-computed numbers (parseFloat'd in the model).
 * Field names post-`toCamel`.
 */
export interface VaultSummary {
	patientServicesTotal: number
	patientDrugsTotal: number
	patientSuppliesTotal: number
	patientMedicalTestsTotal: number
	patientPaymentsTotal: number
	patientOutstandingTotal: number
	patientDiscountsTotal: number
	patientVatTotal: number
	patientAdminTotal: number
	manualAdditionsTotal: number
	manualDeductionsTotal: number
	manualNetTotal: number
	drugShipmentCostsTotal: number
	drugSalesRevenueTotal: number
	drugSalesProfitTotal: number
	supplyShipmentCostsTotal: number
	supplySalesRevenueTotal: number
	supplySalesProfitTotal: number
	wagesOwedTotal: number
	wagesPaidTotal: number
	wagesOutstandingTotal: number
	insurancePaymentsTotal: number
	insurancePaymentCount: number
	insurancePaymentAverage: number
	totalRevenue: number
	totalExpenses: number
	netProfit: number
}

type Money = number | string

/** `GET /api/vault/patient-services` rows. */
export interface PatientServicesRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	servicesTotal: Money
	discountAmount: Money
	paidAmount: Money
}

/** `GET /api/vault/patient-drugs` rows. */
export interface PatientDrugsRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	drugsTotal: Money
	discountAmount: Money
	paidAmount: Money
}

/** `GET /api/vault/patient-supplies` rows. */
export interface PatientSuppliesRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	suppliesTotal: Money
	discountAmount: Money
	paidAmount: Money
}

/** `GET /api/vault/patient-payments` rows. */
export interface PatientPaymentsRow {
	patientId: number
	patientName: string
	paymentType: string
	billId: number
	generatedAt: string
	updatedAt: string
	totalAmount: Money
	paidAmount: Money
}

/** `GET /api/vault/patient-outstanding` rows. */
export interface PatientOutstandingRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	totalAmount: Money
	paidAmount: Money
	outstandingAmount: Money
}

/** `GET /api/vault/patient-discounts` rows. */
export interface PatientDiscountsRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	discountType: string
	discount: Money
	totalAmount: Money
	discountAmount: Money
}

/** `GET /api/vault/patient-medical-tests` rows (Phase 6.9 backend companion). */
export interface PatientMedicalTestsRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	medicalTestsAmount: Money
}

/** `GET /api/vault/patient-vat-admin` rows. */
export interface PatientVatAdminRow {
	patientId: number
	patientName: string
	billId: number
	generatedAt: string
	totalAmount: Money
	vatAmount: Money
	administrativeExpenses: Money
}

/** `GET /api/vault/manual-payments` rows. */
export interface ManualPaymentsRow {
	paymentId: number
	paymentAmount: Money
	paymentType: string
	paymentTime: string
	description: string | null
}

/** `GET /api/vault/insurance-payments` rows. */
export interface InsurancePaymentsRow {
	insuranceId: number
	insuranceName: string
	paymentId: number
	paymentAmount: Money
	paymentFrom: string
	paymentTo: string
	issuedTimestamp: string
	addedBy: string | null
}

/** `GET /api/vault/drug-shipments` rows. */
export interface DrugShipmentsRow {
	shipmentId: number
	drugId: number
	drugName: string
	manufacturer: string | null
	buyQuantity: number
	quantity: number
	buyPrice: Money
	totalCost: Money
	expiryDate: string | null
	receivedDate: string
	warehouseName: string | null
}

/** `GET /api/vault/drug-sales` rows. */
export interface DrugSalesRow {
	transactionId: number
	transactionType: string
	drugId: number
	drugName: string
	quantity: number
	price: Money
	totalRevenue: Money
	timestamp: string
	saleType: string | null
}

/** `GET /api/vault/drug-profits` rows. */
export interface DrugProfitsRow {
	drugId: number
	drugName: string
	manufacturer: string | null
	totalQuantitySold: string | number
	totalRevenue: Money
	totalCost: Money
	totalProfit: Money
	transactionCount: string | number
}

/** `GET /api/vault/supply-shipments` rows (Phase 6.9 backend companion). */
export interface SupplyShipmentsRow {
	shipmentId: number
	supplyId: number
	supplyName: string
	manufacturer: string | null
	buyQuantity: number
	quantity: number
	buyPrice: Money
	totalCost: Money
	expiryDate: string | null
	receivedDate: string
	warehouseName: string | null
}

/** `GET /api/vault/supply-sales` rows (Phase 6.9 backend companion). */
export interface SupplySalesRow {
	transactionId: number
	transactionType: string
	supplyId: number
	supplyName: string
	quantity: number
	price: Money
	totalRevenue: Money
	timestamp: string
	saleType: string | null
}

/** `GET /api/vault/supply-profits` rows (Phase 6.9 backend companion). */
export interface SupplyProfitsRow {
	supplyId: number
	supplyName: string
	manufacturer: string | null
	totalQuantitySold: string | number
	totalRevenue: Money
	totalCost: Money
	totalProfit: Money
	transactionCount: string | number
}

/** `GET /api/vault/wages-owed` rows. */
export interface WagesOwedRow {
	employeeId: number
	employeeName: string
	employeeType: string
	paymentId: number
	paymentAmount: Money
	extraPaymentType: string | null
	extraAmount: Money | null
	isPaid: boolean
	issuedTimestamp: string
}

/** `GET /api/vault/wages-paid` rows. */
export interface WagesPaidRow {
	employeeId: number
	employeeName: string
	employeeType: string
	paymentId: number
	paymentAmount: Money
	extraPaymentType: string | null
	extraAmount: Money | null
	paidTimestamp: string
	paidBy: string | null
}

/** Normalized (money-coerced) row union used by the Report dialog. */
export type ReportRow =
	| PatientServicesRow
	| PatientDrugsRow
	| PatientSuppliesRow
	| PatientPaymentsRow
	| PatientOutstandingRow
	| PatientDiscountsRow
	| PatientMedicalTestsRow
	| PatientVatAdminRow
	| ManualPaymentsRow
	| InsurancePaymentsRow
	| DrugShipmentsRow
	| DrugSalesRow
	| DrugProfitsRow
	| SupplyShipmentsRow
	| SupplySalesRow
	| SupplyProfitsRow
	| WagesOwedRow
	| WagesPaidRow

/** Payload for `POST /api/vault/manual-payments` (snake_cased by the api client). */
export interface CreateManualPaymentPayload {
	paymentAmount: number
	paymentType: "addition" | "deduction"
	description: string | null
}
