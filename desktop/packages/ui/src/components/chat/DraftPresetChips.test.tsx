import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const reorder = vi.fn()
const starter = (id: string, label: string) => ({
  id,
  label,
  icon: "search",
  submitText: `/${id}`,
  ref: { type: "builtin", name: id },
})

vi.doMock("./useDraftStarters", () => ({
  useDraftStarters: () => ({
    global: [starter("a", "Alpha"), starter("b", "Beta"), starter("c", "Gamma")],
    project: [],
    pinnable: [],
    ensureLoaded: vi.fn(),
    addStarter: vi.fn(),
    removeStarter: vi.fn(),
    reorder,
  }),
}))
vi.doMock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ currentTheme: undefined }) }))
vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => (params ? `${key}:${Object.values(params).join("|")}` : key),
  }),
}))

const { DraftPresetChips } = await import("./DraftPresetChips")

describe("draft starters keyboard reorder", () => {
  let container: HTMLDivElement
  let root: Root
  const onSubmit = vi.fn()

  beforeEach(() => {
    reorder.mockReset()
    onSubmit.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<DraftPresetChips onSubmit={onSubmit} layout="grid" />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const chip = (label: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("[data-starter-layout]")).find((button) =>
      button.textContent?.includes(label),
    )!

  const press = (target: HTMLElement, init: KeyboardEventInit) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
    })

  test("Alt+Right moves a starter one place later and announces it", () => {
    press(chip("Alpha"), { key: "ArrowRight", altKey: true })
    expect(reorder).toHaveBeenCalledWith("global", "a", "b")
    expect(container.querySelector("[data-starter-announcement]")?.textContent).toBe(
      "chat.draftStarters.moved:Alpha|2|3",
    )
  })

  test("Alt+Left at the first starter does nothing", () => {
    press(chip("Alpha"), { key: "ArrowLeft", altKey: true })
    expect(reorder).not.toHaveBeenCalled()
  })

  test("Enter still submits instead of moving", () => {
    press(chip("Beta"), { key: "Enter" })
    act(() => chip("Beta").click())
    expect(reorder).not.toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledWith("/b")
  })

  test("each starter advertises the shortcut", () => {
    expect(chip("Gamma").getAttribute("aria-keyshortcuts")).toContain("Alt+ArrowLeft")
  })
})
