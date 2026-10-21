import { createHash } from "crypto"
import { execFileSync } from "node:child_process"
import { execFile } from "child_process"
import { promisify } from "node:util"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { simpleGit } from "simple-git"

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal()
  const execFile = vi.fn(actual.execFile)
  // Preserve execFile's stdout/stderr promise contract while observing its process options.
  const custom = Symbol.for("nodejs.util.promisify.custom")
  execFile[custom] = vi.fn(actual.execFile[custom])
  return { ...actual, execFile }
})

import {
  checkoutBranch,
  checkoutCommit,
  cherryPick,
  commit,
  continueRebase,
  countStashFiles,
  createWorktree,
  deleteRemoteBranch,
  getCommitFileDiff,
  getCommitFiles,
  getCommitPatch,
  getFileDiff,
  getGitBranchDiff,
  getStatus,
  GIT_STATUS_CONTENT_ID_MAX_BYTES,
  GIT_STATUS_CONTENT_ID_MAX_FILES,
  GIT_STATUS_CONTENT_ID_TIMEOUT_MS,
  getWorktreeBootstrapStatus,
  getWorktrees,
  previewWorktreeCreate,
  recordWorktreeRuntimeEvent,
  isGitRepository,
  isRefusedRepositoryRoot,
  leavesRepositoryRoot,
  push,
  removeWorktree,
  resetToCommit,
  resolveRepositoryFilePath,
  resolveBaseRefForLog,
  revertCommit,
  revertFile,
  stageFiles,
  stageHunk,
  unstageFiles,
  unstageHunk,
  validateRepositoryFilePaths,
} from "./service.js"

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

const tempDirs = []

/** Create a temp dir and register it for afterEach cleanup. */
const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openchamber-git-service-"))
  tempDirs.push(dir)
  return dir
}

const runGit = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

const canRunGit = () => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Create a temp repo using simple-git (for tests that need its assertion API).
 * The dir is registered in tempDirs so afterEach handles cleanup automatically.
 */
async function createTempRepo() {
  const tmpDir = createTempDir()
  const git = simpleGit(tmpDir)
  await git.init()
  await git.addConfig("user.name", "Test User", false, "local")
  await git.addConfig("user.email", "test@example.com", false, "local")
  await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"])
  return { tmpDir, git }
}

// ---------------------------------------------------------------------------
// resolveBaseRefForLog
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// deleteRemoteBranch
// ---------------------------------------------------------------------------

describe("deleteRemoteBranch", () => {
  const initBare = (dir) => runGit(dir, ["init", "--bare", "-b", "main"])

  it("deletes from the branch's configured remote instead of assuming origin", async () => {
    const { tmpDir, git } = await createTempRepo()
    const originDir = createTempDir()
    const upstreamDir = createTempDir()
    initBare(originDir)
    initBare(upstreamDir)
    await git.commit("init", undefined, { "--allow-empty": null })
    await git.addRemote("origin", originDir)
    await git.addRemote("upstream", upstreamDir)
    await git.raw(["push", "upstream", "main:feature"])
    await git.raw(["push", "origin", "main:feature"])
    await git.raw(["config", "branch.feature.remote", "upstream"])
    await git.raw(["config", "branch.feature.merge", "refs/heads/feature"])

    const result = await deleteRemoteBranch(tmpDir, { branch: "feature" })

    expect(result).toEqual({ success: true, remote: "upstream" })
    expect(runGit(upstreamDir, ["branch", "--list", "feature"]).trim()).toBe("")
    // The same-named branch on origin is unrelated and must survive.
    expect(runGit(originDir, ["branch", "--list", "feature"])).toContain("feature")
  })

  it("refuses to guess a remote when the branch tracks none", async () => {
    const { tmpDir } = await createTempRepo()

    await expect(deleteRemoteBranch(tmpDir, { branch: "feature" })).rejects.toThrow(/no configured remote/)
  })

  it("deletes the tracked remote branch when its name differs from the local branch", async () => {
    const { tmpDir, git } = await createTempRepo()
    const remoteDir = createTempDir()
    initBare(remoteDir)
    await git.commit("init", undefined, { "--allow-empty": null })
    await git.addRemote("origin", remoteDir)
    await git.raw(["push", "origin", "main:feature", "main:review-target"])
    await git.raw(["config", "branch.feature.remote", "origin"])
    await git.raw(["config", "branch.feature.merge", "refs/heads/review-target"])

    await deleteRemoteBranch(tmpDir, { branch: "feature" })

    expect(runGit(remoteDir, ["branch", "--list", "feature"])).toContain("feature")
    expect(runGit(remoteDir, ["branch", "--list", "review-target"]).trim()).toBe("")
  })

  it("refuses a local upstream instead of deleting a local branch", async () => {
    const { tmpDir, git } = await createTempRepo()
    await git.commit("init", undefined, { "--allow-empty": null })
    await git.branch(["feature"])
    await git.raw(["config", "branch.feature.remote", "."])
    await git.raw(["config", "branch.feature.merge", "refs/heads/feature"])

    await expect(deleteRemoteBranch(tmpDir, { branch: "feature" })).rejects.toThrow(/local repository/)
    expect(runGit(tmpDir, ["branch", "--list", "feature"])).toContain("feature")
  })

  it("refuses to guess a branch when the configured upstream is incomplete", async () => {
    const { tmpDir, git } = await createTempRepo()
    await git.raw(["config", "branch.feature.remote", "origin"])

    await expect(deleteRemoteBranch(tmpDir, { branch: "feature" })).rejects.toThrow(/configured upstream branch/)
  })

  it("honors an explicitly selected remote and branch without upstream configuration", async () => {
    const { tmpDir, git } = await createTempRepo()
    const remoteDir = createTempDir()
    initBare(remoteDir)
    await git.commit("init", undefined, { "--allow-empty": null })
    await git.addRemote("origin", remoteDir)
    await git.raw(["push", "origin", "main:feature"])

    await deleteRemoteBranch(tmpDir, { branch: "refs/heads/feature", remote: "origin" })

    expect(runGit(remoteDir, ["branch", "--list", "feature"]).trim()).toBe("")
  })
})

// ---------------------------------------------------------------------------
// revertFile
// ---------------------------------------------------------------------------

describe("revertFile", () => {
  const repoWithFile = async (content = "base\n") => {
    const { tmpDir, git } = await createTempRepo()
    await fs.promises.writeFile(path.join(tmpDir, "file.txt"), content, "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")
    return { tmpDir, git }
  }

  it("restores a staged deletion from HEAD", async () => {
    const { tmpDir, git } = await repoWithFile()
    await git.rm("file.txt")
    expect((await git.status()).deleted).toContain("file.txt")

    await revertFile(tmpDir, "file.txt", { scope: "all" })

    expect(await fs.promises.readFile(path.join(tmpDir, "file.txt"), "utf8")).toBe("base\n")
    expect((await git.status()).files).toHaveLength(0)
  })

  it("removes a staged addition instead of failing to check it out", async () => {
    const { tmpDir, git } = await repoWithFile()
    await fs.promises.writeFile(path.join(tmpDir, "new.txt"), "fresh\n", "utf8")
    await git.add("new.txt")

    await revertFile(tmpDir, "new.txt", { scope: "all" })

    await expect(fs.promises.stat(path.join(tmpDir, "new.txt"))).rejects.toThrow()
    expect((await git.status()).files).toHaveLength(0)
  })

  it("preserves a directory replacing a staged addition and leaves the index intact", async () => {
    const { tmpDir, git } = await repoWithFile()
    const addedPath = path.join(tmpDir, "new.txt")
    await fs.promises.writeFile(addedPath, "staged\n")
    await git.add("new.txt")
    await fs.promises.unlink(addedPath)
    await fs.promises.mkdir(addedPath)
    await fs.promises.writeFile(path.join(addedPath, "keep.txt"), "untracked sentinel\n")

    await expect(revertFile(tmpDir, "new.txt", { scope: "all" })).rejects.toThrow(/directory/)

    expect(await fs.promises.readFile(path.join(addedPath, "keep.txt"), "utf8")).toBe("untracked sentinel\n")
    expect(await git.raw(["show", ":new.txt"])).toBe("staged\n")
  })

  it("removes a staged addition before the first commit without leaving an index entry", async () => {
    const { tmpDir, git } = await createTempRepo()
    const addedPath = path.join(tmpDir, "new.txt")
    await fs.promises.writeFile(addedPath, "staged\n")
    await git.add("new.txt")

    await revertFile(tmpDir, "new.txt", { scope: "all" })

    expect(fs.existsSync(addedPath)).toBe(false)
    expect((await git.status()).files).toHaveLength(0)
  })

  it("removes the destination of a staged rename", async () => {
    const { tmpDir, git } = await repoWithFile()
    await git.raw(["mv", "file.txt", "renamed.txt"])

    await revertFile(tmpDir, "renamed.txt", { scope: "all" })

    await expect(fs.promises.stat(path.join(tmpDir, "renamed.txt"))).rejects.toThrow()
    // The source side of the rename is untouched until it is reverted itself.
    expect((await git.status()).deleted).toContain("file.txt")
  })

  it("rejects the repository root instead of reverting every file", async () => {
    const { tmpDir } = await repoWithFile()
    await fs.promises.writeFile(path.join(tmpDir, "file.txt"), "changed\n", "utf8")

    await expect(revertFile(tmpDir, ".", { scope: "all" })).rejects.toThrow(/Invalid file path/)

    // An empty pathspec used to match the whole repository.
    expect(await fs.promises.readFile(path.join(tmpDir, "file.txt"), "utf8")).toBe("changed\n")
  })

  it("keeps a staged addition's index entry when only the worktree is reverted", async () => {
    const { tmpDir, git } = await repoWithFile()
    await fs.promises.writeFile(path.join(tmpDir, "new.txt"), "staged\n", "utf8")
    await git.add("new.txt")
    await fs.promises.writeFile(path.join(tmpDir, "new.txt"), "worktree\n", "utf8")

    await revertFile(tmpDir, "new.txt", { scope: "working" })

    expect(await fs.promises.readFile(path.join(tmpDir, "new.txt"), "utf8")).toBe("staged\n")
    expect((await git.status()).created).toContain("new.txt")
  })
})

