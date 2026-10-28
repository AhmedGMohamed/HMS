/**
 * Statistics report — Phase 6.11.4.
 *
 * Replaces the legacy `/api/reports/statistics/comprehensive` endpoint and its
 * eleven unused siblings. Everything the tab needs comes back from **one**
 * request built from seven fixed queries:
 *
 *   1. `kpis` — patients/admissions/discharges, average stay, billed and
 *      collected over the range (one statement, scalar subqueries).
 *   2. `series` — census / admissions / discharges / average stay per bucket.
 *   3. `revenue` — billed / collected / bill count per bucket.
 *   4. `distribution` — admissions in range by payment type **and** gender
 *      (`GROUP BY` both dimensions, split in TS), so the toggle is free.
 *   5. `topServices` — top 10 by revenue.
 *   6. `topDrugs` — top 10 by revenue.
 *   7. `staffUtilization` — per employee type.
 *
 * ## Why one series query feeds three charts
 *
 * Census, admissions, discharges and average stay all describe the same
 * `PatientHistory` rows per bucket. The legacy page ran a separate endpoint per
 * chart, which is how "Admission Trends" ended up charting the census. One
 * statement cannot disagree with itself, so `patient_census`,
 * `admission_discharge` and `average_stay` are three projections of the same
 * rows.
 *
 * ## Buckets are generated, not observed
 *
 * `generate_series` produces every bucket in the range, so a month with no
 * activity is a zero row rather than a gap. An empty range therefore still
 * returns a complete (zeroed) series, which is what makes the charts render an
 * axis instead of an empty state after a legitimate but quiet period.
 *
 * ## Date bounds
 *
 * Both bounds are inclusive on the wire and half-open in SQL
 * (`>= start AND < end + 1 day`) — the legacy `BETWEEN` dropped the final day,
 * which is defect 169-173 in the plan's ledger.
 *
 * ## No occupancy
 *
 * The legacy "Occupancy Rate" card was hardcoded to `-%`. There is no beds
 * table to compute it from, so the metric is gone rather than faked; see plan
 * §2.8 and §5.4.
 */

import type {
	AdmissionDischargePoint,
	AverageStayPoint,
	PatientCensusPoint,
	RevenueTrendPoint,
	StaffUtilizationRow,
	StatisticsDistributionEntry,
	StatisticsKpis,
	StatisticsReportDTO,
	TopDrugRow,
	TopServiceRow,
} from "../../utils/types/reportV2.js";
import { roundMoney } from "../../utils/billFinancials.js";
import { query } from "../database/connection.js";
import {
	END_EXCLUSIVE_OFFSET,
	type DateRangeQuery,
	roundTo,
	safeDivide,
	toNumber,
} from "./shared.js";

/** Bucket sizes the tab can ask for (`?grouping=`). */
export const STATISTICS_GROUPINGS = ["day", "month", "year"] as const;

export type StatisticsGrouping = (typeof STATISTICS_GROUPINGS)[number];

/** Rows behind each top-N list (the legacy charts also showed ten). */
export const TOP_N = 10;

export interface StatisticsFilters {
	range: DateRangeQuery;
	grouping: StatisticsGrouping;
}

/* ------------------------------------------------------------------ */
/* Bucket SQL                                                          */
/* ------------------------------------------------------------------ */

interface BucketPlan {
	/** `generate_series` bounds, already truncated to the grouping. */
	from: string;
	to: string;
	step: string;
}

/**
 * The `generate_series` arguments for one grouping.
 *
 * Truncating the bounds is what makes `2026-10-01 … 2026-10-27` at
 * `grouping=month` produce exactly one bucket instead of 27 partial days, and
 * it keeps the first bucket aligned with a calendar month rather than with
 * whatever day the user picked.
 */
