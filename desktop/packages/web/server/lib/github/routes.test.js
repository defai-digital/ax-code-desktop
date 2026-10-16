import express from "express"
import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearForkDetectionCache } from "./repo/fork-detection.js"

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

// The PR lookup itself is exercised in pr-status.test.js; this file is about how the route answers.
const resolveGitHubPrStatusMock = vi.hoisted(() => vi.fn())
vi.mock("./pr-status.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveGitHubPrStatus: resolveGitHubPrStatusMock,
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
    clearForkDetectionCache()
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

  it("answers GitHub's own refusal when the PR status is forbidden", async () => {
    // An organization that restricts OAuth apps answers 403. The route answered the "no pull request"
    // shape for it, so a branch that has one looked like it had none and GitHub's own reason never
    // reached the user.
    const forbidden = () =>
      Object.assign(new Error("Forbidden"), {
        status: 403,
        response: { data: { message: "OAuth app access restrictions" } },
      })
    const pull = {
      number: 7,
      title: "Feature",
      state: "open",
      head: { ref: "feature", sha: "abc123" },
      base: { ref: "main" },
    }
    resolveGitHubPrStatusMock.mockResolvedValueOnce({
      repo: { owner: "owner", repo: "repo" },
      pr: pull,
      defaultBranch: "main",
      resolvedRemoteName: "origin",
    })
    const { getGitHubAuth, getOctokitOrNull } = await import("./index.js")
    getGitHubAuth.mockReturnValueOnce({ accessToken: "tok", user: { login: "alice" }, scope: "repo" })
    getOctokitOrNull.mockReturnValueOnce({
      rest: {
        pulls: {
          get: vi.fn(async () => {
            throw forbidden()
          }),
        },
      },
    })

    const app = createApp()
    const response = await request(app)
      .get("/api/github/pr/status")
      .query({ directory: "/repo", branch: "feature", force: "true" })

    expect(response.status).toBe(403)
    expect(response.body.error).toBe("OAuth app access restrictions")
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

  it("clears stored credentials when an issue route sees the token is gone", async () => {
    // The PR routes and auth/status clear a revoked token and report the account as
    // disconnected; the issue routes answered 500 and left the app connected to a token that no
    // longer works until some other call happened to notice.
    const { getGitHubAuth, getOctokitOrNull, clearGitHubAuth, resolveGitHubRepoFromDirectory } = await import(
      "./index.js"
    )
    getGitHubAuth.mockReturnValueOnce({ accessToken: "tok", user: { login: "alice" }, scope: "repo" })
    resolveGitHubRepoFromDirectory.mockResolvedValueOnce({ repo: { owner: "owner", repo: "repo" } })
    // The first call the route makes fails with the revoked token, whichever it is.
    const unauthorized = vi.fn(async () => {
      throw Object.assign(new Error("bad credentials"), { status: 401 })
    })
    getOctokitOrNull.mockReturnValueOnce({
      rest: { repos: { get: unauthorized }, issues: { listForRepo: unauthorized } },
      paginate: unauthorized,
    })

    const app = createApp()
    const response = await request(app)
      .get("/api/github/issues/list")
      .query({ directory: "/tmp/repo" })
      .expect(200)

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

  const connectRepo = async (rest) => {
    const { getOctokitOrNull, resolveGitHubRepoFromDirectory } = await import("./index.js")
    resolveGitHubRepoFromDirectory.mockResolvedValue({ repo: { owner: "owner", repo: "repo" } })
    getOctokitOrNull.mockReturnValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({ data: { fork: false, owner: { login: "owner" }, name: "repo" } })),
        },
        ...rest,
      },
    })
  }

  it("lists closed issues for one label without using search", async () => {
    const listForRepo = vi.fn(async () => ({
      data: [
        {
          number: 4,
          title: "Bug",
          html_url: "https://github.com/owner/repo/issues/4",
          state: "closed",
          updated_at: "2026-01-02T00:00:00Z",
          user: { login: "ada", id: 1 },
          labels: [{ name: "bug", color: "d73a4a" }],
        },
        { number: 5, title: "Hidden PR", pull_request: { url: "https://api.github.com/pulls/5" } },
      ],
      headers: { link: '<https://api.github.com/issues?page=2>; rel="next"' },
    }))
    await connectRepo({ issues: { listForRepo } })

    const app = createApp()
    const response = await request(app)
      .get("/api/github/issues/list")
      .query({ directory: "/repo", state: "closed", label: "bug" })
      .expect(200)

    expect(listForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      state: "closed",
      labels: "bug",
      per_page: 50,
      page: 1,
    })
    expect(response.body.issues).toEqual([
      expect.objectContaining({ number: 4, state: "closed", updatedAt: "2026-01-02T00:00:00Z" }),
    ])
    expect(response.body.hasMore).toBe(true)
  })

  it("searches issues when the board sends text, and quotes that text", async () => {
    const issuesAndPullRequests = vi.fn(async () => ({
      data: {
        items: [
          {
            number: 8,
            title: "Login",
            html_url: "https://github.com/owner/repo/issues/8",
            state: "open",
            user: { login: "ada", id: 1 },
            labels: [],
          },
        ],
      },
      headers: {},
    }))
    const listForRepo = vi.fn()
    await connectRepo({ issues: { listForRepo }, search: { issuesAndPullRequests } })

    const app = createApp()
    const response = await request(app)
      .get("/api/github/issues/list")
      .query({ directory: "/repo", q: 'repo:evil "quoted"' })
      .expect(200)

    expect(listForRepo).not.toHaveBeenCalled()
    expect(issuesAndPullRequests).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'repo:owner/repo is:issue is:open "repo:evil quoted"' }),
    )
    expect(response.body.issues.map((issue) => issue.number)).toEqual([8])
  })

  it("lists open pulls directly and pages merged and closed pulls through search", async () => {
    const list = vi.fn(async () => ({
      data: [
        {
          number: 3,
          title: "Open",
          html_url: "https://github.com/owner/repo/pull/3",
          state: "open",
          draft: true,
          updated_at: "2026-03-01T00:00:00Z",
          user: { login: "ada", id: 1 },
          labels: [{ name: "ui", color: "ededed" }],
          requested_reviewers: [{ login: "bea" }],
          base: { ref: "main" },
          head: { ref: "board", sha: "abc" },
        },
      ],
      headers: {},
    }))
    const issuesAndPullRequests = vi.fn(async ({ q }) => ({
      data: {
        items: q.includes("is:merged")
          ? [
              {
                number: 1,
                title: "Merged",
                html_url: "https://github.com/owner/repo/pull/1",
                state: "closed",
                closed_at: "2026-01-01T00:00:00Z",
                pull_request: { merged_at: "2026-01-01T00:00:00Z" },
                user: { login: "ada", id: 1 },
              },
            ]
          : [
              {
                number: 2,
                title: "Closed",
                html_url: "https://github.com/owner/repo/pull/2",
                state: "closed",
                closed_at: "2026-01-02T00:00:00Z",
                pull_request: { merged_at: null },
                user: { login: "bea", id: 2 },
              },
            ],
      },
      headers: { link: '<https://api.github.com/search/issues?page=3>; rel="next"' },
    }))
    await connectRepo({ pulls: { list }, search: { issuesAndPullRequests } })

    const app = createApp()
    const open = await request(app).get("/api/github/pulls/list").query({ directory: "/repo" }).expect(200)
    expect(open.body.prs[0]).toMatchObject({ number: 3, draft: true, review: { requested: 1 } })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ state: "open", per_page: 50 }))
    expect(issuesAndPullRequests).not.toHaveBeenCalled()

    const merged = await request(app)
      .get("/api/github/pulls/list")
      .query({ directory: "/repo", state: "merged", page: 2 })
      .expect(200)
    expect(issuesAndPullRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "repo:owner/repo is:pr is:merged", page: 2, per_page: 50 }),
    )
    expect(merged.body.prs.map((pr) => [pr.number, pr.state])).toEqual([[1, "merged"]])
    expect(merged.body.hasMore).toBe(true)

    const closed = await request(app)
      .get("/api/github/pulls/list")
      .query({ directory: "/repo", state: "closed" })
      .expect(200)
    expect(issuesAndPullRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "repo:owner/repo is:pr is:closed is:unmerged" }),
    )
    expect(closed.body.prs.map((pr) => [pr.number, pr.state])).toEqual([[2, "closed"]])
    expect(list).toHaveBeenCalledTimes(1)
  })

  it("adds a comment on the named repository and rejects an empty body", async () => {
    const createComment = vi.fn(async () => ({
      data: {
        id: 99,
        html_url: "https://github.com/owner/repo/issues/4#issuecomment-99",
        body: "Looks good",
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
        user: { login: "ada", id: 1 },
      },
    }))
    await connectRepo({ issues: { createComment } })
    const app = createApp()

    const missing = await request(app)
      .post("/api/github/issues/comments")
      .send({ directory: "/repo", number: 4, body: "  " })
    expect(missing.status).toBe(400)
    expect(createComment).not.toHaveBeenCalled()

    const created = await request(app)
      .post("/api/github/issues/comments")
      .query({ owner: "owner", repo: "repo" })
      .send({ directory: "/repo", number: 4, body: "Looks good" })
      .expect(200)

    expect(createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 4,
      body: "Looks good",
    })
    expect(created.body.comment).toMatchObject({ id: 99, body: "Looks good", author: { login: "ada" } })
  })

  it("closes an issue and refuses a repository outside the fork network", async () => {
    const update = vi.fn(async () => ({
      data: { number: 4, title: "Bug", html_url: "https://github.com/owner/repo/issues/4", state: "closed" },
    }))
    await connectRepo({ issues: { update } })
    const app = createApp()

    const closed = await request(app)
      .post("/api/github/issues/state")
      .send({ directory: "/repo", number: 4, state: "closed" })
      .expect(200)
    expect(update).toHaveBeenCalledWith({ owner: "owner", repo: "repo", issue_number: 4, state: "closed" })
    expect(closed.body.issue).toMatchObject({ number: 4, state: "closed" })

    const invalid = await request(app)
      .post("/api/github/issues/state")
      .send({ directory: "/repo", number: 4, state: "merged" })
    expect(invalid.status).toBe(400)

    const outside = await request(app)
      .post("/api/github/issues/state")
      .query({ owner: "org", repo: "elsewhere" })
      .send({ directory: "/repo", number: 4, state: "open" })
    expect(outside.status).toBe(400)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("clears a revoked token when commenting fails with 401", async () => {
    const { clearGitHubAuth } = await import("./index.js")
    await connectRepo({
      issues: {
        createComment: vi.fn(async () => {
          throw Object.assign(new Error("bad credentials"), { status: 401 })
        }),
      },
    })

    const app = createApp()
    const response = await request(app)
      .post("/api/github/issues/comments")
      .send({ directory: "/repo", number: 4, body: "hello" })
      .expect(200)

    expect(response.body.connected).toBe(false)
    expect(clearGitHubAuth).toHaveBeenCalled()
  })
})
