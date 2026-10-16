import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { toast } from "@/components/ui"

const statFile = vi.fn()
const getGitStatus = vi.fn()
const getGitDiff = vi.fn()
const getGitLog = vi.fn()
const getCommitPatch = vi.fn()

vi.doMock("@/hooks/useRuntimeAPIs", () => ({
  useRuntimeAPIs: () => ({
    files: { statFile },
    git: { getGitStatus, getGitDiff, getGitLog },
  }),
}))
vi.doMock("@/lib/gitApi", () => ({ getCommitPatch }))
vi.doMock("@/hooks/useChatSearchDirectory", () => ({ useChatSearchDirectory: () => "/repo" }))

const { FileMentionAutocomplete } = await import("./FileMentionAutocomplete")
const { useFilesViewTabsStore } = await import("@/stores/useFilesViewTabsStore")
const { useAgentsStore } = await import("@/stores/useAgentsStore")
const { useFileSearchStore } = await import("@/stores/useFileSearchStore")
const { useTerminalStore } = await import("@/stores/useTerminalStore")

const ROOT = "/repo"
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

describe("FileMentionAutocomplete recent files", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() =>
      root.render(
        <I18nProvider>
          <FileMentionAutocomplete searchQuery="" onFileSelect={vi.fn()} onClose={vi.fn()} />
        </I18nProvider>,
      ),
    )
  }

  const flush = () => act(async () => {})

  const recentLabels = () =>
    Array.from(container.querySelectorAll("[aria-label]"))
      .map((element) => element.getAttribute("aria-label") ?? "")
      .filter((label) => label.length > 0)

  beforeEach(() => {
    statFile.mockReset()
    getGitStatus.mockReset()
    getGitDiff.mockReset()
    getGitLog.mockReset()
    getCommitPatch.mockReset()
    useTerminalStore.setState({ sessions: new Map() })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useFilesViewTabsStore.setState({ byRoot: {} })
    useAgentsStore.setState({ agents: [] })
    useFileSearchStore.setState({ searchFiles: vi.fn(async () => []) })
    useFilesViewTabsStore.getState().addOpenPath(ROOT, `${ROOT}/gone.ts`)
    useFilesViewTabsStore.getState().addOpenPath(ROOT, `${ROOT}/kept.ts`)
    useFilesViewTabsStore.getState().setSelectedPath(ROOT, `${ROOT}/kept.ts`)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("offers a recent file whose path is still there", async () => {
    statFile.mockImplementation(async (path: string) => ({ isFile: true, path, size: 1 }))
    render()
    await flush()

    expect(recentLabels()).toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
    expect(container.textContent).not.toContain("Uncommitted changes")
  })

  test("drops a recent file whose path is gone and closes its unselected tab", async () => {
    statFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/gone.ts` ? { isFile: false, path, size: 0 } : { isFile: true, path, size: 1 },
    )
    render()
    await flush()

    expect(recentLabels()).not.toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
    expect(useFilesViewTabsStore.getState().byRoot[ROOT]?.openPaths).toEqual([`${ROOT}/kept.ts`])
  })

  test("drops a gone file that is the one on screen, without closing its tab", async () => {
    useFilesViewTabsStore.getState().setSelectedPath(ROOT, `${ROOT}/gone.ts`)
    statFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/gone.ts` ? { isFile: false, path, size: 0 } : { isFile: true, path, size: 1 },
    )
    render()
    await flush()

    expect(recentLabels()).not.toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
    const rootTabs = useFilesViewTabsStore.getState().byRoot[ROOT]
    expect(rootTabs?.openPaths).toEqual([`${ROOT}/gone.ts`, `${ROOT}/kept.ts`])
    expect(rootTabs?.selectedPath).toBe(`${ROOT}/gone.ts`)
  })

  test("keeps a recent file whose stat fails for a reason other than being gone", async () => {
    statFile.mockImplementation(async (path: string) => {
      if (path === `${ROOT}/gone.ts`) {
        throw new Error("EACCES: permission denied")
      }
      return { isFile: true, path, size: 1 }
    })
    render()
    await flush()

    expect(recentLabels()).toContain("gone.ts")
  })
})

