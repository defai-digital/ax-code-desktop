import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchWithQuotaTimeout = vi.fn()

vi.mock("../fetch.js", () => ({ fetchWithQuotaTimeout }))
vi.mock("../../ax-code/shared.js", () => ({
  readConfigLayers: () => ({
    mergedConfig: { provider: { zhipuai: { options: { apiKey: "test-key" } } } },
  }),
}))

const { fetchQuota } = await import("./zhipuai-coding-plan.js")

const quotaResponse = (payload) => {
  fetchWithQuotaTimeout.mockResolvedValueOnce({ ok: true, json: async () => payload })
}

describe("Zhipu coding plan windows", () => {
  beforeEach(() => {
    fetchWithQuotaTimeout.mockReset()
  })

  it("reads a CREDIT_LIMIT entry, which is how the plan now reports its budget", async () => {
    // The token entry was renamed, and matching only TOKENS_LIMIT left the card with no windows.
    quotaResponse({
      code: 200,
      success: true,
      data: { limits: [{ type: "CREDIT_LIMIT", percentage: 42, unit: 5, number: 1 }] },
    })

    const result = await fetchQuota()

    expect(result.ok).toBe(true)
    expect(result.usage?.windows?.Credits).toMatchObject({ usedPercent: 42 })
  })

  it("reports a body-level failure instead of an empty card", async () => {
    quotaResponse({ code: 401, msg: "invalid api key", success: false })

    const result = await fetchQuota()

    expect(result.ok).toBe(false)
    expect(result.error).toBe("invalid api key")
  })
})
