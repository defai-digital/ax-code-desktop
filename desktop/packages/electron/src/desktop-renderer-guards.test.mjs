import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const {
  attachRendererNavigationGuards,
  createUpdateInstallGate,
  createUpdateInstaller,
  quotePowerShellLiteral,
  waitForInstallStart,
} = require("./desktop-renderer-guards.js")

describe("quotePowerShellLiteral", () => {
  test("wraps a path in a literal single-quoted string", () => {
    expect(quotePowerShellLiteral("C:\\work\\project")).toBe("'C:\\work\\project'")
  })

  test("stops a directory name from being expanded as a subexpression", () => {
    // In double quotes PowerShell would run this; a literal single-quoted
    // string keeps it as the path text.
    expect(quotePowerShellLiteral("C:\\work\\$(Start-Process calc.exe)")).toBe("'C:\\work\\$(Start-Process calc.exe)'")
  })

  test("doubles embedded single quotes", () => {
    expect(quotePowerShellLiteral("C:\\it's\\project")).toBe("'C:\\it''s\\project'")
  })

  test("handles missing values", () => {
    expect(quotePowerShellLiteral(undefined)).toBe("''")
  })
})

describe("createUpdateInstallGate", () => {
  test("refuses to install before any download completed", () => {
    const gate = createUpdateInstallGate()

    expect(gate.canInstall()).toBe(false)
  })

  test("allows an install once a download completed and reports its version", () => {
    const gate = createUpdateInstallGate()

    gate.onDownloaded({ version: "7.26.0" })

    expect(gate.canInstall()).toBe(true)
    expect(gate.version()).toBe("7.26.0")
  })

  test("refuses again after an error removed the downloaded update", () => {
    // electron-updater clears its cached file on a failed check/install; asking
    // it to quit then leaves the app running with its services already stopped.
    const gate = createUpdateInstallGate()
    gate.onDownloaded({ version: "7.26.0" })

    gate.onNotInstallable()

    expect(gate.canInstall()).toBe(false)
  })
})

describe("attachRendererNavigationGuards", () => {
  const createContents = () => new EventEmitter()

  test("allows trusted navigations and redirects", () => {
    const contents = createContents()
    const onBlocked = vi.fn()
    attachRendererNavigationGuards(contents, { isTrustedUrl: (url) => url.startsWith("app://"), onBlocked })

    const navigation = { preventDefault: vi.fn() }
    contents.emit("will-navigate", navigation, "app://ax-code/index.html")
    contents.emit("will-redirect", navigation, "app://ax-code/index.html")

    expect(navigation.preventDefault).not.toHaveBeenCalled()
    expect(onBlocked).not.toHaveBeenCalled()
  })

  test("blocks a remote redirect as well as a remote navigation", () => {
    const contents = createContents()
    const onBlocked = vi.fn()
    attachRendererNavigationGuards(contents, { isTrustedUrl: (url) => url.startsWith("app://"), onBlocked })

    const navigation = { preventDefault: vi.fn() }
    contents.emit("will-navigate", navigation, "https://example.com/")
    expect(navigation.preventDefault).toHaveBeenCalledTimes(1)

    // The redirect path used to be unguarded: the main frame keeps its preload
    // bridge, so a remote page would keep window-chrome IPC access.
    contents.emit("will-redirect", navigation, "https://example.com/")
    expect(navigation.preventDefault).toHaveBeenCalledTimes(2)
    expect(onBlocked).toHaveBeenNthCalledWith(1, "https://example.com/")
    expect(onBlocked).toHaveBeenNthCalledWith(2, "https://example.com/")
  })

  test("ignores contents without an event API", () => {
    expect(() => attachRendererNavigationGuards(null, {})).not.toThrow()
  })
})

