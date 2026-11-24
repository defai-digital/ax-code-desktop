import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createTrayController } from "./tray.mjs"

const electron = vi.hoisted(() => ({
  createFromPath: vi.fn(),
  createTray: vi.fn(),
  buildFromTemplate: vi.fn((template) => template),
}))

vi.mock("electron", () => ({
  nativeImage: { createFromPath: electron.createFromPath },
  Menu: { buildFromTemplate: electron.buildFromTemplate },
  Tray: class {
    setImage = vi.fn()
    isDestroyed = () => false
    setIgnoreDoubleClickEvents = vi.fn()
    setTitle = vi.fn()
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    destroy = vi.fn()

    constructor(image) {
      electron.createTray(image, this)
    }
  },
}))

const trayAssets = {
  idleIconPath: "idle.png",
  unseenIconPath: "unseen.png",
  breathIconPaths: ["breath-0.png", "breath-1.png", "breath-2.png"],
  statusIconPaths: { busy: "busy.png", blank: "blank.png" },
  onAction: vi.fn(),
}
const busy = { sessions: [{ id: "a", title: "Running", status: "busy" }] }
const unseen = { sessions: [{ id: "a", title: "Finished", unseen: 1 }] }

describe("macOS tray images", () => {
  let controller

  const start = (invalidPaths) => {
    electron.createFromPath.mockImplementation((path) => ({
      path,
      isEmpty: () => invalidPaths.includes(path),
      setTemplateImage: vi.fn(),
    }))
    controller = createTrayController(trayAssets)
    controller.update({})
    return electron.createTray.mock.calls[0][1]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    controller?.destroy()
    controller = undefined
    vi.useRealTimers()
  })

  test("keeps a visible mark when the unread image or an animation frame cannot be decoded", () => {
    const tray = start(["unseen.png", "breath-1.png", "busy.png"])
    controller.update(unseen)
    expect(tray.setImage).toHaveBeenLastCalledWith(expect.objectContaining({ path: "idle.png" }))

    tray.setImage.mockClear()
    controller.update(busy)
    vi.advanceTimersByTime(375)
    expect(tray.setImage.mock.calls.map(([image]) => image.path)).toEqual([
      "breath-0.png", "breath-2.png", "breath-0.png", "breath-2.png", "breath-0.png",
    ])
    const running = electron.buildFromTemplate.mock.lastCall[0].find(({ label }) => label === "Running")
    expect(running.icon.path).toBe("blank.png")
    controller.update({})
    expect(tray.setImage).toHaveBeenLastCalledWith(expect.objectContaining({ path: "idle.png" }))
    expect(vi.getTimerCount()).toBe(0)
  })

  test("keeps a steady unread mark while working if all animation frames are unavailable", () => {
    const tray = start(trayAssets.breathIconPaths)
    controller.update(busy)
    expect(tray.setImage).toHaveBeenLastCalledWith(expect.objectContaining({ path: "unseen.png" }))
    expect(vi.getTimerCount()).toBe(0)
  })

  test("rejects an unreadable idle image before constructing the native tray", () => {
    expect(() => start(["idle.png"])).toThrow("Unable to load the macOS tray icon")
    expect(electron.createTray).not.toHaveBeenCalled()
  })
})
