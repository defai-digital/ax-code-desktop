import { beforeEach, describe, expect, it, vi } from "vitest"
import fsPromises from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const gitLibraries = {
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  stageHunk: vi.fn(),
  unstageHunk: vi.fn(),
  getLog: vi.fn(),
  getCommitFiles: vi.fn(),
  getCommitPatch: vi.fn(),
  getStatus: vi.fn(),
  isGitRepository: vi.fn(),
  deleteBranch: vi.fn(),
  renameBranch: vi.fn(),
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  recordWorktreeRuntimeEvent: vi.fn(),
  stashApply: vi.fn(),
  stashPop: vi.fn(),
  stashDrop: vi.fn(),
  checkoutBranch: vi.fn(),
  countStashFiles: vi.fn(),
  createBranch: vi.fn(),
  deleteRemoteBranch: vi.fn(),
  getGitBranchDiff: vi.fn(),
}

vi.doMock("./index.js", () => ({
  stageFiles: gitLibraries.stageFiles,
  unstageFiles: gitLibraries.unstageFiles,
  stageHunk: gitLibraries.stageHunk,
  unstageHunk: gitLibraries.unstageHunk,
  getLog: gitLibraries.getLog,
  getCommitFiles: gitLibraries.getCommitFiles,
  getCommitPatch: gitLibraries.getCommitPatch,
  getStatus: gitLibraries.getStatus,
  isGitRepository: gitLibraries.isGitRepository,
  deleteBranch: gitLibraries.deleteBranch,
  renameBranch: gitLibraries.renameBranch,
  createWorktree: gitLibraries.createWorktree,
  removeWorktree: gitLibraries.removeWorktree,
  recordWorktreeRuntimeEvent: gitLibraries.recordWorktreeRuntimeEvent,
  stashApply: gitLibraries.stashApply,
  stashPop: gitLibraries.stashPop,
  stashDrop: gitLibraries.stashDrop,
  checkoutBranch: gitLibraries.checkoutBranch,
  countStashFiles: gitLibraries.countStashFiles,
  createBranch: gitLibraries.createBranch,
  deleteRemoteBranch: gitLibraries.deleteRemoteBranch,
  getGitBranchDiff: gitLibraries.getGitBranchDiff,
}))

const { registerGitRoutes } = await import("./routes.js")

