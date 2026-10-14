import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"

const computeIntegratePlanMock = vi.fn()

vi.doMock("@/lib/git/integrateWorktreeCommits", () => ({
  computeIntegratePlan: computeIntegratePlanMock,
  integrateWorktreeCommits: vi.fn(),
  abortIntegrate: vi.fn(),
  continueIntegrate: vi.fn(),
  getIntegrateConflictDetails: vi.fn(),
  isCherryPickInProgress: vi.fn(async () => false),
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
})
