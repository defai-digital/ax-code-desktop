import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"

const computeIntegratePlanMock = vi.fn()
const integrateWorktreeCommitsMock = vi.fn()
const isCherryPickInProgressMock = vi.fn()
const getIntegrateConflictDetailsMock = vi.fn()
const readIntegrateConflictStateMock = vi.fn()
const execCommandMock = vi.fn()
const continueIntegrateMock = vi.fn()
const abortIntegrateMock = vi.fn()

vi.doMock("@/lib/git/integrateWorktreeCommits", () => ({
  computeIntegratePlan: computeIntegratePlanMock,
  integrateWorktreeCommits: integrateWorktreeCommitsMock,
  abortIntegrate: abortIntegrateMock,
  continueIntegrate: continueIntegrateMock,
  getIntegrateConflictDetails: getIntegrateConflictDetailsMock,
  isCherryPickInProgress: isCherryPickInProgressMock,
}))

vi.doMock("@/lib/execCommands", () => ({
  execCommand: execCommandMock,
}))

vi.doMock("./conflictStorage", () => ({
  readIntegrateConflictState: readIntegrateConflictStateMock,
  saveIntegrateConflictState: vi.fn(),
  clearIntegrateConflictState: vi.fn(),
}))

vi.doMock("@/lib/magicPrompts", () => ({
  renderMagicPrompt: vi.fn(async () => ""),
}))

const { IntegrateCommitsSection } = await import("./IntegrateCommitsSection")

const baseProps = {
  repoRoot: "/repo",
  sourceBranch: "feat",
  worktreeMetadata: {} as never,
  localBranches: ["main"],
  defaultTargetBranch: "main",
}

