import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import type { CommandExecResult } from "@/lib/api/types"

const execCommandMock = vi.fn<(command: string, cwd: string) => Promise<CommandExecResult>>()

vi.doMock("@/lib/execCommands", () => ({
  execCommand: execCommandMock,
}))

const { computeIntegratePlan } = await import("./integrateWorktreeCommits")

const ok = (command: string, stdout = ""): CommandExecResult => ({
  command,
  success: true,
  exitCode: 0,
  stdout,
  stderr: "",
})

describe("computeIntegratePlan", () => {
  beforeEach(() => {
    execCommandMock.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  test("rejects when the executor refuses the git commands instead of claiming zero commits", async () => {
    // The Desktop HTTP exec endpoint only accepts git path queries: it answers
    // an unsupported command with success:false and no exit code (it never ran).
    execCommandMock.mockResolvedValue({
      command: "git cherry",
      success: false,
      error: "Unsupported command",
    })

    await expect(
      computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" }),
    ).rejects.toThrow(/Unsupported command/)
  })

  test("treats the expected show-ref exit 1 for a missing local branch as an absent branch", async () => {
    execCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("git show-ref")) {
        return { command, success: false, exitCode: 1, stdout: "", stderr: "" }
      }
      return ok(command)
    })

    const plan = await computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" })

    expect(plan.commits).toEqual([])
  })

  test("rejects a cherry that ran and failed instead of reading its empty output as an empty plan", async () => {
    // `git cherry nonexistent-branch HEAD` exits 128 with empty stdout; that
    // must surface as an error, not as "No commits to move".
    execCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("git show-ref")) {
        return { command, success: false, exitCode: 1, stdout: "", stderr: "" }
      }
      if (command.startsWith("git cherry")) {
        return {
          command,
          success: false,
          exitCode: 128,
          stdout: "",
          stderr: "fatal: bad revision 'feat'",
        }
      }
      return ok(command)
    })

    await expect(
      computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" }),
    ).rejects.toThrow("Unable to list commits to move (fatal: bad revision 'feat')")
  })

  test("rejects a rev-list that ran and failed after cherry succeeded", async () => {
    execCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("git show-ref")) {
        return { command, success: false, exitCode: 1, stdout: "", stderr: "" }
      }
      if (command.startsWith("git cherry")) {
        return ok(command, "+ aaaaaaa1")
      }
      if (command.startsWith("git rev-list")) {
        return { command, success: false, exitCode: 128, stdout: "", stderr: "fatal: bad revision" }
      }
      return ok(command)
    })

    await expect(
      computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" }),
    ).rejects.toThrow("Unable to list commits to move (fatal: bad revision)")
  })

  test("lists only the commits cherry reports as missing from the target", async () => {
    execCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("git cherry")) {
        return ok(command, "+ aaaaaaa1\n- bbbbbbb2\n+ ccccccc3")
      }
      if (command.startsWith("git rev-list")) {
        return ok(command, "aaaaaaa1\nbbbbbbb2\nccccccc3")
      }
      return ok(command)
    })

    const plan = await computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" })

    expect(plan.commits).toEqual(["aaaaaaa1", "ccccccc3"])
    expect(plan.targetBranch).toBe("main")
  })
})

describe("continueIntegrate", () => {
  beforeEach(() => {
    execCommandMock.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  test.each([
    { success: false, exitCode: 128, stdout: "", stderr: "fatal: unable to read index" },
    { success: false, error: "command timed out" },
  ])("never resets a target worktree when its final cleanliness query fails: %j", async (failure) => {
    execCommandMock.mockImplementation(async (command: string, cwd: string) => {
      if (command === "git status --porcelain" && cwd === "/target") return { command, ...failure }
      return ok(command)
    })
    const { continueIntegrate } = await import("./integrateWorktreeCommits")
    await continueIntegrate({
      repoRoot: "/repo",
      tempWorktreePath: "/tmp/wt",
      sourceBranch: "feat",
      targetBranch: "main",
      cleanTargetWorktrees: ["/target"],
      remainingCommits: ["c1"],
      currentCommit: "c1",
      totalCommits: 1,
    })
    expect(
      execCommandMock.mock.calls.some(([command, cwd]) => cwd === "/target" && /reset|read-tree/.test(command)),
    ).toBe(false)
  })

  test("reports every commit the integration moved, not just the tail after the conflict", async () => {
    // `remainingCommits` is only what was left when the conflict stopped the run, so a resumed five-commit
    // integration reported two or three. The count is what the success toast shows.
    execCommandMock.mockImplementation(async (command: string) => ok(command))
    const { continueIntegrate } = await import("./integrateWorktreeCommits")

    const result = await continueIntegrate({
      repoRoot: "/repo",
      tempWorktreePath: "/tmp/wt",
      sourceBranch: "feat",
      targetBranch: "main",
      cleanTargetWorktrees: [],
      remainingCommits: ["c3", "c4", "c5"],
      currentCommit: "c3",
      totalCommits: 5,
    })

    expect(result).toEqual({ kind: "success", moved: 5 })
  })
})

test.each([false, true])("synchronizes the original clean tree and preserves concurrent edits: %s", async (edit) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-integrate-real-"))
  const repo = path.join(directory, "repo")
  const temp = path.join(directory, "integration")
  fs.mkdirSync(repo)
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  try {
    git("init", "-b", "main")
    git("config", "user.email", "test@example.invalid")
    git("config", "user.name", "Integration test")
    fs.writeFileSync(path.join(repo, "file.txt"), "base\n")
    git("add", ".")
    git("commit", "-m", "base")
    git("switch", "-c", "feature")
    fs.writeFileSync(path.join(repo, "file.txt"), "feature\n")
    git("commit", "-am", "feature")
    const commit = git("rev-parse", "HEAD")
    git("switch", "main")
    execCommandMock.mockImplementation(async (command: string, cwd: string) => {
      if (command.startsWith("mkdir ")) return ok(command)
      if (command.startsWith("mktemp ")) return ok(command, temp)
      if (edit && command.startsWith("git worktree remove"))
        fs.writeFileSync(path.join(repo, "file.txt"), "user edit\n")
      try {
        return ok(
          command,
          execFileSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
        )
      } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string }
        return { command, success: false, exitCode: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }
      }
    })
    const { integrateWorktreeCommits } = await import("./integrateWorktreeCommits")
    await expect(
      integrateWorktreeCommits({ repoRoot: repo, sourceBranch: "feature", targetBranch: "main", commits: [commit] }),
    ).resolves.toEqual({ kind: "success", moved: 1 })
    expect(fs.readFileSync(path.join(repo, "file.txt"), "utf8")).toBe(edit ? "user edit\n" : "feature\n")
    if (!edit) expect(git("status", "--porcelain")).toBe("")
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
