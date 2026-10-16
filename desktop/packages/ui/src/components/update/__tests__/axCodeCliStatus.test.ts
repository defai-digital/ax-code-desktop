import { afterEach, describe, expect, test, vi } from "vitest"
import {
  fetchAxCodeCliStatus,
  parseAxCodeCliStatus,
  resolveAxCodeCliUpdateVersion,
  waitForAxCodeCliUpgrade,
} from "../axCodeCliStatus"

const payload = {
  installed: true,
  path: "/opt/homebrew/bin/ax-code",
  onPath: true,
  otherPaths: ["/Users/dev/.local/bin/ax-code", 3],
  isRuntimeBinary: false,
  currentVersion: "7.25.0",
  latestVersion: "7.26.0",
  updateAvailable: true,
  method: "brew",
  checkSupported: true,
  canUpgrade: true,
  manualCommand: "brew upgrade ax-code",
  blockedReason: "bogus",
  error: null,
  checkedAt: "2026-10-15T00:00:00.000Z",
  upgrade: { state: "succeeded", version: "7.26.0", shadowedBy: { path: "/usr/local/bin/ax-code", version: "7.1.0" } },
}

describe("parseAxCodeCliStatus", () => {
  test("normalizes the payload", () => {
    const status = parseAxCodeCliStatus(payload)
    expect(status).toMatchObject({
      installed: true,
      otherPaths: ["/Users/dev/.local/bin/ax-code"],
      method: "brew",
      blockedReason: null,
      upgrade: {
        state: "succeeded",
        version: "7.26.0",
        shadowedBy: { path: "/usr/local/bin/ax-code", version: "7.1.0" },
      },
    })
  })

  test("rejects payloads that are not a status", () => {
    expect(parseAxCodeCliStatus(null)).toBeNull()
    expect(parseAxCodeCliStatus({ error: "Failed" })).toBeNull()
  })

  test("drops an unknown upgrade state and method", () => {
    const status = parseAxCodeCliStatus({ ...payload, method: "npm", upgrade: { state: "weird" } })
    expect(status?.method).toBe("unknown")
    expect(status?.upgrade).toBeNull()
  })
})

describe("resolveAxCodeCliUpdateVersion", () => {
  const status = parseAxCodeCliStatus(payload)!

  test("returns the latest version when an update is available", () => {
    expect(resolveAxCodeCliUpdateVersion(status)).toBe("7.26.0")
  })

  test("returns nothing when current, unknown, missing, or upgrading", () => {
    expect(resolveAxCodeCliUpdateVersion({ ...status, updateAvailable: false })).toBe("")
    expect(resolveAxCodeCliUpdateVersion({ ...status, updateAvailable: null })).toBe("")
    expect(resolveAxCodeCliUpdateVersion({ ...status, installed: false })).toBe("")
    expect(resolveAxCodeCliUpdateVersion({ ...status, onPath: false })).toBe("")
    expect(resolveAxCodeCliUpdateVersion({ ...status, upgrade: { state: "running" } })).toBe("")
    expect(resolveAxCodeCliUpdateVersion(null)).toBe("")
  })
})

describe("waitForAxCodeCliUpgrade", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const respond = (body: unknown) => ({ ok: true, status: 200, statusText: "", json: async () => body }) as Response

  test("ends a stalled status request within the reachability budget", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })
          }),
      ),
    )
    let settled = false
    const pending = waitForAxCodeCliUpgrade({ intervalMs: 1, unreachableMs: 10 }).then((result) => {
      settled = true
      return result
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(settled).toBe(true)
    expect(await pending).toBeNull()
  })

  test("keeps polling while the server reports the upgrade running", async () => {
    const states = ["running", "running", "running", "succeeded"]
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond({ ...payload, upgrade: { state: states.shift() ?? "succeeded" } })),
    )
    const status = await waitForAxCodeCliUpgrade({ intervalMs: 1, unreachableMs: 50 })
    expect(status?.upgrade?.state).toBe("succeeded")
  })

  test("waits through a vanished job, then returns the current status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond({ ...payload, upgrade: null, updateAvailable: false })),
    )
    const status = await waitForAxCodeCliUpgrade({ intervalMs: 1, vanishedGraceMs: 10 })
    expect(status?.upgrade).toBeNull()
    expect(status?.updateAvailable).toBe(false)
  })

  test("gives up only after the server stays unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    expect(await waitForAxCodeCliUpgrade({ intervalMs: 1, unreachableMs: 10 })).toBeNull()
  })
})

describe("fetchAxCodeCliStatus", () => {
  afterEach(() => vi.unstubAllGlobals())

  test("asks the server to apply its cache policy for a scheduled check", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => payload }) as Response)
    vi.stubGlobal("fetch", fetch)
    await fetchAxCodeCliStatus({ check: true })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/cli/check"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh: false }),
      }),
    )
  })

  test("polls an existing job without triggering a new check", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => payload }) as Response)
    vi.stubGlobal("fetch", fetch)
    await fetchAxCodeCliStatus()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/cli/status"),
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    )
  })
})