describe("resolveBaseRefForLog", () => {
  it("returns the local ref unchanged when it exists, even if origin also exists", async () => {
    const checkRef = async (ref) => ref === "main" || ref === "refs/remotes/origin/main"
    expect(await resolveBaseRefForLog("main", checkRef)).toBe("main")
  })

  it("falls back to origin/<from> when local ref cannot be resolved but origin can", async () => {
    const checkRef = async (ref) => ref === "refs/remotes/origin/main"
    expect(await resolveBaseRefForLog("main", checkRef)).toBe("origin/main")
  })

  it("returns the original ref when neither local nor origin ref can be resolved", async () => {
    const checkRef = async () => false
    expect(await resolveBaseRefForLog("nonexistent-branch", checkRef)).toBe("nonexistent-branch")
  })

  it("returns undefined when from is undefined", async () => {
    const checkRef = async () => true
    expect(await resolveBaseRefForLog(undefined, checkRef)).toBeUndefined()
  })

  it("returns undefined when from is an empty string", async () => {
    const checkRef = async () => true
    expect(await resolveBaseRefForLog("", checkRef)).toBeUndefined()
  })

  it("returns undefined when from is a whitespace-only string", async () => {
    const checkRef = async () => true
    expect(await resolveBaseRefForLog("   ", checkRef)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// git index path validation
// ---------------------------------------------------------------------------

describe("git index path validation", () => {
  it("resolves repository file paths inside the repository", () => {
    expect(resolveRepositoryFilePath("/repo", "src/file.ts")).toBe(path.resolve("/repo/src/file.ts"))
  })

  it("rejects repository file path escapes", () => {
    expect(() => resolveRepositoryFilePath("/repo", "../secret.txt")).toThrow(
      "Path is outside repository: ../secret.txt",
    )
    expect(() => resolveRepositoryFilePath("/repo", "/repo2/secret.txt")).toThrow(
      "Path is outside repository: /repo2/secret.txt",
    )
  })

  it("allows Windows repository paths that differ only by case", () => {
    expect(() =>
      validateRepositoryFilePaths("C:\\Users\\Alice\\Repo", ["c:\\users\\alice\\repo\\src\\file.ts"], path.win32),
    ).not.toThrow()
  })

  it("rejects Windows sibling path escapes", () => {
    expect(() =>
      validateRepositoryFilePaths("C:\\Users\\Alice\\Repo", ["C:\\Users\\Alice\\Repo2\\file.ts"], path.win32),
    ).toThrow("Path is outside repository: C:\\Users\\Alice\\Repo2\\file.ts")
  })

  it("accepts a path in a directory whose name starts with two dots", () => {
    // Only ".." itself or a leading "../" leaves the repository. `..cache/file.txt` is a normal path
    // inside it, and rejecting it made those files unstageable (fs/routes.js states the same rule).
    expect(() => validateRepositoryFilePaths("/repo", ["..cache/file.txt"])).not.toThrow()
    expect(() => resolveRepositoryFilePath("/repo", "..cache/file.txt")).not.toThrow()
    expect(leavesRepositoryRoot("..cache/file.txt")).toBe(false)
    expect(leavesRepositoryRoot("..")).toBe(true)
    expect(leavesRepositoryRoot(`..${path.sep}file.txt`)).toBe(true)
  })

  it("rejects stage paths outside the repository before invoking git", async () => {
    await expect(stageFiles("/repo", ["../secret.txt"])).rejects.toThrow("Path is outside repository: ../secret.txt")
  })

  it("rejects unstage paths outside the repository before invoking git", async () => {
    await expect(unstageFiles("/repo", ["../secret.txt"])).rejects.toThrow("Path is outside repository: ../secret.txt")
  })
})

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe("isGitRepository roots", () => {
  it("refuses a repository whose top level is a home directory or a filesystem root", () => {
    // An accidental `git init` above the project made the Git panel run status over the whole
    // tree; the reads have no timeout, so the panel simply hung.
    expect(isRefusedRepositoryRoot("/", "/Users/alice")).toBe(true)
    expect(isRefusedRepositoryRoot("/Users/alice", "/Users/alice")).toBe(true)
    expect(isRefusedRepositoryRoot("/Users/alice/project", "/Users/alice")).toBe(false)
    expect(isRefusedRepositoryRoot("/Volumes/work/project", "/Users/alice")).toBe(false)
    expect(isRefusedRepositoryRoot("", "/Users/alice")).toBe(false)
  })

  it("refuses a repository that is the home directory itself", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])

    // The home directory on this machine is not a repository, so the rule is exercised by
    // pointing the home path at the temporary repository.
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(repo)
    try {
      expect(await isGitRepository(repo)).toBe(false)
    } finally {
      homedirSpy.mockRestore()
    }

    expect(await isGitRepository(repo)).toBe(true)
  })

  it("still accepts a project repository", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])

    expect(await isGitRepository(repo)).toBe(true)

    const nested = path.join(repo, "packages", "app")
    fs.mkdirSync(nested, { recursive: true })
    expect(await isGitRepository(nested)).toBe(true)
  })
})

describe("getStatus", () => {
  it("handles repositories without upstream tracking", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    await expect(getStatus(repo)).resolves.toMatchObject({ current: "main" })
  })

  it("refreshes the index without taking the optional index lock", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    // An mtime older than the recorded stat makes git distrust the cached entry,
    // so an unguarded status would rewrite the index under .git/index.lock.
    const stale = new Date("2001-01-01T00:00:00.000Z")
    fs.utimesSync(path.join(repo, "README.md"), stale, stale)
    const indexPath = path.join(repo, ".git", "index")
    const indexBefore = fs.readFileSync(indexPath)

    await getStatus(repo)

    expect(fs.readFileSync(indexPath)).toEqual(indexBefore)
  })

  it("reports the merge head and message while a merge is in progress", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "f.txt"])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "other"])
    fs.writeFileSync(path.join(repo, "f.txt"), "other\n")
    runGit(repo, ["commit", "-am", "other"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "main"])
    expect(() => runGit(repo, ["merge", "--no-edit", "-m", "Merge other into main", "other"])).toThrow()

    const status = await getStatus(repo)

    expect(status.mergeInProgress).toEqual({
      head: runGit(repo, ["rev-parse", "--short=7", "MERGE_HEAD"]).trim(),
      message: "Merge other into main",
    })
    expect(status.rebaseInProgress).toBeNull()
  })

  it("reports the branch and base of an in-progress rebase", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "f.txt"])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "feature"])
    fs.writeFileSync(path.join(repo, "f.txt"), "feature\n")
    runGit(repo, ["commit", "-am", "feature"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "main"])
    expect(() => runGit(repo, ["rebase", "feature"])).toThrow()

    const status = await getStatus(repo)

    expect(status.mergeInProgress).toBeNull()
    expect(status.rebaseInProgress).toEqual({
      headName: "main",
      onto: runGit(repo, ["rev-parse", "--short=7", "feature"]).trim(),
    })
  })

  it("does not read rebase metadata through a symlink outside the git directory", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "f.txt"])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "feature"])
    fs.writeFileSync(path.join(repo, "f.txt"), "feature\n")
    runGit(repo, ["commit", "-am", "feature"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "main"])
    expect(() => runGit(repo, ["rebase", "feature"])).toThrow()

    const outside = createTempDir()
    const state = path.join(repo, ".git", "rebase-merge")
    fs.renameSync(state, path.join(outside, "state"))
    fs.symlinkSync(path.join(outside, "state"), state, process.platform === "win32" ? "junction" : "dir")
    const status = await getStatus(repo)
    expect(status.rebaseInProgress).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// checkoutCommit
// ---------------------------------------------------------------------------

describe("getCommitPatch", () => {
  it("returns the commit's message and unified patch", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "one\ntwo\n", "utf8")
    await git.add("file.txt")
    await git.commit("First commit")
    await fs.promises.writeFile(filePath, "one\nthree\n", "utf8")
    await git.add("file.txt")
    const second = await git.commit("Change the second line")

    const result = await getCommitPatch(tmpDir, second.commit)
    expect(result.truncated).toBe(false)
    expect(result.patch).toContain("Change the second line")
    expect(result.patch).toContain("diff --git a/file.txt b/file.txt")
    expect(result.patch).toContain("-two")
    expect(result.patch).toContain("+three")
  })

  it("cuts a large patch on a line boundary and flags it", async () => {
    const { tmpDir, git } = await createTempRepo()
    const lines = Array.from({ length: 400 }, (_, index) => `line ${index}`).join("\n")
    await fs.promises.writeFile(path.join(tmpDir, "big.txt"), `${lines}\n`, "utf8")
    await git.add("big.txt")
    const commitResult = await git.commit("Add a big file")

    const result = await getCommitPatch(tmpDir, commitResult.commit, { maxBytes: 600 })
    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.patch, "utf8")).toBeLessThanOrEqual(600)
    expect(result.patch.endsWith("\n")).toBe(true)
  })

  it("rejects an unknown commit", async () => {
    const { tmpDir } = await createTempRepo()
    await expect(getCommitPatch(tmpDir, "deadbeef")).rejects.toThrow()
  })
})

describe("checkoutCommit", () => {
  it("checks out a valid commit and puts the repo in detached HEAD state", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    const result = await checkoutCommit(tmpDir, firstCommit.commit)
    expect(result).toEqual({ success: true })

    const status = await git.status()
    expect(status.detached).toBe(true)
  })

  it("throws an error for an invalid/nonexistent hash", async () => {
    const { tmpDir } = await createTempRepo()
    await expect(checkoutCommit(tmpDir, "invalidhash123")).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// cherryPick
// ---------------------------------------------------------------------------

describe("cherryPick", () => {
  it("cherry-picks a commit that applies cleanly", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "line1\nline2\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")

    await git.checkoutBranch("feature", "HEAD")
    await fs.promises.writeFile(filePath, "line1\nline2\nline3\n", "utf8")
    await git.add("file.txt")
    const featureCommit = await git.commit("Add line3")

    await git.checkout("main")
    const result = await cherryPick(tmpDir, featureCommit.commit)
    expect(result).toEqual({ success: true, conflict: false })

    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("line1\nline2\nline3\n")
  })

  it("returns conflict info when cherry-picking a conflicting commit", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "line1\nline2\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")

    await git.checkoutBranch("feature", "HEAD")
    await fs.promises.writeFile(filePath, "line1\nfeature-line2\n", "utf8")
    await git.add("file.txt")
    const featureCommit = await git.commit("Change line2 in feature")

    await git.checkout("main")
    await fs.promises.writeFile(filePath, "line1\nmain-line2\n", "utf8")
    await git.add("file.txt")
    await git.commit("Change line2 in main")

    const result = await cherryPick(tmpDir, featureCommit.commit)
    expect(result.success).toBe(false)
    expect(result.conflict).toBe(true)
    expect(Array.isArray(result.conflictFiles)).toBe(true)
    expect(result.conflictFiles.length).toBeGreaterThan(0)
  })

  it("throws for an invalid/nonexistent hash", async () => {
    const { tmpDir } = await createTempRepo()
    await expect(cherryPick(tmpDir, "deadbeef00000000")).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// revertCommit
// ---------------------------------------------------------------------------

describe("revertCommit", () => {
  it("reverts a commit and stages the revert changes", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "line1\nline2\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")

    await fs.promises.writeFile(filePath, "line1\nline2\nline3\n", "utf8")
    await git.add("file.txt")
    const changeCommit = await git.commit("Add line3")

    const result = await revertCommit(tmpDir, changeCommit.commit)
    expect(result).toEqual({ success: true, conflict: false })

    const status = await git.status()
    expect(status.staged.length).toBeGreaterThan(0)
    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("line1\nline2\n")
  })

  it("returns conflict info when reverting causes a conflict", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "line1\nline2\nline3\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")

    await fs.promises.writeFile(filePath, "line1\nchanged-a\nline3\n", "utf8")
    await git.add("file.txt")
    const commitA = await git.commit("Change line2 to changed-a")

    await fs.promises.writeFile(filePath, "line1\nchanged-b\nline3\n", "utf8")
    await git.add("file.txt")
    await git.commit("Change line2 to changed-b")

    const result = await revertCommit(tmpDir, commitA.commit)
    expect(result.success).toBe(false)
    expect(result.conflict).toBe(true)
    expect(Array.isArray(result.conflictFiles)).toBe(true)
    expect(result.conflictFiles.length).toBeGreaterThan(0)
  })

  it("throws for an invalid/nonexistent hash", async () => {
    const { tmpDir } = await createTempRepo()
    await expect(revertCommit(tmpDir, "deadbeef00000000")).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// resetToCommit
// ---------------------------------------------------------------------------

describe("resetToCommit", () => {
  it("soft reset moves HEAD without touching the working tree", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second\n", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    const result = await resetToCommit(tmpDir, firstCommit.commit, "soft")
    expect(result).toEqual({ success: true })

    const log = await git.log()
    expect(log.latest.hash).toBe(firstCommit.commit)
    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("second\n")

    const status = await git.status()
    expect(status.staged.length).toBeGreaterThan(0)
  })

  it("mixed reset moves HEAD and unstages changes", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second\n", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    const result = await resetToCommit(tmpDir, firstCommit.commit, "mixed")
    expect(result).toEqual({ success: true })

    const log = await git.log()
    expect(log.latest.hash).toBe(firstCommit.commit)
    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("second\n")

    const status = await git.status()
    expect(status.staged.length).toBe(0)
    expect(status.modified.length).toBeGreaterThan(0)
  })

  it("hard reset with clean working tree succeeds", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second\n", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    const result = await resetToCommit(tmpDir, firstCommit.commit, "hard")
    expect(result).toEqual({ success: true })

    const log = await git.log()
    expect(log.latest.hash).toBe(firstCommit.commit)
    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("first\n")

    const status = await git.status()
    expect(status.isClean()).toBe(true)
  })

  it("hard reset with dirty working tree without force throws", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second\n", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    await fs.promises.writeFile(filePath, "dirty\n", "utf8")

    await expect(resetToCommit(tmpDir, firstCommit.commit, "hard")).rejects.toThrow(
      "Cannot hard reset: uncommitted changes in working tree",
    )
  })

  it("hard reset with dirty working tree with force succeeds", async () => {
    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    const firstCommit = await git.commit("First commit")

    await fs.promises.writeFile(filePath, "second\n", "utf8")
    await git.add("file.txt")
    await git.commit("Second commit")

    await fs.promises.writeFile(filePath, "dirty\n", "utf8")

    const result = await resetToCommit(tmpDir, firstCommit.commit, "hard", true)
    expect(result).toEqual({ success: true })

    const log = await git.log()
    expect(log.latest.hash).toBe(firstCommit.commit)
    const content = await fs.promises.readFile(filePath, "utf8")
    expect(content).toBe("first\n")
  })
})

