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

function createLaunchAnimationController({
  BrowserWindow,
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
  showWindow = true,
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
    if (!current.window.isDestroyed()) current.window.destroy()
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
    let window
    try {
      window = new BrowserWindow({
        width: 960,
        height: 540,
        useContentSize: true,
        title: "AX Code",
        backgroundColor: "#151313",
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webviewTag: false,
          autoplayPolicy: "no-user-gesture-required",
          partition: "ax-code-launch-animation",
        },
      })
    } catch (error) {
      logger.warn("[electron] animation window unavailable", error.message)
      return Promise.resolve({ kind, reason: "error" })
    }
    const pageUrl = new URL(PLAYER_URL)
    const animationSession = window.webContents.session
    if (!installedSessions.has(animationSession)) {
      animationSession.protocol.handle("ax-animation", createAnimationAssetHandler(assetDir, manifest))
      installedSessions.add(animationSession)
    }
    const complete = (reason, frames) => {
      if (active?.window === window) finish(reason, frames)
    }
    let resolve
    const promise = new Promise((done) => {
      resolve = done
    })
    const onDone = (event, message) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
      let senderUrl
      try {
        senderUrl = new URL(event.senderFrame.url)
        senderUrl.search = ""
        senderUrl.hash = ""
      } catch {
        return
      }
      if (senderUrl.href !== pageUrl.href || !REASONS.has(message?.reason)) return
      if (active?.window !== window || active.finishing) return
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
    active = { kind, window, promise, resolve, onDone, timer: setTimeout(() => complete("timeout"), timeoutMs) }
    ipcMain.on(DONE_CHANNEL, onDone)
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (event) => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    window.webContents.session.setPermissionCheckHandler(() => false)
    window.webContents.once("render-process-gone", () => complete("error"))
    window.once("closed", () => complete("skip"))
    window.once("ready-to-show", () => {
      if (showWindow && !window.isDestroyed()) window.show()
    })
    try {
      Promise.resolve(
        window.loadURL(
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
    get window() {
      return active?.window || null
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
