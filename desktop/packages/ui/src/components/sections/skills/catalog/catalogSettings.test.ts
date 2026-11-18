import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { loadCatalogSettings } from "./catalogSettings"

const runtime = vi.hoisted(() => ({ load: vi.fn(), registered: false }))
vi.mock("@/contexts/runtimeAPIRegistry", () => ({
  getRegisteredRuntimeAPIs: () => (runtime.registered ? { settings: { load: runtime.load } } : null),
}))
const catalog = { id: "custom:one", label: "One", source: "https://example.com/skills.git" }
beforeEach(() => {
  runtime.registered = false
  runtime.load.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("fresh catalogue settings boundary", () => {
  test.each([
    [],
    true,
    "invalid",
    { skillCatalogs: "invalid" },
    { skillCatalogs: [null] },
    { skillCatalogs: [{ id: "one" }] },
    { skillCatalogs: [{ ...catalog, gitIdentityId: 42 }] },
  ])("refuses malformed payload %j before it can authorize an overwrite", async (settings) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(settings)))
    await expect(loadCatalogSettings()).resolves.toBeNull()
  })

  test("keeps read failure distinct from a legitimate empty or absent catalogue", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ skillCatalogs: [] }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(loadCatalogSettings()).resolves.toBeNull()
    await expect(loadCatalogSettings()).resolves.toEqual({})
    await expect(loadCatalogSettings()).resolves.toEqual({ skillCatalogs: [] })
  })

  test("does not fall back after a registered settings read fails", async () => {
    runtime.registered = true
    runtime.load.mockRejectedValue(new Error("Read unavailable"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(loadCatalogSettings()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each(["http", "runtime"])("reads fresh %s catalogues for each request", async (source) => {
    runtime.registered = source === "runtime"
    runtime.load
      .mockResolvedValueOnce({ settings: { skillCatalogs: [catalog] } })
      .mockResolvedValueOnce({ settings: {} })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ skillCatalogs: [catalog] }))
      .mockResolvedValueOnce(Response.json({}))
    vi.stubGlobal("fetch", fetchMock)
    await expect(loadCatalogSettings()).resolves.toEqual({ skillCatalogs: [catalog] })
    await expect(loadCatalogSettings()).resolves.toEqual({})
    expect(source === "runtime" ? runtime.load : fetchMock).toHaveBeenCalledTimes(2)
    if (source === "runtime") expect(fetchMock).not.toHaveBeenCalled()
  })
})