// ---------------------------------------------------------------------------
// stashes
// ---------------------------------------------------------------------------

describe("countStashFiles", () => {
  it("normalizes duplicate stash refs before counting files", async () => {
    if (!canRunGit()) return

    const { tmpDir, git } = await createTempRepo()
    const filePath = path.join(tmpDir, "file.txt")
    await fs.promises.writeFile(filePath, "first\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")

    await fs.promises.writeFile(filePath, "first\nsecond\n", "utf8")
    await git.raw(["stash", "push", "-m", "test stash"])

    const counts = await countStashFiles(tmpDir, [" stash@{0} ", "", null, "stash@{0}"])

    expect(counts).toEqual({ "stash@{0}": 1 })
  })
})

// ---------------------------------------------------------------------------
// hash validation
// ---------------------------------------------------------------------------

describe("hash validation", () => {
  it("checkoutCommit rejects non-hex hash", async () => {
    await expect(checkoutCommit("/tmp", "--hard")).rejects.toThrow("Invalid commit hash")
  })

  it("checkoutCommit rejects ref name", async () => {
    await expect(checkoutCommit("/tmp", "HEAD")).rejects.toThrow("Invalid commit hash")
  })

  it("checkoutCommit accepts valid 40-char hex format", async () => {
    await expect(checkoutCommit("/tmp", "1234567890abcdef1234567890abcdef12345678")).rejects.not.toThrow(
      "Invalid commit hash",
    )
  })

  it("cherryPick rejects non-hex hash", async () => {
    await expect(cherryPick("/tmp", "--hard")).rejects.toThrow("Invalid commit hash")
  })

  it("cherryPick rejects ref name", async () => {
    await expect(cherryPick("/tmp", "HEAD")).rejects.toThrow("Invalid commit hash")
  })

  it("cherryPick accepts valid 40-char hex format", async () => {
    await expect(cherryPick("/tmp", "1234567890abcdef1234567890abcdef12345678")).rejects.not.toThrow(
      "Invalid commit hash",
    )
  })

  it("revertCommit rejects non-hex hash", async () => {
    await expect(revertCommit("/tmp", "--hard")).rejects.toThrow("Invalid commit hash")
  })

  it("revertCommit rejects ref name", async () => {
    await expect(revertCommit("/tmp", "HEAD")).rejects.toThrow("Invalid commit hash")
  })

  it("revertCommit accepts valid 40-char hex format", async () => {
    await expect(revertCommit("/tmp", "1234567890abcdef1234567890abcdef12345678")).rejects.not.toThrow(
      "Invalid commit hash",
    )
  })

  it("resetToCommit rejects non-hex hash", async () => {
    await expect(resetToCommit("/tmp", "--hard", "soft")).rejects.toThrow("Invalid commit hash")
  })

  it("resetToCommit rejects ref name", async () => {
    await expect(resetToCommit("/tmp", "HEAD", "soft")).rejects.toThrow("Invalid commit hash")
  })

  it("resetToCommit accepts valid 40-char hex format", async () => {
    await expect(resetToCommit("/tmp", "1234567890abcdef1234567890abcdef12345678", "soft")).rejects.not.toThrow(
      "Invalid commit hash",
    )
  })
})

// ---------------------------------------------------------------------------
// checkoutBranch
// ---------------------------------------------------------------------------

describe("checkoutBranch", () => {
  it("turns a remote-tracking branch into the local branch that tracks it", async () => {
    // `git checkout origin/feature` detaches HEAD; a commit made there belongs to no
    // branch, so the remote-tracking name must become a local branch instead.
    const { tmpDir, git } = await createTempRepo()
    await fs.promises.writeFile(path.join(tmpDir, "file.txt"), "one\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")
    // A real remote, so the fetched ref is a genuine remote-tracking branch. The
    // remote branch is pushed from a differently named local one, so no local
    // `feature` exists and the checkout has to create it.
    const remoteDir = createTempDir()
    runGit(remoteDir, ["init", "--bare"])
    await git.addRemote("origin", remoteDir)
    await git.checkoutBranch("feature-source", "HEAD")
    await git.push("origin", "feature-source:refs/heads/feature")
    await git.checkout("main")
    await git.fetch("origin")

    const result = await checkoutBranch(tmpDir, "origin/feature")

    expect(result).toEqual({ success: true, branch: "feature" })
    const status = await git.status()
    expect(status.detached).toBe(false)
    expect((await git.branch()).current).toBe("feature")
    // The local branch tracks the remote-tracking ref it was created from.
    const upstream = await git.raw(["rev-parse", "--abbrev-ref", "feature@{upstream}"])
    expect(upstream.trim()).toBe("origin/feature")
  })

  it("checks out an existing local branch by its remote-tracking name", async () => {
    const { tmpDir, git } = await createTempRepo()
    await fs.promises.writeFile(path.join(tmpDir, "file.txt"), "one\n", "utf8")
    await git.add("file.txt")
    await git.commit("Initial commit")
    await git.checkoutBranch("feature", "HEAD")
    await git.checkout("main")
    await git.raw(["update-ref", "refs/remotes/origin/feature", "refs/heads/feature"])

    const result = await checkoutBranch(tmpDir, "origin/feature")

    expect(result).toEqual({ success: true, branch: "feature" })
    expect((await git.branch()).current).toBe("feature")
  })
})

// ---------------------------------------------------------------------------
// getFileDiff
// ---------------------------------------------------------------------------

describe("getFileDiff", () => {
  const initRepoWithFile = (repo, filePath, content) => {
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.mkdirSync(path.dirname(path.join(repo, filePath)), { recursive: true })
    fs.writeFileSync(path.join(repo, filePath), content)
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])
  }

  it("reads an already-staged deletion as HEAD content against an empty side", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    initRepoWithFile(repo, "gone.txt", "one\ntwo\n")
    runGit(repo, ["rm", "-q", "gone.txt"])

    // `git show :<path>` fails for a staged deletion (`path ... does not exist
    // (neither on disk nor in the index)`), and simple-git's GitError carries no
    // `code`, so the deletion must not be reported as a server failure.
    await expect(getFileDiff(repo, { path: "gone.txt", staged: true })).resolves.toMatchObject({
      original: "one\ntwo\n",
      modified: "",
      isBinary: false,
    })
  })

  it("reads a staged rename's original from its source path", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    initRepoWithFile(repo, "old.txt", "one\ntwo\n")
    runGit(repo, ["mv", "old.txt", "new.txt"])

    // The destination does not exist in HEAD, so reading `HEAD:new.txt` failed and the
    // whole file rendered as added; the original content lives at the rename source.
    await expect(getFileDiff(repo, { path: "new.txt", staged: true })).resolves.toMatchObject({
      original: "one\ntwo\n",
      modified: "one\ntwo\n",
      isBinary: false,
    })
  })
})

// ---------------------------------------------------------------------------
// getStatus diff stats
// ---------------------------------------------------------------------------

describe("getStatus diff stats", () => {
  it("keys a renamed file's numstat counts by its destination path", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.mkdirSync(path.join(repo, "src"), { recursive: true })
    const lines = Array.from({ length: 20 }, (_, index) => `line${index + 1}`).join("\n")
    fs.writeFileSync(path.join(repo, "src/a.ts"), `${lines}\n`)
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])

    fs.mkdirSync(path.join(repo, "lib"), { recursive: true })
    runGit(repo, ["mv", "src/a.ts", "lib/b.ts"])
    fs.writeFileSync(path.join(repo, "lib/b.ts"), `${lines.replace("line3", "LINE3")}\n`)
    runGit(repo, ["add", "-A"])

    const status = await getStatus(repo)

    // git reports the rename as `1\t1\tsrc/a.ts => lib/b.ts` while the file entry's
    // path is the destination, so the raw key would never match and the row would
    // render as "+0 -0".
    expect(status.diffStats.staged["lib/b.ts"]).toEqual({ insertions: 1, deletions: 1 })
    expect(status.diffStats.staged["src/a.ts => lib/b.ts"]).toBeUndefined()
  })

  it("keys non-ASCII paths by their real names instead of git's C-quoted form", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])

    fs.writeFileSync(path.join(repo, "résumé.txt"), "one\ntwo\n")
    fs.writeFileSync(path.join(repo, "naïve.txt"), "one\ntwo\n")
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])

    fs.writeFileSync(path.join(repo, "résumé.txt"), "one\ntwo\nthree\n")
    runGit(repo, ["add", "résumé.txt"])
    fs.writeFileSync(path.join(repo, "naïve.txt"), "one\ntwo\nthree\n")
    fs.writeFileSync(path.join(repo, "日本語.txt"), "a\nb\n")

    const status = await getStatus(repo)

    expect(status.diffStats.staged["résumé.txt"]).toEqual({ insertions: 1, deletions: 0 })
    expect(status.diffStats.working["naïve.txt"]).toEqual({ insertions: 1, deletions: 0 })
    expect(status.diffStats.working["日本語.txt"]).toEqual({ insertions: 2, deletions: 0 })

    // Porcelain v1 C-quotes these as `"r\303\251sum\303\251.txt"`; such a key never
    // matches the file row's real path, so the row rendered "+0 -0".
    const keys = [...Object.keys(status.diffStats.staged), ...Object.keys(status.diffStats.working)]
    expect(keys.filter((key) => key.startsWith('"'))).toEqual([])
  })

  it("keeps a partially staged file's staged and working counts apart", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    const file = "test.txt"
    const filePath = path.join(repo, file)
    fs.writeFileSync(filePath, "one\ntwo\nthree\n")
    runGit(repo, ["add", file])
    runGit(repo, ["commit", "-m", "initial"])

    // Stage one new line, then keep editing without staging another.
    fs.writeFileSync(filePath, "one\ntwo\nthree\nstaged\n")
    runGit(repo, ["add", file])
    fs.writeFileSync(filePath, "one\ntwo\nthree\nstaged\nworking\n")

    const status = await getStatus(repo)

    expect(status.diffStats.staged[file]).toEqual({ insertions: 1, deletions: 0 })
    expect(status.diffStats.working[file]).toEqual({ insertions: 1, deletions: 0 })
  })

  it("scopes untracked files to working stats and staged additions to staged stats", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "tracked.txt"), "tracked\n")
    runGit(repo, ["add", "tracked.txt"])
    runGit(repo, ["commit", "-m", "initial"])

    fs.writeFileSync(path.join(repo, "untracked.txt"), "a\nb\n")
    fs.writeFileSync(path.join(repo, "staged.txt"), "c\nd\ne\n")
    runGit(repo, ["add", "staged.txt"])

    const status = await getStatus(repo)

    expect(status.diffStats.working["untracked.txt"]).toEqual({ insertions: 2, deletions: 0 })
    expect(status.diffStats.staged["staged.txt"]).toEqual({ insertions: 3, deletions: 0 })
    expect(status.diffStats.working["staged.txt"]).toBeUndefined()
  })
})

