import { afterEach, describe, expect, it, vi } from "vitest"

describe("codex quota provider", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  const importProvider = async (response) => {
    vi.resetModules()
    vi.doMock("../fetch.js", () => ({
      fetchWithQuotaTimeout: vi.fn(async () => response),
    }))
    vi.doMock("../utils/index.js", async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        readProviderAuthEntry: () => ({ access: "token", accountId: "acct" }),
      }
    })
    return import("./codex.js")
  }

  const unauthorizedResponse = (body) => ({
    ok: false,
    status: 401,
    json: async () => body,
    body: { cancel: vi.fn() },
  })

  it("does not call an access-enforcement refusal an expired session", async () => {
    // A still-valid sign-in that the endpoint refuses answers 401 with `rejected_by_access_enforcement`;
    // reporting that as an expired session sent the user to re-authenticate a credential that is fine.
    const provider = await importProvider(unauthorizedResponse({ error: { type: "rejected_by_access_enforcement" } }))

    const result = await provider.fetchQuota()

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Usage is not available for this OpenAI sign-in method; chat still works")
  })

  it("still reports a plain 401 as an expired session", async () => {
    const response = unauthorizedResponse({ error: { type: "invalid_api_key" } })
    const provider = await importProvider(response)

    const result = await provider.fetchQuota()

    expect(result.error).toContain("Session expired")
    // The body was read for the check above, so the connection must not be cancelled a second time.
    expect(response.body.cancel).not.toHaveBeenCalled()
  })

  it("releases the connection when the body was not read", async () => {
    const response = {
      ok: false,
      status: 500,
      json: async () => ({}),
      body: { cancel: vi.fn(async () => {}) },
    }
    const provider = await importProvider(response)

    await provider.fetchQuota()

    expect(response.body.cancel).toHaveBeenCalled()
  })
})
