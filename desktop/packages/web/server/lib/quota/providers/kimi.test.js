import { describe, expect, it, vi } from "vitest"

const fetchWithQuotaTimeout = vi.fn()

vi.mock("../fetch.js", () => ({ fetchWithQuotaTimeout, discardResponseBody: () => {} }))
vi.mock("../utils/index.js", async (importOriginal) => ({
  ...(await importOriginal()),
  readProviderAuthEntry: () => ({ key: "test-key" }),
}))

const { fetchQuota } = await import("./kimi.js")

describe("Kimi quota windows", () => {
  it("keeps every limit when two cover the same span", async () => {
    // Both were stored under the same label, so the card showed only the last one.
    const limit = (remaining) => ({
      window: { duration: 1, timeUnit: "TIME_UNIT_DAY" },
      detail: { limit: 100, remaining },
    })
    fetchWithQuotaTimeout.mockResolvedValueOnce({ ok: true, json: async () => ({ limits: [limit(90), limit(40)] }) })

    const result = await fetchQuota()

    expect(result.ok).toBe(true)
    expect(Object.values(result.usage.windows).map((window) => window.usedPercent)).toEqual([10, 60])
  })
})
