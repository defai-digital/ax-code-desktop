import { createRequire } from "node:module"
import { EventEmitter } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const { createWikiViewer } = createRequire(import.meta.url)("./wiki-viewer.js")
const cleanup = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

async function fixture(platform = process.platform) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ax-wiki-project & % unicode-"))
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }))
  const windows = []
  class Window extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.webContents = new EventEmitter()
      this.webContents.session = Object.assign(new EventEmitter(), {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      })
      this.webContents.setWindowOpenHandler = vi.fn()
      windows.push(this)
    }
    async loadFile(file) {
      this.file = file
      this.html = await fs.readFile(file, "utf8")
    }
    show() {
      this.shown = true
    }
    isDestroyed() {
      return this.destroyed === true
    }
    destroy() {
      this.destroyed = true
      this.emit("closed")
    }
  }
  const run = vi.fn(async (_binary, args) => {
    await fs.writeFile(args.at(-1), "official export")
  })
  const viewer = createWikiViewer({ BrowserWindow: Window, getRuntimeRoot: () => root, run, platform })
  cleanup.push(viewer.closeAll)
  return { root, windows, run, viewer }
}

describe("official Wiki viewer", () => {
  it("uses the runtime export verbatim in a sandbox without a preload", async () => {
    const { root, viewer, run, windows } = await fixture()
    await expect(viewer.open(root)).resolves.toEqual({ opened: true })
    const window = windows[0]
    expect(window.html).toBe("official export")
    expect(window.shown).toBe(true)
    expect(window.options.webPreferences).toMatchObject({
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    })
    expect(window.options.webPreferences.preload).toBeUndefined()
    expect(run.mock.calls[0][1]).toContain("viz")
    expect(run.mock.calls[0][1]).not.toContain("--open")
    expect(run.mock.calls[0][2]).toMatchObject({ cwd: await fs.realpath(root), timeout: 30000 })
    const event = { preventDefault: vi.fn() }
    window.webContents.emit("will-navigate", event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(window.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: "deny" })
    await viewer.closeAll()
    await expect(fs.access(window.file)).rejects.toThrow()
  })

  it("passes Windows paths as literal argv to bundled Node without cmd.exe", async () => {
    const { root, viewer, run } = await fixture("win32")
    await viewer.open(root)
    const [binary, args, options] = run.mock.calls[0]
    expect(binary).toBe(path.join(root, "node", "bin", "node.exe"))
    expect(args[1]).toBe(path.join(root, "lib", "index-node-tui.js"))
    expect(options.shell).toBeUndefined()
  })

  it("removes failed exports and keeps child output out of renderer errors", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      throw new Error("private child output")
    })
    await expect(viewer.open(root)).rejects.toThrow("official Wiki viewer could not be opened")
    await expect(fs.access(path.dirname(output))).rejects.toThrow()
    expect(windows).toHaveLength(0)
  })

  it("does not open a viewer when shutdown occurs during export", async () => {
    const { root, viewer, run, windows } = await fixture()
    let began
    const started = new Promise((resolve) => {
      began = resolve
    })
    run.mockImplementationOnce(async (_binary, _args, options) => {
      began()
      await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }))
    })
    const pending = viewer.open(root)
    const result = expect(pending).rejects.toThrow("official Wiki viewer could not be opened")
    await started
    await viewer.closeAll()
    await result
    expect(windows).toHaveLength(0)
  })
})
