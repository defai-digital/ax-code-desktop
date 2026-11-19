import { afterEach, describe, expect, test, vi } from "vitest"

const createMemoryStorage = () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size
    },
  } as Storage

  return { storage, values }
}

const importStore = async () => {
  vi.resetModules()

  const { storage, values } = createMemoryStorage()
  const setDirectoryMock = vi.fn()
  const updateDesktopSettingsMock = vi.fn(async () => undefined)
  const invalidateDirectoryMock = vi.fn()
  const getFilesystemHomeMock = vi.fn<() => Promise<string | null>>(async () => null)

  vi.doMock("./utils/safeStorage", () => ({
    getSafeStorage: () => storage,
  }))

  vi.doMock("@/lib/ax-code/client", () => ({
    axCodeClient: {
      setDirectory: setDirectoryMock,
      getFilesystemHome: getFilesystemHomeMock,
      getSystemInfo: vi.fn(async () => ({ homeDirectory: "" })),
    },
  }))

  vi.doMock("@/lib/desktop", () => ({
    getDesktopHomeDirectory: vi.fn(async () => ""),
  }))

  vi.doMock("@/lib/persistence", () => ({
    updateDesktopSettings: updateDesktopSettingsMock,
  }))

  vi.doMock("@/stores/useFileSearchStore", () => ({
    useFileSearchStore: {
      getState: () => ({
        invalidateDirectory: invalidateDirectoryMock,
      }),
    },
  }))

  vi.doMock("@/stores/utils/streamDebug", () => ({
    streamDebugEnabled: () => false,
  }))

  const storeModule = await import("./useDirectoryStore")

  return {
    ...storeModule,
    invalidateDirectoryMock,
    getFilesystemHomeMock,
    setDirectoryMock,
    updateDesktopSettingsMock,
    values,
  }
}

