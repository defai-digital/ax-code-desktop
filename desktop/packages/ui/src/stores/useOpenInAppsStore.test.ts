import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type FetchInstalledAppsResult = {
  apps: Array<{ name: string; iconDataUrl?: string | null }>
  success: boolean
  hasCache: boolean
  isCacheStale: boolean
}

const fetchDesktopInstalledAppsMock = vi.fn<(_apps: string[], _force?: boolean) => Promise<FetchInstalledAppsResult>>()

const installMockLocalStorage = () => {
  const values = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(String(key))
    },
    setItem: (key, value) => {
      values.set(String(key), String(value))
    },
  }
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  })
}

const setDesktopPlatform = (platform: string) => {
  Object.defineProperty(window, "__AX_CODE_DESKTOP_PLATFORM__", {
    configurable: true,
    value: platform,
  })
}

const clearDesktopPlatform = () => {
  Reflect.deleteProperty(window, "__AX_CODE_DESKTOP_PLATFORM__")
}

const clearMockLocalStorage = () => {
  Reflect.deleteProperty(window, "localStorage")
}

const updateDesktopSettingsMock = vi.fn(async () => {})

const importStore = async () => {
  vi.resetModules()
  vi.doMock("@/lib/desktop", () => ({
    fetchDesktopInstalledApps: fetchDesktopInstalledAppsMock,
    isDesktopLocalOriginActive: () => true,
    isTauriShell: () => true,
  }))
  vi.doMock("@/lib/persistence", () => ({
    updateDesktopSettings: updateDesktopSettingsMock,
  }))
  return import("./useOpenInAppsStore")
}

