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

    // The first attempt and three backed-off retries.
    await vi.advanceTimersByTimeAsync(200 + 500 + 1500 + 4000)
    await rejection
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  test("retries a save that never reached the settings route instead of reporting it", async () => {
    // The desktop proxy answers 502/503 while the web server is unreachable for a moment. That one
    // dropped request used to discard the change and show "Failed to save settings".
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ fontSize: 16 }), { status: 200 }))
    vi.stubGlobal("fetch", fetch)

    const { updateDesktopSettings } = await import("./persistence")
    let settled: "resolved" | "rejected" | null = null
    const update = updateDesktopSettings({ fontSize: 16 }).then(
      () => (settled = "resolved"),
      () => (settled = "rejected"),
    )

    await vi.advanceTimersByTimeAsync(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(settled).toBeNull()

    await vi.advanceTimersByTimeAsync(500 + 1500)
    await update
    expect(settled).toBe("resolved")
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body as string)).toEqual({ fontSize: 16 })
  })

  test("does not retry over a value a later save already sent", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))
    const gateways: Array<(response: Response) => void> = []
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          gateways.push(resolve)
        }),
    )
    vi.stubGlobal("fetch", fetch)

    const { updateDesktopSettings } = await import("./persistence")
    const first = updateDesktopSettings({ fontSize: 14, showReasoningTraces: true })
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ fontSize: 15 })
    await vi.advanceTimersByTimeAsync(200)
    expect(fetch).toHaveBeenCalledTimes(2)

    gateways[1]?.(new Response(JSON.stringify({ fontSize: 15 }), { status: 200 }))
    await second
    gateways[0]?.(new Response("Service Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).toHaveBeenCalledTimes(3)
    // Only the key no later flush took over goes out again.
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body as string)).toEqual({ showReasoningTraces: true })

    gateways[2]?.(new Response("{}", { status: 200 }))
    await expect(first).resolves.toBeUndefined()
  })

  test("keeps the retry budget when two in-flight saves fail together", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))
    const gateways: Array<(response: Response) => void> = []
    const fetch = vi.fn(() => new Promise<Response>((resolve) => gateways.push(resolve)))
    vi.stubGlobal("fetch", fetch)
    const { updateDesktopSettings } = await import("./persistence")
    const first = updateDesktopSettings({ fontSize: 14 })
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ showReasoningTraces: true })
    await vi.advanceTimersByTimeAsync(200)
    const firstRejected = expect(first).rejects.toThrow("503")
    const secondRejected = expect(second).rejects.toThrow("503")
    gateways[0]?.(new Response("Unavailable", { status: 503 }))
    gateways[1]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).toHaveBeenCalledTimes(3)
    gateways[2]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetch).toHaveBeenCalledTimes(4)
    gateways[3]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetch).toHaveBeenCalledTimes(5)
    gateways[4]?.(new Response("Unavailable", { status: 503 }))
    await Promise.all([firstRejected, secondRejected])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  test("does not let unrelated successful saves replenish a failing batch's retry budget", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))
    const gateways: Array<(response: Response) => void> = []
    const fetch = vi.fn(() => new Promise<Response>((resolve) => gateways.push(resolve)))
    vi.stubGlobal("fetch", fetch)
    const { updateDesktopSettings } = await import("./persistence")
    const failing = updateDesktopSettings({ fontSize: 14 })
    const rejection = expect(failing).rejects.toThrow("503")
    await vi.advanceTimersByTimeAsync(200)
    gateways[0]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(500)
    const successful = updateDesktopSettings({ showReasoningTraces: true })
    await vi.advanceTimersByTimeAsync(200)
    gateways[2]?.(new Response("{}", { status: 200 }))
    await successful
    gateways[1]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(1499)
    expect(fetch).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(4)
    gateways[3]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(4000)
    gateways[4]?.(new Response("Unavailable", { status: 503 }))
    await rejection
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  test("gives a new edit a full budget without shortening the pending backoff", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({ getRegisteredRuntimeAPIs: () => null }))
    const fetch = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 }))
    vi.stubGlobal("fetch", fetch)
    const { updateDesktopSettings } = await import("./persistence")
    const first = updateDesktopSettings({ fontSize: 14 })
    await vi.advanceTimersByTimeAsync(200 + 500 + 1500)
    expect(fetch).toHaveBeenCalledTimes(3)
    const second = updateDesktopSettings({ showReasoningTraces: true })
    await vi.advanceTimersByTimeAsync(3999)
    expect(fetch).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(4)
    fetch.mockResolvedValue(new Response("{}", { status: 200 }))
    await vi.advanceTimersByTimeAsync(500)
    await Promise.all([first, second])
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  test("does not restore a stale hidden-window write after a newer save succeeds", async () => {
    let rejectHidden: ((error: Error) => void) | undefined
    const save = vi.fn().mockImplementationOnce(() => new Promise<null>((_resolve, reject) => {
      rejectHidden = reject
    })).mockResolvedValue(null)
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({ settings: { load: vi.fn(), save } }),
    }))
    const { updateDesktopSettings } = await import("./persistence")
    const hidden = updateDesktopSettings({ fontSize: 14 })
    const rejected = expect(hidden).rejects.toThrow("offline")
    window.dispatchEvent(new Event("pagehide"))
    const newer = updateDesktopSettings({ fontSize: 15 })
    await vi.advanceTimersByTimeAsync(200)
    await newer
    rejectHidden?.(new Error("offline"))
    await rejected
    const last = updateDesktopSettings({ showReasoningTraces: true })
    await vi.advanceTimersByTimeAsync(500)
    await last
    expect(save).toHaveBeenLastCalledWith({ showReasoningTraces: true })
  })

  test("rejects a superseded failed save instead of resolving an empty retry batch", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({ getRegisteredRuntimeAPIs: () => null }))
    const gateways: Array<(response: Response) => void> = []
    const fetch = vi.fn(() => new Promise<Response>((resolve) => gateways.push(resolve)))
    vi.stubGlobal("fetch", fetch)
    const { updateDesktopSettings } = await import("./persistence")
    const first = updateDesktopSettings({ fontSize: 14 })
    const firstOutcome = first.then(() => "saved", () => "failed")
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ fontSize: 15 })
    const secondRejected = expect(second).rejects.toThrow("500")
    await vi.advanceTimersByTimeAsync(200)
    gateways[1]?.(new Response("Rejected", { status: 500 }))
    await secondRejected
    gateways[0]?.(new Response("Unavailable", { status: 503 }))
    await vi.advanceTimersByTimeAsync(500)
    expect(await firstOutcome).toBe("failed")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test("does not shorten a failed hidden write's backoff to a newer edit's debounce", async () => {
    let rejectHidden: ((error: Error) => void) | undefined
    const save = vi.fn().mockImplementationOnce(() => new Promise<null>((_resolve, reject) => {
      rejectHidden = reject
    })).mockResolvedValue(null)
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({ settings: { load: vi.fn(), save } }),
    }))
    const { updateDesktopSettings } = await import("./persistence")
    const hidden = updateDesktopSettings({ fontSize: 14 })
    const rejected = expect(hidden).rejects.toThrow("offline")
    window.dispatchEvent(new Event("pagehide"))
    const newer = updateDesktopSettings({ showReasoningTraces: true })
    rejectHidden?.(new Error("offline"))
    await rejected
    await vi.advanceTimersByTimeAsync(499)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await newer
    expect(save).toHaveBeenLastCalledWith({ fontSize: 14, showReasoningTraces: true })
  })

  test("reports a save the server rejected without retrying it", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => null,
    }))
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 500, statusText: "Internal Server Error" }))
    vi.stubGlobal("fetch", fetch)

    const { updateDesktopSettings } = await import("./persistence")
    const update = updateDesktopSettings({ fontSize: 16 })
    const rejection = expect(update).rejects.toThrow("500 Internal Server Error")

    await vi.advanceTimersByTimeAsync(200)
    await rejection
    await vi.advanceTimersByTimeAsync(10_000)
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

      // A backgrounded window retries even if the user makes no further edit.
      save.mockImplementation(() => Promise.resolve(null))
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
      await vi.advanceTimersByTimeAsync(500)
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

  test("invalidates a cached snapshot when an older save succeeds after a newer save fails", async () => {
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({ getRegisteredRuntimeAPIs: () => null }))
    const gateways: Array<(response: Response) => void> = []
    let fontSize = 100
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Promise<Response>((resolve) => gateways.push(resolve))
      return Promise.resolve(new Response(JSON.stringify({ fontSize }), { status: 200 }))
    })
    vi.stubGlobal("fetch", fetch)
    const { syncDesktopSettings, updateDesktopSettings } = await import("./persistence")
    await syncDesktopSettings()
    const first = updateDesktopSettings({ fontSize: 110 })
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ showReasoningTraces: true })
    const rejection = expect(second).rejects.toThrow("500")
    await vi.advanceTimersByTimeAsync(200)
    gateways[1]?.(new Response("Rejected", { status: 500 }))
    await rejection
    fontSize = 110
    gateways[0]?.(new Response(JSON.stringify({ fontSize }), { status: 200 }))
    await first
    await syncDesktopSettings()
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "GET")).toHaveLength(2)
  })

  test("invalidates a snapshot read while a hidden-window save was in flight", async () => {
    let complete: (() => void) | undefined
    const load = vi.fn().mockResolvedValue({ settings: { fontSize: 100 }, source: "web" })
    const save = vi.fn(() => new Promise<null>((resolve) => { complete = () => resolve(null) }))
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({ settings: { load, save } }),
    }))
    const { syncDesktopSettings, updateDesktopSettings } = await import("./persistence")
    await syncDesktopSettings()
    const update = updateDesktopSettings({ fontSize: 110 })
    window.dispatchEvent(new Event("pagehide"))
    await syncDesktopSettings()
    expect(load).toHaveBeenCalledTimes(2)
    load.mockResolvedValue({ settings: { fontSize: 110 }, source: "web" })
    complete?.()
    await update
    await syncDesktopSettings()
    expect(load).toHaveBeenCalledTimes(3)
  })

  test("invalidates a pending-edit overlay after the edit is rejected", async () => {
    let complete: ((value: unknown) => void) | undefined
    const load = vi.fn().mockResolvedValue({ settings: { fontSize: 110, showReasoningTraces: true }, source: "web" })
    const save = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
      .mockRejectedValue(new Error("rejected"))
    vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
      getRegisteredRuntimeAPIs: () => ({ settings: { load, save } }),
    }))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Rejected", { status: 500 })))
    const { syncDesktopSettings, updateDesktopSettings } = await import("./persistence")
    const first = updateDesktopSettings({ fontSize: 110 })
    await vi.advanceTimersByTimeAsync(200)
    const second = updateDesktopSettings({ showReasoningTraces: false })
    const rejection = expect(second).rejects.toThrow("500")
    complete?.({ fontSize: 110, showReasoningTraces: true })
    await first
    await vi.advanceTimersByTimeAsync(200)
    await rejection
    await syncDesktopSettings()
    expect(load).toHaveBeenCalledTimes(1)
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
