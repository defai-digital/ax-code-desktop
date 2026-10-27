import { createRequire } from "node:module"
import { EventEmitter } from "node:events"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const { createWikiViewer } = createRequire(import.meta.url)("./wiki-viewer.js")
const cleanup = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

const EXPORT_HTML = "<!doctype html><title>official export</title>"

// Same rule as the viewer: win32 spawns node.exe, every other platform spawns node.
const runtimeBinaryName = (platform = process.platform) => (platform === "win32" ? "node.exe" : "node")

const runtimeBinary = (root, platform = process.platform) =>
  path.join(root, "node", "bin", runtimeBinaryName(platform))

async function fixture(platform = process.platform, { runtimeFiles = true, loadFails = false, io } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ax-wiki-project & % unicode-"))
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }))
  if (runtimeFiles) {
    await fs.mkdir(path.join(root, "node", "bin"), { recursive: true })
    const binary = runtimeBinary(root, platform)
    await fs.writeFile(binary, "")
    // The pre-spawn check requires the execute bit everywhere except Windows.
    if (platform !== "win32") await fs.chmod(binary, 0o755)
    await fs.mkdir(path.join(root, "lib"), { recursive: true })
    await fs.writeFile(path.join(root, "lib", "index-node-tui.js"), "")
  }
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
      if (loadFails) throw new Error("private renderer rejection")
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
    await fs.writeFile(args.at(-1), EXPORT_HTML)
  })
  const viewer = createWikiViewer({
    BrowserWindow: Window,
    getRuntimeRoot: () => root,
    run,
    platform,
    ...(io ? { io } : {}),
  })
  cleanup.push(viewer.closeAll)
  return { root, windows, run, viewer }
}

async function expectRemoved(file) {
  await expect(fs.access(path.dirname(file))).rejects.toThrow()
}

