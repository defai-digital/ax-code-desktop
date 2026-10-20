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
  await act(async () => {
    field.focus()
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
