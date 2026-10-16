import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { updateDesktopSettings } = vi.hoisted(() => ({
  updateDesktopSettings: vi.fn<(changes: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock("@/lib/persistence", () => ({ updateDesktopSettings }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/i18n/store", () => ({ useI18nStore: { getState: () => ({ dictionary: {} }) }, formatMessage: () => "" }))

import { startModelPrefsAutoSave } from "./modelPrefsAutoSave"
import { useUIStore } from "@/stores/useUIStore"

const flushDelayMs = 1200

describe("model preferences autosave", () => {
  let stop: (() => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    updateDesktopSettings.mockClear()
    useUIStore.setState({ favoriteModels: [], recentModels: [] })
  })

  afterEach(() => {
    stop?.()
    stop = undefined
    vi.useRealTimers()
  })

  test("writes the user's first favourite instead of dropping it", () => {
    // Regression: the watcher skipped the first change it saw, which is the user's
    // only change whenever hydration left the store as it was.
    stop = startModelPrefsAutoSave()

    useUIStore.getState().toggleFavoriteModel("defai", "deepseek-flash")
    vi.advanceTimersByTime(flushDelayMs)

    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toMatchObject({
      favoriteModels: [{ providerID: "defai", modelID: "deepseek-flash" }],
    })
  })

  test("writes nothing while the stored preferences stay as the app had them", () => {
    stop = startModelPrefsAutoSave()

    // Hydration applying the same values produces no store change at all.
    useUIStore.setState({ favoriteModels: [], recentModels: [] })
    vi.advanceTimersByTime(flushDelayMs)

    expect(updateDesktopSettings).not.toHaveBeenCalled()
  })

  test("keeps writing changes that arrive after hydration replaced the values", () => {
    stop = startModelPrefsAutoSave()

    useUIStore.setState({ favoriteModels: [{ providerID: "defai", modelID: "deepseek-flash" }] })
    vi.advanceTimersByTime(flushDelayMs)
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)

    updateDesktopSettings.mockClear()
    useUIStore.getState().toggleFavoriteModel("claude-code", "claude-sonnet")
    vi.advanceTimersByTime(flushDelayMs)

    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toMatchObject({
      favoriteModels: [
        { providerID: "claude-code", modelID: "claude-sonnet" },
        { providerID: "defai", modelID: "deepseek-flash" },
      ],
    })
  })

  test("flushes a pending favourite when the window goes away", () => {
    // The debounce is 1200 ms; closing the window inside it dropped the change, and
    // persistence.ts can only flush what it already holds.
    stop = startModelPrefsAutoSave()

    useUIStore.getState().toggleFavoriteModel("defai", "deepseek-flash")
    expect(updateDesktopSettings).not.toHaveBeenCalled()

    window.dispatchEvent(new Event("pagehide"))

    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toMatchObject({
      favoriteModels: [{ providerID: "defai", modelID: "deepseek-flash" }],
    })
  })

  test("flushes a pending favourite when the document is hidden", () => {
    stop = startModelPrefsAutoSave()

    useUIStore.getState().toggleFavoriteModel("defai", "deepseek-flash")
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    document.dispatchEvent(new Event("visibilitychange"))

    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
  })

  test("a failed write is not remembered as saved", async () => {
    stop = startModelPrefsAutoSave()
    updateDesktopSettings.mockRejectedValueOnce(new Error("offline"))

    useUIStore.getState().toggleFavoriteModel("defai", "deepseek-flash")
    await vi.advanceTimersByTimeAsync(flushDelayMs)
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)

    // The write never reached the server, so the saved baseline is still the list the
    // app started from. Undoing the favourite puts the store back on that baseline and
    // must not be written out again; treating the failed payload as sent both skipped
    // the retry and reported a save that never happened.
    updateDesktopSettings.mockClear()
    useUIStore.setState({ favoriteModels: [], recentModels: [] })
    await vi.advanceTimersByTimeAsync(flushDelayMs)

    expect(updateDesktopSettings).not.toHaveBeenCalled()
  })
})
