import { describe, expect, it } from "vitest"
import { buildCommandPaletteItems } from "@/lib/commandPalette"
import type { User } from "@/types"

function user(overrides: Partial<User> = {}): User {
  return {
    userId: 1,
    username: "tester",
    role: "Receptionist",
    permissions: [],
    ...overrides,
  }
}

describe("buildCommandPaletteItems", () => {
  it("returns no commands when there is no authenticated user", () => {
    expect(buildCommandPaletteItems(null)).toEqual([])
  })

  it("only exposes pages the user can open", () => {
    const items = buildCommandPaletteItems(
      user({ permissions: ["view_patients"] })
    )
    const urls = items.map((item) => item.url)

    expect(urls).toContain("/dashboard")
    expect(urls).toContain("/patients")
    expect(urls).not.toContain("/drugs")
    expect(urls).not.toContain("/admin/users")
  })

  it("flattens grouped navigation to child pages", () => {
    const items = buildCommandPaletteItems(
      user({ role: "Admin", permissions: [] })
    )
    const urls = items.map((item) => item.url)

    expect(urls).toContain("/admin/users")
    expect(urls).toContain("/admin/roles")
    expect(items.some((item) => item.id === "user_management")).toBe(false)
  })

  it("returns each destination once", () => {
    const items = buildCommandPaletteItems(
      user({ role: "Admin", permissions: [] })
    )
    const urls = items.map((item) => item.url)

    expect(new Set(urls).size).toBe(urls.length)
  })
})
