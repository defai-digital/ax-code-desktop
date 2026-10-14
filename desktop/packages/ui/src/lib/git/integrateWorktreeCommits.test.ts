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

  test("keeps a real non-zero exit as an empty plan instead of an error", async () => {
    execCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("git show-ref")) {
        return { command, success: false, exitCode: 1, stdout: "", stderr: "" }
      }
      return ok(command)
    })

    const plan = await computeIntegratePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main" })

    expect(plan.commits).toEqual([])
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
