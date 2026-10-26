"use strict"

const path = require("node:path")
const { readFile } = require("node:fs/promises")

// Packaged file:// ASAR pages fail when GrantFileProtocolExtraPrivileges is disabled.
// Serve only allowlisted animation assets in the isolated player session instead.
const PLAYER_URL = "ax-animation://player/player.html"
const ANIMATION_PRIVILEGED_SCHEMES = [
  { scheme: "ax-animation", privileges: { standard: true, secure: true, stream: true } },
]
const installedSessions = new WeakSet()

function createAnimationAssetHandler(assetDir, manifest, read = readFile) {
  const allowed = new Set([
    "player.html",
    "player.css",
    "player.js",
    ...manifest.pairs
      .flatMap((pair) => [pair.opening.file, pair.ending.file])
      .filter((file) => /^[a-z0-9-]+\.webm$/.test(file)),
  ])
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webm": "video/webm" }
  return async (request) => {
    const url = new URL(request.url)
    const file = url.pathname.slice(1)
    if (url.protocol !== "ax-animation:" || url.host !== "player" || url.username || url.password || !allowed.has(file))
      return new Response(null, { status: 404 })
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 })
    try {
      const data = await read(path.join(assetDir, file))
      return new Response(request.method === "HEAD" ? null : data, {
        headers: { "Content-Type": types[path.extname(file)], "X-Content-Type-Options": "nosniff" },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}

const DONE_CHANNEL = "ax-code:launch-animation-done"
const REASONS = new Set(["ended", "skip", "disabled", "reduced-motion", "error"])

// The player is an isolated view layered over the host (main) window instead of
// a separate window, so opening and ending artwork reads as part of the app.
function createLaunchAnimationController({
  WebContentsView,
  getHostWindow,
  ipcMain,
  manifest,
  assetDir,
  preloadPath,
  preferencesReader = () => ({}),
  disable = async () => {},
  env = process.env,
  random = Math.random,
  logger = console,
  timeoutMs = 6000,
  onComplete = () => {},
  translate = (text) => text,
}) {
  const pair =
    manifest.pairs[Math.min(manifest.pairs.length - 1, Math.max(0, Math.floor(random() * manifest.pairs.length)))]
  let active = null
  let openingPlayed = false
  let endingPlayed = false
  let disposed = false
  const enabled = () => env.AX_CODE_DESKTOP_ANIMATIONS !== "0" && preferencesReader().enabled !== false

  function finish(reason, frames = 0) {
    const current = active
    if (!current) return
    active = null
    clearTimeout(current.timer)
    ipcMain.removeListener(DONE_CHANNEL, current.onDone)
    current.detach()
    const result = { kind: current.kind, pair: pair.id, reason, frames }
    try {
      onComplete(result)
    } catch (error) {
      logger.warn("[electron] animation diagnostics failed", error.message)
    }
    current.resolve(result)
  }

  function play(kind) {
    if (kind === "opening" ? openingPlayed : endingPlayed)
      return active?.promise || Promise.resolve({ reason: "already-played" })
    if (kind === "opening") openingPlayed = true
    else endingPlayed = true
    finish("replaced")
    if (disposed || !enabled()) return Promise.resolve({ kind, reason: "disabled" })
    const clip = pair[kind]
    if (!clip || !/^[a-z0-9-]+\.webm$/.test(clip.file)) return Promise.resolve({ kind, reason: "missing" })
    const host = getHostWindow()
    if (!host || host.isDestroyed()) return Promise.resolve({ kind, reason: "no-host" })
    let view
    try {
      view = new WebContentsView({
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webviewTag: false,
          autoplayPolicy: "no-user-gesture-required",
          // Keep this short-lived overlay decoding while its host gains visibility.
          // Completion or the six-second deadline closes the unthrottled contents.
          backgroundThrottling: false,
          partition: "ax-code-launch-animation",
        },
      })
      view.setBackgroundColor("#151313")
      host.contentView.addChildView(view)
    } catch (error) {
      logger.warn("[electron] animation view unavailable", error.message)
      if (view && !view.webContents.isDestroyed()) view.webContents.close()
      return Promise.resolve({ kind, reason: "error" })
    }
    const fit = () => {
      if (host.isDestroyed()) return
      const { width, height } = host.getContentBounds()
      view.setBounds({ x: 0, y: 0, width, height })
    }
    fit()
    host.on("resize", fit)
    const onHostClosed = () => complete("skip")
    host.once("closed", onHostClosed)
    const detach = () => {
      host.removeListener("resize", fit)
      host.removeListener("closed", onHostClosed)
      if (!host.isDestroyed()) host.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    const pageUrl = new URL(PLAYER_URL)
    const animationSession = view.webContents.session
    if (!installedSessions.has(animationSession)) {
      animationSession.protocol.handle("ax-animation", createAnimationAssetHandler(assetDir, manifest))
      installedSessions.add(animationSession)
    }
    function complete(reason, frames) {
      if (active?.view === view) finish(reason, frames)
    }
    let resolve
    const promise = new Promise((done) => {
      resolve = done
    })
    const onDone = (event, message) => {
      if (event.sender !== view.webContents || event.senderFrame !== view.webContents.mainFrame) return
      let senderUrl
      try {
        senderUrl = new URL(event.senderFrame.url)
        senderUrl.search = ""
        senderUrl.hash = ""
      } catch {
        return
      }
      if (senderUrl.href !== pageUrl.href || !REASONS.has(message?.reason)) return
      if (active?.view !== view || active.finishing) return
      active.finishing = true
      const frames = Number.isSafeInteger(message.frames) && message.frames >= 0 ? message.frames : 0
      if (message.reason === "disabled") {
        Promise.resolve()
          .then(disable)
          .catch((error) => logger.warn("[electron] animation preference write failed", error.message))
          .finally(() => complete(message.reason, frames))
        return
      }
      complete(message.reason, frames)
    }
    active = { kind, view, detach, promise, resolve, onDone, timer: setTimeout(() => complete("timeout"), timeoutMs) }
    ipcMain.on(DONE_CHANNEL, onDone)
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    view.webContents.on("will-navigate", (event) => event.preventDefault())
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    view.webContents.session.setPermissionCheckHandler(() => false)
    view.webContents.once("render-process-gone", () => complete("error"))
    // Keyboard focus moves to the overlay so Escape skips the artwork.
    view.webContents.once("did-finish-load", () => {
      if (active?.view === view && !view.webContents.isDestroyed()) view.webContents.focus()
    })
    try {
      Promise.resolve(
        view.webContents.loadURL(
          `${PLAYER_URL}?${new URLSearchParams({
            clip: clip.file,
            kind,
            skip: translate("Skip animation"),
            disable: translate("Disable animations"),
            status: translate(kind === "opening" ? "Starting desktop…" : "Closing desktop…"),
          })}`,
        ),
      ).catch(() => complete("error"))
    } catch {
      complete("error")
    }
    return promise
  }

  return {
    playOpening: () => play("opening"),
    playEnding: () => play("ending"),
    dispose: () => {
      disposed = true
      finish("disposed")
    },
    enabled,
    get view() {
      return active?.view || null
    },
    get playing() {
      return active !== null
    },
  }
}

module.exports = {
  createLaunchAnimationController,
  createAnimationAssetHandler,
  ANIMATION_PRIVILEGED_SCHEMES,
  DONE_CHANNEL,
}