function bucketPlan(grouping: StatisticsGrouping): BucketPlan {
	switch (grouping) {
		case "year":
			return {
				from: "date_trunc('year', $1::date)",
				to: "date_trunc('year', $2::date)",
				step: "INTERVAL '1 year'",
			};
		case "month":
			return {
				from: "date_trunc('month', $1::date)",
				to: "date_trunc('month', $2::date)",
				step: "INTERVAL '1 month'",
			};
		default:
			return {
				from: "$1::date",
				to: "$2::date",
				step: "INTERVAL '1 day'",
			};
	}
}

/**
 * `buckets(bucket_start, bucket_end)` for the whole range.
 *
 * `bucket_end` is exclusive: a row belongs to the bucket when its timestamp is
 * `>= bucket_start AND < bucket_end`, which is the same half-open rule the
 * range itself uses.
 */
function bucketsCte(grouping: StatisticsGrouping): string {
	const plan = bucketPlan(grouping);
	return `buckets AS (
		SELECT b AS bucket_start,
		       b + ${plan.step} AS bucket_end
		FROM generate_series(${plan.from}, ${plan.to}, ${plan.step}) AS b
	)`;
}

/** Bucket identity columns shared by every series query. */
const BUCKET_COLUMNS = `b.bucket_start,
	to_char(b.bucket_start, 'YYYY-MM-DD') AS day_label,
	EXTRACT(YEAR FROM b.bucket_start)::int AS year,
	EXTRACT(MONTH FROM b.bucket_start)::int AS month,
	EXTRACT(DAY FROM b.bucket_start)::int AS day`;

/* ------------------------------------------------------------------ */
/* Statements                                                          */
/* ------------------------------------------------------------------ */

const KPIS_SQL = `SELECT
	(SELECT COUNT(DISTINCT ph.patient_id)::int
	   FROM PatientHistory ph
	  WHERE ph.admission_time >= $1::date
	    AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS total_patients,
	(SELECT COUNT(*)::int
	   FROM PatientHistory ph
	  WHERE ph.admission_time >= $1::date
	    AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS total_admissions,
	(SELECT COUNT(*)::int
	   FROM PatientHistory ph
	  WHERE ph.discharge_time >= $1::date
	    AND ph.discharge_time < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS total_discharges,
	(SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ph.discharge_time - ph.admission_time)) / 86400), 0)
	   FROM PatientHistory ph
	  WHERE ph.admission_time IS NOT NULL
	    AND ph.discharge_time >= $1::date
	    AND ph.discharge_time < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS avg_stay_days,
	(SELECT COALESCE(SUM(b.total_amount), 0)
	   FROM Bill b
	  WHERE b.generated_at >= $1::date
	    AND b.generated_at < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS total_billed,
	(SELECT COALESCE(SUM(b.paid_amount), 0)
	   FROM Bill b
	  WHERE b.generated_at >= $1::date
	    AND b.generated_at < ($2::date + ${END_EXCLUSIVE_OFFSET})) AS total_collected`;

/**
 * Census / admissions / discharges / average stay per bucket.
 *
 * `census` counts patients **present** in the bucket: admitted before the
 * bucket ended and not discharged before it started. That is a real number,
 * unlike the legacy card which plotted new admissions and called it a census.
 *
 * `avg_stay_days` averages admissions **discharged** in the bucket. Averaging
 * every stay overlapping the bucket would count long-running admissions many
 * times and drag the figure towards the length of the window rather than the
 * length of a stay.
 */
function seriesSql(grouping: StatisticsGrouping): string {
	return `WITH ${bucketsCte(grouping)}
	SELECT ${BUCKET_COLUMNS},
	       (SELECT COUNT(DISTINCT ph.patient_id)::int
	          FROM PatientHistory ph
	         WHERE ph.admission_time < b.bucket_end
	           AND (ph.discharge_time IS NULL OR ph.discharge_time >= b.bucket_start)) AS census,
	       (SELECT COUNT(*)::int
	          FROM PatientHistory ph
	         WHERE ph.admission_time >= b.bucket_start
	           AND ph.admission_time < b.bucket_end) AS admissions,
	       (SELECT COUNT(*)::int
	          FROM PatientHistory ph
	         WHERE ph.discharge_time >= b.bucket_start
	           AND ph.discharge_time < b.bucket_end) AS discharges,
	       (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ph.discharge_time - ph.admission_time)) / 86400), 0)
	          FROM PatientHistory ph
	         WHERE ph.admission_time IS NOT NULL
	           AND ph.discharge_time >= b.bucket_start
	           AND ph.discharge_time < b.bucket_end) AS avg_stay_days
	FROM buckets b
	ORDER BY b.bucket_start`;
}