describe("getStatus content identities", () => {
  const initRepo = () => {
    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    return repo
  }

  it.each([undefined, "light"])("bounds the HEAD read in %s mode without a second status read", async (mode) => {
    if (process.platform === "win32") return // Invocation recording uses a POSIX shell.
    const repo = initRepo()
    const { result, invocations } = await recordGitInvocations(() => getStatus(repo, { mode }))
    expect(result.headOid).toBeNull()
    const headReads = execFile[promisify.custom].mock.calls.filter(
      ([, args, options]) => options?.cwd === fs.realpathSync(repo) && args.join(" ") === "rev-parse --verify HEAD",
    )
    expect(headReads).toHaveLength(1)
    expect(headReads[0][2].timeout).toBe(GIT_STATUS_CONTENT_ID_TIMEOUT_MS)
    expect(invocations.filter((args) => args.startsWith("status "))).toHaveLength(1)
  })

  it.each(["No commits yet on", "Initial commit on"])("allows the first commit with a legacy '%s' status header", async (header) => {
    if (process.platform === "win32") return // The executable shim uses a POSIX shell.
    const repo = initRepo()
    fs.writeFileSync(path.join(repo, "first.txt"), "first\n")
    runGit(repo, ["add", "first.txt"])
    const realGit = resolveRealGit()
    const binDir = createTempDir()
    const logFile = path.join(binDir, "calls.log")
    const wrapper = path.join(binDir, "git")
    fs.writeFileSync(wrapper, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(logFile)}
case "$*" in
  *--porcelain=v2*) echo 'error: unknown option porcelain=v2' >&2; exit 129 ;;
esac
if [ "$1" = "status" ]; then
  printf '## ${header} main\\0A  first.txt\\0'
  exit 0
fi
exec ${JSON.stringify(realGit)} "$@"
`)
    fs.chmodSync(wrapper, 0o755)
    const previousPath = process.env.PATH
    process.env.PATH = `${binDir}${path.delimiter}${previousPath}`
    try {
      const status = await getStatus(repo, { mode: "light" })
      expect(status).toMatchObject({ headOid: null, current: "main" })
      expect(status.files).toContainEqual(expect.objectContaining({ path: "first.txt", indexBlobId: expect.any(String) }))
      expect(fs.readFileSync(logFile, "utf8")).not.toContain("--porcelain=v2")
      await commit(repo, "first commit", { files: ["first.txt"], stageFiles: [] })
      expect(runGit(repo, ["rev-parse", "--verify", "HEAD"]).trim()).toMatch(/^[a-f0-9]{40}$/)
    } finally {
      process.env.PATH = previousPath
    }
  })

  it.each(["read failure", "timeout"])("keeps HEAD unknown after a %s on a branch with commits", async (failure) => {
    if (process.platform === "win32") return // Invocation recording uses a POSIX shell.
    const repo = initRepo()
    runGit(repo, ["commit", "--allow-empty", "-m", "base"])
    const execute = execFile[promisify.custom]
    const original = execute.getMockImplementation()
    execute.mockImplementation((binary, args, options) => {
      if (options.cwd === fs.realpathSync(repo) && args.join(" ") === "rev-parse --verify HEAD") {
        return Promise.reject(Object.assign(new Error(failure), { code: failure === "timeout" ? "ETIMEDOUT" : 128 }))
      }
      return original(binary, args, options)
    })
    try {
      const { result, invocations } = await recordGitInvocations(() => getStatus(repo, { mode: "light" }))
      expect(result.headOid).toBeUndefined()
      expect(invocations.filter((args) => args.startsWith("status "))).toHaveLength(1)
    } finally {
      execute.mockImplementation(original)
    }
  })

  it("reports unborn HEAD and tracks an empty commit independently of file blobs", async () => {
    const repo = initRepo()
    expect((await getStatus(repo)).headOid).toBeNull()
    runGit(repo, ["commit", "--allow-empty", "-m", "first"])
    const first = await getStatus(repo)
    expect(first.headOid).toBe(runGit(repo, ["rev-parse", "HEAD"]).trim())
    runGit(repo, ["commit", "--allow-empty", "-m", "second"])
    const second = await getStatus(repo, { mode: "light" })
    expect(second.headOid).toBe(runGit(repo, ["rev-parse", "HEAD"]).trim())
    expect(second.headOid).not.toBe(first.headOid)
    expect(second.files).toEqual(first.files)
  })

  it("changes the worktree id on a same-count rewrite and the index id when that rewrite is staged", async () => {
    if (!canRunGit()) return

    const repo = initRepo()
    const file = "src/a.ts"
    fs.mkdirSync(path.join(repo, "src"))
    fs.writeFileSync(path.join(repo, file), "one\n")
    runGit(repo, ["add", file])
    runGit(repo, ["commit", "-m", "base"])

    fs.writeFileSync(path.join(repo, file), "two\n")
    const rewritten = await getStatus(repo)
    const row = rewritten.files.find((entry) => entry.path === file)
    const head = runGit(repo, ["rev-parse", `HEAD:${file}`]).trim()
    const worktree = runGit(repo, ["hash-object", "--no-filters", "--", file]).trim()

    expect(row).toMatchObject({
      headBlobId: head,
      indexBlobId: head,
      worktreeBlobId: worktree,
    })
    expect(row.worktreeBlobId).not.toBe(row.indexBlobId)
    expect(JSON.stringify(rewritten)).not.toContain("two\n")
    expect(row.content).toBeUndefined()

    fs.writeFileSync(path.join(repo, file), "six\n")
    const again = await getStatus(repo)
    const againRow = again.files.find((entry) => entry.path === file)
    expect(againRow.worktreeBlobId).not.toBe(worktree)
    expect(againRow.indexBlobId).toBe(head)
    expect(againRow.insertions).toBeUndefined()

    runGit(repo, ["add", file])
    const staged = await getStatus(repo)
    const stagedRow = staged.files.find((entry) => entry.path === file)
    const stagedBlob = runGit(repo, ["rev-parse", `:${file}`]).trim()
    expect(stagedRow.indexBlobId).toBe(stagedBlob)
    expect(stagedRow.indexBlobId).not.toBe(head)
    expect(stagedRow.worktreeBlobId).toBe(stagedBlob)
  })

  it("gives a deleted file no worktree id", async () => {
    if (!canRunGit()) return

    const repo = initRepo()
    fs.writeFileSync(path.join(repo, "gone.txt"), "gone\n")
    runGit(repo, ["add", "gone.txt"])
    runGit(repo, ["commit", "-m", "base"])
    fs.rmSync(path.join(repo, "gone.txt"))

    const status = await getStatus(repo)
    const row = status.files.find((entry) => entry.path === "gone.txt")
    expect(row.working_dir.trim()).toBe("D")
    expect(row.worktreeBlobId).toBeNull()
    expect(row.indexBlobId).toMatch(/^[0-9a-f]{40}$/)
    expect(row.headBlobId).toBe(row.indexBlobId)
    expect(JSON.stringify(status)).not.toContain("gone\n")
  })

  it("skips worktree ids past the size cap and omits identities past the file cap", async () => {
    if (!canRunGit()) return

    expect(GIT_STATUS_CONTENT_ID_MAX_BYTES).toBe(1024 * 1024)
    expect(GIT_STATUS_CONTENT_ID_MAX_FILES).toBe(200)

    const repo = initRepo()
    fs.writeFileSync(path.join(repo, "small.txt"), "a\n")
    fs.writeFileSync(path.join(repo, "big.txt"), Buffer.alloc(GIT_STATUS_CONTENT_ID_MAX_BYTES + 8, 97))
    const sized = await getStatus(repo)
    const small = sized.files.find((entry) => entry.path === "small.txt")
    const big = sized.files.find((entry) => entry.path === "big.txt")
    expect(small.worktreeBlobId).toMatch(/^[0-9a-f]{40}$/)
    expect(big.worktreeBlobId).toBeNull()
    expect(big.headBlobId).toBeNull()
    expect(big.indexBlobId).toBeNull()
    expect(JSON.stringify(sized)).not.toContain("a".repeat(32))

    const capped = createTempDir()
    runGit(capped, ["init", "-b", "main"])
    for (let index = 0; index < GIT_STATUS_CONTENT_ID_MAX_FILES + 1; index += 1) {
      fs.writeFileSync(path.join(capped, `f${String(index).padStart(4, "0")}.txt`), "a\n")
    }
    const status = await getStatus(capped)
    const identified = status.files.filter((entry) => typeof entry.worktreeBlobId === "string")
    const omitted = status.files.filter((entry) => entry.worktreeBlobId === undefined && entry.headBlobId === undefined)
    expect(status.files).toHaveLength(GIT_STATUS_CONTENT_ID_MAX_FILES + 1)
    expect(identified).toHaveLength(GIT_STATUS_CONTENT_ID_MAX_FILES)
    expect(omitted).toHaveLength(1)
    expect(identified.every((entry) => entry.content === undefined)).toBe(true)
  })

  const gitBlob = (bytes) =>
    createHash("sha1").update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest("hex")

  it("hashes a symlink that points outside the repository by its link text, never by the target", async () => {
    if (!canRunGit()) return

    const repo = initRepo()
    const outside = createTempDir()
    const target = path.join(outside, "secret.txt")
    fs.writeFileSync(target, "secret-content\n")
    fs.symlinkSync(target, path.join(repo, "link.txt"))

    const status = await getStatus(repo)
    const link = status.files.find((entry) => entry.path === "link.txt")
    expect(link).toBeTruthy()
    // Git stores a symlink as a blob of its link text; that is the identity, and the target is not read.
    expect(link.worktreeBlobId).toBe(gitBlob(target))
    expect(link.worktreeBlobId).not.toBe(gitBlob("secret-content\n"))
    expect(JSON.stringify(status)).not.toContain("secret-content")
  })

  it("matches git's own blob id for a regular file", async () => {
    if (!canRunGit()) return

    const repo = initRepo()
    fs.writeFileSync(path.join(repo, "plain.txt"), "line one\nline two\n")
    const expected = execFileSync("git", ["-C", repo, "hash-object", "--no-filters", "--", "plain.txt"]).toString().trim()

    const status = await getStatus(repo)
    expect(status.files.find((entry) => entry.path === "plain.txt")?.worktreeBlobId).toBe(expected)
  })

  it("never resolves a quoted, escaped file name to a file outside the repository", async () => {
    if (!canRunGit() || process.platform === "win32") return

    const repo = initRepo()
    const outside = createTempDir()
    const secret = path.join(outside, "target")
    fs.writeFileSync(secret, "outside-content\n")
    // A literal file name that git --stdin-paths would decode as an absolute path to the outside file.
    const crafted = `"${secret.split("/").join("\\057")}"`
    fs.writeFileSync(path.join(repo, crafted), "inside-content\n")

    const status = await getStatus(repo)
    const ids = status.files.map((entry) => entry.worktreeBlobId).filter(Boolean)
    expect(ids).not.toContain(gitBlob("outside-content\n"))
    expect(ids).toContain(gitBlob("inside-content\n"))
  })
})

// ---------------------------------------------------------------------------
// commit with a selection
// ---------------------------------------------------------------------------

describe("commit with selected files", () => {
  it("leaves a file's unstaged edits unstaged when it temporarily unstages it", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "a.txt"), "one\n")
    fs.writeFileSync(path.join(repo, "b.txt"), "b\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "Initial commit"])

    // a.txt is staged with one edit and then edited again without staging it, so its index entry and
    // its worktree differ. b.txt is the file the user asks to commit.
    fs.writeFileSync(path.join(repo, "a.txt"), "one\nstaged\n")
    runGit(repo, ["add", "a.txt"])
    fs.writeFileSync(path.join(repo, "a.txt"), "one\nstaged\nunstaged\n")
    fs.writeFileSync(path.join(repo, "b.txt"), "b\nchanged\n")
    runGit(repo, ["add", "b.txt"])

    const stagedBlobBefore = runGit(repo, ["rev-parse", ":a.txt"]).trim()

    const result = await commit(repo, "Only b", { files: ["b.txt"], stageFiles: ["b.txt"] })

    expect(result.success).toBe(true)
    // `git add` used to restore a.txt, which staged the worktree content: the edits the user left
    // unstaged were folded into the index and swept into the next commit.
    expect(runGit(repo, ["rev-parse", ":a.txt"]).trim()).toBe(stagedBlobBefore)
    expect(runGit(repo, ["status", "--porcelain", "--", "a.txt"]).trim()).toBe("MM a.txt")
    expect(runGit(repo, ["diff", "--", "a.txt"])).toContain("unstaged")
  })

  it("keeps a staged deletion staged when another file is committed", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n")
    fs.writeFileSync(path.join(repo, "b.txt"), "b\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "Initial commit"])

    // The user staged a deletion and selected only b.txt to commit.
    runGit(repo, ["rm", "a.txt"])
    fs.writeFileSync(path.join(repo, "b.txt"), "b\nchanged\n")
    runGit(repo, ["add", "b.txt"])

    await commit(repo, "Only b", { files: ["b.txt"], stageFiles: ["b.txt"] })

    // Unstaging it for the commit and re-staging it from an index entry cannot work for a deletion —
    // there is no entry to read — so the deletion came back unstaged and the next commit lost it.
    expect(runGit(repo, ["status", "--porcelain"]).trim()).toContain("D  a.txt")
    expect(runGit(repo, ["show", "--name-only", "--format=", "HEAD"]).trim()).toBe("b.txt")
  })

  it("commits a file whose name looks like a git option", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "--amend"), "one\n")
    runGit(repo, ["add", "--", "--amend"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    fs.writeFileSync(path.join(repo, "--amend"), "two\n")

    const result = await commit(repo, "Only the option-like file", { files: ["--amend"] })

    expect(result.success).toBe(true)
    // Without `--`, git parsed the path as --amend and rewrote the initial commit.
    expect(runGit(repo, ["rev-list", "--count", "HEAD"]).trim()).toBe("2")
    expect(runGit(repo, ["log", "-1", "--format=%s"]).trim()).toBe("Only the option-like file")
    expect(runGit(repo, ["show", "HEAD:--amend"]).trim()).toBe("two")
  })

  it("keeps a staged addition staged when another file is committed", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n")
    fs.writeFileSync(path.join(repo, "b.txt"), "b\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "Initial commit"])

    // The user staged a new file and selected only b.txt to commit.
    fs.writeFileSync(path.join(repo, "new.txt"), "fresh\n")
    runGit(repo, ["add", "new.txt"])
    fs.writeFileSync(path.join(repo, "b.txt"), "b\nchanged\n")
    runGit(repo, ["add", "b.txt"])

    await commit(repo, "Only b", { files: ["b.txt"], stageFiles: ["b.txt"] })

    // `update-index --cacheinfo` without `--add` cannot restore an entry that unstaging
    // removed, and the logged failure silently left the addition untracked.
    expect(runGit(repo, ["status", "--porcelain"]).trim()).toContain("A  new.txt")
    expect(runGit(repo, ["show", "--name-only", "--format=", "HEAD"]).trim()).toBe("b.txt")
  })
})

describe("getCommitFiles rename handling", () => {
  it("reports a renamed file's destination path so its diff can be loaded", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.mkdirSync(path.join(repo, "src"), { recursive: true })
    fs.writeFileSync(path.join(repo, "src/a.ts"), "line1\nline2\n")
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])

    fs.mkdirSync(path.join(repo, "lib"), { recursive: true })
    runGit(repo, ["mv", "src/a.ts", "lib/b.ts"])
    runGit(repo, ["commit", "-m", "rename"])

    const [hash] = runGit(repo, ["rev-parse", "HEAD"]).trim().split("\n")
    const { files } = await getCommitFiles(repo, hash)
    const renamed = files.find((file) => file.changeType === "R")

    // `git show --numstat` reports the rename as `src/{a.ts => b.ts}` (or `a.ts => b.ts`), which is not
    // a path: the history view handed it to `commit-file-diff` and every renamed file answered 500.
    expect(renamed?.path).toBe("lib/b.ts")
    await expect(getCommitFileDiff(repo, hash, renamed.path, false)).resolves.toMatchObject({ isBinary: false })
  })

  it("returns a non-ASCII path raw so its diff can be loaded", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "résumé.txt"), "one\n")
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])

    fs.writeFileSync(path.join(repo, "résumé.txt"), "one\ntwo\n")
    runGit(repo, ["commit", "-am", "edit"])

    const [hash] = runGit(repo, ["rev-parse", "HEAD"]).trim().split("\n")
    const { files } = await getCommitFiles(repo, hash)

    // Without `-z` git C-quotes the path (`"r\303\251sum\303\251.txt"`), which is not a path:
    // the history view showed it garbled and `commit-file-diff` answered "Invalid file path".
    expect(files).toEqual([expect.objectContaining({ path: "résumé.txt", insertions: 1, deletions: 0 })])
    await expect(getCommitFileDiff(repo, hash, "résumé.txt", false)).resolves.toMatchObject({
      original: "one\n",
      modified: "one\ntwo\n",
      isBinary: false,
    })
  })

  it("reports a non-ASCII renamed destination and reads its original from the source", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "old.txt"), "one\ntwo\n")
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])

    runGit(repo, ["mv", "old.txt", "résumé.txt"])
    runGit(repo, ["commit", "-m", "rename"])

    const [hash] = runGit(repo, ["rev-parse", "HEAD"]).trim().split("\n")
    const { files } = await getCommitFiles(repo, hash)
    const renamed = files.find((file) => file.changeType === "R")

    expect(renamed?.path).toBe("résumé.txt")
    await expect(getCommitFileDiff(repo, hash, renamed.path, false)).resolves.toMatchObject({
      original: "one\ntwo\n",
      modified: "one\ntwo\n",
      isBinary: false,
    })
  })
})

describe("checkoutBranch target validation", () => {
  it("refuses a path and an option instead of letting git reinterpret them", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "notes.txt"), "committed\n")
    runGit(repo, ["add", "-A"])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["branch", "feature"])

    // `git checkout notes.txt` is a pathspec: it restores the file from the index and drops the edit,
    // while the route reported a branch checkout.
    fs.writeFileSync(path.join(repo, "notes.txt"), "uncommitted edit\n")
    await expect(checkoutBranch(repo, "notes.txt")).rejects.toThrow(/No branch or revision named/)
    expect(fs.readFileSync(path.join(repo, "notes.txt"), "utf8")).toBe("uncommitted edit\n")

    await expect(checkoutBranch(repo, "-f")).rejects.toThrow(/No branch or revision named/)

    // A real branch still switches.
    await expect(checkoutBranch(repo, "feature")).resolves.toMatchObject({ success: true, branch: "feature" })
    expect(runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("feature")
  })
})

describe("continueRebase with unresolved conflicts", () => {
  it("reports the conflict instead of claiming the rebase continued", async () => {
    if (!canRunGit()) return

    // simple-git's own `rebase()` resolves even when git refuses the step (it answers the failure text as
    // its value), so the try/catch around it never saw a conflict: the panel was told the rebase had
    // continued while the repository stayed stopped, with no conflict list to resolve.
    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "other"])
    fs.writeFileSync(path.join(repo, "f.txt"), "other\n")
    runGit(repo, ["commit", "-am", "other"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "main"])
    expect(() => runGit(repo, ["rebase", "other"])).toThrow()

    const result = await continueRebase(repo)

    expect(result).toMatchObject({ success: false, conflict: true })
    expect(result.conflictFiles).toContain("f.txt")
    expect(runGit(repo, ["status", "--porcelain"]).trim()).toContain("UU f.txt")
  })
})

describe("continueRebase on a conflicted commit whose subject reads as an empty step", () => {
  it("keeps reporting the conflict instead of skipping the commit", async () => {
    if (!canRunGit()) return

    // git quotes the commit it failed to apply in the same message the empty-step check reads, so a
    // subject carrying one of those phrases made the panel run `rebase --skip`: the user's conflicting
    // commit was dropped and the answer said everything was fine.
    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "other"])
    fs.writeFileSync(path.join(repo, "f.txt"), "other\n")
    runGit(repo, ["commit", "-am", "other"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "handle no changes in the diff view"])

    expect(() => runGit(repo, ["rebase", "other"])).toThrow()

    const result = await continueRebase(repo)

    expect(result).toMatchObject({ success: false, conflict: true })
    expect(result.conflictFiles).toContain("f.txt")
    // Still stopped on the conflict, not advanced past it.
    expect(runGit(repo, ["status", "--porcelain"]).trim()).toContain("UU f.txt")
  })
})

describe("continueRebase on a step that resolved to nothing", () => {
  it("skips the empty step instead of reporting a conflict that is gone", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    // The apply backend answers the empty step with git's conflict hint in front of it ("Resolve all
    // conflicts manually"), which the panel read as a conflict that is still there.
    runGit(repo, ["config", "rebase.backend", "apply"])
    fs.writeFileSync(path.join(repo, "f.txt"), "base\n")
    runGit(repo, ["add", "."])
    runGit(repo, ["commit", "-m", "base"])
    runGit(repo, ["checkout", "-b", "other"])
    fs.writeFileSync(path.join(repo, "f.txt"), "other\n")
    runGit(repo, ["commit", "-am", "other"])
    runGit(repo, ["checkout", "main"])
    fs.writeFileSync(path.join(repo, "f.txt"), "main\n")
    runGit(repo, ["commit", "-am", "main"])

    expect(() => runGit(repo, ["rebase", "other"])).toThrow()
    // Resolve the conflict to the upstream content: the step has nothing left to apply.
    runGit(repo, ["checkout", "--ours", "f.txt"])
    runGit(repo, ["add", "f.txt"])

    await expect(continueRebase(repo)).resolves.toMatchObject({ success: true, conflict: false })

    // The rebase advanced to the end instead of staying stopped on a conflict that no longer exists.
    expect(fs.existsSync(path.join(repo, ".git", "rebase-apply"))).toBe(false)
    expect(fs.existsSync(path.join(repo, ".git", "rebase-merge"))).toBe(false)
    expect(runGit(repo, ["status", "--porcelain"]).trim()).toBe("")
  })
})

// ---------------------------------------------------------------------------
// stageHunk / unstageHunk
// ---------------------------------------------------------------------------

// The UI splits the file's unified diff into single-hunk patches the same way
// before handing one to stageHunk/unstageHunk.
const extractHunkPatch = (diffText, hunkIndex) => {
  const lines = String(diffText).split("\n")
  const firstHunkLine = lines.findIndex((line) => line.startsWith("@@ "))
  if (firstHunkLine === -1) return null
  const headerLines = lines.slice(0, firstHunkLine)
  const hunks = []
  for (const line of lines.slice(firstHunkLine)) {
    if (line.startsWith("@@ ")) hunks.push([line])
    else if (hunks.length > 0) hunks[hunks.length - 1].push(line)
  }
  const hunk = hunks[hunkIndex]
  if (!hunk) return null
  while (hunk.length > 0 && hunk[hunk.length - 1] === "") hunk.pop()
  return `${headerLines.join("\n")}\n${hunk.join("\n")}\n`
}

const createHunkTestRepo = () => {
  const repo = createTempDir()
  runGit(repo, ["init", "-b", "main"])
  runGit(repo, ["config", "user.email", "test@example.com"])
  runGit(repo, ["config", "user.name", "Test User"])
  return repo
}

const writeTwoEditFile = (repo) => {
  const lines = Array.from({ length: 30 }, (_, index) => `line${index + 1}`)
  fs.writeFileSync(path.join(repo, "file.txt"), `${lines.join("\n")}\n`)
  runGit(repo, ["add", "file.txt"])
  runGit(repo, ["commit", "-m", "base"])

  const modified = [...lines]
  modified[1] = "line2-edited"
  modified[25] = "line26-edited"
  fs.writeFileSync(path.join(repo, "file.txt"), `${modified.join("\n")}\n`)
  return path.join(repo, "file.txt")
}

describe("stageHunk and unstageHunk", () => {
  it("stages a single hunk without staging the rest of the file", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const filePath = writeTwoEditFile(repo)

    const diffText = runGit(repo, ["diff", "--unified=4", "--", "file.txt"])
    const patch = extractHunkPatch(diffText, 0)
    expect(patch).toContain("line2-edited")

    await stageHunk(repo, "file.txt", patch)

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", "file.txt"])
    expect(staged).toContain("+line2-edited")
    expect(staged).not.toContain("line26-edited")
    const unstaged = runGit(repo, ["diff", "--unified=0", "--", "file.txt"])
    expect(unstaged).toContain("+line26-edited")
    expect(unstaged).not.toContain("+line2-edited")
    // Staging a hunk rewrites the index only; the worktree keeps both edits.
    expect(fs.readFileSync(filePath, "utf8")).toContain("line26-edited")
  })

  it("stages a hunk whose body contains lines that look like file headers", async () => {
    // A removed `-- old` line directly above the added `++ new` line that replaces it renders as
    // `--- old` / `+++ new`, which the one-header-pair guard read as a second file header: it rejected a patch
    // that targets nothing but file.txt with "Patch does not target file.txt".
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const lines = Array.from({ length: 30 }, (_, index) => `line${index + 1}`)
    lines[1] = "-- old"
    fs.writeFileSync(path.join(repo, "file.txt"), `${lines.join("\n")}\n`)
    runGit(repo, ["add", "file.txt"])
    runGit(repo, ["commit", "-m", "base"])

    const modified = [...lines]
    modified[1] = "++ new"
    modified[25] = "line26-edited"
    fs.writeFileSync(path.join(repo, "file.txt"), `${modified.join("\n")}\n`)

    const diffText = runGit(repo, ["diff", "--unified=4", "--", "file.txt"])
    const patch = extractHunkPatch(diffText, 0)
    expect(patch).toContain("--- old")
    expect(patch).toContain("+++ new")

    await stageHunk(repo, "file.txt", patch)

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", "file.txt"])
    expect(staged).toContain("+++ new")
    expect(staged).not.toContain("line26-edited")
    const unstaged = runGit(repo, ["diff", "--unified=0", "--", "file.txt"])
    expect(unstaged).toContain("line26-edited")
  })

  it("stages a hunk of a file whose name git quotes in the patch header", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const name = "café notes.txt"
    const lines = Array.from({ length: 30 }, (_, index) => `line${index + 1}`)
    fs.writeFileSync(path.join(repo, name), `${lines.join("\n")}\n`)
    runGit(repo, ["add", name])
    runGit(repo, ["commit", "-m", "base"])
    const modified = [...lines]
    modified[1] = "line2-edited"
    modified[25] = "line26-edited"
    fs.writeFileSync(path.join(repo, name), `${modified.join("\n")}\n`)

    const diffText = runGit(repo, ["-c", "core.quotePath=true", "diff", "--unified=4", "--", name])
    expect(diffText).toContain('+++ "b/caf\\303\\251 notes.txt"')
    await stageHunk(repo, name, extractHunkPatch(diffText, 0))

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", name])
    expect(staged).toContain("+line2-edited")
    expect(staged).not.toContain("line26-edited")
  })

  it("unstages a single staged hunk, leaving the other one staged", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const filePath = writeTwoEditFile(repo)
    runGit(repo, ["add", "file.txt"])

    const cachedDiff = runGit(repo, ["diff", "--cached", "--unified=4", "--", "file.txt"])
    const patch = extractHunkPatch(cachedDiff, 1)
    expect(patch).toContain("line26-edited")

    await unstageHunk(repo, "file.txt", patch)

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", "file.txt"])
    expect(staged).toContain("+line2-edited")
    expect(staged).not.toContain("+line26-edited")
    const unstaged = runGit(repo, ["diff", "--unified=0", "--", "file.txt"])
    expect(unstaged).toContain("+line26-edited")
    // Unstaging a hunk rewrites the index only; the worktree keeps both edits.
    expect(fs.readFileSync(filePath, "utf8")).toContain("line2-edited")
  })

  it("stages part of a new (untracked) file", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    runGit(repo, ["commit", "--allow-empty", "-m", "base"])
    fs.writeFileSync(path.join(repo, "new.txt"), "alpha\nbeta\ngamma\ndelta\n")

    const patch = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+alpha",
      "+beta",
      "",
    ].join("\n")

    await stageHunk(repo, "new.txt", patch)

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", "new.txt"])
    expect(staged).toContain("+alpha")
    expect(staged).toContain("+beta")
    expect(staged).not.toContain("+delta")
    const unstaged = runGit(repo, ["diff", "--unified=0", "--", "new.txt"])
    expect(unstaged).toContain("+gamma")
    expect(unstaged).toContain("+delta")
  })

  it("rejects a hunk path outside the repository before invoking git", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)

    await expect(stageHunk(repo, "../secret.txt", "@@ -1 +1 @@\n-a\n+b\n")).rejects.toThrow(
      "Path is outside repository: ../secret.txt",
    )
  })

  it("rejects a patch whose post-image targets a different file", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)

    const patch = [
      "diff --git a/other.txt b/other.txt",
      "--- a/other.txt",
      "+++ b/other.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "",
    ].join("\n")

    await expect(stageHunk(repo, "file.txt", patch)).rejects.toThrow("Patch does not target file.txt")
  })

  it("rejects a patch that also carries another file's section", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "diff --git a/other.txt b/other.txt",
      "--- a/other.txt",
      "+++ b/other.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "",
    ].join("\n")

    await expect(stageHunk(repo, "file.txt", patch)).rejects.toThrow("Patch does not target file.txt")
  })

  it("rejects a second file section that carries no diff --git line", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)
    // One `diff --git` line, so counting those is satisfied, but the patch still declares a second file section
    // and `git apply` would stage or unstage a hunk of it.
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "--- a/other.txt",
      "+++ b/other.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "",
    ].join("\n")

    await expect(stageHunk(repo, "file.txt", patch)).rejects.toThrow("Patch does not target file.txt")
  })

  it("rejects a second file section behind a hunk whose body is mostly context", async () => {
    // The hunk's two counts are not a single total to drain: its 6 context lines are in both counts, so draining
    // old+new ran 6 lines past the body, swallowed the `--- a/other.txt` / `+++ b/other.txt` pair below and left
    // the guard counting one section — `git apply` then staged a hunk of other.txt as well.
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const lines = Array.from({ length: 10 }, (_, index) => `line${index + 1}`)
    fs.writeFileSync(path.join(repo, "file.txt"), `${lines.join("\n")}\n`)
    fs.writeFileSync(path.join(repo, "other.txt"), "x\n")
    runGit(repo, ["add", "file.txt", "other.txt"])
    runGit(repo, ["commit", "-m", "base"])

    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,7 +1,7 @@",
      " line1",
      "-line2",
      "+line2-edited",
      " line3",
      " line4",
      " line5",
      " line6",
      " line7",
      "--- a/other.txt",
      "+++ b/other.txt",
      "@@ -1,1 +1,1 @@",
      "-x",
      "+y",
      "",
    ].join("\n")

    await expect(stageHunk(repo, "file.txt", patch)).rejects.toThrow("Patch does not target file.txt")
    expect(runGit(repo, ["diff", "--cached", "--", "other.txt"])).toBe("")
  })

  it("stages a later hunk whose body lines look like a file header", async () => {
    // The same over-drain read this second hunk's `--- a` / `+++ b` body lines as a second file section, so a
    // patch that targets nothing but file.txt was rejected with "Patch does not target file.txt".
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    const fileLines = [...Array.from({ length: 24 }, (_, index) => `line${index + 1}`), "-- a", "line26"]
    expect(fileLines).toHaveLength(26)
    fs.writeFileSync(path.join(repo, "file.txt"), `${fileLines.join("\n")}\n`)
    runGit(repo, ["add", "file.txt"])
    runGit(repo, ["commit", "-m", "base"])

    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,7 +1,7 @@",
      " line1",
      "-line2",
      "+line2-edited",
      " line3",
      " line4",
      " line5",
      " line6",
      " line7",
      "@@ -20,7 +20,7 @@",
      " line20",
      " line21",
      " line22",
      " line23",
      " line24",
      "--- a",
      "+++ b",
      " line26",
      "",
    ].join("\n")

    await stageHunk(repo, "file.txt", patch)

    const staged = runGit(repo, ["diff", "--cached", "--unified=0", "--", "file.txt"])
    expect(staged).toContain("+line2-edited")
    expect(staged).toContain("+++ b")
  })

  it("rejects an empty patch payload", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)

    await expect(stageHunk(repo, "file.txt", "   ")).rejects.toThrow("patch are required")
  })

  it("rejects a patch that no longer applies", async () => {
    if (!canRunGit()) return
    const repo = createHunkTestRepo()
    writeTwoEditFile(repo)

    const patch = [
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,3 +1,3 @@",
      "-context-alpha",
      "+rewritten",
      " context-beta",
      " context-gamma",
      "",
    ].join("\n")

    await expect(stageHunk(repo, "file.txt", patch)).rejects.toThrow()
  })
})

describe("push publish path", () => {
  it("surfaces a rejected publish push instead of swallowing it into the generic path", async () => {
    if (!canRunGit()) return

    const origin = createTempDir()
    runGit(origin, ["init", "--bare", "-b", "main"])

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])
    runGit(repo, ["remote", "add", "origin", origin])
    // A branch without an upstream takes the publish path (push --set-upstream).
    runGit(repo, ["checkout", "-b", "feature"])

    // Every push of the branch is rejected, and each attempt is counted. The
    // publish push used to share the status-read try/catch, so its rejection
    // was logged as a failed status read and re-attempted by the generic and
    // missing-upstream paths: three remote attempts for one user action.
    const attemptFile = path.join(createTempDir(), "attempts.txt")
    const hook = path.join(origin, "hooks", "pre-receive")
    fs.writeFileSync(
      hook,
      `#!/bin/sh\necho attempt >> ${JSON.stringify(attemptFile)}\necho "rejected by test hook" >&2\nexit 1\n`,
    )
    fs.chmodSync(hook, 0o755)

    await expect(push(repo, { remote: "origin" })).rejects.toThrow(/rejected by test hook/)

    const attempts = fs.existsSync(attemptFile) ? fs.readFileSync(attemptFile, "utf8").trim().split("\n") : []
    expect(attempts).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Runtime-owned worktrees (ADR-020, runtime worktree migration v1)
// ---------------------------------------------------------------------------

const resolveRealGit = () => {
  if (process.platform === "win32") return "git"
  return execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim()
}

const initWorktreeRepo = () => {
  const repo = createTempDir()
  runGit(repo, ["init", "-b", "main"])
  runGit(repo, ["config", "user.email", "test@example.com"])
  runGit(repo, ["config", "user.name", "Test User"])
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
  runGit(repo, ["add", "README.md"])
  runGit(repo, ["commit", "-m", "Initial commit"])
  return repo
}

/**
 * A stand-in for the runtime's `worktree` SDK namespace. It records every call and performs the git
 * work the runtime would, through the absolute git binary, so the recording git wrapper on PATH sees
 * only what the Desktop service itself runs.
 */
const createStubRuntime = (options = {}) => {
  const realGit = resolveRealGit()
  const dataRoot = createTempDir()
  const calls = { create: [], remove: [], directories: [] }
  const ownedBranches = new Set()
  const client = {
    worktree: {
      async create(params) {
        calls.create.push(params)
        if (options.createResult) return options.createResult(params)
        const input = params.worktreeCreateInput
        const name = String(input.name || "stub")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
        const directory = path.join(dataRoot, name)
        const branch = input.existingBranch || input.branch || `ax-code/${name}`
        const args = input.existingBranch
          ? ["worktree", "add", directory, input.existingBranch]
          : ["worktree", "add", "-b", branch, directory, ...(input.startRef ? [input.startRef] : [])]
        execFileSync(realGit, args, { cwd: params.directory, stdio: "ignore" })
        if (!input.existingBranch) ownedBranches.add(branch)
        options.beforeCreateAnswers?.(directory)
        return { data: { name, branch, directory } }
      },
      async remove(params) {
        calls.remove.push(params)
        if (options.removeResult) return options.removeResult(params)
        const target = params.worktreeRemoveInput.directory
        const branch = execFileSync(realGit, ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: target, encoding: "utf8" }).trim()
        execFileSync(realGit, ["worktree", "remove", "--force", target], { cwd: params.directory, stdio: "ignore" })
        // Like the runtime (ADR-260): a branch marked borrowed is never deleted.
        let borrowed = ""
        try {
          borrowed = execFileSync(realGit, ["config", "--get", `branch.${branch}.axCodeBorrowed`], {
            cwd: params.directory,
            encoding: "utf8",
          }).trim()
        } catch {}
        if (ownedBranches.has(branch) && borrowed !== branch) {
          execFileSync(realGit, ["branch", "-D", branch], { cwd: params.directory, stdio: "ignore" })
        }
        return { data: true }
      },
    },
  }
  return {
    calls,
    dataRoot,
    getWorktreeClient: (directory) => {
      calls.directories.push(directory)
      return client
    },
  }
}

/** Run `fn` with a `git` on PATH that logs each invocation's arguments, and return those lines. */
const recordGitInvocations = async (fn) => {
  const realGit = resolveRealGit()
  const binDir = createTempDir()
  const logFile = path.join(createTempDir(), "git.log")
  fs.writeFileSync(logFile, "")
  const wrapper = path.join(binDir, "git")
  fs.writeFileSync(wrapper, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(logFile)}\nexec ${JSON.stringify(realGit)} "$@"\n`)
  fs.chmodSync(wrapper, 0o755)
  const previousPath = process.env.PATH
  process.env.PATH = `${binDir}${path.delimiter}${previousPath}`
  try {
    const result = await fn()
    return { result, invocations: fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean) }
  } finally {
    process.env.PATH = previousPath
  }
}

describe("createWorktree through the runtime", () => {
  it("maps a new worktree to a runtime create with its branch and start ref", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    runGit(repo, ["branch", "base"])
    const runtime = createStubRuntime()

    const created = await createWorktree(
      repo,
      { mode: "new", worktreeName: "Feature One", branchName: "feature/one", startRef: "base", startCommand: " pnpm i " },
      runtime,
    )

    expect(runtime.calls.create).toEqual([
      {
        directory: fs.realpathSync(repo),
        worktreeCreateInput: {
          name: "Feature One",
          branch: "feature/one",
          startRef: "base",
          startCommand: "pnpm i",
          operationId: expect.any(String),
        },
      },
    ])
    expect(created).toEqual({
      head: runGit(repo, ["rev-parse", "base"]).trim(),
      name: "feature-one",
      branch: "feature/one",
      path: path.join(runtime.dataRoot, "feature-one"),
    })
  })

  it("leaves the branch and start ref to the runtime when none is asked for", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()

    const created = await createWorktree(repo, { mode: "new", worktreeName: "plain", startRef: "HEAD" }, runtime)

    expect(runtime.calls.create[0].worktreeCreateInput).toEqual({ name: "plain", operationId: expect.any(String) })
    expect(created.branch).toBe("ax-code/plain")
  })

  it("borrows an existing local branch", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    runGit(repo, ["branch", "topic"])
    const runtime = createStubRuntime()

    const created = await createWorktree(repo, { mode: "existing", existingBranch: "topic", worktreeName: "t" }, runtime)

    expect(runtime.calls.create[0].worktreeCreateInput).toEqual({
      name: "t",
      existingBranch: "topic",
      operationId: expect.any(String),
    })
    expect(created.branch).toBe("topic")
  })

  it("starts a new local branch from a remote branch and sets its upstream after the create", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const remote = createTempDir()
    runGit(remote, ["init", "--bare", "-b", "main"])
    runGit(repo, ["remote", "add", "origin", remote])
    runGit(repo, ["branch", "remote-only"])
    runGit(repo, ["push", "-q", "origin", "remote-only"])
    runGit(repo, ["branch", "-D", "remote-only"])
    const runtime = createStubRuntime()

    const created = await createWorktree(
      repo,
      { mode: "existing", existingBranch: "origin/remote-only", worktreeName: "r", setUpstream: true },
      runtime,
    )

    expect(runtime.calls.create[0].worktreeCreateInput).toEqual({
      name: "r",
      branch: "remote-only",
      startRef: "origin/remote-only",
      operationId: expect.any(String),
    })
    expect(runGit(created.path, ["rev-parse", "--abbrev-ref", "remote-only@{upstream}"]).trim()).toBe(
      "origin/remote-only",
    )
  })

  it("sends a fresh operation ID with every create", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()

    await createWorktree(repo, { mode: "new", worktreeName: "first" }, runtime)
    await createWorktree(repo, { mode: "new", worktreeName: "second" }, runtime)

    const [first, second] = runtime.calls.create.map((call) => call.worktreeCreateInput.operationId)
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThanOrEqual(128)
    expect(second).not.toBe(first)
  })

  it.each([
    [{ name: "WorktreeCreateFailedError", message: "Branch feat already exists", status: 400 }],
    [{ name: "WorktreeCreateFailedError", data: { message: "Branch feat already exists" } }],
  ])("surfaces the runtime's refusal (%o)", async (error) => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime({ createResult: () => ({ error, response: { status: 400 } }) })

    await expect(createWorktree(repo, { mode: "new", branchName: "feat" }, runtime)).rejects.toThrow(
      "Branch feat already exists",
    )
  })

  it("refuses to create a worktree without a runtime client", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()

    await expect(createWorktree(repo, { mode: "new" })).rejects.toThrow(/runtime is not available/)
  })

  it("creates from a bare repository, which the runtime is asked about directly", async () => {
    if (!canRunGit()) return
    const source = initWorktreeRepo()
    // A bare checkout answers `rev-parse --show-toplevel` with "fatal: this operation must be run in a
    // work tree", which the worktree context used to read as "not a repository".
    const bare = createTempDir()
    runGit(bare, ["init", "--bare", "-b", "main"])
    runGit(source, ["remote", "add", "origin", bare])
    runGit(source, ["push", "-q", "origin", "main"])
    const runtime = createStubRuntime()

    const created = await createWorktree(bare, { mode: "new", branchName: "feature/bare", worktreeName: "bare-wt" }, runtime)

    expect(fs.realpathSync(runtime.calls.create[0].directory)).toBe(fs.realpathSync(bare))
    // Listing ran from the bare repository, which lists itself as a worktree: it has none to check out
    // and must not be offered as one, while the worktree just created must be.
    const listed = (await getWorktrees(bare)).map((entry) => fs.realpathSync(entry.path))
    expect(listed).toContain(fs.realpathSync(created.path))
    expect(listed).not.toContain(fs.realpathSync(bare))
  })

  it("runs no git worktree add itself", async () => {
    if (!canRunGit() || process.platform === "win32") return
    const repo = initWorktreeRepo()
    runGit(repo, ["branch", "topic"])
    const runtime = createStubRuntime()

    const { invocations } = await recordGitInvocations(async () => {
      await createWorktree(repo, { mode: "new", worktreeName: "a", branchName: "feature/a" }, runtime)
      await createWorktree(repo, { mode: "existing", existingBranch: "topic", worktreeName: "b" }, runtime)
    })

    expect(invocations.length).toBeGreaterThan(0)
    expect(invocations.filter((line) => line.startsWith("worktree add"))).toEqual([])
    expect(runtime.calls.create).toHaveLength(2)
  })

  it("previews the name and branch without guessing the runtime's path", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()

    expect(await previewWorktreeCreate(repo, { mode: "new", worktreeName: "My Change" })).toEqual({
      name: "my-change",
      branch: "ax-code/my-change",
      path: "",
    })
    expect(await previewWorktreeCreate(repo, { mode: "new", worktreeName: "x", branchName: "feat/x" })).toEqual({
      name: "x",
      branch: "feat/x",
      path: "",
    })
  })
})

describe("worktree bootstrap status from runtime events", () => {
  it("is pending after the create and ready on worktree.ready", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "ready-wt" }, runtime)

    expect((await getWorktreeBootstrapStatus(created.path)).status).toBe("pending")

    // Another directory's event changes nothing.
    recordWorktreeRuntimeEvent({ directory: repo, payload: { type: "worktree.ready", properties: {} } })
    expect((await getWorktreeBootstrapStatus(created.path)).status).toBe("pending")

    expect(
      recordWorktreeRuntimeEvent({
        directory: created.path,
        payload: { type: "worktree.ready", properties: { name: created.name, branch: created.branch } },
      }),
    ).toBe(true)
    expect(await getWorktreeBootstrapStatus(created.path)).toMatchObject({ status: "ready", error: null })
  })

  it("is failed with the runtime's message on worktree.failed", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "failed-wt" }, runtime)

    recordWorktreeRuntimeEvent({
      directory: created.path,
      payload: { type: "worktree.failed", properties: { message: "Worktree start command failed" } },
    })

    expect(await getWorktreeBootstrapStatus(created.path)).toMatchObject({
      status: "failed",
      error: "Worktree start command failed",
    })
  })

  it("keeps an event that arrived before the create answered", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime({
      beforeCreateAnswers: (directory) =>
        recordWorktreeRuntimeEvent({
          directory,
          payload: { type: "worktree.failed", properties: { message: "Failed to populate worktree" } },
        }),
    })

    const created = await createWorktree(repo, { mode: "new", worktreeName: "early-wt" }, runtime)

    expect(await getWorktreeBootstrapStatus(created.path)).toMatchObject({
      status: "failed",
      error: "Failed to populate worktree",
    })
  })

  it("answers ready for a directory it never created", async () => {
    expect((await getWorktreeBootstrapStatus(path.join(os.tmpdir(), "never-created-worktree"))).status).toBe("ready")
  })
})

describe("removeWorktree through the runtime", () => {
  it("asks the runtime to remove the worktree for the primary checkout", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "gone" }, runtime)

    const result = await removeWorktree(repo, { directory: created.path }, runtime)

    expect(result).toBe(true)
    expect(runtime.calls.remove).toEqual([
      { directory: fs.realpathSync(repo), worktreeRemoveInput: { directory: created.path } },
    ])
    expect(fs.existsSync(created.path)).toBe(false)
    // A re-created worktree at this path starts from a fresh status.
    expect((await getWorktreeBootstrapStatus(created.path)).status).toBe("ready")
  })

  it("reports the branch the runtime kept when the local branch was to be deleted", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    runGit(repo, ["branch", "users-branch"])
    const runtime = createStubRuntime()
    const created = await createWorktree(
      repo,
      { mode: "existing", existingBranch: "users-branch", worktreeName: "borrowed" },
      runtime,
    )

    const result = await removeWorktree(repo, { directory: created.path, deleteLocalBranch: true }, runtime)

    // The runtime keeps a borrowed branch; the user's explicit request deletes it.
    expect(result).toBe(true)
    expect(runGit(repo, ["branch", "--list", "users-branch"]).trim()).toBe("")
  })

  it("deletes a branch kept earlier when the user now asks to delete it", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const first = await createWorktree(repo, { mode: "new", worktreeName: "kept-once" }, runtime)
    await removeWorktree(repo, { directory: first.path }, runtime)
    const again = await createWorktree(
      repo,
      { mode: "existing", existingBranch: first.branch, worktreeName: "kept-again" },
      runtime,
    )

    expect(await removeWorktree(repo, { directory: again.path, deleteLocalBranch: true }, runtime)).toBe(true)
    expect(runGit(repo, ["branch", "--list", first.branch]).trim()).toBe("")
  })

  it("removes nothing when the worktree list cannot be read", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "list-fails" }, runtime)
    const realGit = resolveRealGit()
    const binDir = createTempDir()
    const wrapper = path.join(binDir, "git")
    fs.writeFileSync(
      wrapper,
      `#!/bin/sh\nif [ "$1" = "worktree" ] && [ "$2" = "list" ]; then echo "fatal: simulated" >&2; exit 128; fi\nexec ${JSON.stringify(realGit)} "$@"\n`,
    )
    fs.chmodSync(wrapper, 0o755)
    const previousPath = process.env.PATH
    process.env.PATH = `${binDir}${path.delimiter}${previousPath}`
    try {
      await expect(removeWorktree(repo, { directory: created.path }, runtime)).rejects.toThrow(/nothing was removed/)
    } finally {
      process.env.PATH = previousPath
    }
    expect(runtime.calls.remove).toEqual([])
    expect(fs.existsSync(created.path)).toBe(true)
    expect(runGit(repo, ["branch", "--list", created.branch])).toContain(created.branch)
  })

  it("keeps a runtime-created branch when the user did not ask to delete it", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "keep-me" }, runtime)
    runGit(created.path, ["commit", "--allow-empty", "-m", "unmerged work"])
    const tip = runGit(created.path, ["rev-parse", "HEAD"]).trim()

    expect(await removeWorktree(repo, { directory: created.path }, runtime)).toBe(true)

    expect(runGit(repo, ["rev-parse", created.branch]).trim()).toBe(tip)
    expect(runGit(repo, ["config", "--get", `branch.${created.branch}.axCodeBorrowed`]).trim()).toBe(created.branch)
  })

  it("answers plainly when the runtime deleted the branch it owned", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()
    const created = await createWorktree(repo, { mode: "new", worktreeName: "owned" }, runtime)

    expect(await removeWorktree(repo, { directory: created.path, deleteLocalBranch: true }, runtime)).toBe(true)
    expect(runGit(repo, ["branch", "--list", created.branch]).trim()).toBe("")
  })

  it("surfaces the runtime's refusal", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime({
      removeResult: () => ({ error: { name: "WorktreeRemoveFailedError", message: "Worktree not found" } }),
    })

    await expect(
      removeWorktree(repo, { directory: path.join(createTempDir(), "elsewhere") }, runtime),
    ).rejects.toThrow("Worktree not found")
  })

  it("refuses to remove the primary workspace without asking the runtime", async () => {
    if (!canRunGit()) return
    const repo = initWorktreeRepo()
    const runtime = createStubRuntime()

    await expect(removeWorktree(repo, { directory: repo }, runtime)).rejects.toThrow(/primary workspace/)
    expect(runtime.calls.remove).toEqual([])
  })

  it("never runs git worktree remove, and deletes only a kept branch the user asked to delete", async () => {
    if (!canRunGit() || process.platform === "win32") return
    const repo = initWorktreeRepo()
    runGit(repo, ["branch", "users-branch"])
    const runtime = createStubRuntime()
    const owned = await createWorktree(repo, { mode: "new", worktreeName: "owned" }, runtime)
    const borrowed = await createWorktree(
      repo,
      { mode: "existing", existingBranch: "users-branch", worktreeName: "borrowed" },
      runtime,
    )

    const { invocations } = await recordGitInvocations(async () => {
      await removeWorktree(repo, { directory: owned.path, deleteLocalBranch: true }, runtime)
      await removeWorktree(repo, { directory: borrowed.path, deleteLocalBranch: true }, runtime)
    })

    expect(invocations.length).toBeGreaterThan(0)
    expect(invocations.filter((line) => line.startsWith("worktree remove"))).toEqual([])
    // The runtime deleted the branch it owned; Desktop deletes only the borrowed
    // branch the user explicitly asked to delete.
    expect(invocations.filter((line) => /^branch (-D|-d|--delete)\b/.test(line))).toEqual(["branch -D -- users-branch"])
    expect(runtime.calls.remove).toHaveLength(2)
  })
})

