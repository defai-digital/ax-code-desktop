import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { startConfigUpdate, finishConfigUpdate, getConfigUpdateSnapshot } from "@/lib/configUpdate"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { ConfigUpdateOverlay } from "./ConfigUpdateOverlay"

let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ConfigUpdateOverlay />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  // Each test owns all operations it starts; release any still pending after an assertion failure.
  while (getConfigUpdateSnapshot().isUpdating) finishConfigUpdate()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const button = (key: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === key)!

test("pending configuration uses neutral feedback instead of asserting a runtime restart", () => {
  act(() => startConfigUpdate("Saving fixture configuration"))
  expect(container.textContent).toContain("configUpdate.updating")
  expect(container.textContent).toContain("configUpdate.pendingHint")
  expect(container.textContent).toContain("Saving fixture configuration")
  expect(container.textContent).not.toContain("configUpdate.restarting")
  expect(container.querySelector('[data-config-update-overlay][aria-busy="true"]')).not.toBeNull()
  act(() => finishConfigUpdate())
  expect(container.textContent).toBe("")
})

test("timeout dismissal cannot finish either overlapping operation", () => {
  act(() => { startConfigUpdate("First fixture"); startConfigUpdate("Second fixture") })
  act(() => vi.advanceTimersByTime(120_000))
  act(() => button("configUpdate.dismiss").click())
  expect(getConfigUpdateSnapshot().isUpdating).toBe(true)
  act(() => finishConfigUpdate())
  expect(getConfigUpdateSnapshot().isUpdating).toBe(true)
  expect(container.textContent).toBe("")
  act(() => finishConfigUpdate())
  expect(getConfigUpdateSnapshot().isUpdating).toBe(false)
})

test("a fresh operation cohort is visible after dismissed work completes in the same React batch", () => {
  act(() => startConfigUpdate("Old fixture"))
  act(() => vi.advanceTimersByTime(120_000))
  act(() => button("configUpdate.dismiss").click())
  act(() => { finishConfigUpdate(); startConfigUpdate("New fixture") })
  expect(container.textContent).toContain("New fixture")
  expect(button("configUpdate.dismiss")).toBeUndefined()
  act(() => vi.advanceTimersByTime(119_999))
  expect(button("configUpdate.dismiss")).toBeUndefined()
  act(() => vi.advanceTimersByTime(1))
  expect(button("configUpdate.dismiss")).toBeDefined()
})

test("unmount releases the presentation timer", () => {
  act(() => startConfigUpdate("Fixture"))
  expect(vi.getTimerCount()).toBe(1)
  act(() => root.render(null))
  expect(vi.getTimerCount()).toBe(0)
  expect(getConfigUpdateSnapshot().isUpdating).toBe(true)
})