describe("useOpenInAppsStore", () => {
  beforeEach(() => {
    vi.useRealTimers()
    fetchDesktopInstalledAppsMock.mockReset()
    updateDesktopSettingsMock.mockReset()
    updateDesktopSettingsMock.mockImplementation(async () => {})
    installMockLocalStorage()
    setDesktopPlatform("win32")
  })

  afterEach(() => {
    vi.useRealTimers()
    clearDesktopPlatform()
    clearMockLocalStorage()
    vi.doUnmock("@/lib/desktop")
    vi.doUnmock("@/lib/persistence")
    vi.resetModules()
  })

  test("keeps platform-normalized Explorer metadata after a manual app refresh", async () => {
    fetchDesktopInstalledAppsMock.mockResolvedValue({
      apps: [{ name: "Finder", iconDataUrl: "data:image/png;base64,explorer" }],
      success: true,
      hasCache: true,
      isCacheStale: false,
    })

    const { useOpenInAppsStore } = await importStore()

    await useOpenInAppsStore.getState().loadInstalledApps(true)

    const explorer = useOpenInAppsStore.getState().availableApps.find((app) => app.id === "finder")
    expect(explorer).toMatchObject({
      label: "Explorer",
      appName: "File Explorer",
      iconDataUrl: "data:image/png;base64,explorer",
    })
  })

  test("includes VS Code candidates supported by the desktop open-in-app backend", async () => {
    const requestedApps: string[][] = []
    fetchDesktopInstalledAppsMock.mockImplementation(async (apps) => {
      requestedApps.push(apps)
      return {
        apps: [{ name: "Visual Studio Code", iconDataUrl: "data:image/png;base64,vscode" }],
        success: true,
        hasCache: true,
        isCacheStale: false,
      }
    })

    const { useOpenInAppsStore } = await importStore()

    await useOpenInAppsStore.getState().loadInstalledApps(true)

    expect(requestedApps.at(-1)).toEqual(expect.arrayContaining(["Visual Studio Code", "VSCodium", "Visual Studio"]))

    const vscode = useOpenInAppsStore.getState().availableApps.find((app) => app.id === "vscode")
    expect(vscode).toMatchObject({
      label: "VS Code",
      appName: "Visual Studio Code",
      iconDataUrl: "data:image/png;base64,vscode",
    })
  })

  test("keeps installed-app updates that arrive before a stale cache response resolves", async () => {
    fetchDesktopInstalledAppsMock.mockImplementation(async () => {
      window.dispatchEvent(
        new CustomEvent("openchamber:installed-apps-updated", {
          detail: [{ name: "Cursor", iconDataUrl: "data:image/png;base64,cursor-fresh" }],
        }),
      )
      return {
        apps: [{ name: "Finder", iconDataUrl: "data:image/png;base64,finder-stale" }],
        success: true,
        hasCache: true,
        isCacheStale: true,
      }
    })

    const { useOpenInAppsStore } = await importStore()

    await useOpenInAppsStore.getState().loadInstalledApps(true)
    await Promise.resolve()

    const cursor = useOpenInAppsStore.getState().availableApps.find((app) => app.id === "cursor")
    expect(cursor).toMatchObject({
      appName: "Cursor",
      iconDataUrl: "data:image/png;base64,cursor-fresh",
    })
    expect(useOpenInAppsStore.getState().isCacheStale).toBe(false)
  })

  test("honors a forced refresh when it is the first store load", async () => {
    const forceArgs: Array<boolean | undefined> = []
    fetchDesktopInstalledAppsMock.mockImplementation(async (_apps, force) => {
      forceArgs.push(force)
      return {
        apps: [{ name: "Cursor", iconDataUrl: "data:image/png;base64,cursor" }],
        success: true,
        hasCache: true,
        isCacheStale: false,
      }
    })

    const { useOpenInAppsStore } = await importStore()

    await useOpenInAppsStore.getState().loadInstalledApps(true)

    expect(forceArgs).toEqual([undefined, true])
    expect(useOpenInAppsStore.getState().availableApps.some((app) => app.id === "cursor")).toBe(true)
  })

  test("keeps a manual refresh scanning when the uncached first response is empty", async () => {
    vi.useFakeTimers()
    const forceArgs: Array<boolean | undefined> = []
    fetchDesktopInstalledAppsMock.mockImplementation(async (_apps, force) => {
      forceArgs.push(force)
      if (forceArgs.length === 1) {
        return {
          apps: [{ name: "Terminal", iconDataUrl: "data:image/png;base64,terminal" }],
          success: true,
          hasCache: true,
          isCacheStale: false,
        }
      }
      if (forceArgs.length === 2) {
        return {
          apps: [],
          success: true,
          hasCache: false,
          isCacheStale: false,
        }
      }
      return {
        apps: [{ name: "Cursor", iconDataUrl: "data:image/png;base64,cursor" }],
        success: true,
        hasCache: true,
        isCacheStale: false,
      }
    })

    const { useOpenInAppsStore } = await importStore()

    await useOpenInAppsStore.getState().loadInstalledApps()
    expect(useOpenInAppsStore.getState().hasLoadedApps).toBe(true)

    await useOpenInAppsStore.getState().loadInstalledApps(true)

    expect(useOpenInAppsStore.getState().hasLoadedApps).toBe(false)
    expect(useOpenInAppsStore.getState().isScanning).toBe(true)

    await vi.advanceTimersByTimeAsync(800)

    expect(forceArgs).toEqual([undefined, true, undefined])
    expect(useOpenInAppsStore.getState().isScanning).toBe(false)
    expect(useOpenInAppsStore.getState().availableApps.some((app) => app.id === "cursor")).toBe(true)
  })
})

describe("useOpenInAppsStore selectApp", () => {
  beforeEach(() => {
    vi.useRealTimers()
    fetchDesktopInstalledAppsMock.mockReset()
    updateDesktopSettingsMock.mockReset()
    installMockLocalStorage()
    setDesktopPlatform("win32")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    clearDesktopPlatform()
    clearMockLocalStorage()
    vi.doUnmock("@/lib/desktop")
    vi.doUnmock("@/lib/persistence")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  test("resolves even when the shared-settings write fails", async () => {
    // The selection is applied to state and local storage before the write. Awaiting the write made a
    // failure break the caller's next step: the project never opened in the app just picked, and the
    // rejection escaped from the store.
    updateDesktopSettingsMock.mockRejectedValueOnce(new Error("settings write failed"))
    const { useOpenInAppsStore } = await importStore()

    await expect(useOpenInAppsStore.getState().selectApp("vscode")).resolves.toBeUndefined()

    expect(useOpenInAppsStore.getState().selectedAppId).toBe("vscode")
    expect(window.localStorage.getItem("openInAppId")).toBe("vscode")
  })
})
