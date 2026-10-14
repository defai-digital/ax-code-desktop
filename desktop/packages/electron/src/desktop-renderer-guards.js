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
  webContents.on("will-redirect", guard)
}

module.exports = {
  attachRendererNavigationGuards,
  createUpdateInstallGate,
  quotePowerShellLiteral,
}