/**
 * Billed / collected / bill count per bucket.
 *
 * `LEFT JOIN` from the generated buckets so a month with no bills prints
 * zeros (and a flat line) instead of disappearing — the legacy chart drew a
 * straight line between the two months that did have revenue.
 */
function revenueSql(grouping: StatisticsGrouping): string {
	return `WITH ${bucketsCte(grouping)}
	SELECT ${BUCKET_COLUMNS},
	       COALESCE(SUM(bill.total_amount), 0) AS billed,
	       COALESCE(SUM(bill.paid_amount), 0) AS collected,
	       COUNT(bill.bill_id)::int AS bill_count
	FROM buckets b
	LEFT JOIN Bill bill
	       ON bill.generated_at >= b.bucket_start
	      AND bill.generated_at < b.bucket_end
	GROUP BY b.bucket_start
	ORDER BY b.bucket_start`;
}

const DISTRIBUTION_SQL = `SELECT p.payment_type::text AS payment_type,
	       p.gender::text AS gender,
	       COUNT(*)::int AS count
	FROM PatientHistory ph
	JOIN Patient p ON p.patient_id = ph.patient_id
	WHERE ph.admission_time >= $1::date
	  AND ph.admission_time < ($2::date + ${END_EXCLUSIVE_OFFSET})
	GROUP BY p.payment_type, p.gender`;

const TOP_SERVICES_SQL = `SELECT s.service_id,
	       s.name AS service_name,
	       s.service_type::text AS service_type,
	       COUNT(DISTINCT bd.bill_id)::int AS usage_count,
	       COALESCE(SUM(bd.quantity), 0)::int AS total_quantity,
	       COALESCE(SUM(bd.quantity * bd.unit_price), 0) AS total_revenue
	FROM BillDetail bd
	JOIN Service s ON s.service_id = bd.service_id
	WHERE bd.generated_at >= $1::date
	  AND bd.generated_at < ($2::date + ${END_EXCLUSIVE_OFFSET})
	GROUP BY s.service_id, s.name, s.service_type
	ORDER BY total_revenue DESC, s.name ASC
	LIMIT ${TOP_N}`;

const TOP_DRUGS_SQL = `SELECT dc.drug_id,
	       dc.name AS drug_name,
	       dc.manufacturer,
	       COUNT(DISTINCT bd.bill_id)::int AS usage_count,
	       COALESCE(SUM(bd.quantity), 0)::int AS total_quantity,
	       COALESCE(SUM(bd.quantity * bd.unit_price), 0) AS total_revenue
	FROM BillDetail bd
	JOIN DrugShipment ds ON ds.shipment_id = bd.drug_shipment_id
	JOIN DrugCard dc ON dc.drug_id = ds.drug_id
	WHERE bd.generated_at >= $1::date
	  AND bd.generated_at < ($2::date + ${END_EXCLUSIVE_OFFSET})
	GROUP BY dc.drug_id, dc.name, dc.manufacturer
	ORDER BY total_revenue DESC, dc.name ASC
	LIMIT ${TOP_N}`;

const STAFF_SQL = `SELECT e.employee_type::text AS employee_type,
	       COUNT(DISTINCT dsa.employee_id)::int AS staff_count,
	       COUNT(DISTINCT dsa.patient_id)::int AS patients_served,
	       COALESCE(SUM(COALESCE(dsa.hours_worked, 0)), 0) AS total_hours_worked,
	       COUNT(*)::int AS assignment_count
	FROM DailyStaffAssignment dsa
	JOIN Employee e ON e.employee_id = dsa.employee_id
	WHERE dsa.work_date >= $1::date
	  AND dsa.work_date < ($2::date + ${END_EXCLUSIVE_OFFSET})
	GROUP BY e.employee_type
	ORDER BY e.employee_type`;

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

