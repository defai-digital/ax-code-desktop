import { afterEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import path from "node:path"
import {
  createLaunchAnimationController,
  createAnimationAssetHandler,
  DONE_CHANNEL,
} from "./launch-animation-controller.js"

const controllers = []
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose())
  vi.useRealTimers()
})
const manifest = {
  pairs: [
    { id: "01", opening: { file: "01-opening-code.webm" }, ending: { file: "01-ending-code.webm" } },
    { id: "02", opening: { file: "02-opening-city.webm" }, ending: { file: "02-ending-city.webm" } },
  ],
}
class Window extends EventEmitter {
  constructor(options) {
    super()
    this.options = options
    this.destroyed = false
    this.webContents = new EventEmitter()
    this.webContents.mainFrame = { url: "" }
    this.webContents.setWindowOpenHandler = vi.fn()
    this.webContents.session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      protocol: { handle: vi.fn() },
    }
  }
  loadURL(url) {
    this.query = Object.fromEntries(new URL(url).searchParams)
    this.webContents.mainFrame.url = url
    return Promise.resolve()
  }
  isDestroyed() {
    return this.destroyed
  }
  destroy() {
    this.destroyed = true
    this.emit("closed")
  }
  show() {}
}
function fixture(overrides = {}) {
  const ipcMain = new EventEmitter()
  const controller = createLaunchAnimationController({
    BrowserWindow: Window,
    ipcMain,
    manifest,
    assetDir: path.resolve("/tmp/animation-test-assets"),
    preloadPath: "/tmp/preload.js",
    env: {},
    random: () => 0.99,
    logger: { warn: vi.fn() },
    ...overrides,
  })
  controllers.push(controller)
  const done = (reason = "ended", frames = 72) => {
    const window = controller.window
    ipcMain.emit(
      DONE_CHANNEL,
      { sender: window.webContents, senderFrame: window.webContents.mainFrame },
      { reason, frames },
    )
  }
  return { controller, ipcMain, done }
}