describe("getGitBranchDiff", () => {
  const write = (dir, relative, content) => {
    const absolute = path.join(dir, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, content)
  }

  const commitAll = async (git, message) => {
    await git.add("-A")
    await git.commit(message)
  }

  it("stops reading file content once the response budget is spent", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "base.txt", "base\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    for (const name of ["a.txt", "b.txt", "c.txt"]) write(tmpDir, name, "x".repeat(400) + "\n")

    // Each file is about 400 bytes; a 900-byte budget fits two and marks the rest too large.
    const result = await getGitBranchDiff(tmpDir, { base: "main", maxTotalBytes: 900 })

    const withContent = result.files.filter((file) => file.after.length > 0)
    const overBudget = result.files.filter((file) => file.tooLarge)
    expect(withContent).toHaveLength(2)
    expect(overBudget).toHaveLength(1)
    expect(overBudget[0]).toMatchObject({ before: "", after: "" })
  })

  it("diffs the working tree against the merge-base, including committed and unstaged changes", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "file.txt", "base\n")
    write(tmpDir, "only-base.txt", "base only\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    write(tmpDir, "file.txt", "committed\n")
    write(tmpDir, "added.txt", "added\n")
    await commitAll(git, "feature")
    await git.raw(["checkout", "main"])
    write(tmpDir, "only-base.txt", "main moved\n")
    await commitAll(git, "main moves")
    await git.raw(["checkout", "feature"])
    write(tmpDir, "file.txt", "committed\nworktree\n")

    const result = await getGitBranchDiff(tmpDir, { base: "main" })

    expect(result.base).toBe("main")
    expect(result.mergeBase).toMatch(/^[0-9a-f]{40}$/)
    expect(result.truncated).toBe(false)
    const byFile = Object.fromEntries(result.files.map((file) => [file.file, file]))
    expect(byFile["file.txt"]).toMatchObject({
      status: "modified",
      before: "base\n",
      after: "committed\nworktree\n",
      beforeBlobId: runGit(tmpDir, ["rev-parse", `${result.mergeBase}:file.txt`]).trim(),
    })
    expect(byFile["file.txt"].additions).toBeGreaterThan(0)
    expect(byFile["added.txt"]).toMatchObject({
      status: "added",
      before: "",
      after: "added\n",
      beforeBlobId: null,
    })
    // only-base.txt changed on main after the branch point, so it is not a change on this branch.
    expect(byFile["only-base.txt"]).toBeUndefined()
  })

  it("reports a rename from the merge-base path", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "src/a.ts", "alpha\nbeta\ngamma\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    await git.mv("src/a.ts", "src/b.ts")
    write(tmpDir, "src/b.ts", "alpha\nbeta\ngamma\nextra\n")

    const result = await getGitBranchDiff(tmpDir, { base: "main" })
    const renamed = result.files.find((file) => file.file === "src/b.ts")

    expect(renamed).toMatchObject({
      status: "renamed",
      previousFile: "src/a.ts",
      before: "alpha\nbeta\ngamma\n",
      after: "alpha\nbeta\ngamma\nextra\n",
    })
    expect(result.files.find((file) => file.file === "src/a.ts")).toBeUndefined()
  })

  it("reports a deletion against the merge-base blob", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "gone.txt", "gone\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    fs.rmSync(path.join(tmpDir, "gone.txt"))

    const result = await getGitBranchDiff(tmpDir, { base: "main" })

    expect(result.files).toEqual([
      expect.objectContaining({
        file: "gone.txt",
        status: "deleted",
        before: "gone\n",
        after: "",
        deletions: 1,
        beforeBlobId: runGit(tmpDir, ["rev-parse", `${result.mergeBase}:gone.txt`]).trim(),
      }),
    ])
  })

  it("reports an untracked working-tree file", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "tracked.txt", "tracked\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    write(tmpDir, "notes.txt", "hello\n")

    const result = await getGitBranchDiff(tmpDir, { base: "main" })

    expect(result.files).toEqual([
      expect.objectContaining({
        file: "notes.txt",
        status: "untracked",
        before: "",
        after: "hello\n",
        additions: 1,
        deletions: 0,
        beforeBlobId: null,
      }),
    ])
  })

  it("rejects a base that is not a local or remote branch", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "file.txt", "base\n")
    await commitAll(git, "base")

    await expect(getGitBranchDiff(tmpDir, { base: "not-a-branch" })).rejects.toThrow("Unknown branch")
    await expect(getGitBranchDiff(tmpDir, { base: "--upload-pack=evil" })).rejects.toThrow("Unknown branch")
    await expect(getGitBranchDiff(tmpDir, { base: "main;touch /tmp/ax-branch-diff-pwned" })).rejects.toThrow(
      "Unknown branch",
    )
    await expect(getGitBranchDiff(tmpDir, { base: "HEAD" })).rejects.toThrow("Unknown branch")
    expect(runGit(tmpDir, ["status", "--porcelain"])).toBe("")
    await expect(getGitBranchDiff(tmpDir, { base: "main" })).resolves.toMatchObject({ base: "main", files: [] })
  })

  it("defaults to the origin/HEAD target, then main, then master", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "file.txt", "base\n")
    await commitAll(git, "base")
    await git.raw(["branch", "master"])
    await git.raw(["checkout", "-b", "develop"])
    const origin = createTempDir()
    runGit(origin, ["init", "--bare", "-b", "develop"])
    await git.addRemote("origin", origin)
    await git.raw(["push", "-u", "origin", "develop"])
    runGit(tmpDir, ["remote", "set-head", "origin", "develop"])
    await git.raw(["checkout", "-b", "feature"])
    write(tmpDir, "file.txt", "feature\n")

    const fromOrigin = await getGitBranchDiff(tmpDir, {})
    expect(fromOrigin.base).toBe("develop")
    expect(fromOrigin.files.map((file) => file.file)).toEqual(["file.txt"])

    const fromRemote = await getGitBranchDiff(tmpDir, { base: "origin/develop" })
    expect(fromRemote.base).toBe("origin/develop")
    expect(fromRemote.mergeBase).toBe(fromOrigin.mergeBase)

    await git.raw(["remote", "remove", "origin"])
    const fromMain = await getGitBranchDiff(tmpDir, {})
    expect(fromMain.base).toBe("main")

    await git.raw(["branch", "-D", "main"])
    const fromMaster = await getGitBranchDiff(tmpDir, {})
    expect(fromMaster.base).toBe("master")
  })

  it("marks binary and oversized files and caps the file list", async () => {
    const { tmpDir, git } = await createTempRepo()
    write(tmpDir, "file.txt", "base\n")
    await commitAll(git, "base")
    await git.raw(["checkout", "-b", "feature"])
    write(tmpDir, "bin.dat", Buffer.from([0, 1, 2, 3, 4]))
    write(tmpDir, "big.txt", Buffer.alloc(1024 * 1024 + 8, 97))
    for (let index = 0; index < 305; index += 1) {
      write(tmpDir, `n${String(index).padStart(4, "0")}.txt`, "x\n")
    }

    const result = await getGitBranchDiff(tmpDir, { base: "main" })

    expect(result.truncated).toBe(true)
    expect(result.files).toHaveLength(300)
    expect(result.files.some((file) => file.file === "n0304.txt")).toBe(false)
    const binary = result.files.find((file) => file.file === "bin.dat")
    const oversized = result.files.find((file) => file.file === "big.txt")
    expect(binary).toMatchObject({ binary: true, before: "", after: "" })
    expect(oversized).toMatchObject({ tooLarge: true, before: "", after: "" })
  })
})
