"use strict"

const DESKTOP_BROWSER_WEBVIEW_PARTITION = "persist:openchamber-browser"

function isDesktopUiWebMcpEnabled(isPackaged, env) {
  return isPackaged === false && env?.AX_CODE_DESKTOP_UI_WEBMCP === "1"
}

function createDesktopRendererWebPreferences(preload, options = {}) {
  const additionalArguments = Array.isArray(options.additionalArguments)
    ? options.additionalArguments.filter((value) => typeof value === "string" && value.length > 0)
    : []
  return {
    preload,
    // Electron sandboxes renderers by default; pin it so a future default or a
    // caller override cannot silently give the privileged preload Node access
    // (ADR-018). The preload is bundled for a sandboxed renderer.
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: true,
    ...(additionalArguments.length > 0 ? { additionalArguments } : {}),
  }
}

function isAllowedDesktopBrowserWebviewSrc(value) {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    const parsed = new URL(value)
    if (parsed.protocol === "about:") return parsed.href === "about:blank"
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function isAllowedDesktopBrowserWebviewPartition(value) {
  return value === DESKTOP_BROWSER_WEBVIEW_PARTITION
}

function applyDesktopBrowserWebviewPolicy(event, webPreferences, params) {
  const src = typeof params?.src === "string" ? params.src : ""
  const partition = typeof params?.partition === "string" ? params.partition : ""

  if (!isAllowedDesktopBrowserWebviewSrc(src) || !isAllowedDesktopBrowserWebviewPartition(partition)) {
    event?.preventDefault?.()
    return false
  }

  if (webPreferences && typeof webPreferences === "object") {
    delete webPreferences.preload
    delete webPreferences.preloadURL
    webPreferences.partition = DESKTOP_BROWSER_WEBVIEW_PARTITION
    webPreferences.contextIsolation = true
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.nodeIntegrationInWorker = false
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
  }

  return true
}

function attachDesktopBrowserWebviewPolicy(contents) {
  if (!contents || typeof contents.on !== "function") return
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    applyDesktopBrowserWebviewPolicy(event, webPreferences, params)
  })
  // `allowpopups` (or any future guest that opens a window) would otherwise
  // create an unmanaged BrowserWindow outside every navigation guard. The
  // browser panel has its own "open externally" action for that.
  contents.on("did-attach-webview", (_event, guestContents) => {
    if (!guestContents || typeof guestContents.setWindowOpenHandler !== "function") return
    guestContents.setWindowOpenHandler(() => ({ action: "deny" }))
  })
}

module.exports = {
  isDesktopUiWebMcpEnabled,
  DESKTOP_BROWSER_WEBVIEW_PARTITION,
  applyDesktopBrowserWebviewPolicy,
  attachDesktopBrowserWebviewPolicy,
  createDesktopRendererWebPreferences,
  isAllowedDesktopBrowserWebviewSrc,
}
