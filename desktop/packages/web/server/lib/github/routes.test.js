import express from "express"
import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"

const activateGitHubAuth = vi.fn()
const getGitHubAuthAccounts = vi.fn()

vi.mock("./index.js", () => ({
  activateGitHubAuth,
  clearGitHubAuth: vi.fn(),
  exchangeDeviceCode: vi.fn(),
  getGitHubAuth: vi.fn(() => null),
  getGitHubAuthAccounts,
  getGitHubClientId: vi.fn(() => "client-id"),
  getGitHubScopes: vi.fn(() => ["repo"]),
  getOctokitOrNull: vi.fn(() => null),
  resolveGitHubRepoFromDirectory: vi.fn(async () => ({ repo: null })),
  setGitHubAuth: vi.fn(),
  startDeviceFlow: vi.fn(),
}))

const { registerGitHubRoutes } = await import("./routes.js")

const createApp = () => {
  const app = express()
  app.use(express.json())
  registerGitHubRoutes(app)
  return app
}

describe("github routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGitHubAuthAccounts.mockReturnValue([{ id: "known-account" }])
  })

  it("does not clear stored credentials on a 403 rate limit", async () => {
    // GitHub returns 403 for primary and secondary rate limits, which previously read
    // as "auth invalid": the route deleted the stored OAuth token and wiped every
    // account-scoped cache. A 403 must keep the credentials.
    const { getGitHubAuth, getOctokitOrNull, clearGitHubAuth } = await import("./index.js")
    getGitHubAuth.mockReturnValueOnce({ accessToken: "tok", user: { login: "alice" }, scope: "repo" })
    getOctokitOrNull.mockReturnValueOnce({
      rest: {
        users: {
          getAuthenticated: vi.fn(async () => {
            throw Object.assign(new Error("rate limited"), { status: 403 })
          }),
          listEmailsForAuthenticatedUser: vi.fn(async () => ({ data: [] })),
        },
      },
    })

    const app = createApp()
    const response = await request(app).get("/api/github/auth/status").expect(200)

    expect(response.body.connected).toBe(true)
    expect(clearGitHubAuth).not.toHaveBeenCalled()
  })

  it("clears stored credentials on a 401", async () => {
    const { getGitHubAuth, getOctokitOrNull, clearGitHubAuth } = await import("./index.js")
    getGitHubAuth.mockReturnValueOnce({ accessToken: "tok", user: { login: "alice" }, scope: "repo" })
    getOctokitOrNull.mockReturnValueOnce({
      rest: {
        users: {
          getAuthenticated: vi.fn(async () => {
            throw Object.assign(new Error("bad credentials"), { status: 401 })
          }),
          listEmailsForAuthenticatedUser: vi.fn(async () => ({ data: [] })),
        },
      },
    })

    const app = createApp()
    const response = await request(app).get("/api/github/auth/status").expect(200)

    expect(response.body.connected).toBe(false)
    expect(clearGitHubAuth).toHaveBeenCalledTimes(1)
  })

  it("rejects unknown account activation before mutating auth state", async () => {
    const app = createApp()

    const response = await request(app)
      .post("/api/github/auth/activate")
      .send({ accountId: "missing-account" })
      .expect(404)

    expect(response.body).toEqual({ error: "GitHub account not found" })
    expect(activateGitHubAuth).not.toHaveBeenCalled()
  })

  it("rejects blank account activation before mutating auth state", async () => {
    const app = createApp()

    const response = await request(app).post("/api/github/auth/activate").send({ accountId: "   " }).expect(400)

    expect(response.body).toEqual({ error: "accountId is required" })
    expect(activateGitHubAuth).not.toHaveBeenCalled()
  })
})
