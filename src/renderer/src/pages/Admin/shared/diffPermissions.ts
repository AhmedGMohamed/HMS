/**
 * Pure add/remove diff for role permission edits.
 *
 * `PUT /api/roles/:id` accepts a `{ add: number[], remove: number[] }` delta
 * rather than a full set, so the modal must compute the difference between the
 * loaded role and the checkbox state. Both server operations are idempotent
 * (`ON CONFLICT DO NOTHING` / `DELETE ... ANY`), which makes a double submit
 * harmless.
 */
export interface PermissionDiff {
  add: number[]
  remove: number[]
}

export function diffPermissions(
  before: number[],
  after: number[]
): PermissionDiff {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)

  return {
    add: after.filter((id) => !beforeSet.has(id)),
    remove: before.filter((id) => !afterSet.has(id)),
  }
}

/** True when the diff would change nothing (lets the caller omit the field). */
export function isEmptyDiff(diff: PermissionDiff): boolean {
  return diff.add.length === 0 && diff.remove.length === 0
}
