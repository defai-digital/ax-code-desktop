import { beforeEach, describe, expect, it, vi } from "vitest"
import fsPromises from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const gitLibraries = {
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  getLog: vi.fn(),
  getCommitFiles: vi.fn(),
  getStatus: vi.fn(),
  isGitRepository: vi.fn(),
  deleteBranch: vi.fn(),
  renameBranch: vi.fn(),
}

vi.doMock("./index.js", () => ({
  stageFiles: gitLibraries.stageFiles,
  unstageFiles: gitLibraries.unstageFiles,
  getLog: gitLibraries.getLog,
  getCommitFiles: gitLibraries.getCommitFiles,
  getStatus: gitLibraries.getStatus,
  isGitRepository: gitLibraries.isGitRepository,
  deleteBranch: gitLibraries.deleteBranch,
  renameBranch: gitLibraries.renameBranch,
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
    gitLibraries.deleteBranch.mockReset()
    gitLibraries.renameBranch.mockReset()
  })

  it("rejects an option-like branch name instead of reporting a deletion", async () => {
    // `git branch -d --help` prints usage and exits 0, so git never deleted
    // anything while the route answered success.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("DELETE", "/api/git/branches")(
      { query: { directory: "/repo" }, body: { branch: "--help" } },
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(gitLibraries.deleteBranch).not.toHaveBeenCalled()
  })

  it("rejects an option-like branch name instead of reporting a rename", async () => {
    // `git branch -m -a <new>` consumes `-a` as an option, renames the current
    // branch and exits 0, so git never renamed the branch this route named.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("PUT", "/api/git/branches/rename")(
      { query: { directory: "/repo" }, body: { oldName: "-a", newName: "feature" } },
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(gitLibraries.renameBranch).not.toHaveBeenCalled()
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

describe("git repository hints route", () => {
  const call = async (directory) => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    await getRoute("GET", "/api/git/repositories")({ query: { directory } }, response)
    return response
  }

  it("requires an absolute directory", async () => {
    expect((await call("")).statusCode).toBe(400)
    expect((await call("relative/path")).statusCode).toBe(400)
  })

  it("answers 404 for a missing folder", async () => {
    expect((await call(path.join(os.tmpdir(), "ax-missing-" + Date.now()))).statusCode).toBe(404)
  })

  it("lists child repositories and stays inside a folder outside the home folder", async () => {
    const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-git-route-"))
    await fsPromises.mkdir(path.join(root, "app", ".git"), { recursive: true })
    await fsPromises.mkdir(path.join(root, "lib", ".git"), { recursive: true })
    const response = await call(root)
    expect(response.statusCode).toBe(200)
    expect(response.body.childRepositories.map((repo) => repo.name)).toEqual(["app", "lib"])
    // The temp folder is outside the home folder, so the search does not walk upward.
    expect(response.body.gitRoot).toBeNull()
  })
})
