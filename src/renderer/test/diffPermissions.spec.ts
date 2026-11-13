import { describe, expect, it } from "vitest"

import {
  diffPermissions,
  isEmptyDiff,
} from "@/pages/Admin/shared/diffPermissions"

/**
 * The role edit endpoint takes a delta (`{ add, remove }`), so the modal must
 * compute one correctly for every combination — including the no-op that should
 * skip the request entirely.
 */
describe("diffPermissions", () => {
  it("reports additions only", () => {
    expect(diffPermissions([1, 2], [1, 2, 3, 4])).toEqual({
      add: [3, 4],
      remove: [],
    })
  })

  it("reports removals only", () => {
    expect(diffPermissions([1, 2, 3], [1])).toEqual({ add: [], remove: [2, 3] })
  })

  it("reports both at once", () => {
    expect(diffPermissions([1, 2, 3], [2, 3, 4])).toEqual({
      add: [4],
      remove: [1],
    })
  })

  it("returns an empty diff when nothing changed", () => {
    expect(diffPermissions([1, 2, 3], [1, 2, 3])).toEqual({ add: [], remove: [] })
  })

  it("treats order changes as no change", () => {
    expect(diffPermissions([3, 1, 2], [1, 2, 3])).toEqual({ add: [], remove: [] })
  })

  it("handles an empty role gaining permissions", () => {
    expect(diffPermissions([], [5, 6])).toEqual({ add: [5, 6], remove: [] })
  })

  it("handles a role losing every permission", () => {
    expect(diffPermissions([5, 6], [])).toEqual({ add: [], remove: [5, 6] })
  })

  it("is idempotent for duplicate ids", () => {
    expect(diffPermissions([1, 1], [1])).toEqual({ add: [], remove: [] })
  })
})

describe("isEmptyDiff", () => {
  it("is true for a no-op diff", () => {
    expect(isEmptyDiff({ add: [], remove: [] })).toBe(true)
  })

  it("is false when anything is added", () => {
    expect(isEmptyDiff({ add: [1], remove: [] })).toBe(false)
  })

  it("is false when anything is removed", () => {
    expect(isEmptyDiff({ add: [], remove: [1] })).toBe(false)
  })
})
