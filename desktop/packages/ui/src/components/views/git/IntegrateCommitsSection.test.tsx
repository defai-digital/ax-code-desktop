import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"

const computeIntegratePlanMock = vi.fn()
const isCherryPickInProgressMock = vi.fn()
const getIntegrateConflictDetailsMock = vi.fn()
const readIntegrateConflictStateMock = vi.fn()

vi.doMock("@/lib/git/integrateWorktreeCommits", () => ({
  computeIntegratePlan: computeIntegratePlanMock,
  integrateWorktreeCommits: vi.fn(),
  abortIntegrate: vi.fn(),
  continueIntegrate: vi.fn(),
  getIntegrateConflictDetails: getIntegrateConflictDetailsMock,
  isCherryPickInProgress: isCherryPickInProgressMock,
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
    computeIntegratePlanMock.mockReset()
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

  test("shows a check-failed message instead of a false 'no commits to move'", async () => {
    computeIntegratePlanMock.mockRejectedValue(new Error("Unable to list commits to move (Unsupported command)"))

    await React.act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(IntegrateCommitsSection, baseProps),
        ),
      )
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
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(IntegrateCommitsSection, baseProps),
        ),
      )
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
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(IntegrateCommitsSection, baseProps),
        ),
      )
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
})
