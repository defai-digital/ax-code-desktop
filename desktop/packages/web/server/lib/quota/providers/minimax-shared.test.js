import { afterEach, describe, expect, it, vi } from "vitest"
import { transformMinimaxWindows } from "./minimax-shared.js"

describe("MiniMax quota transforms", () => {
  it("treats usage counts as consumed quota for both MiniMax regions", () => {
    const windows = transformMinimaxWindows({
      current_interval_total_count: 100,
      current_interval_usage_count: 25,
      start_time: 1_000,
      end_time: 19_000,
      current_weekly_total_count: "200",
      current_weekly_usage_count: "50",
      weekly_start_time: 1_000,
      weekly_end_time: 605_800,
    })

    expect(windows["5h"]).toMatchObject({ usedPercent: 25, remainingPercent: 75, windowSeconds: 18_000 })
    expect(windows.weekly).toMatchObject({ usedPercent: 25, remainingPercent: 75, windowSeconds: 604_800 })
  })

  it("does not turn missing usage counts into 100% usage", () => {
    const windows = transformMinimaxWindows({
      current_interval_total_count: 100,
      current_interval_usage_count: null,
      current_weekly_total_count: 100,
    })

    expect(windows["5h"].usedPercent).toBeNull()
    expect(windows["5h"].remainingPercent).toBeNull()
    expect(windows.weekly.usedPercent).toBeNull()
    expect(windows.weekly.remainingPercent).toBeNull()
  })
})

describe("minimax providers", () => {
  const authFile = vi.hoisted(() => ({ readAuthFile: vi.fn() }))
  vi.mock("../../ax-code/auth.js", () => authFile)

  afterEach(() => {
    vi.unstubAllGlobals()
    authFile.readAuthFile.mockReset()
  })

  it.each([
    ["minimax-coding-plan", "MiniMax Token Plan", "https://api.minimax.io/"],
    ["minimax-cn-coding-plan", "MiniMax Token Plan (China)", "https://www.minimaxi.com/"],
  ])("%s keeps its identity and endpoint", async (providerId, providerName, endpointPrefix) => {
    const provider = await import(`./${providerId}.js`)
    expect(provider.providerId).toBe(providerId)
    expect(provider.providerName).toBe(providerName)
    expect(provider.aliases).toEqual([providerId])

    authFile.readAuthFile.mockReturnValue({ [providerId]: { type: "api", key: "secret" } })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ base_resp: { status_code: 0 }, model_remains: [{}] }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    expect(provider.isConfigured()).toBe(true)
    const result = await provider.fetchQuota()
    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0].startsWith(endpointPrefix)).toBe(true)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret")
  })

  it("reports an unconfigured provider without calling the API", async () => {
    const provider = await import("./minimax-coding-plan.js")
    authFile.readAuthFile.mockReturnValue({})
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await provider.fetchQuota()
    expect(result).toMatchObject({ ok: false, configured: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