describe("IntegrateCommitsSection plan failure", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    continueIntegrateMock.mockReset()
    abortIntegrateMock.mockReset()
    computeIntegratePlanMock.mockReset()
    integrateWorktreeCommitsMock.mockReset()
    execCommandMock.mockReset()
    execCommandMock.mockResolvedValue({ success: true, stdout: "", stderr: "" })
    isCherryPickInProgressMock.mockReset()
    isCherryPickInProgressMock.mockResolvedValue(false)
    getIntegrateConflictDetailsMock.mockReset()
    getIntegrateConflictDetailsMock.mockResolvedValue(null)
    readIntegrateConflictStateMock.mockReset()
    readIntegrateConflictStateMock.mockReturnValue(null)
  })

  afterEach(() => {
    React.act(() => {
      root.unmount()
    })
    container.remove()
    vi.resetModules()
  })

  test("serializes Continue and Abort while a conflict operation is pending", async () => {
    computeIntegratePlanMock.mockResolvedValue({ ...baseProps, commits: [] })
    readIntegrateConflictStateMock.mockReturnValue({
      repoRoot: "/repo",
      sourceBranch: "feat",
      targetBranch: "main",
      tempWorktreePath: "/tmp/integrate",
      currentCommit: "abc",
      remainingCommits: ["abc"],
      cleanTargetWorktrees: [],
      totalCommits: 1,
    })
    isCherryPickInProgressMock.mockResolvedValue(true)
    getIntegrateConflictDetailsMock.mockResolvedValue({ unmergedFiles: ["conflict.txt"] })
    continueIntegrateMock.mockReturnValue(new Promise(() => {}))
    await React.act(async () => {
      root.render(
        <I18nProvider>
          <IntegrateCommitsSection {...baseProps} />
        </I18nProvider>,
      )
    })
    const buttons = [...container.querySelectorAll("button")]
    const next = buttons.find((button) => button.textContent?.trim() === "Continue")!
    const abort = buttons.find((button) => button.textContent?.trim() === "Abort")!
    expect(next).toBeDefined()
    await React.act(async () => {
      next.click()
      next.click()
      abort.click()
    })
    expect(continueIntegrateMock).toHaveBeenCalledTimes(1)
    expect(abortIntegrateMock).not.toHaveBeenCalled()
    expect(next.disabled).toBe(true)
    expect(abort.disabled).toBe(true)
  })

  test("shows a check-failed message instead of a false 'no commits to move'", async () => {
    computeIntegratePlanMock.mockRejectedValue(new Error("Unable to list commits to move (Unsupported command)"))

    await React.act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(IntegrateCommitsSection, baseProps)))
    })

    expect(container.textContent).toContain("Unable to check commits to move")
    expect(container.textContent).not.toContain("No commits to move")
  })

  test("still reports no commits when the plan ran and found none", async () => {
    computeIntegratePlanMock.mockResolvedValue({
      repoRoot: "/repo",
      sourceBranch: "feat",
      targetBranch: "main",
      commits: [],
    })

    await React.act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(IntegrateCommitsSection, baseProps)))
    })

    expect(container.textContent).toContain("No commits to move")
    expect(container.textContent).not.toContain("Unable to check commits to move")
  })

  test("a persisted conflict survives the plan that was already in flight", async () => {
    let resolvePlan: (plan: unknown) => void = () => {}
    computeIntegratePlanMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve
      }),
    )
    readIntegrateConflictStateMock.mockReturnValue({
      repoRoot: "/repo",
      sourceBranch: "feat",
      targetBranch: "main",
      tempWorktreePath: "/tmp/integrate-1",
      currentCommit: "abcdef1234567890",
      remainingCommits: ["1111111", "2222222"],
    })
    isCherryPickInProgressMock.mockResolvedValue(true)
    getIntegrateConflictDetailsMock.mockResolvedValue({ unmergedFiles: ["conflict.txt"] })

    await React.act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(IntegrateCommitsSection, baseProps)))
    })
    await React.act(async () => {})

    // The restore effect found the half-finished cherry-pick and took the panel.
    expect(container.textContent).toContain("conflict.txt")

    // The plan that was requested on mount resolves late. It must not replace the
    // conflict view — that would put "Move" back within reach over a worktree that
    // still holds the cherry-pick.
    await React.act(async () => {
      resolvePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main", commits: [] })
    })
    await React.act(async () => {})

    expect(container.textContent).toContain("conflict.txt")
  })

  test("keeps the target branch control usable while the plan loads and locks it while a move owns the panel", async () => {
    let resolvePlan: (plan: unknown) => void = () => {}
    computeIntegratePlanMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve
      }),
    )
    let resolveMove: (result: unknown) => void = () => {}
    integrateWorktreeCommitsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveMove = resolve
      }),
    )

    await React.act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(IntegrateCommitsSection, baseProps)))
    })

    const buttons = () => Array.from(container.querySelectorAll("button"))
    const targetTrigger = buttons().find((button) => button.textContent?.includes("Target"))
    // The plan request has no timeout: a stalled fetch must not take the picker down,
    // because picking another branch is how the panel re-plans.
    expect(targetTrigger?.disabled).toBe(false)
    expect(container.textContent).toContain("Checking")

    await React.act(async () => {
      resolvePlan({ repoRoot: "/repo", sourceBranch: "feat", targetBranch: "main", commits: ["abcdef1"] })
    })
    await React.act(async () => {})

    const moveButton = buttons().find((button) => button.textContent?.trim() === "Move")
    expect(targetTrigger?.disabled).toBe(false)
    expect(moveButton?.disabled).toBe(false)

    await React.act(async () => {
      moveButton?.click()
    })

    // While the cherry-pick runs the plan effect stops re-planning. The control that changes the
    // target must stop accepting selections too, or a mid-run pick leaves the header pointing at
    // one branch while the panel re-plans the branch that was actually moved to.
    expect(targetTrigger?.disabled).toBe(true)
    expect(container.textContent).toContain("Moving")

    await React.act(async () => {
      resolveMove({ kind: "success", moved: 1 })
    })
    await React.act(async () => {})
  })

  test("keeps the restored conflict when the plan resolves without an intervening render", async () => {
    // Both chains settle in the same batch, so the restore's `setUi({ kind: "conflict" })` is
    // queued but not rendered when the plan lands. A ref cannot see a queued update — the earlier
    // fix read one, and the queued `ready` still replaced the conflict view.
    computeIntegratePlanMock.mockResolvedValue({
      repoRoot: "/repo",
      sourceBranch: "feat",
      targetBranch: "main",
      commits: [],
    })
    readIntegrateConflictStateMock.mockReturnValue({
      repoRoot: "/repo",
      sourceBranch: "feat",
      targetBranch: "main",
      tempWorktreePath: "/tmp/integrate-1",
      currentCommit: "abcdef1234567890",
      remainingCommits: [],
    })
    isCherryPickInProgressMock.mockResolvedValue(true)
    getIntegrateConflictDetailsMock.mockResolvedValue({ unmergedFiles: ["conflict.txt"] })

    await React.act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(IntegrateCommitsSection, baseProps)))
    })
    await React.act(async () => {})

    expect(container.textContent).toContain("conflict.txt")
  })
})
