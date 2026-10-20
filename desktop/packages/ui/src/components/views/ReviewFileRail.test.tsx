import React from "react"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import {
  reviewFileSignature,
  useReviewPaneFileKeys,
  useReviewProgressStore,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"

import { ReviewFileRail, ReviewProgressCompact } from "./ReviewFileRail"

const DIRECTORY = "/repo"
const SCOPE = "working"

const sampleFiles: ReviewProgressFile[] = [
  { path: "src/a.ts", index: "M", working_dir: " ", insertions: 1, deletions: 0 },
  { path: "src/b.ts", index: "M", working_dir: "M", insertions: 2, deletions: 3 },
  { path: "docs/README.md", index: "A", working_dir: " ", insertions: 10, deletions: 0 },
]

export function ReviewHarness({
  files,
  initialSelected = files[0]?.path ?? null,
}: {
  files: ReviewProgressFile[]
  initialSelected?: string | null
}) {
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = React.useState<string | null>(initialSelected)
  const keyed = React.useMemo(
    () => files.map((file) => ({ path: file.path, signature: reviewFileSignature(file) })),
    [files],
  )
  useReviewPaneFileKeys({
    paneRef,
    directory: DIRECTORY,
    scope: SCOPE,
    files: keyed,
    selectedFile: selected,
    onSelectFile: setSelected,
  })

  return (
    <I18nProvider>
      <div ref={paneRef} data-review-changes tabIndex={0}>
        <output data-testid="selected">{selected}</output>
        <ReviewFileRail
          directory={DIRECTORY}
          scope={SCOPE}
          files={files}
          selectedFile={selected}
          onSelectFile={setSelected}
        />
      </div>
    </I18nProvider>
  )
}

const selectedText = () => screen.getByTestId("selected").textContent
const progress = () => screen.getByRole("progressbar")

describe("ReviewFileRail", () => {
  beforeEach(() => {
    useReviewProgressStore.setState({ marks: {} })
  })

  afterEach(() => {
    cleanup()
  })

  test("renders progress and toggles viewed without hiding the row", () => {
    render(<ReviewHarness files={sampleFiles} />)

    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
    expect(progress().getAttribute("aria-valuemin")).toBe("0")
    expect(progress().getAttribute("aria-valuemax")).toBe("3")
    expect(progress().getAttribute("aria-valuenow")).toBe("0")
    expect(progress().getAttribute("aria-label")).toBe("0 of 3 viewed")

    const current = screen.getByRole("listitem", { current: true })
    expect(current.getAttribute("data-review-file")).toBe("src/a.ts")
    expect(current.querySelector("[aria-label='Modified file']")?.textContent).toBe("M")
    expect((current.querySelector("[aria-label='Modified file']") as HTMLElement).style.color).toBe(
      "var(--status-warning)",
    )
    expect(screen.getByTitle("src/a.ts").textContent).toContain("a.ts")
    expect(screen.getByTitle("src/a.ts").textContent).toContain("src")

    const checkbox = screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(screen.getByText("1 of 3 viewed")).toBeTruthy()
    expect(progress().getAttribute("aria-valuenow")).toBe("1")
    expect(screen.getByText("a.ts").classList.contains("review-file-rail__name--viewed")).toBe(true)
    expect(screen.getByRole("listitem", { current: true }).getAttribute("data-review-file")).toBe("src/a.ts")

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
    expect(screen.getByText("a.ts").classList.contains("review-file-rail__name--viewed")).toBe(false)
  })

  test("filter narrows rows by path substring without changing the progress total", () => {
    render(<ReviewHarness files={sampleFiles} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter files" }), { target: { value: "ReAd" } })

    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("README.md")).toBeTruthy()
    expect(screen.queryByText("a.ts")).toBeNull()
    expect(screen.queryByText("b.ts")).toBeNull()
    expect(screen.getByText("1 of 3 viewed")).toBeTruthy()
    expect(progress().getAttribute("aria-valuemax")).toBe("3")
  })

  test("] [ and v select the expected file and skip text entry", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const pane = document.querySelector("[data-review-changes]") as HTMLElement
    pane.focus()

    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe("src/b.ts")
    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe("docs/README.md")
    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe("docs/README.md")

    fireEvent.keyDown(pane, { key: "[" })
    expect(selectedText()).toBe("src/b.ts")
    fireEvent.keyDown(pane, { key: "[" })
    expect(selectedText()).toBe("src/a.ts")
    fireEvent.keyDown(pane, { key: "[" })
    expect(selectedText()).toBe("src/a.ts")

    const filter = screen.getByRole("searchbox", { name: "Filter files" })
    filter.focus()
    fireEvent.keyDown(filter, { key: "]" })
    expect(selectedText()).toBe("src/a.ts")

    pane.focus()
    fireEvent.keyDown(pane, { key: "v" })
    expect(selectedText()).toBe("src/b.ts")
    expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(true)

    fireEvent.keyDown(pane, { key: "v" })
    expect(selectedText()).toBe("docs/README.md")
    expect((screen.getByRole("checkbox", { name: "Mark b.ts as viewed" }) as HTMLInputElement).checked).toBe(true)

    fireEvent.keyDown(pane, { key: "v" })
    expect(selectedText()).toBe("docs/README.md")
    expect((screen.getByRole("checkbox", { name: "Mark README.md as viewed" }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText("3 of 3 viewed")).toBeTruthy()
  })

  test("a signature change clears viewed for that file", () => {
    const { rerender } = render(<ReviewHarness files={sampleFiles} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark README.md as viewed" }))
    expect(progress().getAttribute("aria-valuenow")).toBe("1")
    expect(screen.getByText("README.md").classList.contains("review-file-rail__name--viewed")).toBe(true)

    const edited = sampleFiles.map((entry) => (entry.path === "docs/README.md" ? { ...entry, insertions: 11 } : entry))
    rerender(<ReviewHarness files={edited} />)

    const readme = screen.getByRole("checkbox", { name: "Mark README.md as viewed" }) as HTMLInputElement
    expect(readme.checked).toBe(false)
    expect(screen.getByText("README.md").classList.contains("review-file-rail__name--viewed")).toBe(false)
    expect(progress().getAttribute("aria-valuenow")).toBe("0")
    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
  })

  test("the compact progress marks the selected file and counts it like the rail", () => {
    render(
      <I18nProvider>
        <ReviewProgressCompact directory={DIRECTORY} scope={SCOPE} files={sampleFiles} selectedFile="src/b.ts" />
      </I18nProvider>,
    )
    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
    const toggle = screen.getByRole("button", { name: "Mark b.ts as viewed" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(toggle)
    expect(screen.getByText("1 of 3 viewed")).toBeTruthy()
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    const b = sampleFiles[1]
    expect(useReviewProgressStore.getState().isViewed(DIRECTORY, SCOPE, b.path, reviewFileSignature(b))).toBe(true)
  })
})
