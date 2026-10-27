"use strict"

const fs = require("node:fs/promises")
const { constants: fsConstants } = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")

// Failure codes cross IPC; the renderer maps them to localized text. Raw child output
// carries project paths and configuration, so it never leaves this module — callers only
// ever receive the class.
const FAILURE = Object.freeze({
  runtimeUnavailable: "runtime_unavailable",
  wikiMissing: "wiki_missing",
  exportIncompatible: "export_incompatible",
  failed: "failed",
})

// The pinned runtime reports an absent manifest only through this diagnostic. It is read
// here to choose the safe message and is never forwarded.
const MISSING_WIKI_DIAGNOSTIC = /No Wiki manifest found/i

// Diagnostics the exporter emits for a present wiki it cannot turn into a viewer document:
// graph text the exporter rejects, a refused symlinked manifest, or an oversized manifest.
// None of them mean the wiki is missing, so they must not borrow that message.
const EXPORT_INCOMPATIBLE_DIAGNOSTIC = /Invalid graph text|refuses symlinked manifests|Wiki manifest exceeds/i

const SHUTDOWN_MESSAGE = "Wiki viewer is shutting down"

/** An export the viewer cannot render, as opposed to a failure of the export command. */
class ExportFailure extends Error {
  constructor(failure) {
    super(failure)
    this.failure = failure
  }
}

