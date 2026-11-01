import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const { tabsState, uiState, writeFile, readFile, toastError } = vi.hoisted(() => {
  const tabsState = {
    openPaths: ["/repo/a.txt"],
    selectedPath: "/repo/a.txt" as string | null,
    expandedPaths: [] as string[],
    touchedAt: 0,
  }
  const setActiveMainTab = vi.fn()
  const setMainTabGuard = vi.fn()
  type PendingNavigation = { path: string; line: number; column?: number }
  type UiState = {
    settingsDefaultFileViewerPreview: boolean
    shortcutOverrides: Record<string, unknown>
    pendingFileNavigation: PendingNavigation | null
    pendingFileFocusPath: string | null
    mainTabGuard: ((next: string) => boolean) | null
    setMainTabGuard: (guard: ((next: string) => boolean) | null) => void
    setActiveMainTab: (tab: string) => void
    setPendingFileNavigation: (navigation: PendingNavigation | null) => void
    setPendingFileFocusPath: (path: string | null) => void
  }
  const uiState: UiState = {
    settingsDefaultFileViewerPreview: false,
    shortcutOverrides: {},
    pendingFileNavigation: null,
    pendingFileFocusPath: null,
    mainTabGuard: null,
    setMainTabGuard: (guard) => {
      uiState.mainTabGuard = guard
      setMainTabGuard(guard)
    },
    setActiveMainTab,
    setPendingFileNavigation: (navigation) => {
      uiState.pendingFileNavigation = navigation
    },
    setPendingFileFocusPath: (path) => {
      uiState.pendingFileFocusPath = path
    },
  }
  return {
    tabsState,
    uiState,
    writeFile: vi.fn(async () => ({ success: true })),
    readFile: vi.fn(),
    setMainTabGuard,
    setActiveMainTab,
    toastError: vi.fn(),
  }
})

const fileContents: Record<string, string> = { "/repo/a.txt": "alpha\n", "/repo/b.txt": "beta\n" }

const runtimeAPIs = {
  files: {
    writeFile: (...args: unknown[]) => writeFile(...(args as [])),
    readFile: (path: string) => readFile(path),
    statFile: vi.fn(async () => ({ size: 6, mtimeMs: 1 })),
    listDirectory: vi.fn(async () => ({ entries: [] })),
    createDirectory: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
  runtime: {},
}
readFile.mockImplementation(async (path: string) => ({ content: fileContents[path] ?? "", path }))

vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => runtimeAPIs }))
vi.mock("@/components/ui", () => ({
  toast: { error: toastError, success: vi.fn(), message: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, isTablet: false, screenWidth: 1400, hasTouchInput: false }),
}))
vi.mock("@/lib/directoryShowHidden", () => ({ useDirectoryShowHidden: () => false }))
vi.mock("@/lib/filesViewShowGitignored", () => ({ useFilesViewShowGitignored: () => false }))
vi.mock("@/contexts/useThemeSystem", async () => {
  const { getDefaultTheme } = await vi.importActual<typeof import("@/lib/theme/themes")>("@/lib/theme/themes")
  return {
    useThemeSystem: () => ({
      currentTheme: getDefaultTheme(true),
      availableThemes: [],
      lightThemeId: "light",
      darkThemeId: "dark",
    }),
    useOptionalThemeSystem: () => ({
      currentTheme: getDefaultTheme(true),
      availableThemes: [],
      lightThemeId: "light",
      darkThemeId: "dark",
    }),
  }
})
vi.mock("@/stores/useGitStore", () => ({ useGitStatus: () => null }))
vi.mock("@pierre/diffs/react", () => ({ File: () => null }))
vi.mock("@/components/chat/MarkdownRenderer", () => ({ SimpleMarkdownRenderer: () => null }))
vi.mock("@/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: unknown) => value }))

vi.mock("@/components/ui/CodeMirrorEditor", () => ({ CodeMirrorEditor: () => null }))

// An action the render path needs but the state does not name fails loudly as
// "not a function", so only the members FilesView actually reads are listed.
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
  useUIStore: stubStore(uiState),
}))
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: stubStore({ settingsDefaultFileViewerPreview: false, settingsGitmojiEnabled: false }),
}))
vi.mock("@/stores/useFilesViewTabsStore", () => ({
  useFilesViewTabsStore: stubStore({
    get byRoot() {
      return { "/repo": tabsState }
    },
    pendingFileFocusPath: null,
    pendingFileNavigation: null,
    openingFileAtChange: null,
    addOpenPath: vi.fn(),
    removeOpenPath: vi.fn(),
    removeOpenPathsByPrefix: vi.fn(),
    removeUnselectedOpenPath: vi.fn(),
    setSelectedPath: (_root: string, path: string | null) => {
      tabsState.selectedPath = path
    },
    toggleExpandedPath: vi.fn(),
    expandPaths: vi.fn(),
    setPendingFileFocusPath: vi.fn(),
    setPendingFileNavigation: vi.fn(),
  }),
}))

const { FilesView } = await import("./FilesView-impl")

describe("FilesView polling while its pane is hidden", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    tabsState.openPaths = ["/repo/a.txt"]
    tabsState.selectedPath = "/repo/a.txt"
    uiState.pendingFileNavigation = null
    uiState.mainTabGuard = null
    runtimeAPIs.files.statFile.mockClear()
    runtimeAPIs.files.listDirectory.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const render = async (active: boolean) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <FilesView mode="editor-only" active={active} />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  test("a hidden pane neither stats the open file nor refreshes the tree, and resumes once shown", async () => {
    await render(false)
    const stats = runtimeAPIs.files.statFile.mock.calls.length
    const listings = runtimeAPIs.files.listDirectory.mock.calls.length

    await advance(31_000)
    expect(runtimeAPIs.files.statFile.mock.calls.length).toBe(stats)
    expect(runtimeAPIs.files.listDirectory.mock.calls.length).toBe(listings)

    await render(true)
    await advance(2_000)
    expect(runtimeAPIs.files.statFile.mock.calls.length).toBeGreaterThan(stats)
    await advance(30_000)
    expect(runtimeAPIs.files.listDirectory.mock.calls.length).toBeGreaterThan(listings)
  })
})
