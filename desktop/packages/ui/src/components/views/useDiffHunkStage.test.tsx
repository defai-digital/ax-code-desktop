import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { gitApiMock, getGitDiff, stageGitHunk, unstageGitHunk, bumpIndexRevision, fetchStatus, toastError } = vi.hoisted(
  () => {
    const getGitDiff = vi.fn<(directory: string, options: unknown) => Promise<{ diff: string }>>(async () => ({
      diff: "",
    }))
    const stageGitHunk = vi.fn<(directory: string, filePath: string, patch: string) => Promise<void>>(async () => {})
    const unstageGitHunk = vi.fn<(directory: string, filePath: string, patch: string) => Promise<void>>(async () => {})
    // One stable object for the whole run: the hook's effects depend on the git
    // api identity, and a fresh object per render restarts them forever.
    return {
      gitApiMock: { getGitDiff, stageGitHunk, unstageGitHunk },
      getGitDiff,
      stageGitHunk,
      unstageGitHunk,
      bumpIndexRevision: vi.fn(),
      fetchStatus: vi.fn(async () => true),
      toastError: vi.fn(),
    }
  },
)

const statusState = { value: null as { files: Array<{ path: string; index: string; working_dir: string }> } | null }

vi.mock("@/hooks/useRuntimeAPIs", () => ({
  useRuntimeAPIs: () => ({ git: gitApiMock }),
}))
vi.mock("@/components/ui", () => ({ toast: { error: toastError, success: vi.fn(), message: vi.fn() } }))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => <span /> }))
// A stable i18n value: a fresh `t` per call would recreate the hook's mutation
// queue on every render and drop queued mutations across renders.
const stableI18n = { t: (key: string) => key }
vi.mock("@/lib/i18n", () => ({ useI18n: () => stableI18n }))
vi.mock("@/stores/useGitStore", () => ({
  useGitStore: (selector: (state: unknown) => unknown) =>
    selector({
      bumpIndexRevision,
      fetchStatus,
      directories: new Map(),
    }),
  useGitStatus: () => statusState.value,
}))

const { useDiffHunkStage, isConflictedStatusFile } = await import("./useDiffHunkStage")
const { DiffHunkReviewList } = await import("./DiffHunkReviewList")

const gitDiffText = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,6 +1,6 @@",
  " line1",
  "-line2",
  "+line2-edited",
  " line3",
  " line4",
  " line5",
  " line6",
  "@@ -20,6 +20,6 @@",
  " line19",
  " line20",
  "-line21",
  "+line21-edited",
  " line22",
  " line23",
  " line24",
  " line25",
  "",
].join("\n")

