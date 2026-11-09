import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchWithQuotaTimeout = vi.fn()

vi.mock("../fetch.js", () => ({ fetchWithQuotaTimeout, discardResponseBody: () => {} }))
vi.mock("../utils/index.js", async (importOriginal) => ({
  ...(await importOriginal()),
  readProviderAuthEntry: () => ({ key: "test-key" }),
}))

const { fetchQuota } = await import("./zai.js")

const quotaResponse = (payload) => {
  fetchWithQuotaTimeout.mockResolvedValueOnce({ ok: true, json: async () => payload })
}

describe("z.ai coding plan quota", () => {
  beforeEach(() => {
    fetchWithQuotaTimeout.mockReset()
  })

  it("reports a rejected key the API answers inside an HTTP 200 body", async () => {
    // Read as a successful card with no windows and no reason.
    quotaResponse({ code: 401, msg: "invalid api key", success: false })

    const result = await fetchQuota()

    expect(result.ok).toBe(false)
    expect(result.error).toBe("invalid api key")
  })

  it("reads the budget from a CREDIT_LIMIT entry", async () => {
    quotaResponse({
      code: 200,
      success: true,
      data: { limits: [{ type: "CREDIT_LIMIT", percentage: 42, unit: 3, number: 5 }] },
    })

    const result = await fetchQuota()

    expect(result.ok).toBe(true)
    expect(Object.values(result.usage?.windows ?? {})).toEqual([expect.objectContaining({ usedPercent: 42 })])
  })
})
