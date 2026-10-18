"use strict"

const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")

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

  const openSnapshot = async (directory, signal) => {
    if (stopping) throw new Error("Wiki viewer is shutting down")
    if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.includes("\0")) {
      throw new Error("An absolute project directory is required")
    }
    const root = await io.realpath(directory)
    if (!(await io.stat(root)).isDirectory()) throw new Error("Project directory is not a folder")
    const runtime = getRuntimeRoot()
    if (!runtime) throw new Error("The bundled AX Code runtime is unavailable")
    const temporary = await io.mkdtemp(path.join(os.tmpdir(), "ax-code-wiki-viewer-"))
    let window
    let closed
    const removeExport = () => io.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    try {
      // Spawn Node directly: cmd.exe must never interpret project/export paths,
      // including spaces, percent signs, ampersands and non-ASCII usernames.
      await run(
        path.join(runtime, "node", "bin", platform === "win32" ? "node.exe" : "node"),
        [
          "--disable-warning=ExperimentalWarning",
          path.join(runtime, "lib", "index-node-tui.js"),
          "wiki",
          "viz",
          "--export",
          path.join(temporary, "snapshot.html"),
        ],
        {
          signal,
          cwd: root,
          env: { ...process.env, AX_CODE_ORIGINAL_CWD: root },
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      )
      if (stopping) throw new Error("Wiki viewer is shutting down")
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
          removeExport().then(
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
      await window.loadFile(path.join(temporary, "snapshot.html"))
      if (!window.isDestroyed()) window.show()
      return { opened: true }
    } catch {
      if (window && !window.isDestroyed()) window.destroy()
      // Cleanup must not replace the actionable message with a raw fs error.
      if (closed) await closed.catch(() => {})
      else await removeExport().catch(() => {})
      // Child output can contain paths/configuration. Keep it out of IPC errors.
      throw new Error("The official Wiki viewer could not be opened. Build the project wiki and try again.")
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
    await Promise.all(records.map(([, closed]) => closed))
  }

  return { open, closeAll }
}

module.exports = { createWikiViewer }
