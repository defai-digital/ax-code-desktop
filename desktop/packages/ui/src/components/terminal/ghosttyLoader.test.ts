import { beforeEach, describe, expect, test, vi } from "vitest"

const load = vi.fn()

vi.doMock("@ax-code/ghostty-web", () => ({
  Ghostty: { load },
}))

describe("getGhostty", () => {
  beforeEach(() => {
    vi.resetModules()
    load.mockReset()
  })

  test("retries the load after a rejection instead of caching it", async () => {
    // The runtime asset is fetched once per app run, and caching the rejection made every
    // terminal opened after one transient failure fail with it until the process restarted -
    // Hard Restart only reloads the view, so it could not recover either.
    load.mockRejectedValueOnce(new Error("assets unavailable"))
    const { getGhostty } = await import("./ghosttyLoader")

    await expect(getGhostty()).rejects.toThrow("assets unavailable")

    const loaded = { id: "ghostty" }
    load.mockResolvedValueOnce(loaded)
    await expect(getGhostty()).resolves.toBe(loaded)
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("loads once and reuses the runtime", async () => {
    const loaded = { id: "ghostty" }
    load.mockResolvedValue(loaded)
    const { getGhostty } = await import("./ghosttyLoader")

    await expect(getGhostty()).resolves.toBe(loaded)
    await expect(getGhostty()).resolves.toBe(loaded)
    expect(load).toHaveBeenCalledTimes(1)
  })

  test("loads the bundled wasm from the app origin, not the default inline data URL", async () => {
    load.mockResolvedValueOnce({ id: "ghostty" })
    const { getGhostty } = await import("./ghosttyLoader")
    await getGhostty()
    const [url] = load.mock.calls[0] ?? []
    expect(typeof url).toBe("string")
    expect(String(url).startsWith("data:")).toBe(false)
    expect(String(url)).toContain("ghostty-vt")
  })
})