describe("git routes index mutations", () => {
  beforeEach(() => {
    gitLibraries.stageFiles.mockReset()
    gitLibraries.unstageFiles.mockReset()
    gitLibraries.stageHunk.mockReset()
    gitLibraries.unstageHunk.mockReset()
    gitLibraries.getLog.mockReset()
    gitLibraries.getCommitFiles.mockReset()
    gitLibraries.getStatus.mockReset()
    gitLibraries.isGitRepository.mockReset()
    gitLibraries.deleteBranch.mockReset()
    gitLibraries.renameBranch.mockReset()
    gitLibraries.createWorktree.mockReset()
    gitLibraries.stashApply.mockReset()
    gitLibraries.stashPop.mockReset()
    gitLibraries.stashDrop.mockReset()
    gitLibraries.checkoutBranch.mockReset()
    gitLibraries.countStashFiles.mockReset()
    gitLibraries.createBranch.mockReset()
    gitLibraries.deleteRemoteBranch.mockReset()
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

  it("rejects an option-like branch name instead of handing it to git checkout", async () => {
    // `git checkout -f` discards the working tree and exits 0, and a value that names a tracked file
    // is a pathspec: `git checkout README.md` restored that file from the index. The route answered
    // success for both, so the user believed a branch had been checked out.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/checkout")({ query: { directory: "/repo" }, body: { branch: "-f" } }, response)

    expect(response.statusCode).toBe(400)
    expect(gitLibraries.checkoutBranch).not.toHaveBeenCalled()
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
    // Paths are literal: the surrounding spaces belong to the file name.
    expect(gitLibraries.stageFiles).toHaveBeenCalledWith("/repo", [" a.ts ", "b.ts"])
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
    expect(gitLibraries.unstageFiles).toHaveBeenCalledWith("/repo", [" a.ts ", "b.ts"])
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

  it.each([
    ["/api/git/stage-hunk", "stageHunk"],
    ["/api/git/unstage-hunk", "unstageHunk"],
  ])("passes a single-hunk patch through to %s", async (routePath, libraryName) => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", routePath)(
      { query: { directory: "/repo" }, body: { path: "a.ts", patch: "@@ -1,1 +1,1 @@\n-a\n+b\n" } },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(gitLibraries[libraryName]).toHaveBeenCalledWith("/repo", "a.ts", "@@ -1,1 +1,1 @@\n-a\n+b\n")
  })

  it.each([
    ["/api/git/stage-hunk", "stageHunk"],
    ["/api/git/unstage-hunk", "unstageHunk"],
  ])("rejects a hunk payload without a usable patch on %s", async (routePath, libraryName) => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", routePath)({ query: { directory: "/repo" }, body: { path: "a.ts" } }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "patch parameter is required" })
    expect(gitLibraries[libraryName]).not.toHaveBeenCalled()
  })

  it.each([
    ["/api/git/stage-hunk", "stageHunk"],
    ["/api/git/unstage-hunk", "unstageHunk"],
  ])("reports a hunk mutation failure without swallowing it on %s", async (routePath, libraryName) => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    gitLibraries[libraryName].mockRejectedValueOnce(new Error("Patch does not target a.ts"))

    await getRoute("POST", routePath)(
      { query: { directory: "/repo" }, body: { path: "a.ts", patch: "@@ -1,1 +1,1 @@" } },
      response,
    )

    expect(response.statusCode).toBe(500)
    expect(response.body).toEqual({ error: "Patch does not target a.ts" })
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

  it("rejects an option-like hash on the commit patch route", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/commit-patch")({ query: { directory: "/repo", hash: "--output=/tmp/x" } }, response)

    expect(response.statusCode).toBe(400)
    expect(gitLibraries.getCommitPatch).not.toHaveBeenCalled()
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

  it("returns per-file content identities from git status without file content", async () => {
    const headBlobId = "a".repeat(40)
    const indexBlobId = "b".repeat(40)
    const worktreeBlobId = "c".repeat(40)
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()
    gitLibraries.isGitRepository.mockResolvedValueOnce(true)
    gitLibraries.getStatus.mockResolvedValueOnce({
      current: "main",
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [
        {
          path: "src/a.ts",
          index: " ",
          working_dir: "M",
          headBlobId,
          indexBlobId,
          worktreeBlobId,
        },
      ],
      isClean: false,
    })

    await getRoute("GET", "/api/git/status")({ query: { directory: "/repo" } }, response)

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.getStatus).toHaveBeenCalledWith("/repo", { mode: undefined })
    expect(response.body.files).toEqual([
      { path: "src/a.ts", index: " ", working_dir: "M", headBlobId, indexBlobId, worktreeBlobId },
    ])
    expect(response.body.files[0].content).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toContain("const value")
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

  it("rejects embedded nulls before filesystem inspection", async () => {
    expect((await call(path.resolve("bad\0path"))).statusCode).toBe(400)
  })

  it("lists child repositories and stays inside a folder outside the home folder", async () => {
    const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-git-route-"))
    await fsPromises.mkdir(path.join(root, "app", ".git"), { recursive: true })
    await fsPromises.mkdir(path.join(root, "lib", ".git"), { recursive: true })
    const response = await call(root)
    expect(response.statusCode).toBe(200)
    expect(response.body.directory).toBe(await fsPromises.realpath(root))
    expect(response.body.childRepositories.map((repo) => repo.name)).toEqual(["app", "lib"])
    // The temp folder is outside the home folder, so the search does not walk upward.
    expect(response.body.gitRoot).toBeNull()
  })
})

describe("git worktree routes", () => {
  beforeEach(() => {
    gitLibraries.createWorktree.mockReset()
    gitLibraries.removeWorktree.mockReset()
    gitLibraries.recordWorktreeRuntimeEvent.mockReset()
  })

  it("hands worktree creation the runtime client factory", async () => {
    // ADR-020: the runtime creates worktrees, and only the route layer can reach it.
    const { app, getRoute } = createRouteRegistry()
    const getWorktreeClient = vi.fn()
    registerGitRoutes(app, { getWorktreeClient })
    const response = createMockResponse()
    gitLibraries.createWorktree.mockResolvedValue({ head: "", name: "feat", branch: "feat", path: "/data/feat" })

    await getRoute("POST", "/api/git/worktrees")({ query: { directory: "/repo" }, body: { branchName: "feat" } }, response)

    expect(gitLibraries.createWorktree).toHaveBeenCalledWith("/repo", { branchName: "feat" }, { getWorktreeClient })
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ head: "", name: "feat", branch: "feat", path: "/data/feat" })
  })

  it("answers removal with the branch the runtime kept", async () => {
    const { app, getRoute } = createRouteRegistry()
    const getWorktreeClient = vi.fn()
    registerGitRoutes(app, { getWorktreeClient })
    const response = createMockResponse()
    gitLibraries.removeWorktree.mockResolvedValue({ removed: true, branchDeleted: false, warning: "Kept feat" })

    await getRoute("DELETE", "/api/git/worktrees")(
      { query: { directory: "/repo" }, body: { directory: "/data/feat", deleteLocalBranch: true } },
      response,
    )

    expect(gitLibraries.removeWorktree).toHaveBeenCalledWith(
      "/repo",
      { directory: "/data/feat", deleteLocalBranch: true },
      { getWorktreeClient },
    )
    expect(response.body).toEqual({ success: true, warning: "Kept feat" })
  })

  it("feeds the runtime's worktree bootstrap events to the git service", async () => {
    const { app } = createRouteRegistry()
    let subscriber = null
    const globalEventHub = { subscribeEvent: vi.fn((fn) => (subscriber = fn)) }
    registerGitRoutes(app, { globalEventHub })

    await subscriber({
      directory: "/data/feat",
      payload: { type: "worktree.failed", properties: { message: "install failed" } },
    })
    await subscriber({ directory: "/repo", payload: { type: "session.status", properties: {} } })

    expect(gitLibraries.recordWorktreeRuntimeEvent).toHaveBeenCalledTimes(1)
    expect(gitLibraries.recordWorktreeRuntimeEvent).toHaveBeenCalledWith({
      directory: "/data/feat",
      payload: { type: "worktree.failed", properties: { message: "install failed" } },
    })
  })
})

describe("git routes stash references", () => {
  it.each([
    ["/api/git/stash/apply", "stashApply"],
    ["/api/git/stash/pop", "stashPop"],
    ["/api/git/stash/drop", "stashDrop"],
  ])("rejects an option-like stash ref on %s instead of reporting success", async (routePath, libraryName) => {
    // Git parses a leading "-" as an option: `--help` prints usage and exits 0, so no stash was
    // applied, popped or dropped while the route answered success.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", routePath)({ query: { directory: "/repo" }, body: { ref: "--help" } }, response)

    expect(response.statusCode).toBe(400)
    expect(gitLibraries[libraryName]).not.toHaveBeenCalled()
  })

  it("rejects an option-like stash ref instead of writing the file it names", async () => {
    // The refs reach `git stash show`, which forwards options to `git diff`: `--output=<path>` is honoured, so the
    // stash's file list was written to that file and the route answered 200 with a counts map keyed by the option.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stashes/file-counts")(
      { query: { directory: "/repo" }, body: { refs: ["stash@{0}", "--output=/tmp/pwned"] } },
      response,
    )

    expect(response.statusCode).toBe(400)
  })

  it("rejects an option-like stash ref sent as a bare string", async () => {
    // `countStashFiles` normalizes a non-array into a one-element list, so the string form reaches `git stash show`
    // exactly as an array entry does and the guard has to see both.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/stashes/file-counts")(
      { query: { directory: "/repo" }, body: { refs: "--output=/tmp/pwned" } },
      response,
    )

    expect(response.statusCode).toBe(400)
  })

  it("rejects an option-like start point instead of creating the branch from HEAD", async () => {
    // `git checkout -b <name> <startPoint>` reads a leading "-" as an option, so the branch was created at HEAD
    // (or over local state, with `--force`) and the route answered success for a branch from the wrong commit.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("POST", "/api/git/branches")(
      { query: { directory: "/repo" }, body: { name: "feature", startPoint: "--force" } },
      response,
    )

    expect(response.statusCode).toBe(400)
  })

  it("rejects an option-like remote instead of pushing with it as a flag", async () => {
    // The remote and the branch reach `git push <remote> <refspec>` as bare argv: `--force :main` force-deletes
    // main on the default remote, and the route reported success for deleting a branch on a remote named that way.
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("DELETE", "/api/git/remote-branches")(
      { query: { directory: "/repo" }, body: { branch: "feature", remote: "--force" } },
      response,
    )

    expect(response.statusCode).toBe(400)
  })
})

