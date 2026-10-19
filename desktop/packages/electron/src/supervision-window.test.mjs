import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const { createSupervisionWindowController, SUPERVISION_WINDOW_SIZE } = require("./supervision-window.js")
const { createDesktopRendererWebPreferences } = require("./webview-policy.js")

const createFakeBrowserWindow = () => {
  const instances = []
  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.destroyed = false
      this.minimized = false
      this.calls = []
      this.listeners = new Map()
      this.windowOpenHandler = null
      this.webContents = {
        setWindowOpenHandler: (handler) => {
          this.windowOpenHandler = handler
        },
      }
      instances.push(this)
    }
    on(event, listener) {
      this.listeners.set(event, listener)
    }
    once(event, listener) {
      this.listeners.set(event, listener)
    }
    isDestroyed() {
      return this.destroyed
    }
    isMinimized() {
      return this.minimized
    }
    restore() {
      this.calls.push("restore")
    }
    show() {
      this.calls.push("show")
    }
    focus() {
      this.calls.push("focus")
    }
    destroy() {
      this.destroyed = true
      this.calls.push("destroy")
    }
    close() {
      this.destroyed = true
      this.listeners.get("closed")?.()
    }
  }
  return { FakeBrowserWindow, instances }
}

const createController = (overrides = {}) => {
  const { FakeBrowserWindow, instances } = createFakeBrowserWindow()
  const loadUrlWithTimeout = overrides.loadUrlWithTimeout ?? vi.fn(async () => {})
  const attachNavigationGuards = vi.fn()
  const openExternal = vi.fn()
  const controller = createSupervisionWindowController({
    BrowserWindow: FakeBrowserWindow,
    webPreferences: () => createDesktopRendererWebPreferences("/app/preload.js"),
    chromeOptions: () => ({ titleBarStyle: "hiddenInset" }),
    attachNavigationGuards,
    isTrustedUrl: (url) => url.startsWith("http://127.0.0.1:3910/"),
    openExternal,
    loadUrlWithTimeout,
    getOrigin: () => "http://127.0.0.1:3910",
    timeoutMs: 30_000,
  })
  return { controller, instances, loadUrlWithTimeout, attachNavigationGuards, openExternal }
}

describe("supervision pop-out window", () => {
  test("uses the shared sandboxed renderer preferences and the spec window size", async () => {
    const { controller, instances } = createController()
    await controller.open()
    expect(instances).toHaveLength(1)
    const options = instances[0].options
    expect(options.webPreferences).toMatchObject({
      preload: "/app/preload.js",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    })
    expect(options).toMatchObject({ ...SUPERVISION_WINDOW_SIZE, show: false, titleBarStyle: "hiddenInset" })
    expect(SUPERVISION_WINDOW_SIZE).toEqual({ width: 960, height: 720, minWidth: 640, minHeight: 480 })
  })

  test("loads supervision.html from the local renderer origin", async () => {
    const { controller, loadUrlWithTimeout } = createController()
    const win = await controller.open()
    expect(loadUrlWithTimeout).toHaveBeenCalledWith(win, "http://127.0.0.1:3910/supervision.html", {
      timeoutMs: 30_000,
    })
  })

  test("attaches the navigation guards and denies every window.open", async () => {
    const { controller, attachNavigationGuards, openExternal } = createController()
    const win = await controller.open()
    expect(attachNavigationGuards).toHaveBeenCalledWith(
      win.webContents,
      expect.objectContaining({ onBlocked: openExternal }),
    )
    expect(win.windowOpenHandler({ url: "https://example.com/" })).toEqual({ action: "deny" })
    expect(openExternal).toHaveBeenCalledWith("https://example.com/")
    expect(win.windowOpenHandler({ url: "http://127.0.0.1:3910/other" })).toEqual({ action: "deny" })
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  test("keeps a single instance and focuses it when asked again", async () => {
    const { controller, instances } = createController()
    const first = await controller.open()
    first.minimized = true
    const second = await controller.open()
    expect(second).toBe(first)
    expect(instances).toHaveLength(1)
    expect(first.calls).toEqual(["restore", "show", "focus"])
  })

  test("joins a request made while the first window is still loading", async () => {
    let finishLoad
    const loadUrlWithTimeout = vi.fn(
      () =>
        new Promise((resolve) => {
          finishLoad = resolve
        }),
    )
    const { controller, instances } = createController({ loadUrlWithTimeout })
    const first = controller.open()
    const second = controller.open()
    finishLoad()
    expect(await first).toBe(await second)
    expect(instances).toHaveLength(1)
  })

  test("opens a new window after the previous one was closed", async () => {
    const { controller, instances } = createController()
    const first = await controller.open()
    first.close()
    expect(controller.getWindow()).toBeNull()
    const second = await controller.open()
    expect(second).not.toBe(first)
    expect(instances).toHaveLength(2)
  })

  test("destroys the window when the load fails and lets a later request retry", async () => {
    const loadUrlWithTimeout = vi.fn(async () => {
      throw new Error("load timed out")
    })
    const { controller, instances } = createController({ loadUrlWithTimeout })
    await expect(controller.open()).rejects.toThrow("load timed out")
    expect(instances[0].calls).toContain("destroy")
    expect(controller.getWindow()).toBeNull()
    await expect(controller.open()).rejects.toThrow("load timed out")
    expect(instances).toHaveLength(2)
  })
})