describe("useDirectoryStore", () => {
  afterEach(() => {
    vi.doUnmock("./utils/safeStorage")
    vi.doUnmock("@/lib/ax-code/client")
    vi.doUnmock("@/lib/desktop")
    vi.doUnmock("@/lib/persistence")
    vi.doUnmock("@/stores/useFileSearchStore")
    vi.doUnmock("@/stores/utils/streamDebug")
    vi.resetModules()
  })

  test("does not run discovery or write host settings on import", async () => {
    const { getFilesystemHomeMock, updateDesktopSettingsMock } = await importStore()
    expect(getFilesystemHomeMock).not.toHaveBeenCalled()
    expect(updateDesktopSettingsMock).not.toHaveBeenCalled()
  })

  test("restores a saved literal directory without rewriting it or appending to history", async () => {
    const { restoreDirectoryPreferences, useDirectoryStore, updateDesktopSettingsMock, values } = await importStore()
    values.set("homeDirectory", "/home/fixture")
    values.set("lastDirectory", "~/project ")

    restoreDirectoryPreferences()

    expect(useDirectoryStore.getState()).toMatchObject({
      currentDirectory: "/home/fixture/project ",
      directoryHistory: ["/home/fixture/project "],
      homeDirectory: "/home/fixture",
    })
    expect(updateDesktopSettingsMock).not.toHaveBeenCalled()
  })

  test("ignores a startup directory snapshot after a window selects a directory", async () => {
    const { restoreDirectoryPreferences, useDirectoryStore, setDirectoryMock, values } = await importStore()
    useDirectoryStore.getState().setDirectory("/active")
    values.set("lastDirectory", "/stale")

    restoreDirectoryPreferences()

    expect(useDirectoryStore.getState().currentDirectory).toBe("/active")
    expect(setDirectoryMock).toHaveBeenLastCalledWith("/active")
  })

  test("uses the active project when no directory is saved without publishing a save", async () => {
    const { restoreDirectoryPreferences, useDirectoryStore, updateDesktopSettingsMock, values } = await importStore()

    restoreDirectoryPreferences("/fixture/project")

    expect(useDirectoryStore.getState().currentDirectory).toBe("/fixture/project")
    expect(values.has("lastDirectory")).toBe(false)
    expect(updateDesktopSettingsMock).not.toHaveBeenCalled()
  })

  test("coalesces concurrent discovery and persists only the changed home", async () => {
    const { refreshDirectoryHome, getFilesystemHomeMock, updateDesktopSettingsMock, useDirectoryStore } =
      await importStore()
    getFilesystemHomeMock.mockResolvedValue("/host/home")
    useDirectoryStore.getState().setDirectory("/active")
    updateDesktopSettingsMock.mockClear()

    await Promise.all([refreshDirectoryHome(), refreshDirectoryHome()])
    await refreshDirectoryHome()

    expect(getFilesystemHomeMock).toHaveBeenCalledTimes(2)
    expect(updateDesktopSettingsMock.mock.calls).toEqual([[{ homeDirectory: "/host/home" }]])
    expect(useDirectoryStore.getState()).toMatchObject({ homeDirectory: "/host/home", currentDirectory: "/active" })
  })

  test("ignores invalid synchronized home directories", async () => {
    const { setDirectoryMock, updateDesktopSettingsMock, useDirectoryStore, values } = await importStore()
    const initialState = {
      currentDirectory: "/Users/alice/project",
      directoryHistory: ["/Users/alice/project"],
      historyIndex: 0,
      homeDirectory: "/Users/alice",
      hasPersistedDirectory: true,
      isHomeReady: true,
    }

    for (const candidate of ["", "   ", "/"]) {
      values.clear()
      setDirectoryMock.mockClear()
      updateDesktopSettingsMock.mockClear()
      useDirectoryStore.setState(initialState)

      useDirectoryStore.getState().synchronizeHomeDirectory(candidate)

      expect(useDirectoryStore.getState()).toMatchObject(initialState)
      expect(values.get("homeDirectory")).toBeUndefined()
      expect(setDirectoryMock).not.toHaveBeenCalled()
      expect(updateDesktopSettingsMock).not.toHaveBeenCalled()
    }
  })

  test("normalizes synchronized home directories before updating state", async () => {
    const { updateDesktopSettingsMock, useDirectoryStore } = await importStore()

    useDirectoryStore.setState({
      currentDirectory: "/Users/alice/project",
      directoryHistory: ["/Users/alice/project"],
      historyIndex: 0,
      homeDirectory: "/Users/alice",
      hasPersistedDirectory: true,
      isHomeReady: true,
    })

    useDirectoryStore.getState().synchronizeHomeDirectory("/Users/alice-new///")

    expect(useDirectoryStore.getState()).toMatchObject({
      currentDirectory: "/Users/alice/project",
      directoryHistory: ["/Users/alice/project"],
      homeDirectory: "/Users/alice-new",
      isHomeReady: true,
    })
    expect(updateDesktopSettingsMock).toHaveBeenCalledWith({ homeDirectory: "/Users/alice-new" })
  })

  test("keeps Windows drive-root parents absolute", async () => {
    const { setDirectoryMock, useDirectoryStore, values } = await importStore()
    values.set("homeDirectory", "C:/Users/alice")
    useDirectoryStore.setState({
      currentDirectory: "C:/Users",
      directoryHistory: ["C:/Users/alice", "C:/Users"],
      historyIndex: 1,
      homeDirectory: "C:/Users/alice",
      hasPersistedDirectory: true,
      isHomeReady: true,
    })

    useDirectoryStore.getState().goToParent()

    expect(useDirectoryStore.getState().currentDirectory).toBe("C:/")
    expect(setDirectoryMock).toHaveBeenCalledWith("C:/")
    expect(values.get("lastDirectory")).toBe("C:/")
  })

  test("does not navigate above Windows drive roots", async () => {
    const { setDirectoryMock, useDirectoryStore, values } = await importStore()
    values.set("homeDirectory", "C:/Users/alice")
    useDirectoryStore.setState({
      currentDirectory: "C:/",
      directoryHistory: ["C:/Users/alice", "C:/"],
      historyIndex: 1,
      homeDirectory: "C:/Users/alice",
      hasPersistedDirectory: true,
      isHomeReady: true,
    })
    setDirectoryMock.mockClear()

    useDirectoryStore.getState().goToParent()

    expect(useDirectoryStore.getState().currentDirectory).toBe("C:/")
    expect(setDirectoryMock).not.toHaveBeenCalled()
    expect(values.get("lastDirectory")).toBeUndefined()
  })
})

test.each(["/?ocPanel=session-chat", "/mini-chat.html?mode=session", "/supervision.html"])(
  "secondary renderer %s keeps directory navigation local",
  async (url) => {
    const original = window.location.href
    window.history.replaceState(null, "", url)
    try {
      const { useDirectoryStore, values, updateDesktopSettingsMock } = await importStore()
      values.set("lastDirectory", "/primary")
      useDirectoryStore.getState().setDirectory("/secondary")
      useDirectoryStore.getState().setDirectory("/secondary-next")
      useDirectoryStore.getState().goBack()
      expect(useDirectoryStore.getState().currentDirectory).toBe("/secondary")
      useDirectoryStore.getState().goForward()
      expect(useDirectoryStore.getState().currentDirectory).toBe("/secondary-next")
      expect(values.get("lastDirectory")).toBe("/primary")
      expect(updateDesktopSettingsMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ lastDirectory: expect.any(String) }),
      )
    } finally {
      window.history.replaceState(null, "", original)
    }
  },
)
