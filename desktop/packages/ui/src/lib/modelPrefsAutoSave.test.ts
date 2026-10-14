import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { updateDesktopSettings } = vi.hoisted(() => ({
  updateDesktopSettings: vi.fn<(changes: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock("@/lib/persistence", () => ({ updateDesktopSettings }))

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
})
