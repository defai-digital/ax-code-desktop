import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { simpleGit } from "simple-git"

import {
  checkoutBranch,
  checkoutCommit,
  cherryPick,
  commit,
  continueRebase,
  countStashFiles,
  createWorktree,
  getCommitFileDiff,
  getCommitFiles,
  getCommitPatch,
  getFileDiff,
  getStatus,
  getWorktreeBootstrapStatus,
  getWorktrees,
  isGitRepository,
  isRefusedRepositoryRoot,
  leavesRepositoryRoot,
  removeWorktree,
  resetToCommit,
  resolveRepositoryFilePath,
  resolveBaseRefForLog,
  revertCommit,
  stageFiles,
  unstageFiles,
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
// removeWorktree
// ---------------------------------------------------------------------------

describe("removeWorktree", () => {
  it("removes the worktree and reports a branch it could not delete", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])
    runGit(repo, ["branch", "feat"])

    // Two worktrees on the same branch: git refuses to delete a branch that another
    // worktree still has checked out, which is what makes `branch -D` fail after the
    // first worktree is removed.
    const target = path.join(repo, ".worktrees", "target")
    const other = path.join(repo, ".worktrees", "other")
    runGit(repo, ["worktree", "add", "--force", target, "feat"])
    runGit(repo, ["worktree", "add", "--force", other, "feat"])

    const result = await removeWorktree(repo, { directory: target, deleteLocalBranch: true })

    // The worktree is gone, so the call reports success and says why the branch stayed.
    expect(result).toMatchObject({ removed: true, branchDeleted: false })
    expect(String(result.warning)).toContain("feat")
    expect(fs.existsSync(target)).toBe(false)
    expect(runGit(repo, ["branch", "--list", "feat"])).toContain("feat")
  })

  it("asks the runtime to release the worktree's instance before removing it", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    const target = path.join(repo, ".worktrees", "disposed")
    runGit(repo, ["worktree", "add", "-b", "disposed", target])

    const disposed = []
    const result = await removeWorktree(repo, {
      directory: target,
      disposeInstance: async (directory) => {
        // The directory has to still exist when the runtime is asked to release it.
        disposed.push({ directory, existed: fs.existsSync(directory) })
      },
    })

    expect(result).toBe(true)
    expect(disposed).toEqual([{ directory: target, existed: true }])
    expect(fs.existsSync(target)).toBe(false)
  })

  it("removes the worktree even when releasing its instance fails", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    const target = path.join(repo, ".worktrees", "stubborn")
    runGit(repo, ["worktree", "add", "-b", "stubborn", target])

    const result = await removeWorktree(repo, {
      directory: target,
      disposeInstance: async () => {
        throw new Error("runtime is not running")
      },
    })

    expect(result).toBe(true)
    expect(fs.existsSync(target)).toBe(false)
  })

  it("deletes the branch when it is only checked out in the removed worktree", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    const target = path.join(repo, ".worktrees", "solo")
    runGit(repo, ["worktree", "add", "-b", "solo", target])

    const result = await removeWorktree(repo, { directory: target, deleteLocalBranch: true })

    expect(result).toBe(true)
    expect(runGit(repo, ["branch", "--list", "solo"]).trim()).toBe("")
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


// ---------------------------------------------------------------------------
// createWorktree start scripts
// ---------------------------------------------------------------------------

describe("createWorktree start scripts", () => {
  it("runs the project start command the runtime keeps, in the new worktree", async () => {
    if (!canRunGit()) return

    const repo = createTempDir()
    runGit(repo, ["init", "-b", "main"])
    runGit(repo, ["config", "user.email", "test@example.com"])
    runGit(repo, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n")
    runGit(repo, ["add", "README.md"])
    runGit(repo, ["commit", "-m", "Initial commit"])

    const previousXdgDataHome = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = createTempDir()
    const markerScript = path.join(createTempDir(), "project-start.cjs")
    fs.writeFileSync(markerScript, "require('node:fs').writeFileSync('START_RAN', process.cwd());\n")
    const askedFor = []

    try {
      const created = await createWorktree(repo, {
        mode: "new",
        branchName: "feature/project-start",
        worktreeName: "project-start",
        // The project's start command lives in the runtime; the route layer hands this reader in.
        readProjectStartCommand: async (projectID) => {
          askedFor.push(projectID)
          return `${JSON.stringify(process.execPath)} ${JSON.stringify(markerScript)}`
        },
      })

      await expect
        .poll(async () => (await getWorktreeBootstrapStatus(created.path)).status, { timeout: 15000 })
        .toBe("ready")

      expect(fs.readFileSync(path.join(created.path, "START_RAN"), "utf8")).toBe(fs.realpathSync(created.path))
      expect(askedFor).toEqual([expect.any(String)])
    } finally {
      if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousXdgDataHome
    }
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
})

// ---------------------------------------------------------------------------
// createWorktree bootstrap ownership
// ---------------------------------------------------------------------------

describe("createWorktree bootstrap ownership", () => {
  it("checks the run's ownership after every suspension that can precede a side effect", async () => {
    // The run's awaits are the points where its worktree can be removed and re-created under the same
    // name. Each side effect (git reset, the upstream configuration, the project's start scripts, the
    // recorded state) has to be preceded by the ownership check; the upstream fetch is a network round
    // trip, so a check before it alone left the start scripts unguarded.
    const source = await readFile(path.resolve(__dirname, "service.js"), "utf8")
    const queue = source.slice(source.indexOf("const queueWorktreeBootstrap = (args) => {"))
    const run = queue.slice(0, queue.indexOf("const ensureRemoteWithUrl"))

    const check = (before, after) =>
      expect(run.indexOf(before)).toBeLessThan(run.indexOf(after, run.indexOf(before)))

    check("if (!isCurrentBootstrap())", 'runGitCommandOrThrow(directory, ["reset", "--hard"]')
    check("if (!isCurrentBootstrap())", "applyUpstreamConfiguration({")
    // The upstream step awaits a network fetch; the guard has to follow it, not only precede it.
    const upstreamIdx = run.indexOf("applyUpstreamConfiguration({")
    const guardAfterUpstream = run.indexOf("if (!isCurrentBootstrap())", upstreamIdx)
    const startScriptsIdx = run.indexOf("runWorktreeStartScripts(directory, projectID")
    expect(guardAfterUpstream).toBeGreaterThan(-1)
    expect(guardAfterUpstream).toBeLessThan(startScriptsIdx)
    check("if (!isCurrentBootstrap())", "setWorktreeBootstrapState(directory, WORKTREE_BOOTSTRAP_READY)")
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

describe("createWorktree from a bare repository", () => {
  it("creates a worktree instead of refusing to resolve a top level", async () => {
    if (!canRunGit()) return

    const source = createTempDir()
    runGit(source, ["init", "-b", "main"])
    runGit(source, ["config", "user.email", "test@example.com"])
    runGit(source, ["config", "user.name", "Test User"])
    fs.writeFileSync(path.join(source, "README.md"), "# Test\n")
    runGit(source, ["add", "README.md"])
    runGit(source, ["commit", "-m", "Initial commit"])

    // A bare checkout answers `rev-parse --show-toplevel` with "fatal: this operation must be run in a
    // work tree", which the worktree context read as "not a repository" and refused every worktree
    // operation on it.
    const bare = createTempDir()
    runGit(bare, ["init", "--bare", "-b", "main"])
    runGit(source, ["remote", "add", "origin", bare])
    runGit(source, ["push", "-q", "origin", "main"])

    const previousXdgDataHome = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = createTempDir()
    try {
      const created = await createWorktree(bare, {
        mode: "new",
        branchName: "feature/bare",
        worktreeName: "bare-wt",
      })

      // The checkout itself is the bootstrap's job.
      await expect
        .poll(async () => (await getWorktreeBootstrapStatus(created.path)).status, { timeout: 15000 })
        .toBe("ready")

      expect(fs.existsSync(path.join(created.path, "README.md"))).toBe(true)
      expect(runGit(created.path, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("feature/bare")

      // Listing ran from the bare repository, which lists itself as a worktree: it has none to check out
      // and must not be offered as one, while the worktree just created must be.
      const listed = (await getWorktrees(bare)).map((entry) => fs.realpathSync(entry.path))
      expect(listed).toContain(fs.realpathSync(created.path))
      expect(listed).not.toContain(fs.realpathSync(bare))
    } finally {
      if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousXdgDataHome
    }
  })
})
