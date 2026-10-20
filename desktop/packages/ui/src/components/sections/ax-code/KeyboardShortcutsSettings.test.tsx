import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"
import * as persistence from "@/lib/persistence"
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings"

let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(persistence, "updateDesktopSettings").mockResolvedValue(undefined)
  useUIStore.setState({ shortcutOverrides: {} })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <I18nProvider>
        <KeyboardShortcutsSettings />
      </I18nProvider>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})
const type = async (value: string) => {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Search Keyboard Shortcuts"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

test("filters by action and chord, shows an empty result and restores the full list", async () => {
  const count = host.querySelectorAll("input[readonly]").length
  expect(count).toBeGreaterThan(20)
  expect(Array.from(host.querySelectorAll("input[readonly]")).every((e) => Boolean(e.getAttribute("aria-label")))).toBe(
    true,
  )
  await type("terminal")
  expect(host.querySelectorAll("input[readonly]")).toHaveLength(2)
  expect(host.querySelector('[role="status"]')?.textContent).toContain(`2 / ${count}`)
  await type("zzzznomatch")
  expect(host.textContent).toContain("No results found")
  expect(host.querySelectorAll("input[readonly]")).toHaveLength(0)
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!.click())
  expect(host.querySelectorAll("input[readonly]")).toHaveLength(count)
})

test("names row actions and only enables reset after a shortcut is changed", async () => {
  const label = "Open command palette"
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  const save = () => host.querySelector<HTMLButtonElement>(`button[aria-label="Save changes: ${label}"]`)!
  const reset = () => host.querySelector<HTMLButtonElement>(`button[aria-label="Reset: ${label}"]`)!
  expect(save().disabled).toBe(true)
  expect(reset().disabled).toBe(true)
  await act(async () => field.focus())
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, shiftKey: true, bubbles: true }))
  })
  expect(save().disabled).toBe(false)
  expect(reset().disabled).toBe(false)
  await act(async () => save().click())
  expect(persistence.updateDesktopSettings).toHaveBeenCalled()
  await act(async () => reset().click())
  expect(reset().disabled).toBe(true)
  expect(useUIStore.getState().shortcutOverrides).toEqual({})
})

const chordField = () => host.querySelector<HTMLInputElement>('input[aria-label="Open command palette"]')!
const key = async (key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })
  await act(async () => chordField().dispatchEvent(event))
  return event
}

test("Escape ends capture so Tab navigates without creating a shortcut draft", async () => {
  await act(async () => chordField().focus())
  await key("Escape")
  const before = chordField().value
  const event = await key("Tab")
  expect(event.defaultPrevented).toBe(false)
  expect(chordField().value).toBe(before)
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Save changes: Open command palette"]')?.disabled).toBe(true)
  expect(persistence.updateDesktopSettings).not.toHaveBeenCalled()
})

test("a captured chord survives Tab and Shift+Tab after recording completes", async () => {
  await act(async () => chordField().focus())
  await key("y", { ctrlKey: true, shiftKey: true })
  const captured = chordField().value
  expect((await key("Tab")).defaultPrevented).toBe(false)
  expect(chordField().value).toBe(captured)
  expect((await key("Tab", { shiftKey: true })).defaultPrevented).toBe(false)
  expect(chordField().value).toBe(captured)
})

test("pointer and Enter rearm the focused recorder while explicit Tab capture remains supported", async () => {
  await act(async () => chordField().focus())
  await key("Escape")
  await act(async () => chordField().click())
  expect(chordField().value).toBe("Press keys...")
  expect((await key("Tab")).defaultPrevented).toBe(true)
  expect(chordField().value).toBe("Tab")
  await key("Enter")
  expect(chordField().value).toBe("Press keys...")
  await key("y", { ctrlKey: true, shiftKey: true })
  expect(chordField().value).not.toBe("Tab")
  expect(persistence.updateDesktopSettings).not.toHaveBeenCalled()
})

test("composition keys do not become a shortcut or end capture", async () => {
  await act(async () => chordField().focus())
  expect((await key("Process", { isComposing: true, keyCode: 229 })).defaultPrevented).toBe(false)
  expect(chordField().value).toBe("Press keys...")
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Save changes: Open command palette"]')?.disabled).toBe(true)
})

test("released Tab keeps native navigation without reaching a global Tab binding", async () => {
  const globalBinding = vi.fn((event: KeyboardEvent) => {
    if (event.key === "Tab") event.preventDefault()
  })
  document.addEventListener("keydown", globalBinding)
  try {
    await act(async () => chordField().focus())
    await key("Escape")
    expect((await key("Tab")).defaultPrevented).toBe(false)
    expect(globalBinding).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener("keydown", globalBinding)
  }
})
