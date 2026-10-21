import React, { act } from "react"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import {
  reviewFileSignature,
  useReviewPaneFileKeys,
  useReviewProgressStore,
  type ReviewProgressFile,
} from "@/stores/useReviewProgressStore"

import { ReviewFileRail, ReviewProgressCompact } from "./ReviewFileRail"
import * as reviewRailTree from "./reviewFileRailTree"
import {
  REVIEW_RAIL_MODE_STORAGE_KEY,
  resetReviewRailForTests,
  setReviewRailWidth,
} from "./reviewFileRailTree"

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
  directory = DIRECTORY,
  scope = SCOPE,
}: {
  files: ReviewProgressFile[]
  initialSelected?: string | null
  directory?: string
  scope?: string
}) {
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = React.useState<string | null>(initialSelected)
  const keyed = React.useMemo(
    () => files.map((file) => ({ path: file.path, signature: reviewFileSignature(file) })),
    [files],
  )
  useReviewPaneFileKeys({
    paneRef,
    directory,
    scope,
    files: keyed,
    selectedFile: selected,
    onSelectFile: setSelected,
  })

  return (
    <I18nProvider>
      <div ref={paneRef} data-review-changes tabIndex={0}>
        <output data-testid="selected">{selected}</output>
        <ReviewFileRail
          directory={directory}
          scope={scope}
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
    resetReviewRailForTests()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test("renders progress and toggles viewed without hiding the row", () => {
    render(<ReviewHarness files={sampleFiles} />)

    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
    expect(progress().getAttribute("aria-valuemin")).toBe("0")
    expect(progress().getAttribute("aria-valuemax")).toBe("3")
    expect(progress().getAttribute("aria-valuenow")).toBe("0")
    expect(progress().getAttribute("aria-label")).toBe("0 of 3 viewed")

    const current = screen.getByRole("treeitem", { current: true })
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
    expect(screen.getByRole("treeitem", { current: true }).getAttribute("data-review-file")).toBe("src/a.ts")

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText("0 of 3 viewed")).toBeTruthy()
    expect(screen.getByText("a.ts").classList.contains("review-file-rail__name--viewed")).toBe(false)
  })

  test("only viewed fallback rows show an accessible count-confidence marker", () => {
    const label = "Viewed state is based on line counts and may miss edits"
    const files = [
      sampleFiles[0],
      { ...sampleFiles[1], headBlobId: "a".repeat(40), indexBlobId: "b".repeat(40), worktreeBlobId: "c".repeat(40) },
    ]
    render(<ReviewHarness files={files} />)
    expect(screen.queryByRole("img", { name: label })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    expect(screen.getByRole("img", { name: label }).getAttribute("title")).toBe(label)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark b.ts as viewed" }))
    expect(screen.getAllByRole("img", { name: label })).toHaveLength(1)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    expect(screen.queryByRole("img", { name: label })).toBeNull()
  })

  test("filter narrows rows by path substring without changing the progress total", () => {
    render(<ReviewHarness files={sampleFiles} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter files" }), { target: { value: "ReAd" } })

    expect(document.querySelectorAll("[data-review-file]")).toHaveLength(1)
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

  test("open-in-editor opens that file without changing the selection", () => {
    const onSelectFile = vi.fn()
    const onOpenFile = vi.fn()
    render(
      <I18nProvider>
        <ReviewFileRail
          directory={DIRECTORY}
          scope={SCOPE}
          files={sampleFiles}
          selectedFile="src/a.ts"
          onSelectFile={onSelectFile}
          onOpenFile={onOpenFile}
        />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Open b.ts in the editor" }))
    expect(onOpenFile).toHaveBeenCalledWith("src/b.ts")
    expect(onSelectFile).not.toHaveBeenCalled()
  })

  test("rows have no open control where nothing can be opened", () => {
    render(
      <I18nProvider>
        <ReviewFileRail
          directory={DIRECTORY}
          scope={SCOPE}
          files={sampleFiles}
          selectedFile={null}
          onSelectFile={() => {}}
        />
      </I18nProvider>,
    )
    expect(screen.queryByRole("button", { name: "Open b.ts in the editor" })).toBeNull()
  })

  test("groups directories, compresses a single-child chain, and counts reviewed files", () => {
    const files = [gitFile("a/b/c/one.ts"), gitFile("a/b/c/two.ts"), gitFile("a/keep.ts")]
    render(<ReviewHarness files={files} initialSelected="a/keep.ts" />)

    const chain = screen.getByRole("treeitem", { name: "b/c, 0 of 2 viewed" })
    expect(chain.getAttribute("aria-level")).toBe("2")
    expect(chain.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("treeitem", { name: "a, 0 of 3 viewed" }).getAttribute("aria-level")).toBe("1")
    expect(screen.queryByRole("treeitem", { name: "b, 0 of 2 viewed" })).toBeNull()
    expect(screen.queryByRole("treeitem", { name: "c, 0 of 2 viewed" })).toBeNull()

    fireEvent.click(screen.getByRole("checkbox", { name: "Mark one.ts as viewed" }))
    expect(screen.getByRole("treeitem", { name: "b/c, 1 of 2 viewed" })).toBeTruthy()
    expect(screen.getByRole("treeitem", { name: "a, 1 of 3 viewed" })).toBeTruthy()
  })

  test("groups both separators and passes the original path through", () => {
    const onSelectFile = vi.fn()
    const windows = "src\\b.ts"
    render(
      <I18nProvider>
        <ReviewFileRail
          directory={DIRECTORY}
          scope={SCOPE}
          files={[gitFile("src/a.ts"), gitFile(windows)]}
          selectedFile={null}
          onSelectFile={onSelectFile}
        />
      </I18nProvider>,
    )
    expect(screen.getAllByRole("treeitem", { name: "src, 0 of 2 viewed" })).toHaveLength(1)
    const row = reviewFileRow(windows)
    fireEvent.click(row?.querySelector("button") as HTMLButtonElement)
    expect(onSelectFile).toHaveBeenCalledWith(windows)
  })

  test("collapses and expands a directory with the pointer and the arrow keys", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const directoryRow = () => screen.getByRole("treeitem", { name: "src, 0 of 2 viewed" })
    expect(directoryRow().getAttribute("aria-expanded")).toBe("true")
    expect(directoryRow().getAttribute("aria-level")).toBe("1")

    fireEvent.click(directoryRow())
    expect(directoryRow().getAttribute("aria-expanded")).toBe("false")
    expect(collapsedFile("src/a.ts")).toBe(true)

    fireEvent.keyDown(directoryRow(), { key: "ArrowRight" })
    expect(directoryRow().getAttribute("aria-expanded")).toBe("true")
    expect(collapsedFile("src/a.ts")).toBe(false)
    expect(reviewFileRow("src/a.ts")).toBeTruthy()

    fireEvent.keyDown(directoryRow(), { key: "ArrowLeft" })
    expect(directoryRow().getAttribute("aria-expanded")).toBe("false")
    expect(collapsedFile("src/b.ts")).toBe(true)
  })

  test("keeps collapse per directory and scope for the session", () => {
    const files = [gitFile("top.ts"), gitFile("src/a.ts")]
    const { rerender } = render(<ReviewHarness files={files} initialSelected="top.ts" />)
    fireEvent.click(screen.getByRole("treeitem", { name: "src, 0 of 1 viewed" }))
    expect(collapsedFile("src/a.ts")).toBe(true)

    rerender(<ReviewHarness files={files} initialSelected="top.ts" scope="staged" />)
    expect(screen.getByRole("treeitem", { name: "src, 0 of 1 viewed" }).getAttribute("aria-expanded")).toBe("true")
    expect(document.querySelector("[data-review-file='src/a.ts']")).toBeTruthy()

    rerender(<ReviewHarness files={files} initialSelected="top.ts" scope={SCOPE} />)
    expect(screen.getByRole("treeitem", { name: "src, 0 of 1 viewed" }).getAttribute("aria-expanded")).toBe("false")

    rerender(<ReviewHarness files={files} initialSelected="top.ts" directory="/other" />)
    expect(screen.getByRole("treeitem", { name: "src, 0 of 1 viewed" }).getAttribute("aria-expanded")).toBe("true")
  })

  test("Enter on a file row selects that file", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const row = document.querySelector("[data-review-file='src/b.ts']") as HTMLElement
    row.focus()
    fireEvent.keyDown(row, { key: "Enter" })
    expect(selectedText()).toBe("src/b.ts")
    expect(row.getAttribute("aria-current")).toBe("true")
  })

  test("next and previous reach a file inside a collapsed directory and expand it", () => {
    const nested = "a/b/c/deep.ts"
    const files = [gitFile("top.ts"), gitFile(nested), gitFile("tail.ts")]
    render(<ReviewHarness files={files} initialSelected="top.ts" />)
    fireEvent.click(screen.getByRole("treeitem", { name: "a/b/c, 0 of 1 viewed" }))
    expect(collapsedFile(nested)).toBe(true)
    expect(reviewFileRow(nested)).toBeTruthy()

    const pane = document.querySelector("[data-review-changes]") as HTMLElement
    pane.focus()
    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe(nested)
    expect(screen.getByRole("treeitem", { name: "a/b/c, 0 of 1 viewed" }).getAttribute("aria-expanded")).toBe("true")
    expect(reviewFileRow(nested)).toBeTruthy()

    fireEvent.click(screen.getByRole("treeitem", { name: "a/b/c, 0 of 1 viewed" }))
    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe("tail.ts")
    fireEvent.keyDown(pane, { key: "[" })
    expect(selectedText()).toBe(nested)
    expect(screen.getByRole("treeitem", { name: "a/b/c, 0 of 1 viewed" }).getAttribute("aria-expanded")).toBe("true")
  })

  test("tree navigation follows visual directory order and list mode keeps the given order", () => {
    const files = [gitFile("b/1.ts"), gitFile("a/2.ts"), gitFile("b/3.ts")]
    render(<ReviewHarness files={files} initialSelected="b/1.ts" />)
    const pane = document.querySelector("[data-review-changes]") as HTMLElement
    pane.focus()
    fireEvent.keyDown(pane, { key: "]" })
    expect(selectedText()).toBe("b/3.ts")

    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(screen.getByRole("list")).toBeTruthy()
    expect(screen.queryByRole("tree")).toBeNull()
    expect(screen.getAllByRole("treeitem")).toHaveLength(0)
    expect(document.querySelectorAll("[data-review-file]")).toHaveLength(3)
    const listControls = Array.from(screen.getByRole("list").querySelectorAll<HTMLElement>("button, input")).filter(
      (element) => element.tabIndex >= 0,
    )
    expect(listControls.length).toBeGreaterThan(1)
    // List order is b/1, a/2, b/3, so the file before b/3 is a/2. Tree order would step back to b/1.
    fireEvent.keyDown(pane, { key: "[" })
    expect(selectedText()).toBe("a/2.ts")

    render(<ReviewHarness files={files} initialSelected="b/1.ts" />)
    expect(screen.getByRole("list")).toBeTruthy()
    expect(window.localStorage.getItem(REVIEW_RAIL_MODE_STORAGE_KEY)).toBe("list")
    fireEvent.click(screen.getByRole("button", { name: "Tree" }))
    expect(screen.getByRole("tree")).toBeTruthy()
  })

  test("clamps keyboard and pointer resizing to 180 and half the pane", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute("data-review-changes") ? 800 : 0
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 600, width, height: 600, toJSON() { return {} } } as DOMRect
    })
    setReviewRailWidth(390)
    render(<ReviewHarness files={sampleFiles} />)
    const separator = () => screen.getByRole("separator", { name: "Resize the file list" })
    expect(separator().getAttribute("aria-orientation")).toBe("vertical")
    expect(separator().getAttribute("aria-valuemin")).toBe("180")
    expect(separator().getAttribute("aria-valuemax")).toBe("400")
    expect(separator().getAttribute("aria-valuenow")).toBe("390")
    expect(separator().tabIndex).toBe(0)

    separator().focus()
    fireEvent.keyDown(separator(), { key: "ArrowRight" })
    expect(separator().getAttribute("aria-valuenow")).toBe("400")
    fireEvent.keyDown(separator(), { key: "ArrowRight" })
    expect(separator().getAttribute("aria-valuenow")).toBe("400")

    act(() => setReviewRailWidth(190))
    fireEvent.keyDown(separator(), { key: "ArrowLeft" })
    expect(separator().getAttribute("aria-valuenow")).toBe("180")
    fireEvent.keyDown(separator(), { key: "ArrowLeft" })
    expect(separator().getAttribute("aria-valuenow")).toBe("180")
    fireEvent.keyDown(separator(), { key: "End" })
    expect(separator().getAttribute("aria-valuenow")).toBe("400")
    fireEvent.keyDown(separator(), { key: "Home" })
    expect(separator().getAttribute("aria-valuenow")).toBe("180")

    const handle = separator()
    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, button: 0, pointerId: 1 }))
    })
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: 400, button: 0, pointerId: 1 }))
    })
    expect(separator().getAttribute("aria-valuenow")).toBe("400")
  })

  test("a blocked storage write still changes the layout in memory", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked")
    })
    render(<ReviewHarness files={sampleFiles} />)
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(screen.getByRole("list")).toBeTruthy()
  })

  test("does not regroup 2000 files when the path list is unchanged", () => {
    const build = vi.spyOn(reviewRailTree, "buildReviewFileTree")
    const files = Array.from({ length: 2000 }, (_, index) => gitFile(`group-${index % 25}/file-${index}.ts`))
    const view = render(<ReviewHarness files={files} initialSelected={files[0].path} />)
    const built = build.mock.calls.length
    expect(built).toBeGreaterThan(0)
    view.rerender(<ReviewHarness files={files.map((file) => ({ ...file }))} initialSelected={files[0].path} />)
    expect(build.mock.calls.length).toBe(built)
    fireEvent.click(screen.getAllByRole("checkbox")[0])
    expect(build.mock.calls.length).toBe(built)
    const renamed = files.map((file, index) => (index === 0 ? { ...file, path: "moved/renamed.ts" } : { ...file }))
    view.rerender(<ReviewHarness files={renamed} initialSelected={renamed[0].path} />)
    expect(build.mock.calls.length).toBeGreaterThan(built)
  })

  test("uses one tab stop and moves focus with the tree keys", () => {
    const files = [gitFile("top.ts"), gitFile("src/a.ts"), gitFile("src/nested/b.ts")]
    render(<ReviewHarness files={files} initialSelected="top.ts" />)
    const tree = screen.getByRole("tree")
    const tabbable = () =>
      Array.from(tree.querySelectorAll<HTMLElement>("button, input, [role='treeitem']")).filter(
        (element) => element.tabIndex >= 0,
      )
    const top = reviewFileRow("top.ts") as HTMLElement
    const src = () => screen.getByRole("treeitem", { name: "src, 0 of 2 viewed" })
    const nested = () => screen.getByRole("treeitem", { name: "nested, 0 of 1 viewed" })
    const fileA = () => reviewFileRow("src/a.ts") as HTMLElement
    const fileB = () => reviewFileRow("src/nested/b.ts") as HTMLElement

    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]).toBe(top)
    for (const control of tree.querySelectorAll<HTMLElement>("button, input")) {
      expect(control.tabIndex).toBe(-1)
    }

    top.focus()
    fireEvent.keyDown(top, { key: "ArrowDown" })
    expect(document.activeElement).toBe(src())
    expect(tabbable()).toHaveLength(1)
    expect(tabbable()[0]).toBe(src())
    expect(top.tabIndex).toBe(-1)

    fireEvent.keyDown(src(), { key: "ArrowDown" })
    expect(document.activeElement).toBe(fileA())
    fireEvent.keyDown(fileA(), { key: "ArrowDown" })
    expect(document.activeElement).toBe(nested())
    fireEvent.keyDown(nested(), { key: "ArrowDown" })
    expect(document.activeElement).toBe(fileB())
    fireEvent.keyDown(fileB(), { key: "ArrowUp" })
    expect(document.activeElement).toBe(nested())

    fireEvent.keyDown(nested(), { key: "Home" })
    expect(document.activeElement).toBe(top)
    fireEvent.keyDown(top, { key: "End" })
    expect(document.activeElement).toBe(fileB())

    fireEvent.keyDown(fileB(), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(nested())
    expect(nested().getAttribute("aria-expanded")).toBe("true")
    fireEvent.keyDown(nested(), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(nested())
    expect(nested().getAttribute("aria-expanded")).toBe("false")
    expect(collapsedFile("src/nested/b.ts")).toBe(true)
    expect(screen.getByRole("treeitem", { name: "src/nested/b.ts, Modified file, 0 of 1 viewed" })).toBe(fileB())

    fireEvent.keyDown(nested(), { key: "ArrowRight" })
    expect(nested().getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement).toBe(nested())
    fireEvent.keyDown(nested(), { key: "ArrowRight" })
    expect(document.activeElement).toBe(fileB())
    fireEvent.keyDown(fileB(), { key: "Enter" })
    expect(selectedText()).toBe("src/nested/b.ts")

    fireEvent.keyDown(nested(), { key: "ArrowLeft" })
    expect(nested().getAttribute("aria-expanded")).toBe("false")
    fireEvent.keyDown(nested(), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(src())
    expect(src().getAttribute("aria-expanded")).toBe("true")
    expect(nested().getAttribute("aria-expanded")).toBe("false")

    fireEvent.keyDown(src(), { key: "ArrowLeft" })
    expect(src().getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(src())
    fireEvent.keyDown(src(), { key: "ArrowDown" })
    expect(document.activeElement).toBe(src())
    expect(reviewFileRow("src/a.ts")).toBeTruthy()

    fireEvent.keyDown(src(), { key: "ArrowUp" })
    expect(document.activeElement).toBe(top)
  })

  test("keeps collapsed file rows mounted for selectors and assistive technology", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const src = screen.getByRole("treeitem", { name: "src, 0 of 2 viewed" })
    fireEvent.click(src)
    expect(src.getAttribute("aria-expanded")).toBe("false")
    const row = reviewFileRow("src/a.ts")
    expect(row).toBeTruthy()
    expect(collapsedFile("src/a.ts")).toBe(true)
    expect(row?.getAttribute("aria-hidden")).not.toBe("true")
    expect(row?.closest("[role='group']")?.getAttribute("aria-hidden")).not.toBe("true")
    expect(row?.closest("[role='group']")?.hasAttribute("hidden")).toBe(false)
    expect(src.contains(row)).toBe(true)
    expect(screen.getByRole("treeitem", { name: "src/a.ts, Modified file, 0 of 1 viewed" })).toBe(row)
  })

  test("puts directory children in a group inside the treeitem", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const tree = screen.getByRole("tree")
    expect(tree.querySelector("[role='presentation']")).toBeNull()
    const src = screen.getByRole("treeitem", { name: "src, 0 of 2 viewed" })
    const group = src.querySelector(":scope > [role='group']")
    expect(group?.getAttribute("role")).toBe("group")
    expect(group?.querySelector("[data-review-file='src/a.ts']")?.getAttribute("role")).toBe("treeitem")
    expect(group?.querySelector("[data-review-directory]")).toBeNull()
  })

  test("file rows name the path, status, and viewed state", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const row = reviewFileRow("src/b.ts")
    expect(row?.getAttribute("aria-label")).toBe("src/b.ts, Modified file, 0 of 1 viewed")
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark b.ts as viewed" }))
    expect(row?.getAttribute("aria-label")).toBe("src/b.ts, Modified file, 1 of 1 viewed")
    expect(reviewFileRow("docs/README.md")?.getAttribute("aria-label")).toBe("docs/README.md, New file, 0 of 1 viewed")
  })

  test("resize drag drops its window listeners when the rail unmounts", () => {
    render(<ReviewHarness files={sampleFiles} />)
    const handle = screen.getByRole("separator", { name: "Resize the file list" })
    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, button: 0, pointerId: 1 }),
      )
    })
    const width = reviewRailTree.getReviewRailSnapshot().width
    cleanup()
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: 400, button: 0, pointerId: 1 }),
      )
    })
    expect(reviewRailTree.getReviewRailSnapshot().width).toBe(width)
  })

  test("drops a collapse key when its directory id leaves the tree", () => {
    const files = [gitFile("a/b/c/file.ts")]
    const view = render(<ReviewHarness files={files} initialSelected="a/b/c/file.ts" />)
    fireEvent.click(screen.getByRole("treeitem", { name: "a/b/c, 0 of 1 viewed" }))
    const key = reviewRailTree.reviewRailCollapseKey(DIRECTORY, SCOPE, "a/b/c")
    expect(reviewRailTree.getReviewRailSnapshot().collapsed.has(key)).toBe(true)
    view.rerender(<ReviewHarness files={[gitFile("z.ts")]} initialSelected="z.ts" />)
    expect(reviewRailTree.getReviewRailSnapshot().collapsed.has(key)).toBe(false)
  })

  test("selection ancestor key follows the ids rather than the tree object", () => {
    const files = [{ path: "a/b/one.ts" }]
    const first = reviewRailTree.buildReviewFileTree(files)
    const second = reviewRailTree.buildReviewFileTree(files)
    expect(first).not.toBe(second)
    const key = reviewRailTree.reviewSelectionAncestorKey(first.ancestors, "a/b/one.ts")
    expect(key).toBe(reviewRailTree.reviewSelectionAncestorKey(second.ancestors, "a/b/one.ts"))
    expect(key.split("\0")).toEqual(first.ancestors.get("a/b/one.ts"))
    const withExtra = reviewRailTree.buildReviewFileTree([{ path: "a/b/one.ts" }, { path: "z.ts" }])
    expect(reviewRailTree.reviewSelectionAncestorKey(withExtra.ancestors, "a/b/one.ts")).toBe(key)
  })

  test("rebuilding the tree keeps a collapsed directory closed for the same selection", () => {
    const files = [gitFile("a/b/one.ts"), gitFile("a/b/two.ts")]
    const view = render(<ReviewHarness files={files} initialSelected="a/b/one.ts" />)
    fireEvent.click(screen.getByRole("treeitem", { name: "a/b, 0 of 2 viewed" }))
    expect(screen.getByRole("treeitem", { name: "a/b, 0 of 2 viewed" }).getAttribute("aria-expanded")).toBe("false")
    view.rerender(<ReviewHarness files={[...files, gitFile("z.ts")]} initialSelected="a/b/one.ts" />)
    expect(screen.getByRole("treeitem", { name: "a/b, 0 of 2 viewed" }).getAttribute("aria-expanded")).toBe("false")
  })

  test("does not read review rail storage until a subscriber attaches", async () => {
    vi.resetModules()
    const getItem = vi.spyOn(globalThis.localStorage, "getItem")
    getItem.mockClear()
    const mod = await import("./reviewFileRailTree")
    expect(getItem).not.toHaveBeenCalled()
    localStorage.setItem(mod.REVIEW_RAIL_MODE_STORAGE_KEY, "list")
    localStorage.setItem(mod.REVIEW_RAIL_WIDTH_STORAGE_KEY, "300")
    expect(mod.getReviewRailSnapshot().mode).toBe("tree")
    expect(mod.getReviewRailSnapshot().width).toBe(mod.REVIEW_RAIL_DEFAULT_WIDTH)
    const stop = mod.subscribeReviewRail(() => {})
    expect(mod.getReviewRailSnapshot().mode).toBe("list")
    expect(mod.getReviewRailSnapshot().width).toBe(300)
    expect(getItem).toHaveBeenCalled()
    stop()
    mod.resetReviewRailForTests()
  })
})

function reviewFileRow(path: string): Element | null {
  return (
    Array.from(document.querySelectorAll("[data-review-file]")).find(
      (element) => element.getAttribute("data-review-file") === path,
    ) ?? null
  )
}

function collapsedFile(path: string): boolean {
  const row = reviewFileRow(path)
  return row?.closest(".review-file-rail__branch--collapsed") !== null && row !== null
}

function gitFile(path: string): ReviewProgressFile {
  return { path, index: "M", working_dir: " ", insertions: 1, deletions: 0 }
}
