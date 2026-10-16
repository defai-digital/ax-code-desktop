import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

describe("updateDesktopSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock("@/contexts/runtimeAPIRegistry")
  })

  test("resolves returned promises after the debounced settings save finishes", async () => {
    const saveControl: { resolve?: (value: null) => void } = {}
    const save = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          saveControl.resolve = resolve
        }),
    )

    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: {
          load: vi.fn(),
          save,
        },
      }),
    }))

    const { updateDesktopSettings } = await import("./persistence")

    let firstResolved = false
    let secondResolved = false
    const first = updateDesktopSettings({ themeId: "dark" }).then(() => {
      firstResolved = true
    })

    await vi.advanceTimersByTimeAsync(199)
    expect(save).not.toHaveBeenCalled()
    expect(firstResolved).toBe(false)

    const second = updateDesktopSettings({ fontSize: 115 }).then(() => {
      secondResolved = true
    })

    await vi.advanceTimersByTimeAsync(199)
    expect(save).not.toHaveBeenCalled()
    expect(firstResolved).toBe(false)
    expect(secondResolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ themeId: "dark", fontSize: 115 })
    expect(firstResolved).toBe(false)
    expect(secondResolved).toBe(false)

    const completeSave = saveControl.resolve
    if (!completeSave) {
      throw new Error("settings save was not started")
    }
    completeSave(null)
    await Promise.all([first, second])

    expect(firstResolved).toBe(true)
    expect(secondResolved).toBe(true)
  })

  test("rejects when the server settings fallback is unavailable", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))

    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to parse URL from /api/config/settings"))
    vi.stubGlobal("fetch", fetch)

    const { updateDesktopSettings } = await import("./persistence")
    const update = updateDesktopSettings({ themeId: "dark" })
    const rejection = expect(update).rejects.toThrow("Failed to parse URL from /api/config/settings")

    await vi.advanceTimersByTimeAsync(200)
    await rejection
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test("flushes a pending save when the page is closing", async () => {
    const save = vi.fn().mockResolvedValue(null)
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: {
          load: vi.fn(),
          save,
        },
      }),
    }))

    const { updateDesktopSettings } = await import("./persistence")
    const update = updateDesktopSettings({ themeId: "dark" })

    window.dispatchEvent(new Event("pagehide"))

    expect(save).toHaveBeenCalledWith({ themeId: "dark" })
    await expect(update).resolves.toBeUndefined()
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(1)
  })

  test("does not report a save that failed while the window was hidden", async () => {
    // `visibilitychange → hidden` also fires when the window is merely backgrounded, and the
    // unload flush answered every waiting caller with success without looking at the write: the
    // settings UI reported a save that never happened, and the change was gone.
    const save = vi.fn<() => Promise<null>>(() => Promise.reject(new Error("offline")))
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: {
          load: vi.fn(),
          save,
        },
      }),
    }))
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })

    try {
      const { updateDesktopSettings } = await import("./persistence")
      const update = updateDesktopSettings({ fontSize: 16 })
      const rejection = expect(update).rejects.toThrow("offline")

      document.dispatchEvent(new Event("visibilitychange"))
      await rejection
      expect(save).toHaveBeenCalledWith({ fontSize: 16 })

      // Still pending, so the next flush carries it again instead of dropping it.
      save.mockImplementation(() => Promise.resolve(null))
      document.dispatchEvent(new Event("visibilitychange"))
      expect(save).toHaveBeenCalledTimes(2)
      expect(save).toHaveBeenLastCalledWith({ fontSize: 16 })
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    }
  })
})

describe("settings save response application", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock("@/contexts/runtimeAPIRegistry")
  })

  test("does not roll back a change queued while the save was in flight", async () => {
    const saveControl: { resolve?: (value: unknown) => void } = {}
    const save = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          saveControl.resolve = resolve
        }),
    )

    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: {
          load: vi.fn(),
          save,
        },
      }),
    }))

    const { updateDesktopSettings } = await import("./persistence")

    const synced: unknown[] = []
    window.addEventListener("openchamber:settings-synced", (event) => {
      synced.push((event as CustomEvent).detail)
    })

    const first = updateDesktopSettings({ fontSize: 110 })
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledWith({ fontSize: 110 })

    // The user flips another setting while the first save is out; the response
    // still carries the pre-change value and must not roll it back.
    void updateDesktopSettings({ showReasoningTraces: false })
    saveControl.resolve?.({ fontSize: 110, showReasoningTraces: true })
    await first

    const applied = synced.at(-1) as Record<string, unknown>
    expect(applied.fontSize).toBe(110)
    expect(applied.showReasoningTraces).toBe(false)
  })
})

describe("overlapping settings flushes", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock("@/contexts/runtimeAPIRegistry")
  })

  test("does not let an earlier save's answer revert a later one", async () => {
    // Two saves overlap — the debounce starts a second flush while the first is still out — and the
    // older answer landing last put the value it carried back into the store, the cache and the
    // interface while the server held the newer one.
    const saves: Array<{ resolve: (value: unknown) => void }> = []
    const save = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          saves.push({ resolve })
        }),
    )

    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: {
          load: vi.fn(),
          save,
        },
      }),
    }))

    const { updateDesktopSettings } = await import("./persistence")

    const synced: unknown[] = []
    window.addEventListener("openchamber:settings-synced", (event) => {
      synced.push((event as CustomEvent).detail)
    })

    const first = updateDesktopSettings({ fontSize: 110 })
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ fontSize: 120 })
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(2)

    saves[1]?.resolve({ fontSize: 120, showReasoningTraces: true })
    await second
    saves[0]?.resolve({ fontSize: 110, showReasoningTraces: true })
    await first

    const applied = synced.at(-1) as Record<string, unknown>
    expect(applied.fontSize).toBe(120)
  })
})

describe("persistToLocalStorage via save response", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock("@/contexts/runtimeAPIRegistry")
    localStorage.clear()
  })

  const saveAndSettle = async (response: Record<string, unknown>) => {
    const save = vi.fn(async () => response)
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({
        settings: { load: vi.fn(), save },
      }),
    }))
    const { updateDesktopSettings } = await import("./persistence")
    const done = updateDesktopSettings({ fontSize: 110 })
    await vi.advanceTimersByTimeAsync(200)
    await done
  }

  test("keeps the cached project list when the response carries no projects key", async () => {
    localStorage.setItem("projects", JSON.stringify([{ id: "p1", path: "/repo" }]))
    await saveAndSettle({ fontSize: 110 })
    expect(localStorage.getItem("projects")).toBe(JSON.stringify([{ id: "p1", path: "/repo" }]))
  })

  test("clears the cached project list only for an explicit empty list", async () => {
    localStorage.setItem("projects", JSON.stringify([{ id: "p1", path: "/repo" }]))
    await saveAndSettle({ fontSize: 110, projects: [] })
    expect(localStorage.getItem("projects")).toBeNull()
  })
})