interface BucketIdentity {
	day_label: string;
	year: number;
	month: number;
	day: number;
}

/**
 * The chart x label for a bucket.
 *
 * `day` returns `YYYY-MM-DD`, `month` `YYYY-MM`, `year` `YYYY`. Built from the
 * components Postgres returned rather than from a JS `Date`, because `pg`
 * deserializes `timestamp` in the server's local zone and a UTC read would
 * shift a bucket across midnight.
 */
function periodOf(row: BucketIdentity, grouping: StatisticsGrouping): string {
	if (grouping === "year") return String(row.year);
	if (grouping === "month") {
		return `${row.year}-${String(row.month).padStart(2, "0")}`;
	}
	return row.day_label;
}

/** The `year`/`month`/`day` triple every series point carries. */
function periodFields(
	row: BucketIdentity,
	grouping: StatisticsGrouping
): { period: string; year: number; month: number; day: number } {
	return {
		period: periodOf(row, grouping),
		year: Number(row.year) || 0,
		month: Number(row.month) || 0,
		day: Number(row.day) || 0,
	};
}

function toKpis(raw: Record<string, unknown>): StatisticsKpis {
	const billed = roundMoney(raw.total_billed);
	const collected = roundMoney(raw.total_collected);

	return {
		total_patients: toNumber(raw.total_patients),
		total_admissions: toNumber(raw.total_admissions),
		total_discharges: toNumber(raw.total_discharges),
		avg_stay_days: roundTo(raw.avg_stay_days, 2),
		total_billed: billed,
		total_collected: collected,
		// Derived, not a third aggregate: two sums of the same rows cannot
		// disagree, and a separate `SUM(total - paid)` would round differently.
		total_outstanding: roundMoney(billed - collected),
	};
}

/** Split the 2-D distribution rows into the two toggle series. */
function toDistribution(
	rows: Array<Record<string, unknown>>
): { payment_type: StatisticsDistributionEntry[]; gender: StatisticsDistributionEntry[] } {
	const payment = new Map<string, number>();
	const gender = new Map<string, number>();

	for (const row of rows) {
		const count = toNumber(row.count);
		const paymentKey = String(row.payment_type ?? "unknown");
		const genderKey = String(row.gender ?? "unknown");
		payment.set(paymentKey, (payment.get(paymentKey) ?? 0) + count);
		gender.set(genderKey, (gender.get(genderKey) ?? 0) + count);
	}

	const toEntries = (map: Map<string, number>): StatisticsDistributionEntry[] =>
		[...map.entries()]
			.map(([key, count]) => ({ key, count }))
			.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

	return { payment_type: toEntries(payment), gender: toEntries(gender) };
}

function toTopService(raw: Record<string, unknown>): TopServiceRow {
	return {
		service_id: toNumber(raw.service_id),
		service_name: String(raw.service_name ?? ""),
		service_type: raw.service_type === null ? null : String(raw.service_type),
		usage_count: toNumber(raw.usage_count),
		total_quantity: toNumber(raw.total_quantity),
		total_revenue: roundMoney(raw.total_revenue),
	};
}

function toTopDrug(raw: Record<string, unknown>): TopDrugRow {
	return {
		drug_id: toNumber(raw.drug_id),
		drug_name: String(raw.drug_name ?? ""),
		manufacturer: raw.manufacturer === null ? null : String(raw.manufacturer),
		usage_count: toNumber(raw.usage_count),
		total_quantity: toNumber(raw.total_quantity),
		total_revenue: roundMoney(raw.total_revenue),
	};
}

