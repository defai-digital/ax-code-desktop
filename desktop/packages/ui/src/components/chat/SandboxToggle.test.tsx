import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const sandbox = vi.hoisted(() => {
  const state = {
    sandboxByDirectory: {} as Record<string, boolean>,
    pendingByDirectory: {} as Record<string, boolean>,
    loadSandbox: vi.fn(async () => {}),
    setSandbox: vi.fn(async () => {}),
  }
  return state
})

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (selector: (state: { currentDirectory: string }) => unknown) =>
    selector({ currentDirectory: "/repo" }),
}))
vi.mock("@/stores/useSandboxStore", () => ({
  useSandboxStore: Object.assign((selector: (state: typeof sandbox) => unknown) => selector(sandbox), {
    getState: () => sandbox,
  }),
}))

import { SandboxToggle } from "./SandboxToggle"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe("SandboxToggle unknown state", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    sandbox.sandboxByDirectory = {}
    sandbox.pendingByDirectory = {}
    sandbox.loadSandbox.mockClear()
    sandbox.setSandbox.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = () =>
    act(() => {
      root.render(<SandboxToggle withTooltip={false} />)
    })

  test("stays interactive after a failed read so the user can write", () => {
    render()
    const button = container.querySelector<HTMLButtonElement>("button")!
    expect(button.disabled).toBe(false)

    act(() => button.click())
    expect(sandbox.setSandbox).toHaveBeenCalledWith("/repo", true)
  })

  test("stays disabled while the read is in flight", () => {
    sandbox.pendingByDirectory["/repo"] = true
    render()
    const button = container.querySelector<HTMLButtonElement>("button")!
    expect(button.disabled).toBe(true)

    act(() => button.click())
    expect(sandbox.setSandbox).not.toHaveBeenCalled()
  })
})
