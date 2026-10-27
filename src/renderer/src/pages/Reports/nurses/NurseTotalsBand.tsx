"use client"

/**
 * Totals row under a nurse report table — Phase 6.11.3.
 *
 * The values are the whole-set aggregates from the API (`summary`), never a
 * client-side sum of the visible page: paging away must not change the total,
 * and the server's figures are the only ones guaranteed to include rows the
 * user cannot see.
 *
 * The patient figure passed here is the **additive** assignment count, not the
 * deduplicated `totalPatients`, because it sits under a column that already
 * sums per nurse. The KPI card shows the unique count and the optional note
 * explains the difference (6.11.2 contract 18).
 *
 * Rendered through `DataTable`'s `footer` slot so it sits inside the same card
 * as the rows it summarises.
 */

export interface NurseTotalsBandLabels {
  patients: string
  days: string
  hours: string
}

export interface NurseTotalsBandProps {
  /** Already-translated "TOTALS" caption. */
  label: string
  patients: number
  days: number
  /** Pre-formatted; hours are decimals, so the caller owns the locale. */
  hours: string
  labels: NurseTotalsBandLabels
  /** Optional clarification (e.g. the unique-vs-assignment note). */
  note?: string
}

export function NurseTotalsBand({
  label,
  patients,
  days,
  hours,
  labels,
  note,
}: NurseTotalsBandProps) {
  const metrics = [
    { key: "patients", label: labels.patients, value: String(patients) },
    { key: "days", label: labels.days, value: String(days) },
    { key: "hours", label: labels.hours, value: hours },
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
