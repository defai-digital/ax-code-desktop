import { readFile } from "node:fs/promises"
import path from "node:path"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { writeFile, createDirectory, rename, deletePath, toastError, toastSuccess } = vi.hoisted(() => ({
  writeFile: vi.fn(),
  createDirectory: vi.fn(),
  rename: vi.fn(),
  deletePath: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

// A stable object: the view threads these through effect dependencies.
const runtimeAPIs = {
  files: {
    writeFile: (...args: unknown[]) => writeFile(...args),
    createDirectory: (...args: unknown[]) => createDirectory(...args),
    rename: (...args: unknown[]) => rename(...args),
    delete: (...args: unknown[]) => deletePath(...args),
    statFile: vi.fn(async () => null),
    readFile: vi.fn(async () => ({ content: "", path: "" })),
    listDirectory: vi.fn(async () => ({ entries: [] })),
  },
  runtime: {},
}

vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => runtimeAPIs }))
vi.mock("@/components/ui", () => ({
  toast: { error: toastError, success: toastSuccess, message: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, isTablet: false, screenWidth: 1400, hasTouchInput: false }),
}))
vi.mock("@/lib/directoryShowHidden", () => ({ useDirectoryShowHidden: () => false }))
vi.mock("@/lib/filesViewShowGitignored", () => ({ useFilesViewShowGitignored: () => false }))
// The real theme object: the view (and the CodeMirror theme built from it) reads many palette groups,
// and a hand-written stub only moves the next missing field along.
vi.mock("@/contexts/useThemeSystem", async () => {
  const { getDefaultTheme } = await vi.importActual<typeof import("@/lib/theme/themes")>("@/lib/theme/themes")
  return {
    useThemeSystem: () => ({
      currentTheme: getDefaultTheme(true),
      availableThemes: [],
      lightThemeId: "light",
      darkThemeId: "dark",
    }),
  }
})
vi.mock("@/stores/useGitStore", () => ({ useGitStatus: () => null }))
vi.mock("@/components/ui/CodeMirrorEditor", () => ({ CodeMirrorEditor: () => null }))
vi.mock("@pierre/diffs/react", () => ({ File: () => null }))
vi.mock("@/components/chat/MarkdownRenderer", () => ({ SimpleMarkdownRenderer: () => null }))

// The view is large and reads a lot of store members. Data is spelled out per store; an action the
// render path needs but the state does not name fails loudly as "not a function", which is easier to
// act on than a silent no-op.
const stubStore = <State extends object,>(state: State) => {
  const proxied = new Proxy(state, {
    get: (target, prop) => (prop in target ? Reflect.get(target, prop) : undefined),
  }) as State
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(proxied) : proxied)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => proxied
  return useStore
}

vi.mock("@/stores/useFileSearchStore", () => ({
  useFileSearchStore: stubStore({ searchFiles: vi.fn(async () => []), invalidateDirectory: vi.fn() }),
}))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: stubStore({
    settingsDefaultFileViewerPreview: false,
    shortcutOverrides: {},
    setMainTabGuard: vi.fn(),
  }),
}))
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: stubStore({ settingsGitmojiEnabled: false }) }))
vi.mock("@/stores/useFilesViewTabsStore", () => ({
  useFilesViewTabsStore: stubStore({
    byRoot: {},
    pendingFileFocusPath: null,
    pendingFileNavigation: null,
    openingFileAtChange: null,
    addOpenPath: vi.fn(),
    removeOpenPath: vi.fn(),
    removeOpenPathsByPrefix: vi.fn(),
    setSelectedPath: vi.fn(),
    toggleExpandedPath: vi.fn(),
    setPendingFileFocusPath: vi.fn(),
    setPendingFileNavigation: vi.fn(),
  }),
}))
vi.mock("@/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: unknown) => value }))

const { FilesView } = await import("./FilesView-impl")

describe("FilesView file dialogs", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    writeFile.mockReset()
    createDirectory.mockReset()
    rename.mockReset()
    deletePath.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <FilesView />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const clickByLabel = async (label: string) => {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!button) throw new Error(`button not found: ${label}`)
    await act(async () => {
      button.click()
    })
  }

  const typeIntoDialog = async (value: string) => {
    const target = document.querySelector<HTMLInputElement>(
      `input[placeholder="${dict["filesView.dialog.namePlaceholder"]}"]`,
    )
    if (!target) throw new Error("dialog input not found")
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    await act(async () => {
      setter?.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  const submitDialog = async () => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => element.textContent === dict["filesView.dialog.confirm"],
    )
    if (!button) throw new Error("dialog confirm button not found")
    await act(async () => {
      button.click()
    })
    await act(async () => {})
  }

  // The Files API reports failure by resolving `{ success: false }`, and the dialog used to close on
  // that result without a word: the user believed a file had been created when nothing happened.
  test("reports a refused file creation instead of closing quietly", async () => {
    writeFile.mockResolvedValue({ success: false, path: "/repo/new.md" })
    await render()

    await clickByLabel(dict["filesView.tree.actions.newFileTitle"])
    await typeIntoDialog("new.md")
    await submitDialog()

    expect(writeFile).toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(dict["sidebarFilesTree.toast.operationFailed"])
    expect(toastSuccess).not.toHaveBeenCalledWith(dict["sidebarFilesTree.toast.fileCreated"])
  })

  test("rejects a name that would escape the directory scoped by the dialog", async () => {
    writeFile.mockResolvedValue({ success: true, path: "/repo/new.md" })
    await render()

    await clickByLabel(dict["filesView.tree.actions.newFileTitle"])
    await typeIntoDialog("../../evil.txt")
    await submitDialog()

    expect(toastError).toHaveBeenCalledWith(dict["sidebarFilesTree.toast.nameInvalid"])
    expect(writeFile).not.toHaveBeenCalled()
  })

  // The rename dialog opens from a tree row's context menu, and this harness renders no rows, so its
  // guard is asserted against the source — including that it comes before the rename call, which is
  // the whole point: `rename` replaces an existing target.
  test("refuses to rename onto an existing file", async () => {
    const source = await readFile(path.resolve(__dirname, "FilesView-impl.tsx"), "utf8")

    const collisionCheck = source.indexOf("const existingTarget = files.statFile")
    const renameCall = source.indexOf("await files\n          .rename(oldPath, newPath)")
    expect(collisionCheck).toBeGreaterThan(-1)
    expect(renameCall).toBeGreaterThan(-1)
    expect(collisionCheck).toBeLessThan(renameCall)
    expect(source.slice(collisionCheck, renameCall)).toContain('fileAlreadyExists')
  })

  test("confirms a created file", async () => {
    writeFile.mockResolvedValue({ success: true, path: "/repo/new.md" })
    await render()

    await clickByLabel(dict["filesView.tree.actions.newFileTitle"])
    await typeIntoDialog("new.md")
    await submitDialog()

    expect(toastSuccess).toHaveBeenCalledWith(dict["sidebarFilesTree.toast.fileCreated"])
    expect(toastError).not.toHaveBeenCalled()
  })
})
