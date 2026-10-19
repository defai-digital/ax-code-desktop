import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
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
