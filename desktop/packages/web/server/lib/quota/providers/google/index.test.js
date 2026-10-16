import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { resolveGoogleAuthSources } = vi.hoisted(() => ({
  resolveGoogleAuthSources: vi.fn(),
}))

vi.mock("./auth.js", () => ({
  resolveGoogleAuthSources,
  resolveGoogleOAuthClient: () => ({ clientId: "client-id", clientSecret: "client-secret" }),
}))

const { fetchGoogleQuota } = await import("./index.js")

const source = (sourceId, sourceLabel) => ({
  sourceId,
  sourceLabel,
  accessToken: "",
  refreshToken: `refresh-${sourceId}`,
  expires: 0,
  projectId: "project-1",
})

describe("fetchGoogleQuota token refresh", () => {
  beforeEach(() => {
    resolveGoogleAuthSources.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("keeps the other sources when one refresh fails at the transport level", async () => {
    // `refreshGoogleAccessToken` returns null on an HTTP failure but *rejects* on a transport error or
    // the request timeout. The rejection used to escape the per-source loop and turn a two-source
    // aggregate into a whole-provider failure, discarding the source that was never attempted.
    resolveGoogleAuthSources.mockReturnValue([source("gemini", "Gemini"), source("antigravity", "Antigravity")])

    let refreshAttempts = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("oauth2.googleapis.com")) {
          refreshAttempts += 1
          if (refreshAttempts === 1) {
            throw new Error("network down")
          }
          return { ok: true, json: async () => ({ access_token: "fresh-token" }) }
        }
        // The models read for the second source.
        return {
          ok: true,
          json: async () => ({
            models: {
              "gemini-2.5-pro": { displayName: "Gemini 2.5 Pro", quotaInfo: { remainingFraction: 0.5 } },
            },
          }),
        }
      }),
    )

    const result = await fetchGoogleQuota()

    // The second source's model is reported, and the first source's failure is collected rather than
    // replacing the aggregate.
    expect(result.ok).toBe(true)
    expect(Object.keys(result.usage.models)).toEqual(["antigravity/gemini-2.5-pro"])
  })
})
