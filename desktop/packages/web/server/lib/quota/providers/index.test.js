import { describe, expect, it } from "vitest"
import { fetchQuotaForProvider } from "./index.js"

describe("fetchQuotaForProvider", () => {
  it("reports Object.prototype member names as unsupported providers", async () => {
    for (const providerId of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const result = await fetchQuotaForProvider(providerId)
      expect(result).toMatchObject({ providerId, ok: false, configured: false, error: "Unsupported provider" })
    }
  })
})
