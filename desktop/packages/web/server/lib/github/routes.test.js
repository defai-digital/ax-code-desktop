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

  it("caps branch pagination at a bounded number of pages", async () => {
    // An unbounded loop meant one request paid hundreds of sequential, now-timeboxed
    // API calls for a repo with thousands of branches.
    const listBranches = vi.fn(async () => ({
      data: Array.from({ length: 100 }, (_, i) => ({ name: `branch-${i}` })),
    }))
    const { getOctokitOrNull } = await import("./index.js")
    getOctokitOrNull.mockReturnValueOnce({ rest: { repos: { listBranches } } })

    const app = createApp()
    const response = await request(app)
      .get("/api/github/repo/branches")
      .query({ owner: "owner", repo: "repo" })
      .expect(200)

    expect(response.body.branches).toHaveLength(2000)
    expect(listBranches).toHaveBeenCalledTimes(20)
  })

  it("marks the cached user as stale when the live lookup fails", async () => {
    // A network or GitHub failure keeps the credentials but must not silently stand in
    // as a live account: the route now says so.
    const { getGitHubAuth, getOctokitOrNull, clearGitHubAuth } = await import("./index.js")
    getGitHubAuth.mockReturnValueOnce({ accessToken: "tok", user: { login: "alice" }, scope: "repo" })
    getOctokitOrNull.mockReturnValueOnce({
      rest: {
        users: {
          getAuthenticated: vi.fn(async () => {
            throw new Error("network unreachable")
          }),
          listEmailsForAuthenticatedUser: vi.fn(async () => ({ data: [] })),
        },
      },
    })

    const app = createApp()
    const response = await request(app).get("/api/github/auth/status").expect(200)

    expect(response.body.connected).toBe(true)
    expect(response.body.stale).toBe(true)
    expect(response.body.user).toEqual({ login: "alice" })
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

  it("refuses a pull request repo outside this repository's network instead of the origin repo", async () => {
    // Merge, mark-ready and edit resolved the repo from the directory alone and ignored
    // which repo the caller named, so they acted on the origin repo's pull request with
    // the same number - an unrelated one - while the UI showed an upstream PR.
    const merge = vi.fn(async () => ({ data: { merged: true } }))
    const { getOctokitOrNull, resolveGitHubRepoFromDirectory } = await import("./index.js")
    resolveGitHubRepoFromDirectory.mockResolvedValueOnce({ repo: { owner: "me", repo: "fork" } })
    getOctokitOrNull.mockReturnValueOnce({ rest: { pulls: { merge } } })

    const app = createApp()
    const response = await request(app)
      .post("/api/github/pr/merge")
      .query({ owner: "org", repo: "upstream" })
      .send({ directory: "/repo", number: 7, method: "squash" })

    expect(response.status).toBe(400)
    expect(merge).not.toHaveBeenCalled()
  })

  it("merges in the repo the caller named when it resolves to the same repo", async () => {
    const merge = vi.fn(async () => ({ data: { merged: true, message: "ok" } }))
    const { getOctokitOrNull, resolveGitHubRepoFromDirectory } = await import("./index.js")
    resolveGitHubRepoFromDirectory.mockResolvedValueOnce({ repo: { owner: "me", repo: "fork" } })
    getOctokitOrNull.mockReturnValueOnce({ rest: { pulls: { merge } } })

    const app = createApp()
    await request(app)
      .post("/api/github/pr/merge")
      .query({ owner: "me", repo: "fork" })
      .send({ directory: "/repo", number: 7, method: "squash" })
      .expect(200)

    expect(merge).toHaveBeenCalledWith({ owner: "me", repo: "fork", pull_number: 7, merge_method: "squash" })
  })

  it("still uses the directory's repo when the caller names none", async () => {
    const merge = vi.fn(async () => ({ data: { merged: true, message: "ok" } }))
    const { getOctokitOrNull, resolveGitHubRepoFromDirectory } = await import("./index.js")
    resolveGitHubRepoFromDirectory.mockResolvedValueOnce({ repo: { owner: "me", repo: "fork" } })
    getOctokitOrNull.mockReturnValueOnce({ rest: { pulls: { merge } } })

    const app = createApp()
    await request(app)
      .post("/api/github/pr/merge")
      .send({ directory: "/repo", number: 7, method: "merge" })
      .expect(200)

    expect(merge).toHaveBeenCalledWith({ owner: "me", repo: "fork", pull_number: 7, merge_method: "merge" })
  })
})
