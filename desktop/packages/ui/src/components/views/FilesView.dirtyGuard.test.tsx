import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { tabsState, otherTabsState, directoryState, uiState, writeFile, readFile, setMainTabGuard, toastError } =
  vi.hoisted(() => {
  const tabsState = {
    openPaths: ["/repo/a.txt"],
    selectedPath: "/repo/a.txt" as string | null,
    expandedPaths: [] as string[],
    touchedAt: 0,
  }
  // The Files tabs of a second project, shown after a session in that project is opened.
  const otherTabsState = {
    openPaths: ["/other/c.txt"],
    selectedPath: "/other/c.txt" as string | null,
    expandedPaths: [] as string[],
    touchedAt: 0,
  }
  const directoryState = { current: "/repo" }
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
    otherTabsState,
    directoryState,
    uiState,
    writeFile: vi.fn(async () => ({ success: true })),
    readFile: vi.fn(),
    setMainTabGuard,
    setActiveMainTab,
    toastError: vi.fn(),
  }
})

const fileContents: Record<string, string> = {
  "/repo/a.txt": "alpha\n",
  "/repo/b.txt": "beta\n",
  "/other/c.txt": "gamma\n",
}

const runtimeAPIs = {
  files: {
    writeFile: (...args: unknown[]) => writeFile(...(args as [])),
    readFile: (path: string, options?: unknown) => readFile(path, options),
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
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => directoryState.current }))
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

// The editor is the only way to make the buffer dirty, so the mock keeps its latest
// `onChange` (FilesView passes `setDraftContent`) for the test to call.
let editorOnChange: ((value: string) => void) | null = null
let editorValue: string | null = null
vi.mock("@/components/ui/CodeMirrorEditor", () => ({
  CodeMirrorEditor: (props: { value?: string; onChange?: (value: string) => void }) => {
    editorOnChange = props.onChange ?? null
    editorValue = props.value ?? null
    return null
  },
}))

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
      // "/" stands for a project that contains this one, so the same absolute path is open under both.
      return { "/repo": tabsState, "/other": otherTabsState, "/": otherTabsState }
    },
    pendingFileFocusPath: null,
    pendingFileNavigation: null,
    openingFileAtChange: null,
    addOpenPath: vi.fn(),
    removeOpenPath: vi.fn(),
    removeOpenPathsByPrefix: vi.fn(),
    removeUnselectedOpenPath: vi.fn(),
    setSelectedPath: (root: string, path: string | null) => {
      ;(root === "/repo" ? tabsState : otherTabsState).selectedPath = path
    },
    toggleExpandedPath: vi.fn(),
    expandPaths: vi.fn(),
    setPendingFileFocusPath: vi.fn(),
    setPendingFileNavigation: vi.fn(),
  }),
}))

const { FilesView } = await import("./FilesView-impl")
const { useStrandedFilesDraftStore } = await import("./strandedFilesDraft")

