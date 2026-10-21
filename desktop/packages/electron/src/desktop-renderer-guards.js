"use strict"

// Small, unit-testable pieces of the Electron shell's safety policy. They live
// here rather than inline in main.js so the behaviour can be pinned by tests
// (main.js itself is not importable from a test).

/**
 * Quotes a value as a PowerShell single-quoted literal. PowerShell expands
 * `$(...)` inside double-quoted strings, so a directory name can otherwise
 * smuggle a command into a `-Command` argument (NTFS names may contain `$`,
 * `(`, `)` and spaces). Inside single quotes everything is literal; an embedded
 * single quote is written twice.
 */
const quotePowerShellLiteral = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`

/**
 * Tracks whether the updater has a verified download ready to install.
 * electron-updater's `quitAndInstall()` does NOT quit when nothing is
 * downloaded — it emits `error` and returns — so the shell must not stop its
 * services before asking it to install, or the app is left running with a dead
 * server and runtime.
 */
const createUpdateInstallGate = () => {
  let downloadedVersion = null

  return {
    /** `update-downloaded` — a verified download exists and can be installed. */
    onDownloaded(info) {
      downloadedVersion = typeof info?.version === "string" ? info.version : ""
    },
    /** `error` / `update-not-available` — nothing installable is left. */
    onNotInstallable() {
      downloadedVersion = null
    },
    canInstall() {
      return downloadedVersion !== null
    },
    version() {
      return downloadedVersion
    },
  }
}

/**
 * Observe the quit before starting the installer: it may announce the quit
 * synchronously, emit an error without quitting, or throw before it starts.
 * Services remain live until the app's normal before-quit coordinator runs.
 */
const DEFAULT_INSTALL_START_TIMEOUT_MS = 30_000

const waitForInstallStart = ({
  updater,
  nativeUpdater = updater,
  start,
  timeoutMs = DEFAULT_INSTALL_START_TIMEOUT_MS,
} = {}) =>
  new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (started) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      nativeUpdater?.removeListener?.("before-quit-for-update", onStarted)
      updater?.removeListener?.("error", onFailed)
      if (nativeUpdater !== updater) nativeUpdater?.removeListener?.("error", onFailed)
      resolve(started)
    }
    const onStarted = () => finish(true)
    const onFailed = () => finish(false)
    timer = setTimeout(onFailed, timeoutMs)
    // Must not keep the process alive while the app is meant to be quitting.
    timer.unref?.()
    nativeUpdater?.once?.("before-quit-for-update", onStarted)
    updater?.once?.("error", onFailed)
    if (nativeUpdater !== updater) nativeUpdater?.once?.("error", onFailed)
    try {
      start?.()
    } catch {
      onFailed()
    } finally {
      // After handoff, wrapper errors may belong to unrelated background
      // checks. Native staging errors still arrive on the native updater;
      // wrapper errors emitted synchronously by quitAndInstall are handled above.
      if (nativeUpdater !== updater) updater?.removeListener?.("error", onFailed)
    }
  })

/** Share concurrent IPC requests and leave service cleanup to the actual quit. */
const createUpdateInstaller = ({
  updater,
  nativeUpdater,
  gate,
  isQuitting = () => false,
  beforeInstall = async () => {},
  timeoutMs,
} = {}) => {
  let inFlight = null
  return () => {
    if (inFlight) return inFlight
    if (isQuitting()) return Promise.resolve({ installed: false, reason: "app-quitting" })
    if (!gate.canInstall()) return Promise.resolve({ installed: false, reason: "no-downloaded-update" })
    const version = gate.version()
    inFlight = Promise.resolve()
      .then(beforeInstall)
      .then(() => waitForInstallStart({ updater, nativeUpdater, timeoutMs, start: () => updater.quitAndInstall() }))
      .then((started) => {
        if (!started) {
          gate.onNotInstallable()
          return { installed: false, reason: "install-not-started" }
        }
        return { installed: true, version: version ?? undefined }
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }
}

/**
 * Blocks every navigation of `webContents` (renderer-initiated AND
 * server-side redirects) that `isTrustedUrl` rejects. A renderer that lands on
 * a remote page keeps its preload bridge, so both paths must be guarded;
 * `will-navigate` alone does not cover a redirect chain.
 */
const attachRendererNavigationGuards = (webContents, { isTrustedUrl, onBlocked } = {}) => {
  if (!webContents || typeof webContents.on !== "function") return
  const guard = (event, url) => {
    if (typeof isTrustedUrl === "function" && isTrustedUrl(url)) return
    event?.preventDefault?.()
    onBlocked?.(url)
  }
  webContents.on("will-navigate", guard)
  // A subframe redirect is not the renderer navigating (the preload bridge only
  // belongs to the top-level document), and treating it as one opened an
  // external browser tab for every third-party embed that redirected.
  webContents.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame === false || event?.isMainFrame === false) return
    guard(event, url)
  })
}

module.exports = {
  attachRendererNavigationGuards,
  createUpdateInstallGate,
  createUpdateInstaller,
  quotePowerShellLiteral,
  waitForInstallStart,
}