describe("official Wiki viewer", () => {
  it("uses the runtime export verbatim in a sandbox without a preload", async () => {
    const { root, viewer, run, windows } = await fixture()
    await expect(viewer.open(root)).resolves.toEqual({ opened: true })
    const window = windows[0]
    expect(window.html).toBe(EXPORT_HTML)
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
    expect(binary).toBe(runtimeBinary(root, "win32"))
    expect(args[1]).toBe(path.join(root, "lib", "index-node-tui.js"))
    expect(options.shell).toBeUndefined()
  })

  it("reports an unavailable runtime instead of spawning a missing binary", async () => {
    const { root, viewer, run } = await fixture(process.platform, { runtimeFiles: false })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "runtime_unavailable" })
    expect(run).not.toHaveBeenCalled()
  })

  it("reports a bundled binary that fails the execute check as an unavailable runtime without spawning", async () => {
    const io = {
      ...fs,
      access: async (target, mode) => {
        if (mode === fsConstants.X_OK) throw Object.assign(new Error("not executable"), { code: "EACCES" })
        return fs.access(target)
      },
    }
    const { root, viewer, run } = await fixture("linux", { io })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "runtime_unavailable" })
    expect(run).not.toHaveBeenCalled()
  })

  it.skipIf(process.platform === "win32")(
    "reports a mode 0644 bundled node as an unavailable runtime",
    async () => {
      const platform = process.platform === "linux" ? "linux" : "darwin"
      const { root, viewer, run } = await fixture(platform)
      await fs.chmod(runtimeBinary(root, platform), 0o644)
      await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "runtime_unavailable" })
      expect(run).not.toHaveBeenCalled()
    },
  )

  it("resolves a safe failure when the export directory cannot be created", async () => {
    const io = {
      ...fs,
      mkdtemp: async () => {
        throw Object.assign(new Error("private temp path"), { code: "EACCES" })
      },
    }
    const { root, viewer, run, windows } = await fixture(process.platform, { io })
    const result = await viewer.open(root)
    expect(result).toEqual({ opened: false, failure: "failed" })
    expect(JSON.stringify(result)).not.toContain("private")
    expect(run).not.toHaveBeenCalled()
    expect(windows).toHaveLength(0)
  })

  it("does not blame the runtime when spawn fails because the project cwd vanished", async () => {
    const { root, viewer, run } = await fixture()
    run.mockImplementationOnce(async () => {
      // Node 26 reports the executable in error.path even when the cwd is gone.
      throw Object.assign(new Error("private spawn failure"), {
        code: "ENOENT",
        path: runtimeBinary(root),
      })
    })
    const result = await viewer.open(root)
    expect(result).toEqual({ opened: false, failure: "failed" })
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it("classifies a spawn failure as an unavailable runtime when the binary disappears", async () => {
    let binaryAccesses = 0
    const io = {
      ...fs,
      access: async (target, mode) => {
        if (path.basename(String(target)) === runtimeBinaryName()) {
          binaryAccesses += 1
          if (binaryAccesses > 1) throw Object.assign(new Error("missing binary"), { code: "ENOENT" })
        }
        return mode === undefined ? fs.access(target) : fs.access(target, mode)
      },
    }
    const { root, viewer, run } = await fixture(process.platform, { io })
    run.mockImplementationOnce(async () => {
      throw Object.assign(new Error("private spawn failure"), {
        code: "ENOENT",
        path: runtimeBinary(root),
      })
    })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "runtime_unavailable" })
    expect(binaryAccesses).toBe(2)
  })

  it("classifies a spawn EACCES as an unavailable runtime when execute access fails", async () => {
    let binaryChecks = 0
    const io = {
      ...fs,
      access: async (target, mode) => {
        if (path.basename(String(target)) === runtimeBinaryName("linux") && mode === fsConstants.X_OK) {
          binaryChecks += 1
          if (binaryChecks > 1) throw Object.assign(new Error("not executable"), { code: "EACCES" })
          return
        }
        return mode === undefined ? fs.access(target) : fs.access(target, mode)
      },
    }
    const { root, viewer, run } = await fixture("linux", { io })
    run.mockImplementationOnce(async () => {
      throw Object.assign(new Error("spawn EACCES"), { code: "EACCES" })
    })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "runtime_unavailable" })
    expect(run).toHaveBeenCalledOnce()
    expect(binaryChecks).toBe(2)
  })

  it("checks a Windows runtime binary with F_OK only", async () => {
    const modes = []
    const io = {
      ...fs,
      access: async (target, mode) => {
        if (path.basename(String(target)) === "node.exe") modes.push(mode)
        return mode === undefined ? fs.access(target) : fs.access(target, mode)
      },
    }
    const { root, viewer, run } = await fixture("win32", { io })
    run.mockImplementationOnce(async () => {
      throw Object.assign(new Error("spawn EACCES"), { code: "EACCES" })
    })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "failed" })
    expect(modes).toEqual([fsConstants.F_OK, fsConstants.F_OK])
    expect(modes).not.toContain(fsConstants.X_OK)
  })

  it("keeps child output out of a generic failure and removes the export", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      throw Object.assign(new Error("private child output"), {
        code: 1,
        stderr: `command failed in ${root}/secret\nprivate configuration`,
      })
    })
    const result = await viewer.open(root)
    expect(result).toEqual({ opened: false, failure: "failed" })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain("private")
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("classifies an absent wiki from the runtime diagnostic without exposing it", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      throw Object.assign(new Error("command failed"), {
        code: 1,
        stderr: "Error: No Wiki manifest found. Generate a Wiki explicitly before viewing it.",
      })
    })
    const result = await viewer.open(root)
    expect(result).toEqual({ opened: false, failure: "wiki_missing" })
    expect(JSON.stringify(result)).not.toContain("No Wiki manifest")
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("classifies an export the runtime rejects as incompatible, not as a missing wiki", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      throw Object.assign(new Error("command failed"), {
        code: 1,
        stderr: "Error: Unexpected error, check log file\nInvalid graph text",
      })
    })
    const result = await viewer.open(root)
    expect(result).toEqual({ opened: false, failure: "export_incompatible" })
    expect(JSON.stringify(result)).not.toContain("Invalid graph text")
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("reports an export it cannot render as incompatible and cleans it up", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      await fs.writeFile(output, '{"kind":"not-html"}')
    })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "export_incompatible" })
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("reports an empty export as incompatible and cleans it up", async () => {
    const { root, viewer, run, windows } = await fixture()
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      await fs.writeFile(output, "")
    })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "export_incompatible" })
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("reports an export the viewer fails to load as incompatible and cleans it up", async () => {
    const { root, viewer, run, windows } = await fixture(process.platform, { loadFails: true })
    await expect(viewer.open(root)).resolves.toEqual({ opened: false, failure: "export_incompatible" })
    expect(windows[0].destroyed).toBe(true)
    expect(windows[0].file).toBeUndefined()
    await expectRemoved(run.mock.calls[0][1].at(-1))
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
    const result = expect(pending).rejects.toThrow("Wiki viewer is shutting down")
    await started
    await viewer.closeAll()
    await result
    expect(windows).toHaveLength(0)
  })

  it("does not open a viewer when shutdown occurs during the export read", async () => {
    let releaseRead
    const readGate = new Promise((resolve) => {
      releaseRead = resolve
    })
    let began
    const started = new Promise((resolve) => {
      began = resolve
    })
    const io = {
      ...fs,
      open: async (file, flags) => {
        began()
        await readGate
        return fs.open(file, flags)
      },
    }
    const { root, viewer, run, windows } = await fixture(process.platform, { io })
    let output
    run.mockImplementationOnce(async (_binary, args) => {
      output = args.at(-1)
      await fs.writeFile(output, EXPORT_HTML)
    })
    const pending = viewer.open(root)
    const result = expect(pending).rejects.toThrow("Wiki viewer is shutting down")
    await started
    const closing = viewer.closeAll()
    releaseRead()
    await closing
    await result
    expect(windows).toHaveLength(0)
    await expectRemoved(output)
  })

  it("rejects open when shutdown overlaps classification of a spawn failure", async () => {
    let releaseClassification
    const classificationGate = new Promise((resolve) => {
      releaseClassification = resolve
    })
    let classificationStarted
    const classificationBegan = new Promise((resolve) => {
      classificationStarted = resolve
    })
    let binaryAccesses = 0
    const io = {
      ...fs,
      access: async (target, mode) => {
        if (path.basename(String(target)) === runtimeBinaryName()) {
          binaryAccesses += 1
          if (binaryAccesses > 1) {
            classificationStarted()
            await classificationGate
          }
        }
        return mode === undefined ? fs.access(target) : fs.access(target, mode)
      },
    }
    const { root, viewer, run, windows } = await fixture(process.platform, { io })
    run.mockImplementationOnce(async () => {
      throw Object.assign(new Error("private spawn failure"), { code: "ENOENT" })
    })
    const pending = viewer.open(root)
    const result = expect(pending).rejects.toThrow("Wiki viewer is shutting down")
    await classificationBegan
    const closing = viewer.closeAll()
    releaseClassification()
    await closing
    await result
    expect(binaryAccesses).toBe(2)
    expect(windows).toHaveLength(0)
  })
})