describe("FileMentionAutocomplete context mentions", () => {
  let container: HTMLDivElement
  let root: Root
  const mentionRef = React.createRef<{ handleKeyDown: (key: string) => void }>()
  const onContextAttachment = vi.fn()
  const onClose = vi.fn()

  const renderMenu = (searchQuery = "") => {
    act(() =>
      root.render(
        <I18nProvider>
          <FileMentionAutocomplete
            ref={mentionRef}
            searchQuery={searchQuery}
            onFileSelect={vi.fn()}
            onContextAttachment={onContextAttachment}
            onClose={onClose}
          />
        </I18nProvider>,
      ),
    )
  }

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  const labels = () =>
    Array.from(container.querySelectorAll("[aria-label]")).map((element) => element.getAttribute("aria-label") ?? "")

  const readBlobText = async (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })

  const clickLabel = async (label: string) => {
    const element = Array.from(container.querySelectorAll("[aria-label]")).find(
      (node) => node.getAttribute("aria-label") === label,
    )
    if (!(element instanceof HTMLElement)) {
      throw new Error(`missing row ${label}`)
    }
    await act(async () => {
      element.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  const setTerminalOutput = (chunks: string[]) => {
    useTerminalStore.setState({
      sessions: new Map([
        [
          "/repo",
          {
            activeTabId: "tab-1",
            tabs: [
              {
                id: "tab-1",
                label: "zsh",
                terminalSessionId: null,
                lifecycle: "idle",
                iconKey: null,
                bufferChunks: chunks.map((data, id) => ({ id, data })),
                bufferLength: chunks.join("").length,
                isConnecting: false,
                createdAt: 1,
                previewUrl: null,
                previewAutoOpened: false,
                previewUrlLocked: false,
              },
            ],
          },
        ],
      ]),
    })
  }

  beforeEach(() => {
    statFile.mockReset()
    getGitStatus.mockReset()
    getGitDiff.mockReset()
    getGitLog.mockReset()
    getCommitPatch.mockReset()
    onContextAttachment.mockReset()
    onClose.mockReset()
    vi.spyOn(toast, "error").mockImplementation(() => "")
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useFilesViewTabsStore.setState({ byRoot: {} })
    useAgentsStore.setState({ agents: [] })
    useFileSearchStore.setState({ searchFiles: vi.fn(async () => []) })
    useTerminalStore.setState({ sessions: new Map() })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    useTerminalStore.setState({ sessions: new Map() })
  })

  test("lists terminal, diff, and commit rows for an empty query", () => {
    setTerminalOutput(["ready\n"])
    renderMenu("")

    expect(labels()).toEqual(["zsh", "Uncommitted changes", "Commit"])
    expect(container.textContent).toContain("Context")
    expect(container.textContent).toContain("Active")
  })

  test("filters to the diff row for @uncommitted and keeps commit closed", () => {
    renderMenu("uncommitted")

    expect(labels()).toEqual(["Uncommitted changes"])
    expect(container.textContent).not.toContain("Recent commits")
  })

  test("attaches stripped terminal output as a text file", async () => {
    setTerminalOutput(["\u001b[32mhello from terminal\u001b[0m\r\n"])
    renderMenu("term")
    await flush()

    await act(async () => {
      mentionRef.current?.handleKeyDown("Enter")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onContextAttachment).toHaveBeenCalledTimes(1)
    const file = onContextAttachment.mock.calls[0]?.[0] as File
    expect(file.name).toBe("Terminal output (zsh)")
    expect(file.type).toBe("text/plain")
    expect(await readBlobText(file)).toBe("Terminal output (zsh)\n\nhello from terminal\n")
  })

  test("does not attach a hidden file hit while a search is still running", async () => {
    // The list renders a spinner while a search runs, but `files` keeps the previous query's hits until the new
    // one settles: Enter or Tab then attached a mention that was nowhere on screen.
    setTerminalOutput(["ready\n"])
    let releaseSecondSearch = () => {}
    useFileSearchStore.setState({
      searchFiles: vi.fn((_directory, query: string) => {
        if (query === "term") {
          return Promise.resolve([{ path: "/repo/terms.md", name: "terms.md", relativePath: "terms.md" }])
        }
        return new Promise((resolve) => {
          releaseSecondSearch = () => resolve([])
        })
      }) as never,
    })

    // `renderMenu` wires its own throwaway `onFileSelect`, so this renders the same tree with one this test owns.
    const onFileSelect = vi.fn()
    const render = (searchQuery: string) =>
      act(() =>
        root.render(
          <I18nProvider>
            <FileMentionAutocomplete
              ref={mentionRef}
              searchQuery={searchQuery}
              onFileSelect={onFileSelect}
              onContextAttachment={onContextAttachment}
              onClose={onClose}
            />
          </I18nProvider>,
        ),
      )

    render("term")
    await flush()
    expect(labels()).toContain("terms.md")
    render("terms")
    // Past the 180 ms input debounce, so the second search has started and is still in flight.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })

    act(() => {
      mentionRef.current?.handleKeyDown("Enter")
    })

    expect(onFileSelect).not.toHaveBeenCalled()

    await act(async () => {
      releaseSecondSearch()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  test("still answers the keys for a context row while a search runs", async () => {
    // The context rows are not behind the spinner, so refusing every key while loading stopped the terminal and
    // diff rows from being picked at all.
    setTerminalOutput(["ready\n"])
    let releaseSearch = () => {}
    useFileSearchStore.setState({
      searchFiles: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseSearch = () => resolve([])
          }),
      ) as never,
    })

    renderMenu("term")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })

    // Attaching a context row reads the terminal store, so the handler's work settles a tick later.
    await act(async () => {
      mentionRef.current?.handleKeyDown("Enter")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onContextAttachment).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseSearch()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  test("puts the selection on the first context row when a search starts", async () => {
    // A search swaps the file rows out for a spinner while the context rows stay on screen, and the keys stay
    // live for them. `selectedIndex` was left where the file list had it: with one context row and file row 1
    // selected, the row the user had picked was no longer rendered while Enter still wrapped onto the context
    // row below the spinner.
    setTerminalOutput(["ready\n"])
    let releaseSearch = () => {}
    useFileSearchStore.setState({
      searchFiles: vi.fn((_directory, query: string) => {
        if (query === "term") {
          return Promise.resolve([
            { path: `${ROOT}/terminal.md`, name: "terminal.md", relativePath: "terminal.md" },
            { path: `${ROOT}/terms.md`, name: "terms.md", relativePath: "terms.md" },
            { path: `${ROOT}/termux.md`, name: "termux.md", relativePath: "termux.md" },
          ])
        }
        return new Promise((resolve) => {
          releaseSearch = () => resolve([])
        })
      }) as never,
    })

    renderMenu("term")
    await flush()
    expect(labels()).toContain("termux.md")

    await act(async () => {
      mentionRef.current?.handleKeyDown("ArrowDown")
    })
    const selectedText = () => container.querySelector(".bg-interactive-selection")?.textContent ?? ""
    expect(selectedText()).toContain("terminal.md")

    // A longer query, still a context keyword, so the context row stays on screen while the search runs.
    renderMenu("terminal")
    await flush()

    await act(async () => {
      mentionRef.current?.handleKeyDown("ArrowDown")
    })
    expect(selectedText()).toContain("terminal.md")

    // Past the 180 ms input debounce, so the second search has started and is still in flight.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })

    expect(selectedText()).toContain("zsh")

    await act(async () => {
      mentionRef.current?.handleKeyDown("Enter")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onContextAttachment).toHaveBeenCalledTimes(1)
    expect((onContextAttachment.mock.calls[0]?.[0] as File).name).toBe("Terminal output (zsh)")

    await act(async () => {
      releaseSearch()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  test("keeps the highlighted context row when later terminal output arrives", async () => {
    setTerminalOutput(["one\n"])
    renderMenu("")
    const selectedLabel = () => container.querySelector(".bg-interactive-selection")?.getAttribute("aria-label")

    await act(async () => {
      mentionRef.current?.handleKeyDown("ArrowDown")
    })
    expect(selectedLabel()).toBe("Uncommitted changes")

    setTerminalOutput(["one\n", "two\n"])
    await flush()

    expect(selectedLabel()).toBe("Uncommitted changes")
  })

  test("attaches the uncommitted diff", async () => {
    getGitStatus.mockResolvedValue({
      isClean: false,
      files: [{ path: "a.ts", index: " ", working_dir: "M" }],
    })
    getGitDiff.mockResolvedValue({ diff: "diff --git a/a.ts b/a.ts\n+hello\n" })
    renderMenu("diff")
    await flush()
    await clickLabel("Uncommitted changes")

    const file = onContextAttachment.mock.calls[0]?.[0] as File
    expect(file.name).toBe("Uncommitted changes")
    const body = await readBlobText(file)
    expect(body.startsWith("Uncommitted changes\n\n## Unstaged changes")).toBe(true)
    expect(body).toContain("+hello")
  })

  test("opens recent commits and returns without closing the menu", async () => {
    getGitLog.mockResolvedValue({
      all: [
        { hash: "abc1234def567", message: "Fix mentions", body: "" },
        { hash: "fff0000aaaaaa", message: "Other change", body: "" },
      ],
    })
    renderMenu("commit")
    await flush()
    await clickLabel("Commit")

    expect(onClose).not.toHaveBeenCalled()
    expect(labels()).toContain("Back")
    expect(labels()).toContain("abc1234 Fix mentions")
    expect(labels()).toContain("fff0000 Other change")

    await act(async () => {
      mentionRef.current?.handleKeyDown("Escape")
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(labels()).toContain("Commit")
    expect(labels()).not.toContain("Back")
  })

  test("attaches the chosen commit message and diff", async () => {
    getGitLog.mockResolvedValue({
      all: [{ hash: "abc1234def567", message: "Fix mentions", body: "Explains the fix" }],
    })
    getCommitPatch.mockResolvedValue({
      patch:
        "commit abc1234def567\n\n    Fix mentions\n\n    Explains the fix\n\ndiff --git a/a.ts b/a.ts\n-old\n+new\n",
      truncated: false,
    })
    renderMenu("commit")
    await flush()
    await clickLabel("Commit")
    await clickLabel("abc1234 Fix mentions")

    const file = onContextAttachment.mock.calls[0]?.[0] as File
    expect(file.name).toBe("Commit abc1234: Fix mentions")
    expect(file.type).toBe("text/plain")
    const body = await readBlobText(file)
    expect(body.startsWith("Commit abc1234: Fix mentions\n\ncommit abc1234def567")).toBe(true)
    expect(getCommitPatch).toHaveBeenCalledWith("/repo", "abc1234def567")
    expect(body).toContain("Explains the fix")
    expect(body).toContain("diff --git a/a.ts b/a.ts")
    expect(body).toContain("-old")
    expect(body).toContain("+new")
  })

  test("toasts when the terminal has no output", async () => {
    renderMenu("terminal")
    await flush()
    await clickLabel("Recent output from the integrated terminal")

    expect(onContextAttachment).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("This terminal has no output yet")
  })
})
