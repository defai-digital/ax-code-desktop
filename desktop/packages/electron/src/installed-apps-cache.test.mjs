import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const { createInstalledAppsRefresher, normalizeInstalledAppsCache } = require("./installed-apps-cache.js")

describe("installed apps cache", () => {
  test("uses a fresh cache with an apps array", () => {
    expect(
      normalizeInstalledAppsCache(
        {
          updatedAt: 1_000,
          apps: [{ name: "Visual Studio Code", iconDataUrl: null }],
        },
        1_100,
        3_600,
      ),
    ).toEqual({
      apps: [{ name: "Visual Studio Code", iconDataUrl: null }],
      hasCache: true,
      isCacheStale: false,
    })
  })

  test("treats caches without an apps array as missing", () => {
    expect(
      normalizeInstalledAppsCache(
        {
          updatedAt: 1_000,
          apps: "not-an-array",
        },
        1_100,
        3_600,
      ),
    ).toEqual({
      apps: [],
      hasCache: false,
      isCacheStale: true,
    })
  })

  test("marks future-dated caches stale so corrupted timestamps cannot block refresh", () => {
    expect(
      normalizeInstalledAppsCache(
        {
          updatedAt: 9_999,
          apps: [{ name: "Cursor", iconDataUrl: null }],
        },
        1_100,
        3_600,
      ),
    ).toEqual({
      apps: [{ name: "Cursor", iconDataUrl: null }],
      hasCache: true,
      isCacheStale: true,
    })
  })
})

describe("installed apps refresher", () => {
  const deferred = () => {
    let resolve
    const promise = new Promise((promiseResolve) => {
      resolve = promiseResolve
    })
    return { promise, resolve }
  }

  test("joins the run in flight instead of scanning and writing twice", async () => {
    // Two windows (or a `force` request next to a stale read) each scanned and wrote the cache
    // independently: the writes are a plain writeFile on one path, and interleaved writers can
    // leave a partial JSON file that the next read loses to a parse error.
    const scan = deferred()
    const build = vi.fn(() => scan.promise)
    const writeCache = vi.fn(async () => {})
    const refresh = createInstalledAppsRefresher({ build, writeCache })

    const first = refresh()
    const second = refresh()
    scan.resolve([{ name: "Cursor", iconDataUrl: null }])
    await Promise.all([first, second])

    expect(build).toHaveBeenCalledTimes(1)
    expect(writeCache).toHaveBeenCalledTimes(1)
    expect(writeCache).toHaveBeenCalledWith([{ name: "Cursor", iconDataUrl: null }])
  })

  test("starts a new run once the previous one settled", async () => {
    const build = vi.fn(async () => [])
    const writeCache = vi.fn(async () => {})
    const refresh = createInstalledAppsRefresher({ build, writeCache })

    await refresh()
    await refresh()

    expect(build).toHaveBeenCalledTimes(2)
  })

  test("releases the run when it fails, so the next request can retry", async () => {
    const build = vi.fn()
      .mockRejectedValueOnce(new Error("scan failed"))
      .mockResolvedValueOnce([])
    const writeCache = vi.fn(async () => {})
    const refresh = createInstalledAppsRefresher({ build, writeCache })

    await expect(refresh()).rejects.toThrow("scan failed")
    await expect(refresh()).resolves.toBeUndefined()

    expect(build).toHaveBeenCalledTimes(2)
  })
})
