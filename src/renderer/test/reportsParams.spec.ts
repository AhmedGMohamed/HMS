/**
 * Reports URL contract — Phase 6.11.
 *
 * These are the rules that make a report deep-linkable and make the
 * "generated vs draft" distinction safe: if serialization and parsing ever
 * disagree, `run=1` links would silently show the wrong data or a permanent
 * stale banner.
 */

import { describe, expect, it } from "vitest"

import {
  defaultDraftForTab,
  defaultReportRange,
  doctorsForRelationship,
  isDraftStale,
  parseDraft,
  parseGeneratedParams,
  parseTab,
  reportParamsKey,
  resetTabSpecificFilters,
  serializeReportParams,
  validateDraft,
} from "@/pages/Reports/state/reportParams"
import type {
  ReportDraft,
  ReportOption,
  ReportRange,
} from "@/pages/Reports/types/reports"

const RANGE: ReportRange = { from: "2026-10-01", to: "2026-10-27" }

function draft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return { ...defaultDraftForTab("patients", RANGE), ...overrides }
}

describe("reports URL params", () => {
  it("defaults to the patients tab", () => {
    expect(parseTab(new URLSearchParams(""))).toBe("patients")
    expect(parseTab(new URLSearchParams("tab=not-a-tab"))).toBe("patients")
    expect(parseTab(new URLSearchParams("tab=payments"))).toBe("payments")
  })

  it("round-trips the generated parameters", () => {
    const source = draft({
      paymentType: "insurance",
      insuranceId: 7,
      search: "  john  ",
    })

    const params = serializeReportParams(source, "patients", { run: true })
    expect(params.get("run")).toBe("1")

    const parsed = parseGeneratedParams(params, "patients")
    expect(parsed).not.toBeNull()
    expect(parsed!.range).toEqual(RANGE)
    expect(parsed!.paymentType).toBe("insurance")
    expect(parsed!.insuranceId).toBe(7)
    expect(parsed!.search).toBe("john")
  })

  it("returns null generated params without run=1", () => {
    const params = serializeReportParams(draft(), "patients")
    expect(parseGeneratedParams(params, "patients")).toBeNull()
  })

  it("drops the insurance id when the payment type is not insurance", () => {
    const params = serializeReportParams(
      draft({ paymentType: "cash", insuranceId: 3 }),
      "patients"
    )
    expect(params.get("insurance_id")).toBeNull()
  })

  it("only serializes the active tab's filters", () => {
    const withDoctor = draft({ scope: "specific", doctorId: 42, employeeId: 9 })
    const params = serializeReportParams(withDoctor, "patients")
    expect(params.get("doctor_id")).toBeNull()
    expect(params.get("employee_id")).toBeNull()

    const doctorParams = serializeReportParams(withDoctor, "doctors")
    expect(doctorParams.get("doctor_id")).toBe("42")
    expect(doctorParams.get("scope")).toBe("specific")
  })

  it("omits the group-by control for tabs that do not use it", () => {
    expect(serializeReportParams(draft({ grouping: "month" }), "patients").get("group")).toBeNull()
    expect(serializeReportParams(draft({ grouping: "month" }), "statistics").get("group")).toBe(
      "month"
    )
    expect(serializeReportParams(draft({ grouping: "year" }), "payments").get("group")).toBe("year")
  })

  it("ignores an invalid date and falls back to the default range", () => {
    const params = new URLSearchParams("tab=patients&from=not-a-date&to=2026-10-27&run=1")
    const parsed = parseGeneratedParams(params, "patients")
    expect(parsed!.range.from).toBe(defaultReportRange().from)
  })

  it("only defaults specific-scope ids when they are present", () => {
    const params = new URLSearchParams("tab=doctors&scope=specific&run=1")
    const parsed = parseGeneratedParams(params, "doctors")
    expect(parsed!.scope).toBe("specific")
    expect(parsed!.doctorId).toBeNull()
  })

  it("marks the draft stale only after a real change", () => {
    const generated = draft({ paymentType: "cash" })
    expect(isDraftStale(generated, generated, "patients")).toBe(false)
    expect(
      isDraftStale({ ...generated, range: { from: "2026-09-01", to: "2026-09-30" } }, generated, "patients")
    ).toBe(true)
    expect(isDraftStale({ ...generated, paymentType: "credit" }, generated, "patients")).toBe(true)
  })

  it("does not report stale when nothing has been generated", () => {
    expect(isDraftStale(draft(), null, "patients")).toBe(false)
  })

  it("produces a stable key for identical parameters", () => {
    expect(reportParamsKey(draft(), "patients")).toBe(reportParamsKey(draft(), "patients"))
  })

  it("keeps the range but clears tab filters when switching tabs", () => {
    const patients = draft({ paymentType: "insurance", insuranceId: 5, search: "x" })
    const doctors = resetTabSpecificFilters(patients, "doctors")
    expect(doctors.range).toEqual(patients.range)
    expect(doctors.paymentType).toBe("all")
    expect(doctors.insuranceId).toBeNull()
    expect(doctors.search).toBe("")
    expect(doctors.scope).toBe("all")
  })

  it("parses a draft without run from the URL range", () => {
    const parsed = parseDraft(
      new URLSearchParams("tab=nurses&from=2026-01-01&to=2026-01-31"),
      "nurses"
    )
    expect(parsed.range).toEqual({ from: "2026-01-01", to: "2026-01-31" })
  })

  describe("validation", () => {
    it("rejects an inverted range", () => {
      expect(
        validateDraft(draft({ range: { from: "2026-10-31", to: "2026-10-01" } }), "patients")
      ).toBe("reports.validation.endBeforeStart")
    })

    it("requires a doctor for a specific-doctor report", () => {
      expect(
        validateDraft(draft({ scope: "specific", doctorId: null }), "doctors")
      ).toBe("reports.validation.selectDoctor")
      expect(
        validateDraft(draft({ scope: "specific", doctorId: 2 }), "doctors")
      ).toBeNull()
    })

    it("requires a nurse for a specific-nurse report", () => {
      expect(
        validateDraft(draft({ scope: "specific", nurseId: null }), "nurses")
      ).toBe("reports.validation.selectNurse")
      expect(validateDraft(draft({ scope: "specific", nurseId: 4 }), "nurses")).toBeNull()
    })
  })

  describe("doctor picker filtering", () => {
    const doctors: ReportOption[] = [
      { id: 1, name: "A", doctorType: "referring" },
      { id: 2, name: "B", doctorType: "attending" },
      { id: 3, name: "C", doctorType: "outside" },
      { id: 4, name: "D", doctorType: "supervising" },
      { id: 5, name: "E", doctorType: null },
    ]

    it("offers only referring (and untyped) doctors for referred reports", () => {
      expect(doctorsForRelationship(doctors, "referred").map((d) => d.id)).toEqual([1, 5])
    })

    it("offers attending, outside and supervising doctors for attended reports", () => {
      expect(doctorsForRelationship(doctors, "attended").map((d) => d.id)).toEqual([
        2, 3, 4, 5,
      ])
    })

    it("offers only supervising doctors for supervised reports", () => {
      expect(doctorsForRelationship(doctors, "supervised").map((d) => d.id)).toEqual([4])
    })
  })
})
