import { describe, expect, it } from "vitest"

import { formatDate, formatDateSafe } from "@/lib/utils"

describe("formatDateSafe", () => {
  it("delegates valid Date input to formatDate", () => {
    const date = new Date("2026-11-17T12:00:00")
    expect(formatDateSafe(date, "en")).toBe(formatDate(date, "en"))
  })

  it("parses an ISO string to the same output as the equivalent Date", () => {
    const iso = "2026-11-17"
    expect(formatDateSafe(iso, "en")).toBe(
      formatDateSafe(new Date(iso), "en")
    )
  })

  it("returns the em-dash fallback for an unparsable string without throwing", () => {
    expect(() => formatDateSafe("not-a-date", "en")).not.toThrow()
    expect(formatDateSafe("not-a-date", "en")).toBe("—")
  })

  it("returns the fallback for null, undefined and the empty string", () => {
    expect(formatDateSafe(null)).toBe("—")
    expect(formatDateSafe(undefined)).toBe("—")
    expect(formatDateSafe("")).toBe("—")
  })

  it("localises the output for the Arabic language key", () => {
    /* Do not assert exact ar-EG glyphs — ICU data varies by runtime. */
    expect(formatDateSafe("2026-11-17", "ar")).not.toBe(
      formatDateSafe("2026-11-17", "en")
    )
  })

  it("honours an empty-string fallback", () => {
    expect(formatDateSafe("bad", "en", "")).toBe("")
    expect(formatDateSafe(null, "en", "")).toBe("")
  })
})