describe("waitForInstallStart", () => {
  test("observes synchronous install signals before starting the installer", async () => {
    const updater = new EventEmitter()
    const app = new EventEmitter()
    const start = vi.fn(() => updater.emit("before-quit-for-update"))
    const result = waitForInstallStart({ updater, app, start })
    expect(start).toHaveBeenCalledOnce()
    await expect(result).resolves.toBe(true)
    expect(updater.listenerCount("error")).toBe(0)
    expect(app.listenerCount("before-quit")).toBe(0)
  })

  test.each(["emit", "throw"])("cleans up when starting the installer fails via %s", async (failure) => {
    const updater = new EventEmitter()
    const app = new EventEmitter()
    const logger = vi.fn()
    updater.on("error", logger)
    const result = waitForInstallStart({
      updater,
      app,
      start: () => {
        const error = new Error("installer unavailable")
        if (failure === "throw") throw error
        updater.emit("error", error)
      },
    })
    await expect(result).resolves.toBe(false)
    expect(updater.listenerCount("before-quit-for-update")).toBe(0)
    expect(updater.listenerCount("error")).toBe(1)
    expect(app.listenerCount("before-quit")).toBe(0)
  })

  test("ignores a background check error after handing installation to the native updater", async () => {
    const updater = new EventEmitter()
    const nativeUpdater = new EventEmitter()
    updater.on("error", vi.fn())
    const result = waitForInstallStart({ updater, nativeUpdater, start: vi.fn() })
    updater.emit("error", new Error("background check offline"))
    nativeUpdater.emit("before-quit-for-update")
    await expect(result).resolves.toBe(true)
    expect(nativeUpdater.listenerCount("error")).toBe(0)
  })

  test("reports native staging errors after the initial installer call returns", async () => {
    const updater = new EventEmitter()
    const nativeUpdater = new EventEmitter()
    const result = waitForInstallStart({ updater, nativeUpdater, start: vi.fn() })
    nativeUpdater.emit("error", new Error("native verification failed"))
    await expect(result).resolves.toBe(false)
    expect(nativeUpdater.listenerCount("before-quit-for-update")).toBe(0)
    expect(nativeUpdater.listenerCount("error")).toBe(0)
    expect(updater.listenerCount("error")).toBe(0)
  })

  test("resolves once the install quit starts, and reports a refusal otherwise", async () => {
    vi.useFakeTimers()
    try {
      const updater = new EventEmitter()
      const app = new EventEmitter()

      const started = waitForInstallStart({ updater, app, timeoutMs: 1_000 })
      updater.emit("before-quit-for-update")
      await expect(started).resolves.toBe(true)

      // The updater refusing (unsigned build failing native verification, a missing
      // installer, a spawn failure) quits nothing; services must remain available.
      const refused = waitForInstallStart({ updater, app, timeoutMs: 1_000 })
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(refused).resolves.toBe(false)

      // An ordinary app quit must not be mistaken for an installer signal.
      const nativeUpdater = new EventEmitter()
      const quitting = waitForInstallStart({ updater, nativeUpdater, timeoutMs: 1_000 })
      app.emit("before-quit")
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(quitting).resolves.toBe(false)

      // electron-updater emits this on Electron's native updater on all targets.
      const native = waitForInstallStart({ updater, nativeUpdater, timeoutMs: 1_000 })
      nativeUpdater.emit("before-quit-for-update")
      await expect(native).resolves.toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("createUpdateInstaller", () => {
  const setup = (quitAndInstall) => {
    const updater = new EventEmitter()
    updater.quitAndInstall = vi.fn(() => quitAndInstall(updater, app))
    const app = new EventEmitter()
    const stopServices = vi.fn()
    const { createQuitCoordinator } = require("./quit-coordinator.js")
    const coordinator = createQuitCoordinator({
      onStarting: vi.fn(),
      playEnding: vi.fn(),
      stopServices,
      quit: vi.fn(),
    })
    app.on("before-quit", (event) => void coordinator.handle(event))
    const gate = createUpdateInstallGate()
    gate.onDownloaded({ version: "7.26.1" })
    const install = createUpdateInstaller({
      updater,
      gate,
      isQuitting: () => coordinator.state !== "idle",
      timeoutMs: 1_000,
    })
    return { updater, app, gate, install, stopServices, coordinator }
  }

  test("keeps services running when the installer emits an error", async () => {
    const { install, gate, stopServices, coordinator } = setup((updater) => {
      updater.emit("error", new Error("installer missing"))
    })
    await expect(install()).resolves.toEqual({ installed: false, reason: "install-not-started" })
    expect(stopServices).not.toHaveBeenCalled()
    expect(coordinator.state).toBe("idle")
    expect(gate.canInstall()).toBe(false)
  })

  test("runs service cleanup through the normal quit coordinator after install starts", async () => {
    const { install, stopServices, coordinator } = setup((updater, app) => {
      updater.emit("before-quit-for-update")
      app.emit("before-quit", { preventDefault: vi.fn() })
    })
    await expect(install()).resolves.toEqual({ installed: true, version: "7.26.1" })
    expect(stopServices).toHaveBeenCalledOnce()
    expect(coordinator.state).toBe("ready")
  })

  test("refuses an install while an ordinary quit is already cleaning up", async () => {
    const { install, updater, app } = setup(() => {})
    app.emit("before-quit", { preventDefault: vi.fn() })
    await expect(install()).resolves.toEqual({ installed: false, reason: "app-quitting" })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  test("shares an in-flight install and preserves services on a silent refusal", async () => {
    vi.useFakeTimers()
    try {
      const { install, updater, stopServices } = setup(() => {})
      const first = install()
      expect(install()).toBe(first)
      expect(updater.quitAndInstall).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(first).resolves.toEqual({ installed: false, reason: "install-not-started" })
      expect(stopServices).not.toHaveBeenCalled()
      await expect(install()).resolves.toEqual({ installed: false, reason: "no-downloaded-update" })
      expect(updater.quitAndInstall).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
