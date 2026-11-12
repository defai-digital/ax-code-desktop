import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const config = vi.hoisted(() => ({
  providers: [
    { id: "alibaba", models: [{ id: "qwen", name: "Qwen", capabilities: { toolcall: true } }] },
    // Runs its own agent loop, so the runtime never gives it council/arena.
    { id: "claude-code", models: [{ id: "fable", name: "Fable", capabilities: { toolcall: true } }] },
    // Not a CLI provider, but the catalog says it cannot call tools.
    { id: "minimax", models: [{ id: "m3", name: "MiniMax-M3", capabilities: { toolcall: false } }] },
  ],
  currentProviderId: "alibaba",
  currentModelId: "qwen",
}))

const directory = vi.hoisted(() => ({ currentDirectory: "/repo" }))

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (selector: (state: { currentDirectory: string }) => unknown) => selector(directory),
}))
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: (selector: (state: typeof config) => unknown) => selector(config),
}))

import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { WorkModeSelector } from "./WorkModeSelector"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe("WorkModeSelector", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    directory.currentDirectory = "/repo"
    config.currentProviderId = "alibaba"
    config.currentModelId = "qwen"
    useWorkModeStore.setState({ modeByDirectory: {} })
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
      root.render(<WorkModeSelector />)
    })
  const chip = () => container.querySelector<HTMLElement>("button")!
  const warningIcon = () => container.querySelector<SVGElement>("[data-work-mode-warning]")

  test("Agent mode never warns, whatever the composer model can do", () => {
    config.currentProviderId = "claude-code"
    config.currentModelId = "fable"
    render()

    expect(warningIcon()).toBeNull()
    expect(chip().getAttribute("aria-label")).not.toContain("chat.workMode.blocked")
  })

  test("an armed Council mode on a CLI model warns on the chip", () => {
    config.currentProviderId = "claude-code"
    config.currentModelId = "fable"
    act(() => useWorkModeStore.getState().setMode("/repo", "council"))
    render()

    expect(warningIcon()).not.toBeNull()
    expect(chip().getAttribute("aria-label")).toContain("chat.workMode.blocked.cliLead")
    // The mode name travels as the placeholder the message expects.
    expect(chip().getAttribute("aria-label")).toContain("Council")
  })

  test("an armed Arena mode on a model without tool calling warns with its own reason", () => {
    config.currentProviderId = "minimax"
    config.currentModelId = "m3"
    act(() => useWorkModeStore.getState().setMode("/repo", "arena"))
    render()

    expect(warningIcon()).not.toBeNull()
    expect(chip().getAttribute("aria-label")).toContain("chat.workMode.blocked.noToolCalling")
  })

  test("the chip's accessible name comes from the catalog, with and without a warning", () => {
    render()
    expect(chip().getAttribute("aria-label")).toBe('chat.workMode.tooltip {"mode":"Agent"}')

    config.currentProviderId = "claude-code"
    config.currentModelId = "fable"
    act(() => useWorkModeStore.getState().setMode("/repo", "council"))
    render()
    // One translated sentence: the warning is a placeholder, not text appended to English.
    expect(chip().getAttribute("aria-label")).toMatch(/^chat\.workMode\.tooltipBlocked /)
    expect(chip().getAttribute("aria-label")).not.toContain("Work mode")
  })

  test("a model that can call tools runs both modes without a warning", () => {
    act(() => useWorkModeStore.getState().setMode("/repo", "council"))
    render()

    expect(warningIcon()).toBeNull()
    act(() => useWorkModeStore.getState().setMode("/repo", "arena"))
    expect(warningIcon()).toBeNull()
  })
})
