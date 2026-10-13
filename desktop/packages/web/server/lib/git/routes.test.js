import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const gitLibraries = {
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  getLog: vi.fn(),
  getCommitFiles: vi.fn(),
}

vi.doMock("./index.js", () => ({
  stageFiles: gitLibraries.stageFiles,
  unstageFiles: gitLibraries.unstageFiles,
  getLog: gitLibraries.getLog,
  getCommitFiles: gitLibraries.getCommitFiles,
}))

const { registerGitRoutes } = await import("./routes.js")

describe("git routes index mutations", () => {
  beforeEach(() => {
    gitLibraries.stageFiles.mockReset()
    gitLibraries.unstageFiles.mockReset()
    gitLibraries.getLog.mockReset()
    gitLibraries.getCommitFiles.mockReset()
  })

  it("accepts legacy stage path payloads", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stage")({ query: { directory: "/repo" }, body: { path: "a.ts" } }, response)

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith("/repo", ["a.ts"])
  })

  it("accepts bulk stage paths payloads", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stage")(
      { query: { directory: "/repo" }, body: { paths: ["a.ts", "b.ts"] } },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"])
  })

  it("filters invalid bulk stage path entries before calling git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stage")(
      { query: { directory: "/repo" }, body: { paths: [" a.ts ", "", null, "b.ts"] } },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"])
  })

  it("accepts legacy unstage path payloads", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/unstage")({ query: { directory: "/repo" }, body: { path: "a.ts" } }, response)

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith("/repo", ["a.ts"])
  })

  it("accepts bulk unstage paths payloads", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/unstage")(
      { query: { directory: "/repo" }, body: { paths: ["a.ts", "b.ts"] } },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"])
  })

  it("filters invalid bulk unstage path entries before calling git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/unstage")(
      { query: { directory: "/repo" }, body: { paths: [" a.ts ", "", undefined, "b.ts"] } },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"])
  })

  it("rejects invalid path payloads before calling git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stage")({ query: { directory: "/repo" }, body: { paths: [" ", null] } }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "path parameter is required" })
    expect(gitLibraries.stageFiles).not.toHaveBeenCalled()
  })

  it("rejects option-like log revisions before reaching git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/log")({ query: { directory: "/repo", to: "--output=/tmp/pwned" } }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "from and to must be revisions, not options" })
    expect(gitLibraries.getLog).not.toHaveBeenCalled()
  })

  it("passes plain log revisions through to git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    gitLibraries.getLog.mockResolvedValueOnce({ all: [], latest: null, total: 0 })

    await getRoute("GET", "/api/git/log")({ query: { directory: "/repo", from: "main", to: "feature/x" } }, response)

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.getLog).toHaveBeenCalledWith("/repo", {
      maxCount: undefined,
      from: "main",
      to: "feature/x",
      file: undefined,
      all: false,
    })
  })

  it("rejects an option-like commit hash before reaching git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/commit-files")(
      { query: { directory: "/repo", hash: "--output=/tmp/pwned" } },
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "hash must be a valid commit SHA" })
    expect(gitLibraries.getCommitFiles).not.toHaveBeenCalled()
  })
})