describe("git branch diff route", () => {
  beforeEach(() => {
    gitLibraries.getGitBranchDiff.mockReset()
  })

  it("passes the directory and base through to the service", async () => {
    gitLibraries.getGitBranchDiff.mockResolvedValue({ base: "main", mergeBase: "a".repeat(40), truncated: false, files: [] })
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/branch-diff")({ query: { directory: "/repo", base: "main" } }, response)

    expect(response.statusCode).toBe(200)
    expect(gitLibraries.getGitBranchDiff).toHaveBeenCalledWith("/repo", { base: "main" })
    expect(response.body.base).toBe("main")
  })

  it("omits an empty base so the service can choose the default", async () => {
    gitLibraries.getGitBranchDiff.mockResolvedValue({ base: "main", files: [] })
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/branch-diff")({ query: { directory: "/repo", base: "" } }, response)

    expect(gitLibraries.getGitBranchDiff).toHaveBeenCalledWith("/repo", { base: undefined })
  })

  it("rejects a missing directory before asking git", async () => {
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/branch-diff")({ query: {} }, response)

    expect(response.statusCode).toBe(400)
    expect(gitLibraries.getGitBranchDiff).not.toHaveBeenCalled()
  })

  it("returns the service's status when the base is rejected", async () => {
    const error = new Error("Unknown branch")
    error.statusCode = 400
    gitLibraries.getGitBranchDiff.mockRejectedValue(error)
    const { app, getRoute } = createRouteRegistry()
    registerGitRoutes(app)
    const response = createMockResponse()

    await getRoute("GET", "/api/git/branch-diff")({ query: { directory: "/repo", base: "--upload-pack=evil" } }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "Unknown branch" })
  })
})