function toStaff(raw: Record<string, unknown>): StaffUtilizationRow {
	const staffCount = toNumber(raw.staff_count);
	const patientsServed = toNumber(raw.patients_served);
	const totalHours = roundTo(raw.total_hours_worked, 2);
	const assignments = toNumber(raw.assignment_count);

	return {
		employee_type: String(raw.employee_type ?? "unknown"),
		staff_count: staffCount,
		patients_served: patientsServed,
		avg_hours_per_assignment: roundTo(safeDivide(totalHours, assignments), 2),
		total_hours_worked: totalHours,
		avg_patients_per_staff: roundTo(safeDivide(patientsServed, staffCount), 2),
	};
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export default class StatisticsReportModel {
	/**
	 * The whole statistics document for one range and grouping.
	 *
	 * Seven statements run in parallel; each is independent, so the endpoint's
	 * latency is one round trip rather than the sum of seven.
	 */
	static async getStatistics(
		filters: StatisticsFilters
	): Promise<StatisticsReportDTO> {
		const params = [filters.range.startDate, filters.range.endDate];

		const [kpisResult, seriesResult, revenueResult, distributionResult, servicesResult, drugsResult, staffResult] =
			await Promise.all([
				query(KPIS_SQL, params),
				query(seriesSql(filters.grouping), params),
				query(revenueSql(filters.grouping), params),
				query(DISTRIBUTION_SQL, params),
				query(TOP_SERVICES_SQL, params),
				query(TOP_DRUGS_SQL, params),
				query(STAFF_SQL, params),
			]);

		const patientCensus: PatientCensusPoint[] = [];
		const admissionDischarge: AdmissionDischargePoint[] = [];
		const averageStay: AverageStayPoint[] = [];

		for (const raw of seriesResult.rows as Array<Record<string, unknown>>) {
			const identity = raw as unknown as BucketIdentity;
			const period = periodFields(identity, filters.grouping);
			const admissions = toNumber(raw.admissions);
			const discharges = toNumber(raw.discharges);

			patientCensus.push({
				...period,
				census: toNumber(raw.census),
				admissions,
			});

			admissionDischarge.push({
				...period,
				admissions,
				discharges,
				net_change: admissions - discharges,
			});

			averageStay.push({
				...period,
				discharges,
				avg_stay_days: roundTo(raw.avg_stay_days, 2),
			});
		}

		const revenueTrends: RevenueTrendPoint[] = (
			revenueResult.rows as Array<Record<string, unknown>>
		).map((raw) => {
			const identity = raw as unknown as BucketIdentity;
			const billed = roundMoney(raw.billed);
			const collected = roundMoney(raw.collected);
			const billCount = toNumber(raw.bill_count);

			return {
				...periodFields(identity, filters.grouping),
				billed,
				collected,
				outstanding: roundMoney(billed - collected),
				bill_count: billCount,
				avg_bill_amount: roundMoney(safeDivide(billed, billCount)),
			};
		});

		return {
			range: {
				start_date: filters.range.startDate,
				end_date: filters.range.endDate,
				grouping: filters.grouping,
			},
			kpis: toKpis((kpisResult.rows[0] ?? {}) as Record<string, unknown>),
			patient_census: patientCensus,
			distribution: toDistribution(
				distributionResult.rows as Array<Record<string, unknown>>
			),
			average_stay: averageStay,
			revenue_trends: revenueTrends,
			admission_discharge: admissionDischarge,
			top_services: (servicesResult.rows as Array<Record<string, unknown>>).map(
				toTopService
			),
			top_drugs: (drugsResult.rows as Array<Record<string, unknown>>).map(
				toTopDrug
			),
			staff_utilization: (staffResult.rows as Array<Record<string, unknown>>).map(
				toStaff
			),
		};
	}

	/**
	 * Export document: the same seven queries plus `generated_at`.
	 *
	 * Deliberately not a second implementation — a statistics export that could
	 * disagree with the screen would be worse than a slow one, and there is no
	 * paging to drop (the tab shows the whole range already).
	 */
	static async exportStatistics(
		filters: StatisticsFilters
	): Promise<StatisticsReportDTO & { generated_at: string }> {
		const report = await StatisticsReportModel.getStatistics(filters);
		return { generated_at: new Date().toISOString(), ...report };
	}
}
