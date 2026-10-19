import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import type { GitLogEntry } from "@/lib/api/types"

const { fetchHistoryCommitFileDiffMock } = vi.hoisted(() => ({
  fetchHistoryCommitFileDiffMock: vi.fn(),
}))

vi.mock("./historyDiffLoader", () => ({
  fetchHistoryCommitFileDiff: fetchHistoryCommitFileDiffMock,
}))

vi.mock("@/components/views/PierreDiffViewer", () => ({
  PierreDiffViewer: () => React.createElement("div", { "data-testid": "pierre-diff" }),
}))

const { HistoryCommitRow } = await import("./HistoryCommitRow")

const entry: GitLogEntry = {
  hash: "0123456789abcdef",
  date: "2026-01-01T00:00:00Z",
  message: "A commit",
  refs: "",
  body: "",
  author_name: "Alice",
  author_email: "alice@example.com",
  filesChanged: 1,
  insertions: 600,
  deletions: 0,
  parents: [],
}

const largeFile = {
  path: "big.ts",
  insertions: 400,
  deletions: 200,
  isBinary: false,
  changeType: "M",
}

describe("HistoryCommitRow large diff", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    fetchHistoryCommitFileDiffMock.mockReset()
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

  const renderRow = () => {
    act(() =>
      root.render(
        <I18nProvider>
          <HistoryCommitRow
            entry={entry}
            isExpanded
            onToggle={() => {}}
            files={[largeFile]}
            isLoadingFiles={false}
            onCopyHash={() => {}}
            directory="/repo"
          />
        </I18nProvider>,
      ),
    )
  }

  const fileRow = () =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(largeFile.path))

  test("an open large diff can be collapsed without loading it", () => {
    renderRow()
    act(() => fileRow()?.click())

    // The first click opens the row and stops at the large-diff guard: nothing was fetched, so
    // `diffCache` has no entry for the path.
    expect(container.textContent).toContain("Large diff (600 changed lines)")
    expect(fetchHistoryCommitFileDiffMock).not.toHaveBeenCalled()

    act(() => fileRow()?.click())

    // The second click must still collapse the row. Requiring a cache entry sent it back through
    // the open path, where the same guard returned early and left it open for good.
    expect(container.textContent).not.toContain("Large diff (600 changed lines)")
    expect(fetchHistoryCommitFileDiffMock).not.toHaveBeenCalled()
  })
})
