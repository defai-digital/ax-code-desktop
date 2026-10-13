import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const gitLibraries = {
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  getLog: vi.fn(),
  getCommitFiles: vi.fn(),
  getStatus: vi.fn(),
  isGitRepository: vi.fn(),
}

vi.doMock("./index.js", () => ({
  stageFiles: gitLibraries.stageFiles,
  unstageFiles: gitLibraries.unstageFiles,
  getLog: gitLibraries.getLog,
  getCommitFiles: gitLibraries.getCommitFiles,
  getStatus: gitLibraries.getStatus,
  isGitRepository: gitLibraries.isGitRepository,
}))

const { registerGitRoutes } = await import("./routes.js")

describe("git routes index mutations", () => {
  beforeEach(() => {
    gitLibraries.stageFiles.mockReset()
    gitLibraries.unstageFiles.mockReset()
    gitLibraries.getLog.mockReset()
    gitLibraries.getCommitFiles.mockReset()
    gitLibraries.getStatus.mockReset()
    gitLibraries.isGitRepository.mockReset()
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

  it("answers a directory that is not a repository with a full status shape", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    gitLibraries.isGitRepository.mockResolvedValueOnce(false)

    await getRoute("GET", "/api/git/status")({ query: { directory: "/not-a-repo" } }, response)

    // The client stores this payload as a GitStatus and computes `isDirty: !status.isClean`, so a
    // partial object reported a non-repository as having uncommitted changes.
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({
      isGitRepository: false,
      current: "",
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [],
      isClean: true,
    })
  })

  it("answers a status failure caused by a missing repository with the same shape", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    gitLibraries.isGitRepository.mockResolvedValueOnce(true)
    gitLibraries.getStatus.mockRejectedValueOnce(new Error("fatal: not a git repository (or any parent)"))

    await getRoute("GET", "/api/git/status")({ query: { directory: "/gone" } }, response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ isGitRepository: false, current: "", isClean: true, files: [] })
  })
})