describe("FilesView unsaved-changes guard", () => {
  let container: HTMLDivElement
  let root: Root
  let bump: () => void

  beforeEach(() => {
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
    otherTabsState.selectedPath = "/other/c.txt"
    directoryState.current = "/repo"
    fileContents["/repo/a.txt"] = "alpha\n"
    useStrandedFilesDraftStore.setState({ drafts: [] })
    showFiles = true
    uiState.pendingFileNavigation = null
    uiState.mainTabGuard = null
    editorOnChange = null
    editorValue = null
    writeFile.mockClear()
    readFile.mockClear()
    setMainTabGuard.mockClear()
    toastError.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // The Files panel can close with a session switch (the context panel drops it when the new project has no tabs).
  let showFiles = true
  function Harness() {
    const [, setTick] = React.useState(0)
    bump = () => setTick((tick) => tick + 1)
    return <I18nProvider>{showFiles ? <FilesView /> : null}</I18nProvider>
  }

  const render = async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {})
  }

  const clickByText = async (text: string) => {
    const button = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === text)
    if (!button) throw new Error(`button not found: ${text}`)
    await act(async () => {
      button.click()
    })
    await act(async () => {})
  }

  test("a tab switch that discards edits does not disarm the next file prompt", async () => {
    await render()
    expect(editorOnChange).toBeTypeOf("function")

    // Edit the open file, then ask to leave the tab: the guard refuses and the
    // discard dialog takes over.
    await act(async () => {
      editorOnChange?.("alpha edited\n")
    })
    const guard = setMainTabGuard.mock.calls.at(-1)?.[0] as ((next: string) => boolean) | undefined
    expect(guard).toBeTypeOf("function")
    let allowed = true
    await act(async () => {
      allowed = guard?.("diff") ?? true
    })
    expect(allowed).toBe(false)
    expect(document.body.textContent).toContain(dict["filesView.unsaved.title"])

    await clickByText(dict["filesView.unsaved.discard"])
    await act(async () => {
      bump()
    })

    // Edit again, then navigate to another file the way the app does when a diff or
    // search result asks for it. The earlier discard must not have left permission
    // behind: this switch has to prompt too.
    await act(async () => {
      editorOnChange?.("alpha edited again\n")
    })
    uiState.pendingFileNavigation = { path: "/repo/b.txt", line: 1 }
    await act(async () => {
      bump()
    })
    await act(async () => {})

    expect(readFile.mock.calls.map((call) => call[0])).not.toContain("/repo/b.txt")
    expect(document.body.textContent).toContain(dict["filesView.unsaved.title"])
  })

  test("a selection set outside the editor prompts instead of dropping the draft", async () => {
    await render()
    expect(editorOnChange).toBeTypeOf("function")

    await act(async () => {
      editorOnChange?.("alpha edited\n")
    })

    // The sidebar tree and chat file links write the store directly, so this
    // change never passes through handleSelectFile's guard.
    tabsState.selectedPath = "/repo/b.txt"
    await act(async () => {
      bump()
    })
    await act(async () => {})

    expect(document.body.textContent).toContain(dict["filesView.unsaved.title"])
    expect(readFile.mock.calls.map((call) => call[0])).not.toContain("/repo/b.txt")
    // The tab is restored to the file whose draft is still in the editor.
    expect(tabsState.selectedPath).toBe("/repo/a.txt")

    await clickByText(dict["filesView.unsaved.discard"])
    await act(async () => {})

    expect(readFile.mock.calls.map((call) => call[0])).toContain("/repo/b.txt")
  })

  test("an older file's save finishing does not unlock a second overlapping save of the current file", async () => {
    // Each write stays pending until the test settles it.
    const writes: Array<{ path: string; content: string; resolve: () => void }> = []
    // The hoisted mock is declared without parameters; the view calls it with (path, content).
    const pendingWrite = (path: string, content: string) =>
      new Promise<{ success: boolean }>((resolve) =>
        writes.push({ path, content, resolve: () => resolve({ success: true }) }),
      )
    writeFile.mockImplementation(pendingWrite as unknown as () => Promise<{ success: boolean }>)
    const save = async () => {
      await act(async () => {
        // Real key events target an element (here the body) and bubble to the window listeners.
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, ctrlKey: true, bubbles: true }))
      })
      await act(async () => {})
    }
    const writesTo = (path: string) => writes.filter((write) => write.path === path)
    try {
      await render()

      // A's save is still in flight when the user moves to B (discarding the dirty buffer).
      await act(async () => {
        editorOnChange?.("alpha edited\n")
      })
      await save()
      expect(writesTo("/repo/a.txt")).toHaveLength(1)
      tabsState.selectedPath = "/repo/b.txt"
      await act(async () => {
        bump()
      })
      await clickByText(dict["filesView.unsaved.discard"])
      await act(async () => {})

      // B's first save is in flight too.
      await act(async () => {
        editorOnChange?.("beta edited once\n")
      })
      await save()
      expect(writesTo("/repo/b.txt")).toHaveLength(1)

      // A's save finishing must not clear B's in-flight state.
      await act(async () => {
        writesTo("/repo/a.txt")[0]?.resolve()
      })
      await act(async () => {})
      await act(async () => {
        editorOnChange?.("beta edited twice\n")
      })
      await save()
      // A second, newer write of B now would race the first; if the older one landed last
      // it would leave stale content on disk.
      expect(writesTo("/repo/b.txt")).toHaveLength(1)
    } finally {
      for (const write of writes) write.resolve()
      writeFile.mockImplementation(async () => ({ success: true }))
    }
  })

  describe("opening a session in another project", () => {
    const banner = () => document.querySelector<HTMLElement>('[role="status"]')
    const bannerButton = (label: string) => {
      const found = Array.from(banner()?.querySelectorAll("button") ?? []).find((entry) => entry.textContent === label)
      if (!found) throw new Error(`banner button not found: ${label}`)
      return found
    }
    const switchProject = async () => {
      directoryState.current = "/other"
      await act(async () => {
        bump()
      })
      await act(async () => {})
    }
    const editAndSwitch = async () => {
      await render()
      await act(async () => {
        editorOnChange?.("alpha edited\n")
      })
      await switchProject()
    }

    test("keeps the unsaved draft and saves it to the file it came from", async () => {
      await editAndSwitch()

      // The editor moved on to the other project's file; the draft was not written anywhere on the way.
      expect(readFile.mock.calls.map((call) => call[0])).toContain("/other/c.txt")
      expect(writeFile).not.toHaveBeenCalled()
      expect(banner()?.textContent).toContain(
        dict["filesView.stranded.message"].replace("{file}", "a.txt").replace("{project}", "repo"),
      )

      await act(async () => bannerButton(dict["filesView.unsaved.saveChanges"]).click())
      await act(async () => {})

      // Read and written scoped to the project the file belongs to: the server would check it against /other otherwise.
      expect(readFile).toHaveBeenCalledWith("/repo/a.txt", { allowOutsideWorkspace: false, directory: "/repo" })
      expect(writeFile).toHaveBeenCalledWith("/repo/a.txt", "alpha edited\n", {
        allowOutsideWorkspace: false,
        directory: "/repo",
      })
      expect(banner()).toBeNull()
    })

    test("discarding drops the draft without writing", async () => {
      await editAndSwitch()

      await act(async () => bannerButton(dict["filesView.unsaved.discard"]).click())

      expect(writeFile).not.toHaveBeenCalled()
      expect(banner()).toBeNull()
    })

    test("a failed save keeps the draft on screen", async () => {
      writeFile.mockImplementationOnce(async () => ({ success: false }))
      await editAndSwitch()

      await act(async () => bannerButton(dict["filesView.unsaved.saveChanges"]).click())
      await act(async () => {})

      expect(toastError).toHaveBeenCalledWith(dict["filesView.toast.writeFileFailed"])
      expect(banner()?.textContent).toContain("a.txt")
    })

    test("the same file open under the enclosing project is read again for that project", async () => {
      // A project and a project nested in it can both have the same absolute path open.
      otherTabsState.openPaths = ["/repo/a.txt"]
      otherTabsState.selectedPath = "/repo/a.txt"
      try {
        await render()
        await act(async () => {
          editorOnChange?.("alpha edited\n")
        })
        directoryState.current = "/"
        await act(async () => {
          bump()
        })
        await act(async () => {})

        // The editor shows the file as read for the enclosing project; the nested project's draft waits in the notice.
        expect(editorValue).toBe("alpha\n")
        expect(banner()?.textContent).toContain("a.txt")
        expect(writeFile).not.toHaveBeenCalled()
      } finally {
        otherTabsState.openPaths = ["/other/c.txt"]
      }
    })

    test("a buffer with no edits leaves nothing behind", async () => {
      await render()
      await switchProject()

      expect(banner()).toBeNull()
    })

    test("a file that changed on disk since is not overwritten from the notice", async () => {
      await editAndSwitch()
      fileContents["/repo/a.txt"] = "alpha changed by the agent\n"

      await act(async () => bannerButton(dict["filesView.unsaved.saveChanges"]).click())
      await act(async () => {})

      expect(writeFile).not.toHaveBeenCalled()
      expect(toastError).toHaveBeenCalledWith(dict["filesView.stranded.conflict"].replace("{file}", "a.txt"))
      expect(banner()?.textContent).toContain("a.txt")
    })

    test("a draft an earlier save already wrote is cleared without writing again", async () => {
      await editAndSwitch()
      // An autosave of the same text landed after the switch.
      fileContents["/repo/a.txt"] = "alpha edited\n"

      await act(async () => bannerButton(dict["filesView.unsaved.saveChanges"]).click())
      await act(async () => {})

      expect(writeFile).not.toHaveBeenCalled()
      expect(banner()).toBeNull()
    })

    test("going back to the project puts the draft back in its editor", async () => {
      await editAndSwitch()
      directoryState.current = "/repo"
      await act(async () => {
        bump()
      })
      await act(async () => {})

      expect(editorValue).toBe("alpha edited\n")
      // One copy only: the notice no longer holds it, so it cannot overwrite a later save from the editor.
      expect(banner()).toBeNull()
    })

    test("an editor that closes with the switch still keeps the draft", async () => {
      await render()
      await act(async () => {
        editorOnChange?.("alpha edited\n")
      })
      showFiles = false
      directoryState.current = "/other"
      await act(async () => {
        bump()
      })

      expect(useStrandedFilesDraftStore.getState().drafts).toMatchObject([
        { root: "/repo", path: "/repo/a.txt", draftContent: "alpha edited\n" },
      ])

      // Files opens again in the other project: the notice offers the draft there.
      showFiles = true
      await act(async () => {
        bump()
      })
      await act(async () => {})
      expect(banner()?.textContent).toContain("a.txt")
    })

    test("a save prompt open when the session moves is closed, not left to write into the next file", async () => {
      await render()
      await act(async () => {
        editorOnChange?.("alpha edited\n")
      })
      tabsState.selectedPath = "/repo/b.txt"
      await act(async () => {
        bump()
      })
      await act(async () => {})
      expect(document.body.textContent).toContain(dict["filesView.unsaved.description"])

      await switchProject()

      expect(document.body.textContent).not.toContain(dict["filesView.unsaved.description"])
      expect(useStrandedFilesDraftStore.getState().drafts).toMatchObject([{ path: "/repo/a.txt" }])
    })

    test("a prompt's save that finishes after the session moved leaves the next project's edits alone", async () => {
      let finishWrite: () => void = () => {}
      writeFile.mockImplementation((() =>
        new Promise<{ success: boolean }>((resolve) => {
          finishWrite = () => resolve({ success: true })
        })) as unknown as () => Promise<{ success: boolean }>)
      try {
        await render()
        await act(async () => {
          editorOnChange?.("alpha edited\n")
        })
        tabsState.selectedPath = "/repo/b.txt"
        await act(async () => {
          bump()
        })
        await act(async () => {})
        await clickByText(dict["filesView.unsaved.saveChanges"])

        // The write is still in flight when the session moves and the next project's file is edited.
        await switchProject()
        await act(async () => {
          editorOnChange?.("gamma edited\n")
        })
        await act(async () => {
          finishWrite()
        })
        await act(async () => {})

        // The old prompt neither navigated the next project nor forgot its edits: closing the panel keeps them.
        expect(otherTabsState.selectedPath).toBe("/other/c.txt")
        expect(editorValue).toBe("gamma edited\n")
        showFiles = false
        await act(async () => {
          bump()
        })
        expect(useStrandedFilesDraftStore.getState().drafts.map((draft) => draft.path)).toContain("/other/c.txt")
      } finally {
        writeFile.mockImplementation(async () => ({ success: true }))
      }
    })
  })
})
