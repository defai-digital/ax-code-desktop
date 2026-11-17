import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadConfigDefaults } from "./configDefaults"
import { API_ENDPOINTS } from "./http"

const runtime = vi.hoisted(() => ({ load: vi.fn(), registered: false }))
vi.mock("@/contexts/runtimeAPIRegistry", () => ({
  getRegisteredRuntimeAPIs: () => (runtime.registered ? { settings: { load: runtime.load } } : null),
}))

beforeEach(() => {
  runtime.load.mockReset()
  runtime.registered = false
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("config defaults adapters", () => {
  it.each(["runtime", "http"])("normalizes %s settings and preserves false booleans", async (source) => {
    const settings = {
      defaultModel: " provider/model ",
      defaultVariant: " fast ",
      defaultAgent: " build ",
      autoCreateWorktree: false,
      gitmojiEnabled: false,
      defaultFileViewerPreview: true,
      zenModel: " utility ",
    }
    runtime.registered = source === "runtime"
    runtime.load.mockResolvedValue({ settings })
    const fetchMock = vi.fn().mockResolvedValue(Response.json(settings))
    vi.stubGlobal("fetch", fetchMock)

    await expect(loadConfigDefaults()).resolves.toEqual({
      defaultModel: "provider/model",
      defaultVariant: "fast",
      defaultAgent: "build",
      autoCreateWorktree: false,
      gitmojiEnabled: false,
      defaultFileViewerPreview: true,
      zenModel: "utility",
    })
    if (source === "runtime") expect(fetchMock).not.toHaveBeenCalled()
    else
      expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.config.settings, expect.objectContaining({ method: "GET" }))
  })

  it("does not coerce malformed settings into configured defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          defaultModel: 42,
          defaultVariant: "  ",
          defaultAgent: null,
          autoCreateWorktree: "true",
          gitmojiEnabled: 1,
          defaultFileViewerPreview: {},
          zenModel: [],
        }),
      ),
    )
    const defaults = await loadConfigDefaults()
    expect(Object.values(defaults).every((value) => value === undefined)).toBe(true)
  })

  it.each([null, [], "invalid"])("ignores a non-object settings response %j", async (settings) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(settings)))
    await expect(loadConfigDefaults()).resolves.toEqual({})
  })

  it("falls back to HTTP when registered settings fail", async () => {
    runtime.registered = true
    runtime.load.mockRejectedValue(new Error("Native settings unavailable"))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ defaultAgent: "build" })))
    await expect(loadConfigDefaults()).resolves.toMatchObject({ defaultAgent: "build" })
  })

  it("returns no overrides for an unavailable HTTP adapter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    await expect(loadConfigDefaults()).resolves.toEqual({})
  })

  it("reports a failed HTTP read and returns no overrides", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")))
    await expect(loadConfigDefaults()).resolves.toEqual({})
    expect(warn).toHaveBeenCalledOnce()
  })
})
