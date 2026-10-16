import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { writeFile, setDiff, toastError } = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({ success: true })),
  setDiff: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/hooks/useRuntimeAPIs", () => ({
  useRuntimeAPIs: () => ({ files: { writeFile: (...args: unknown[]) => writeFile(...(args as [])) } }),
}))
vi.mock("@/components/ui", () => ({ toast: { error: toastError, success: vi.fn(), message: vi.fn() } }))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => <span /> }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/stores/useGitStore", () => ({
  useGitStore: (selector: (state: { setDiff: typeof setDiff }) => unknown) => selector({ setDiff }),
}))

const { useDiffHunkRevert } = await import("./useDiffHunkRevert")
const { DiffHunkReviewList } = await import("./DiffHunkReviewList")

// Two edits far enough apart that the diff keeps them as separate hunks.
const originalLines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
const original = originalLines.join("\n")
const modifiedLines = [...originalLines]
modifiedLines[1] = "line2-edited"
modifiedLines[18] = "line19-edited"
const modified = modifiedLines.join("\n")

describe("useDiffHunkRevert", () => {
  let container: HTMLDivElement
  let root: Root
  let revert: ((hunkIndex: number) => Promise<void>) | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    writeFile.mockClear()
    setDiff.mockClear()
    toastError.mockClear()
    revert = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const Probe = () => {
    const { handleRevertHunk } = useDiffHunkRevert({ directory: "/repo", filePath: "src/a.ts", diff: { original, modified } })
    revert = handleRevertHunk
    return null
  }

  test("a second revert started while one is in flight is ignored", async () => {
    await act(async () => {
      root.render(<Probe />)
    })

    // Both clicks land before the first write resolves: the second rebuild would
    // start from the same closed-over `modified` and overwrite the first revert.
    await act(async () => {
      const first = revert?.(0)
      const second = revert?.(1)
      await Promise.all([first, second])
    })

    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(setDiff).toHaveBeenCalledTimes(1)
  })

  test("every hunk button is disabled while one revert is in flight", async () => {
    await act(async () => {
      root.render(
        <DiffHunkReviewList original={original} modified={modified} onRevertHunk={() => {}} revertingHunkIndex={1} />,
      )
    })

    const buttons = [...container.querySelectorAll("button")]
    expect(buttons).toHaveLength(2)
    expect(buttons.map((button) => button.disabled)).toEqual([true, true])
  })
})