describe("desktop animation lifecycle", () => {
  it("selects one pair per launch and reuses its matching ending", async () => {
    const random = vi.fn(() => 0.99)
    const { controller, done } = fixture({ random })
    const opening = controller.playOpening()
    expect(controller.window.query.clip).toBe("02-opening-city.webm")
    expect(controller.window.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    })
    done()
    expect(await opening).toMatchObject({ reason: "ended", pair: "02", frames: 72 })
    const ending = controller.playEnding()
    expect(controller.window.query.clip).toBe("02-ending-city.webm")
    done()
    await ending
    expect(random).toHaveBeenCalledTimes(1)
    expect(controller.playing).toBe(false)
  })

  it.each([{ env: { AX_CODE_DESKTOP_ANIMATIONS: "0" } }, { preferencesReader: () => ({ enabled: false }) }])(
    "respects a disabled preference or environment override",
    async (options) => {
      const { controller } = fixture(options)
      expect(await controller.playOpening()).toMatchObject({ reason: "disabled" })
      expect(await controller.playEnding()).toMatchObject({ reason: "disabled" })
      expect(controller.window).toBe(null)
    },
  )

  it("rejects completion from other windows, frames, or navigated pages", async () => {
    const { controller, ipcMain, done } = fixture()
    const playing = controller.playOpening()
    const window = controller.window
    ipcMain.emit(DONE_CHANNEL, { sender: {}, senderFrame: window.webContents.mainFrame }, { reason: "ended" })
    ipcMain.emit(
      DONE_CHANNEL,
      { sender: window.webContents, senderFrame: { url: window.webContents.mainFrame.url } },
      { reason: "ended" },
    )
    const original = window.webContents.mainFrame.url
    window.webContents.mainFrame.url = "https://example.com/"
    done()
    expect(controller.playing).toBe(true)
    window.webContents.mainFrame.url = original
    done("skip")
    expect(await playing).toMatchObject({ reason: "skip" })
    expect(ipcMain.listenerCount(DONE_CHANNEL)).toBe(0)
  })

  it("bounds stalled playback and removes the window and IPC listener", async () => {
    vi.useFakeTimers()
    const { controller, ipcMain } = fixture({ timeoutMs: 50 })
    const playing = controller.playOpening()
    const window = controller.window
    await vi.advanceTimersByTimeAsync(50)
    expect(await playing).toMatchObject({ reason: "timeout" })
    expect(window.isDestroyed()).toBe(true)
    expect(ipcMain.listenerCount(DONE_CHANNEL)).toBe(0)
  })

  it("handles renderer crashes and manually closed players", async () => {
    const { controller } = fixture()
    const opening = controller.playOpening()
    controller.window.webContents.emit("render-process-gone")
    expect(await opening).toMatchObject({ reason: "error" })
    const ending = controller.playEnding()
    controller.window.destroy()
    expect(await ending).toMatchObject({ reason: "skip" })
  })

  it("ignores an obsolete opening load rejection after ending starts", async () => {
    let failOpening
    class SlowWindow extends Window {
      loadURL(url) {
        super.loadURL(url)
        if (this.query.kind === "opening")
          return new Promise((_resolve, reject) => {
            failOpening = reject
          })
        return Promise.resolve()
      }
    }
    const { controller, done } = fixture({ BrowserWindow: SlowWindow })
    const opening = controller.playOpening()
    const ending = controller.playEnding()
    expect(await opening).toMatchObject({ reason: "replaced" })
    failOpening(new Error("old player destroyed"))
    await Promise.resolve()
    expect(controller.playing).toBe(true)
    expect(controller.window.query.kind).toBe("ending")
    done()
    expect(await ending).toMatchObject({ reason: "ended" })
  })

  it("persists disable before resolving and ignores duplicate completion", async () => {
    let persist
    const disable = vi.fn(
      () =>
        new Promise((resolve) => {
          persist = resolve
        }),
    )
    const { controller, done } = fixture({ disable })
    const playing = controller.playOpening()
    done("disabled")
    done("disabled")
    await Promise.resolve()
    expect(disable).toHaveBeenCalledTimes(1)
    expect(controller.playing).toBe(true)
    persist()
    expect(await playing).toMatchObject({ reason: "disabled" })
  })

  it("skips reduced motion and disposes pending playback on failure or restart", async () => {
    const { controller, done } = fixture()
    const opening = controller.playOpening()
    done("reduced-motion", 0)
    expect(await opening).toMatchObject({ reason: "reduced-motion", frames: 0 })
    const ending = controller.playEnding()
    controller.dispose()
    expect(await ending).toMatchObject({ reason: "disposed" })
  })

  it("keeps startup usable when a player cannot be created", async () => {
    const { controller } = fixture({
      BrowserWindow: class {
        constructor() {
          throw new Error("unavailable")
        }
      },
    })
    expect(await controller.playOpening()).toMatchObject({ reason: "error" })
  })
})

describe("isolated animation assets", () => {
  it("serves only packaged player resources and manifest clips", async () => {
    const read = vi.fn(async () => Buffer.from("video bytes"))
    const handler = createAnimationAssetHandler("/assets", manifest, read)
    const response = await handler(new Request("ax-animation://player/02-opening-city.webm"))
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("video/webm")
    expect(await response.text()).toBe("video bytes")
    expect(read).toHaveBeenCalledWith(path.join("/assets", "02-opening-city.webm"))
    for (const url of [
      "ax-animation://other/player.html",
      "https://player/player.html",
      "ax-animation://player/%2e%2e/secret",
      "ax-animation://player/unknown.webm",
      "ax-animation://user@player/player.html",
    ]) {
      expect((await handler({ url, method: "GET" })).status).toBe(404)
    }
    expect((await handler(new Request("ax-animation://player/player.html", { method: "POST" }))).status).toBe(405)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
