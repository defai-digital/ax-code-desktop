import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { updateDesktopSettings } = vi.hoisted(() => ({
  updateDesktopSettings: vi.fn<(changes: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock("@/lib/persistence", () => ({ updateDesktopSettings }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/i18n/store", () => ({ useI18nStore: { getState: () => ({ dictionary: {} }) }, formatMessage: () => "" }))

// Re-imported after every resetModules so the store instance the autosave module
// subscribes to is the one these tests drive.
let useUIStore: typeof import("@/stores/useUIStore").useUIStore

const setVisibility = (value: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value })
}

describe("appearance autosave", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    updateDesktopSettings.mockClear()
    setVisibility("visible")
    ;({ useUIStore } = await import("@/stores/useUIStore"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("writes a debounced change after the debounce window", async () => {
    const { startAppearanceAutoSave } = await import("./appearanceAutoSave")
    startAppearanceAutoSave()

    useUIStore.getState().setFontSize(150)
    expect(updateDesktopSettings).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(updateDesktopSettings).toHaveBeenCalledWith({ fontSize: 150 })
  })

  test("flushes a pending change when the document is hidden", async () => {
    // Closing the window inside the 150ms debounce used to drop the change: only the
    // timer flushed, and persistence.ts can only flush what it already holds.
    const { startAppearanceAutoSave } = await import("./appearanceAutoSave")
    startAppearanceAutoSave()

    useUIStore.getState().setPadding(120)
    expect(updateDesktopSettings).not.toHaveBeenCalled()

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))

    expect(updateDesktopSettings).toHaveBeenCalledWith({ padding: 120 })
  })

  test("flushes a pending change on pagehide", async () => {
    const { startAppearanceAutoSave } = await import("./appearanceAutoSave")
    startAppearanceAutoSave()

    useUIStore.getState().setCornerRadius(7)
    window.dispatchEvent(new Event("pagehide"))

    expect(updateDesktopSettings).toHaveBeenCalledWith({ cornerRadius: 7 })
  })
})
