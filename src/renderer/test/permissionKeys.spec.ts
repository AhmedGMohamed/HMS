import { describe, expect, it, vi } from "vitest"

import {
  permissionLabel,
  sortPermissions,
} from "@/pages/Admin/shared/permissionKeys"
import type { Permission } from "@/pages/Admin/Roles/types/role"

/**
 * The `roles.permissions` map lags the database (the seed has 20 permissions,
 * the map had 19 — `manage_supplies` was missing). The grid must never render a
 * raw `roles.permissions.foo` key, so the fallback is the behaviour under test.
 */
describe("permissionLabel", () => {
  it("uses the translated label when one exists", () => {
    const t = vi.fn().mockReturnValue("Manage Patients")

    expect(permissionLabel("manage_patients", t)).toBe("Manage Patients")
    expect(t).toHaveBeenCalledWith("roles.permissions.manage_patients", {
      defaultValue: "manage_patients",
    })
  })

  it("falls back to the raw feature name for an untranslated permission", () => {
    // Mirrors i18next: with `defaultValue`, a miss returns the default.
    const t = vi
      .fn()
      .mockImplementation((_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? ""
      )

    expect(permissionLabel("some_future_permission", t)).toBe(
      "some_future_permission"
    )
  })

  it("never returns a namespaced key", () => {
    const t = vi
      .fn()
      .mockImplementation((_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? ""
      )

    const label = permissionLabel("brand_new_feature", t)
    expect(label).not.toContain("roles.permissions.")
  })
})

describe("sortPermissions", () => {
  const permissions: Permission[] = [
    { permissionId: 3, featureName: "view_reports", description: null },
    { permissionId: 1, featureName: "manage_billing", description: "Billing" },
    { permissionId: 2, featureName: "manage_patients", description: null },
  ]

  it("sorts by feature name", () => {
    expect(sortPermissions(permissions).map((p) => p.featureName)).toEqual([
      "manage_billing",
      "manage_patients",
      "view_reports",
    ])
  })

  it("does not mutate the input", () => {
    const before = permissions.map((p) => p.featureName)
    sortPermissions(permissions)
    expect(permissions.map((p) => p.featureName)).toEqual(before)
  })

  it("handles an empty list", () => {
    expect(sortPermissions([])).toEqual([])
  })
})
