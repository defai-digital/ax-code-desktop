"use strict"

// Supervision pop-out window (SPEC-2026-10-19-supervision-popout-v1). Mission
// Control in its own renderer window: a view over the same runtime projections
// as the in-window board, with no state of its own. At most one exists; asking
// again focuses it. Dependencies are injected so the factory is unit-testable.

const SUPERVISION_WINDOW_PATH = "/supervision.html"
const SUPERVISION_WINDOW_SIZE = Object.freeze({ width: 960, height: 720, minWidth: 640, minHeight: 480 })

function createSupervisionWindowController({
  BrowserWindow,
  webPreferences,
  chromeOptions = () => ({}),
  attachChrome = () => {},
  attachWebviewPolicy = () => {},
  attachNavigationGuards,
  isTrustedUrl,
  openExternal,
  loadUrlWithTimeout,
  getOrigin,
  timeoutMs,
  beforeCreate = () => {},
}) {
  let current = null
  let pending = null

  const isLive = (win) => Boolean(win) && !win.isDestroyed()

  const reveal = (win) => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return win
  }

  const create = async () => {
    beforeCreate()
    const win = new BrowserWindow({
      ...SUPERVISION_WINDOW_SIZE,
      title: "AX Code",
      ...chromeOptions(),
      show: false,
      webPreferences: webPreferences(),
    })
    current = win
    win.on("closed", () => {
      if (current === win) current = null
    })
    attachWebviewPolicy(win.webContents)
    attachChrome(win)
    win.once("ready-to-show", () => win.show())
    win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      // A window.open child would inherit this window's privileged preload
      // without the navigation guards, so no target gets its own window.
      if (!isTrustedUrl(targetUrl)) openExternal(targetUrl)
      return { action: "deny" }
    })
    attachNavigationGuards(win.webContents, { isTrustedUrl, onBlocked: openExternal })
    try {
      await loadUrlWithTimeout(win, `${getOrigin()}${SUPERVISION_WINDOW_PATH}`, { timeoutMs })
    } catch (error) {
      // Never leave a hidden show:false window behind a wedged load.
      if (current === win) current = null
      if (!win.isDestroyed()) win.destroy()
      throw error
    }
    return win
  }

  const open = async () => {
    // A second request during the first load joins it instead of opening a
    // second window or revealing a half-loaded one.
    if (pending) return pending
    if (isLive(current)) return reveal(current)
    pending = create().finally(() => {
      pending = null
    })
    return pending
  }

  return {
    open,
    getWindow: () => (isLive(current) ? current : null),
  }
}

module.exports = {
  SUPERVISION_WINDOW_PATH,
  SUPERVISION_WINDOW_SIZE,
  createSupervisionWindowController,
}