// Consume the signed runtime's offline export. Desktop never renders or copies
// the canonical viewer. A separate sandbox preserves its own CSP and lifecycle.
function createWikiViewer({
  BrowserWindow,
  getRuntimeRoot,
  run = promisify(execFile),
  io = fs,
  platform = process.platform,
}) {
  const windows = new Map()
  const jobs = new Set()
  const controllers = new Set()
  let stopping = false
  // The stable partition means every viewer shares one cached session: attach
  // its handlers once, not per opened window.
  const configuredSessions = new WeakSet()
  const configureSession = (guestSession) => {
    if (configuredSessions.has(guestSession)) return
    configuredSessions.add(guestSession)
    guestSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    guestSession.setPermissionCheckHandler(() => false)
    guestSession.on("will-download", (event) => event.preventDefault())
  }

  const removeExport = (temporary) =>
    io.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })

  // Windows has no execute bit. Elsewhere a bundled node without one must fail this
  // check, or spawn's EACCES is reported as a generic failure.
  const accessRuntimeBinary = (binary) => {
    const constants = io.constants ?? fsConstants
    return io.access(binary, platform === "win32" ? constants.F_OK : constants.X_OK)
  }

  const classifyRunFailure = async (error, binary) => {
    if (!error || typeof error !== "object") return FAILURE.failed
    // Node reports a missing or unreadable cwd as ENOENT/EACCES with error.path set to
    // the executable, so the path cannot separate a vanished project from a missing
    // runtime. Re-check that the binary itself is runnable.
    if (error.code === "ENOENT" || error.code === "EACCES") {
      try {
        await accessRuntimeBinary(binary)
      } catch {
        return FAILURE.runtimeUnavailable
      }
      return FAILURE.failed
    }
    // execFile attaches the child's bounded output. Inspect it here; never forward it.
    const output = `${typeof error.stdout === "string" ? error.stdout : ""}\n${
      typeof error.stderr === "string" ? error.stderr : ""
    }`
    if (MISSING_WIKI_DIAGNOSTIC.test(output)) return FAILURE.wikiMissing
    if (EXPORT_INCOMPATIBLE_DIAGNOSTIC.test(output)) return FAILURE.exportIncompatible
    return FAILURE.failed
  }

  // The export must be an HTML document the sandboxed viewer can render. Anything else
  // (missing, empty, or a different artifact) means the runtime and the viewer disagree.
  const exportIsHtml = async (file) => {
    let handle
    try {
      handle = await io.open(file, "r")
      const buffer = Buffer.alloc(256)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return buffer.subarray(0, bytesRead).toString("utf8").trimStart().startsWith("<")
    } catch {
      return false
    } finally {
      if (handle) await handle.close().catch(() => {})
    }
  }

  const openSnapshot = async (directory, signal) => {
    if (stopping) throw new Error(SHUTDOWN_MESSAGE)
    if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.includes("\0")) {
      throw new Error("An absolute project directory is required")
    }
    let root
    try {
      root = await io.realpath(directory)
      if (!(await io.stat(root)).isDirectory()) throw new Error("Project directory is not a folder")
    } catch {
      // The project moved or disappeared between the click and the read.
      return { opened: false, failure: FAILURE.failed }
    }
    let runtime
    try {
      runtime = getRuntimeRoot()
    } catch {
      // Resolution itself failed: no usable runtime to launch the viewer with.
      return { opened: false, failure: FAILURE.runtimeUnavailable }
    }
    if (!runtime) return { opened: false, failure: FAILURE.runtimeUnavailable }
    const binary = path.join(runtime, "node", "bin", platform === "win32" ? "node.exe" : "node")
    const entrypoint = path.join(runtime, "lib", "index-node-tui.js")
    try {
      // A partial install must read as an unavailable runtime, not as a failed export.
      await accessRuntimeBinary(binary)
      await io.access(entrypoint)
    } catch {
      return { opened: false, failure: FAILURE.runtimeUnavailable }
    }
    let temporary
    try {
      temporary = await io.mkdtemp(path.join(os.tmpdir(), "ax-code-wiki-viewer-"))
    } catch {
      // No private export directory, no viewer; nothing to clean up and nothing to leak.
      return { opened: false, failure: FAILURE.failed }
    }
    const exportFile = path.join(temporary, "snapshot.html")
    let window
    let closed
    try {
      // Spawn Node directly: cmd.exe must never interpret project/export paths,
      // including spaces, percent signs, ampersands and non-ASCII usernames.
      await run(binary, ["--disable-warning=ExperimentalWarning", entrypoint, "wiki", "viz", "--export", exportFile], {
        signal,
        cwd: root,
        env: { ...process.env, AX_CODE_ORIGINAL_CWD: root },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      if (stopping) throw new Error(SHUTDOWN_MESSAGE)
      if (!(await exportIsHtml(exportFile))) throw new ExportFailure(FAILURE.exportIncompatible)
      // Re-checking here keeps closeAll's single snapshot complete: nothing is awaited before the window is registered.
      if (stopping) throw new Error(SHUTDOWN_MESSAGE)
      window = new BrowserWindow({
        title: "AX Code Wiki",
        width: 1100,
        height: 800,
        show: false,
        webPreferences: {
          // One stable, in-memory partition for every wiki window: Electron
          // caches a Session per partition string for the app's lifetime, so a
          // UUID per open leaked a session (cookie jar, caches, network
          // context) per window.
          partition: "wiki-viewer",
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      })
      configureSession(window.webContents.session)
      closed = new Promise((resolve, reject) => {
        window.once("closed", () => {
          removeExport(temporary).then(
            () => {
              windows.delete(window)
              resolve()
            },
            (error) => {
              windows.delete(window)
              reject(error)
            },
          )
        })
      })
      // Closing a viewer normally has no caller awaiting its cleanup.
      void closed.catch(() => {})
      windows.set(window, closed)
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
      window.webContents.on("will-navigate", (event) => event.preventDefault())
      window.webContents.on("will-attach-webview", (event) => event.preventDefault())
      try {
        await window.loadFile(exportFile)
      } catch {
        // The document exists but this viewer cannot render it: a version mismatch.
        throw new ExportFailure(FAILURE.exportIncompatible)
      }
      if (!window.isDestroyed()) window.show()
      return { opened: true }
    } catch (error) {
      if (window && !window.isDestroyed()) window.destroy()
      // Cleanup must not replace the classified outcome with a raw fs error.
      if (closed) await closed.catch(() => {})
      else await removeExport(temporary).catch(() => {})
      if (stopping) throw new Error(SHUTDOWN_MESSAGE)
      const failure = error instanceof ExportFailure ? error.failure : await classifyRunFailure(error, binary)
      // closeAll can flip stopping while the binary re-check is in flight.
      if (stopping) throw new Error(SHUTDOWN_MESSAGE)
      return { opened: false, failure }
    }
  }

  const open = (directory) => {
    const controller = new AbortController()
    controllers.add(controller)
    const job = openSnapshot(directory, controller.signal)
    jobs.add(job)
    return job.finally(() => {
      jobs.delete(job)
      controllers.delete(controller)
    })
  }

  const closeAll = async () => {
    stopping = true
    for (const controller of controllers) controller.abort()
    const records = Array.from(windows)
    for (const [window] of records) if (!window.isDestroyed()) window.destroy()
    await Promise.allSettled(Array.from(jobs))
    // Settle every cleanup before reporting one failure: rejecting on the first let shutdown
    // continue while other viewers' project exports were still being removed.
    const cleanups = await Promise.allSettled(records.map(([, closed]) => closed))
    const failure = cleanups.find((cleanup) => cleanup.status === "rejected")
    if (failure) throw failure.reason
  }

  return { open, closeAll }
}

module.exports = { createWikiViewer }
