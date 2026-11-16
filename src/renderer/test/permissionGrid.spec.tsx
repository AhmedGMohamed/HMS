import { act } from "react"
import { useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import i18n from "@/i18n"
import rolesEn from "@/locales/roles.en.json"
import { PermissionGrid } from "@/pages/Admin/Roles/components/PermissionGrid"
import type { Permission } from "@/pages/Admin/Roles/types/role"

/**
 * Radix renders a hidden "bubble" `<input>` beside every checkbox so the value
 * reaches the enclosing `<form>`. Each time `checked` flips it dispatches a
 * **bubbling** synthetic `click` on that input. Because the input is a sibling
 * of the checkbox button (not a descendant), a tile-level click handler sees
 * `target === input`; toggling from there flips the value straight back and
 * re-arms the dispatch, looping until React throws "Maximum update depth
 * exceeded".
 *
 * These tests therefore keep the `<form>` wrapper on purpose: it is what makes
 * Radix arm the bubble input, and without it the regression cannot reproduce.
 */

// The grid sorts alphabetically by feature name, so these are named to sort in
// `permissionId` order — that keeps `boxes()[i]` and "permission i + 1" the same
// thing, and makes the assertions readable.
const permissions: Permission[] = [
  { permissionId: 1, featureName: "manage_billing", description: null },
  { permissionId: 2, featureName: "manage_patients", description: "Patients" },
  { permissionId: 3, featureName: "view_dashboard", description: "Dashboard" },
]

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let roots: Root[] = []

beforeAll(async () => {
  // The bubble input measures the checkbox with `useSize`.
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
  // `roles` is a lazy page namespace; the page loads it, this spec does not.
  i18n.addResourceBundle("en", "translation", rolesEn, true, true)
  await i18n.changeLanguage("en")
})

afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ""
})

interface Harness {
  container: HTMLElement
  selected: () => number[]
  tiles: () => HTMLElement[]
  boxes: () => HTMLElement[]
  checkedCount: () => number
  clickTile: (index: number) => void
  clickBox: (index: number) => void
  clickText: (button: string) => void
}

function renderGrid(initial: number[] = []): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)

  let current = initial

  function Harness() {
    const [value, setValue] = useState<number[]>(initial)
    current = value
    return (
      <form>
        <PermissionGrid
          permissions={permissions}
          value={value}
          onChange={setValue}
        />
      </form>
    )
  }

  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>
    )
  })

  const boxes = () => [
    ...container.querySelectorAll<HTMLElement>('[data-slot="checkbox"]'),
  ]
  const tiles = () =>
    boxes().map((box) => box.parentElement as HTMLElement)

  return {
    container,
    selected: () => current,
    boxes,
    tiles,
    checkedCount: () =>
      container.querySelectorAll('[data-slot="checkbox"][data-state="checked"]')
        .length,
    clickTile: (index) => act(() => tiles()[index].click()),
    clickBox: (index) => act(() => boxes()[index].click()),
    clickText: (button) => {
      const match = [...container.querySelectorAll<HTMLElement>("button")].find(
        (el) => el.textContent?.trim() === button
      )
      if (!match) throw new Error(`No button labelled "${button}"`)
      act(() => match.click())
    },
  }
}

describe("PermissionGrid", () => {
  it("toggles once per tile click, without re-entering the handler", () => {
    const grid = renderGrid()
    expect(grid.checkedCount()).toBe(0)

    grid.clickTile(1)
    expect(grid.selected()).toEqual([2])
    expect(grid.checkedCount()).toBe(1)

    grid.clickTile(1)
    expect(grid.selected()).toEqual([])
    expect(grid.checkedCount()).toBe(0)
  })

  it("toggles once per checkbox click", () => {
    const grid = renderGrid()
    grid.clickBox(2)
    expect(grid.selected()).toEqual([3])
    expect(grid.checkedCount()).toBe(1)

    grid.clickBox(2)
    expect(grid.selected()).toEqual([])
  })

  it("keeps independent selections", () => {
    const grid = renderGrid()
    grid.clickTile(0)
    grid.clickTile(2)
    expect(grid.selected()).toEqual([1, 3])
    expect(grid.checkedCount()).toBe(2)
  })

  it("selects and clears everything from the header actions", () => {
    const grid = renderGrid()
    grid.clickText("Select All")
    expect(grid.selected().length).toBe(3)
    grid.clickText("Deselect All")
    expect(grid.selected()).toEqual([])
  })

  it("renders an existing selection", () => {
    const grid = renderGrid([1, 3])
    expect(grid.checkedCount()).toBe(2)
    grid.clickTile(0)
    expect(grid.selected()).toEqual([3])
  })
})
