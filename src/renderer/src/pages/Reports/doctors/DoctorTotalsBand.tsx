"use client"

/**
 * Totals row under a doctor report table — Phase 6.11.2.
 *
 * The values are the whole-set aggregates from the API (`summary`), never a
 * client-side sum of the visible page: paging away must not change the total,
 * and the server's figures are the only ones guaranteed to include rows the
 * user cannot see.
 *
 * Rendered through `DataTable`'s `footer` slot so it sits inside the same card
 * as the rows it summarises.
 */

export interface DoctorTotalsBandLabels {
  patients: string
  admissions: string
  billed: string
  paid: string
}

export interface DoctorTotalsBandProps {
  /** Already-translated "TOTALS" caption. */
  label: string
  patients: number
  admissions: number
  billed: string
  paid: string
  labels: DoctorTotalsBandLabels
  /** Optional clarification (e.g. the unique-vs-assignment note). */
  note?: string
}

export function DoctorTotalsBand({
  label,
  patients,
  admissions,
  billed,
  paid,
  labels,
  note,
}: DoctorTotalsBandProps) {
  const metrics = [
    { key: "patients", label: labels.patients, value: String(patients) },
    { key: "admissions", label: labels.admissions, value: String(admissions) },
    { key: "billed", label: labels.billed, value: billed },
    { key: "paid", label: labels.paid, value: paid },
  ]

  return (
    <div className="bg-surface-muted px-4 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </span>

        <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {note ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  )
}
