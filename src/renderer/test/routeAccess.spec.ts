import { describe, expect, it, vi } from "vitest"

import {
  canAccessRoute,
  findRouteRequirement,
  type RouteRequirement,
} from "@/lib/routes"

/**
 * The `admin` case used to be missing from `PermissionRoute`'s inline
 * expression, which made `/admin/users` and `/admin/roles` redirect to
 * `/dashboard` for every role — even Admin. These tests pin the decision table.
 */
function ctx(overrides: {
  permissions?: string[]
  privileged?: boolean
} = {}) {
  const permissions = overrides.permissions ?? []
  return {
    hasPermission: (permission: string) => permissions.includes(permission),
    isPrivileged: () => overrides.privileged ?? false,
  }
}

describe("canAccessRoute", () => {
  it("allows public routes without a session", () => {
    expect(canAccessRoute({ mode: "public" }, ctx())).toBe(true)
  })

  it("allows private routes", () => {
    expect(canAccessRoute({ mode: "private" }, ctx())).toBe(true)
  })

  it("allows a permission route when the permission is held", () => {
    const requirement: RouteRequirement = {
      mode: "permission",
      permission: "view_patients",
    }
    expect(canAccessRoute(requirement, ctx({ permissions: ["view_patients"] }))).toBe(
      true
    )
  })

  it("denies a permission route when the permission is absent", () => {
    const requirement: RouteRequirement = {
      mode: "permission",
      permission: "view_patients",
    }
    expect(canAccessRoute(requirement, ctx())).toBe(false)
  })

  it("allows an admin route for a privileged user", () => {
    expect(canAccessRoute({ mode: "admin" }, ctx({ privileged: true }))).toBe(true)
  })

  it("denies an admin route for a non-privileged user", () => {
    expect(canAccessRoute({ mode: "admin" }, ctx())).toBe(false)
  })

  it("does not treat a permission as satisfying an admin route", () => {
    // Regression: before the fix, `admin` fell through every branch and always
    // denied — but it must also never be satisfied by permissions alone.
    const requirement: RouteRequirement = { mode: "admin" }
    expect(
      canAccessRoute(requirement, ctx({ permissions: ["manage_users"] }))
    ).toBe(false)
  })
})

describe("findRouteRequirement", () => {
  it("resolves the admin paths to the admin mode", () => {
    expect(findRouteRequirement("/admin/users").mode).toBe("admin")
    expect(findRouteRequirement("/admin/roles").mode).toBe("admin")
  })

  it("resolves parametric sub-routes by longest prefix", () => {
    expect(findRouteRequirement("/patients/123").mode).toBe("permission")
  })

  it("defaults unknown paths to private", () => {
    expect(findRouteRequirement("/dev/whatever").mode).toBe("private")
  })
})

describe("PermissionRoute integration contract", () => {
  it("lets a privileged user reach /admin/users", () => {
    const hasPermission = vi.fn().mockReturnValue(false)
    const requirement = findRouteRequirement("/admin/users")

    expect(
      canAccessRoute(requirement, {
        hasPermission,
        isPrivileged: () => true,
      })
    ).toBe(true)
    // Privileged access must not depend on the permission list.
    expect(hasPermission).not.toHaveBeenCalled()
  })
})