// Two edits far enough apart that the diff keeps them as separate hunks.
const originalLines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`)
const original = originalLines.join("\n")
const modifiedLines = [...originalLines]
modifiedLines[1] = "line2-edited"
modifiedLines[20] = "line21-edited"
const modified = modifiedLines.join("\n")

const flushQueue = async () => {
  // The queue flushes on a macrotask; let it start and settle.
  await new Promise((resolve) => setTimeout(resolve, 10))
}

describe("useDiffHunkStage", () => {
  let container: HTMLDivElement
  let root: Root
  let stageHunk: ((gitHunkIndex: number) => void) | null
  let probeStaged: boolean

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    getGitDiff.mockReset().mockResolvedValue({ diff: gitDiffText })
    stageGitHunk.mockReset().mockResolvedValue(undefined)
    unstageGitHunk.mockReset().mockResolvedValue(undefined)
    bumpIndexRevision.mockReset()
    fetchStatus.mockReset().mockResolvedValue(true)
    toastError.mockReset()
    statusState.value = { files: [{ path: "src/a.ts", index: "M", working_dir: "M" }] }
    stageHunk = null
    probeStaged = false
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const Probe = () => {
    const { handleStageHunk } = useDiffHunkStage({
      directory: "/repo",
      filePath: "src/a.ts",
      diff: { original, modified },
      staged: probeStaged,
    })
    stageHunk = handleStageHunk
    return null
  }

  test("stages a patch holding only the clicked hunk of the fetched diff text", async () => {
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })

    expect(getGitDiff).toHaveBeenCalledWith("/repo", { path: "src/a.ts", staged: false, contextLines: 4 })
    expect(stageGitHunk).toHaveBeenCalledTimes(1)
    const [directory, filePath, patch] = stageGitHunk.mock.calls[0]
    expect(directory).toBe("/repo")
    expect(filePath).toBe("src/a.ts")
    expect(patch).toContain("+line2-edited")
    expect(patch).not.toContain("line21-edited")
    expect(patch).toMatch(/^diff --git a\/src\/a\.ts b\/src\/a\.ts/)
  })

  test("a second click while one mutation is in flight is ignored", async () => {
    let resolveMutation: () => void = () => {}
    stageGitHunk.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve
        }),
    )

    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(0)
      stageHunk?.(1)
      await flushQueue()
    })
    expect(stageGitHunk).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveMutation()
      await flushQueue()
    })
    // The guard released once the mutation settled.
    await act(async () => {
      stageHunk?.(1)
      await flushQueue()
    })
    expect(stageGitHunk).toHaveBeenCalledTimes(2)
  })

  test("a staged view unstages instead of staging", async () => {
    probeStaged = true
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(1)
      await flushQueue()
    })

    expect(unstageGitHunk).toHaveBeenCalledTimes(1)
    expect(unstageGitHunk.mock.calls[0][2]).toContain("+line21-edited")
    expect(stageGitHunk).not.toHaveBeenCalled()
  })

  test("a successful mutation refreshes the index revision and status like whole-file staging", async () => {
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })

    expect(bumpIndexRevision).toHaveBeenCalledWith("/repo")
    expect(fetchStatus).toHaveBeenCalledWith("/repo", expect.anything(), { silent: true })
  })

  test("a failed mutation surfaces the git error and releases the guard", async () => {
    stageGitHunk.mockRejectedValueOnce(new Error("Patch does not apply"))
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })

    expect(toastError).toHaveBeenCalledWith("Patch does not apply")
    expect(bumpIndexRevision).not.toHaveBeenCalled()

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })
    expect(stageGitHunk).toHaveBeenCalledTimes(2)
  })

  test("without diff text the click toasts instead of posting a patch", async () => {
    getGitDiff.mockRejectedValueOnce(new Error("boom"))
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })

    expect(toastError).toHaveBeenCalledWith("diffView.hunk.stageUnsupported")
    expect(stageGitHunk).not.toHaveBeenCalled()
  })

  test("a conflicted file neither fetches a diff nor stages", async () => {
    statusState.value = { files: [{ path: "src/a.ts", index: "U", working_dir: "U" }] }
    await act(async () => {
      root.render(<Probe />)
    })

    expect(getGitDiff).not.toHaveBeenCalled()

    await act(async () => {
      stageHunk?.(0)
      await flushQueue()
    })

    expect(stageGitHunk).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("diffView.hunk.stageUnsupported")
  })
})

describe("useDiffHunkStage row actions in DiffHunkReviewList", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const gitHunks = [
    { header: "@@ -1,6 +1,6 @@", oldStart: 1, oldCount: 6, newStart: 1, newCount: 6 },
    // An edit at line 21 with context 4 starts its hunk at line 17.
    { header: "@@ -17,10 +17,10 @@", oldStart: 17, oldCount: 10, newStart: 17, newCount: 10 },
  ]

  test("offers one stage button per row that matches a git hunk", async () => {
    await act(async () => {
      root.render(
        <DiffHunkReviewList
          original={original}
          modified={modified}
          onRevertHunk={() => {}}
          revertingHunkIndex={null}
          gitHunks={gitHunks}
          onStageHunk={() => {}}
          stagingHunkIndex={null}
        />,
      )
    })

    const buttons = [...container.querySelectorAll("button")]
    expect(buttons).toHaveLength(4)
  })

  test("hides the stage action for rows without a matching git hunk", async () => {
    await act(async () => {
      root.render(
        <DiffHunkReviewList
          original={original}
          modified={modified}
          onRevertHunk={() => {}}
          revertingHunkIndex={null}
          gitHunks={[gitHunks[0]]}
          onStageHunk={() => {}}
          stagingHunkIndex={null}
        />,
      )
    })

    const buttons = [...container.querySelectorAll("button")]
    expect(buttons).toHaveLength(3)
  })

  test("staged rows show the unstage action and no revert", async () => {
    await act(async () => {
      root.render(
        <DiffHunkReviewList
          original={original}
          modified={modified}
          onRevertHunk={() => {}}
          revertingHunkIndex={null}
          gitHunks={gitHunks}
          onStageHunk={() => {}}
          stagingHunkIndex={null}
          staged
        />,
      )
    })

    const buttons = [...container.querySelectorAll("button")]
    expect(buttons).toHaveLength(2)
    // The i18n mock returns the key itself; both rows carry the unstage action.
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "diffView.hunk.unstageAria",
      "diffView.hunk.unstageAria",
    ])
  })
})

describe("isConflictedStatusFile", () => {
  test.each([
    ["UU", "U", "U"],
    ["AA", "A", "A"],
    ["DD", "D", "D"],
    ["AU", "A", "U"],
    ["UA", "U", "A"],
    ["UD", "U", "D"],
    ["DU", "D", "U"],
  ])("treats porcelain %s as conflicted", (_label, index, working) => {
    expect(isConflictedStatusFile({ index, working_dir: working })).toBe(true)
  })

  test.each([
    ["modified", "M", " "],
    ["staged add", "A", " "],
    ["untracked", "?", "?"],
    ["unstaged delete", " ", "D"],
  ])("treats %s as not conflicted", (_label, index, working) => {
    expect(isConflictedStatusFile({ index, working_dir: working })).toBe(false)
  })
})
