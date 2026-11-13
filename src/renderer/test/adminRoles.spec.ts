import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import {
  PRIVILEGED_ROLE_NAMES,
  isPrivilegedRole,
} from "@/lib/roles"

/**
 * The renderer must agree with the server on which roles bypass permission
 * checks. The server list lives in `src/app/utils/roles.ts`; it is read here as
 * text (not imported) because the two trees use different module conventions.
 *
 * If someone adds a third privileged role on one side only, this fails.
 */
describe("isPrivilegedRole", () => {
  it("treats Admin as privileged", () => {
    expect(isPrivilegedRole("Admin")).toBe(true)
  })

  it("treats System as privileged", () => {
    // The automation role. It must pass every gate the Admin role passes,
    // otherwise cron jobs lose access to admin-only endpoints.
    expect(isPrivilegedRole("System")).toBe(true)
  })

  it("rejects ordinary roles", () => {
    expect(isPrivilegedRole("User")).toBe(false)
    expect(isPrivilegedRole("Limited User")).toBe(false)
    expect(isPrivilegedRole("Nurse")).toBe(false)
  })

  it("rejects empty and missing roles", () => {
    expect(isPrivilegedRole("")).toBe(false)
    expect(isPrivilegedRole(null)).toBe(false)
    expect(isPrivilegedRole(undefined)).toBe(false)
  })

  it("is case-sensitive — role names are exact strings from the database", () => {
    expect(isPrivilegedRole("admin")).toBe(false)
    expect(isPrivilegedRole("ADMIN")).toBe(false)
  })

  it("declares exactly the two privileged roles", () => {
    expect([...PRIVILEGED_ROLE_NAMES]).toEqual(["Admin", "System"])
  })
})

describe("parity with the server helper", () => {
  it("declares the same privileged role list as the backend", () => {
    const serverPath = path.resolve(
      __dirname,
      "../../app/utils/roles.ts"
    )
    const source = readFileSync(serverPath, "utf8")

    for (const name of PRIVILEGED_ROLE_NAMES) {
      expect(source).toContain(`"${name}"`)
    }

    // No extra names hiding in the server array.
    const match = source.match(/PRIVILEGED_ROLE_NAMES\s*=\s*\[([^\]]*)\]/)
    expect(match).not.toBeNull()
    const serverNames = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    expect(serverNames).toEqual([...PRIVILEGED_ROLE_NAMES])
  })
})
