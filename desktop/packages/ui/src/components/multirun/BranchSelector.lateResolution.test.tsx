import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const getRootBranch = vi.fn()
const onChange = vi.fn()

vi.doMock("@/lib/worktrees/worktreeStatus", () => ({ getRootBranch }))
vi.doMock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ git: null }) }))
vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.doMock("@/stores/useGitStore", () => ({
  useGitStore: (selector: (state: { fetchBranches: () => void; fetchStatus: () => void }) => unknown) =>
    selector({ fetchBranches: vi.fn(), fetchStatus: vi.fn() }),
  useGitBranches: () => ({ all: ["main", "release", "feature"], current: "main" }),
  useGitLoadingBranches: () => false,
  useGitLoadingStatus: () => false,
  useIsGitRepo: () => true,
}))

const { BranchSelector } = await import("./BranchSelector")

describe("BranchSelector default branch resolution", () => {
  let container: HTMLDivElement
  let root: Root

  // The pick arrives as the parent's `value`, which is what the selector reads to guard its own resolution.
  const render = (value: string) =>
    act(() =>
      root.render(<BranchSelector directory="/repo" value={value} onChange={onChange} />),
    )

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    onChange.mockReset()
    getRootBranch.mockReset()
    window.localStorage.clear()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("does not apply a default branch that resolves after the user picked one", async () => {
    let resolveRootBranch: (branch: string | null) => void = () => {}
    getRootBranch.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveRootBranch = resolve
      }),
    )

    render("")
    await flush()

    render("feature")
    await act(async () => {
      resolveRootBranch("main")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  test("applies the repository's root branch while nothing has been picked", async () => {
    // The guard that cancels a late resolution must not cancel the one the selector started for itself.
    getRootBranch.mockResolvedValue("main")

    render("")
    await flush()

    expect(onChange).toHaveBeenCalledWith("main")
  })
})
