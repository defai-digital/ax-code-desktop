'use strict'

const { app, BrowserWindow, dialog, ipcMain, shell, session, utilityProcess } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const os = require('os')
const { createStartupDiagnostics } = require('./startup-diagnostics')

// Override the package name so macOS menus show "AX Code Desktop" instead
// of the scoped npm package name "@ax-code/electron".
app.name = 'AX Code Desktop'

// ── Resource paths ──────────────────────────────────────────────────────────
// In production (packaged), extraResources land at process.resourcesPath/web-dist.
// In development, point at the Vite build output directly.
function getWebDistPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web-dist')
  }
  return path.join(__dirname, '..', '..', '..', 'packages', 'web', 'dist')
}

function getDevRendererUrl() {
  if (app.isPackaged) return null
  const raw = process.env.OPENCHAMBER_ELECTRON_RENDERER_URL
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return null
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

// ── State ───────────────────────────────────────────────────────────────────
let mainWindow = null
let serverPort = 0
let serverChild = null
const startupDiagnostics = createStartupDiagnostics({
  logPath: process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Logs', 'AX Code Desktop', 'main.log')
    : path.join(os.homedir(), '.ax-code-desktop', 'logs', 'main.log'),
})

function recordStartupEvent(name, details = {}, options = {}) {
  const event = options.once === false
    ? startupDiagnostics.record(name, details, options)
    : startupDiagnostics.markOnce(name, details, options)
  if (event && options.forward !== false && serverChild) {
    try {
      serverChild.postMessage({ type: 'desktop-startup-event', event })
    } catch {
      // The utilityProcess may not be accepting messages yet.
    }
  }
  return event
}

recordStartupEvent('electron.process.start')

// ── Server ──────────────────────────────────────────────────────────────────
// The web server runs in a dedicated utilityProcess (dist/server-process.js)
// rather than in-process, so its CPU/IO never blocks the main event loop that
// drives the window, IPC, and auto-update. The renderer reaches it over HTTP
// loopback exactly as before — only where the server runs changes.
const SERVER_START_TIMEOUT_MS = 30_000
const SERVER_STOP_TIMEOUT_MS = 5_000

function launchServer() {
  return new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, 'server-process.js')
    recordStartupEvent('server.utilityProcess.launch')
    serverChild = utilityProcess.fork(serverEntry, [], {
      serviceName: 'ax-code-server',
      env: {
        ...process.env,
        // The server reads these at module-init time; previously set on the
        // main process before require, now passed into the forked process.
        OPENCHAMBER_DIST_DIR: getWebDistPath(),
        OPENCHAMBER_RUNTIME: 'desktop',
        AX_CODE_DESKTOP_STARTUP_SNAPSHOT: JSON.stringify(startupDiagnostics.snapshot()),
      },
    })

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { serverChild?.kill() } catch { /* ignore */ }
      reject(new Error('server process start timed out'))
    }, SERVER_START_TIMEOUT_MS)

    serverChild.on('message', (msg) => {
      if (msg?.type === 'startup-event' && msg.event?.name) {
        recordStartupEvent(msg.event.name, msg.event.details ?? {}, {
          source: msg.event.source || 'web-server',
          atEpochMs: Number.isFinite(msg.event.atEpochMs) ? msg.event.atEpochMs : undefined,
          forward: false,
          milestone: msg.event.name,
        })
        return
      }
      if (settled) return
      if (msg?.type === 'ready') {
        settled = true
        clearTimeout(timer)
        serverPort = msg.port
        recordStartupEvent('server.utilityProcess.ready', { port: serverPort })
        resolve()
      } else if (msg?.type === 'error') {
        settled = true
        clearTimeout(timer)
        reject(new Error(msg.message || 'server process failed to start'))
      }
    })

    serverChild.on('exit', (code) => {
      const wasReady = settled
      serverChild = null
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`server process exited before ready (code ${code})`))
      } else if (wasReady && code !== 0) {
        console.error('[electron] server process exited unexpectedly with code', code)
      }
    })
  })
}

// Ask the server to shut down gracefully (which also stops the ax-code child it
// spawned), then ensure the process is gone. Resolves once the child exits or a
// timeout forces a kill.
function stopServer() {
  const child = serverChild
  if (!child) return Promise.resolve()
  serverChild = null
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      finish()
    }, SERVER_STOP_TIMEOUT_MS)
    child.once('exit', finish)
    try {
      child.postMessage({ type: 'stop' })
    } catch {
      try { child.kill() } catch { /* ignore */ }
      finish()
    }
  })
}

// ── Window ──────────────────────────────────────────────────────────────────
function isTrustedRendererNavigation(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const devRendererUrl = getDevRendererUrl()
  const isServerUrl = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.port === String(serverPort)
  const isDevRendererUrl = devRendererUrl && parsed.origin === new URL(devRendererUrl).origin
  return Boolean(isServerUrl || isDevRendererUrl)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AX Code Desktop',
    backgroundColor: '#151313',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow loading from localhost — needed for the in-process server.
      webSecurity: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    recordStartupEvent('renderer.ready-to-show')
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Keep internal navigation inside the window; open everything else in the
    // default OS browser. Match host+port exactly via URL parsing — a prefix
    // check (startsWith) would treat e.g. `http://localhost:<port>@evil.com` or
    // `http://localhost:<port>9` as internal and load it in the trusted window
    // (which runs with webSecurity disabled and the preload IPC bridge).
    if (isTrustedRendererNavigation(url)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererNavigation(url)) {
      return
    }
    event.preventDefault()
    shell.openExternal(url)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    recordStartupEvent('renderer.did-finish-load')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    recordStartupEvent('renderer.did-fail-load', {
      errorCode,
      errorDescription,
      url: validatedUrl,
    }, { once: false })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const rendererUrl = getDevRendererUrl() || `http://localhost:${serverPort}`
  recordStartupEvent('renderer.load-url.start', {
    devRenderer: Boolean(getDevRendererUrl()),
  })
  await mainWindow.loadURL(rendererUrl)
}

// ── Auto-update ───────────────────────────────────────────────────────────
// Updates are user-driven through the in-app dialog: check → download (with a
// live progress bar) → quit-and-install. Disable auto-download/auto-install so
// the download only runs when the user clicks "Download" — otherwise
// electron-updater fetches in the background and the progress events below
// would replay against an already-downloaded file (the bar would jump straight
// to done).
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

// Forward electron-updater download progress to the renderer using the same
// event name and payload shape the shared UI expects from the Tauri updater
// (see downloadDesktopUpdate in packages/ui/src/lib/desktop.ts).
function sendUpdateProgress(event, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('openchamber:update-progress', { event, data })
  }
}

autoUpdater.on('download-progress', (p) => {
  sendUpdateProgress('Progress', { downloaded: p.transferred, total: p.total })
})
autoUpdater.on('update-downloaded', () => {
  sendUpdateProgress('Finished', {})
})
// electron-updater emits 'error' alongside rejecting its promises; without a
// listener, Node's EventEmitter turns the emit into an uncaught exception that
// crashes the main process. The IPC handlers already report failures to the
// renderer, so logging here is enough.
autoUpdater.on('error', (err) => {
  console.warn('[updater] error:', err instanceof Error ? err.message : err)
})

// ── IPC handlers (Tauri-compatible surface) ─────────────────────────────────
ipcMain.handle('desktop_get_launch_at_login', () => ({
  enabled: app.getLoginItemSettings().openAtLogin,
  supported: true,
}))

ipcMain.handle('desktop_set_launch_at_login', (_, { enabled }) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
  return { enabled: Boolean(enabled), supported: true }
})

ipcMain.handle('desktop_check_for_updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) return { available: false, currentVersion: app.getVersion() }
    const available = result.updateInfo.version !== app.getVersion()
    return {
      available,
      version: result.updateInfo.version,
      currentVersion: app.getVersion(),
      body: result.updateInfo.releaseNotes ?? undefined,
      date: result.updateInfo.releaseDate ?? undefined,
    }
  } catch (err) {
    // Surface the failure so the UI can distinguish "check failed" from "you're
    // up to date" — both previously collapsed to available:false.
    return {
      available: false,
      currentVersion: app.getVersion(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('desktop_download_and_install_update', async () => {
  sendUpdateProgress('Started', {})
  await autoUpdater.downloadUpdate()
})

ipcMain.handle('desktop_quit_and_install', () => {
  autoUpdater.quitAndInstall()
})

ipcMain.handle('desktop_restart', () => {
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('desktop_get_lan_address', () => {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${serverPort}`
      }
    }
  }
  return null
})

ipcMain.handle('desktop_dialog_open', async (_event, options = {}) => {
  const properties = []
  if (options?.directory === true) {
    properties.push('openDirectory')
  } else {
    properties.push('openFile')
  }
  if (options?.multiple === true) {
    properties.push('multiSelections')
  }

  const dialogOptions = {
    properties,
  }

  if (typeof options?.title === 'string' && options.title.trim()) {
    dialogOptions.title = options.title.trim()
  }
  if (typeof options?.defaultPath === 'string' && options.defaultPath.trim()) {
    dialogOptions.defaultPath = options.defaultPath.trim()
  }
  if (Array.isArray(options?.filters)) {
    dialogOptions.filters = options.filters
      .filter((filter) => (
        filter &&
        typeof filter.name === 'string' &&
        Array.isArray(filter.extensions) &&
        filter.extensions.every((extension) => typeof extension === 'string' && extension.trim().length > 0)
      ))
      .map((filter) => ({
        name: filter.name,
        extensions: filter.extensions.map((extension) => extension.trim()),
      }))
  }

  const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return options?.multiple === true ? result.filePaths : result.filePaths[0]
})

ipcMain.handle('desktop_record_startup_event', (_event, payload) => {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
  if (!/^[a-z0-9._:-]{1,96}$/i.test(name)) {
    return { ok: false, error: 'Invalid startup event name' }
  }

  recordStartupEvent(name, payload?.details ?? {}, {
    source: 'renderer',
    milestone: name,
  })
  return { ok: true }
})

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  recordStartupEvent('electron.app.ready')
  // Deny all permission requests except clipboard and fullscreen.
  // Chromium enumerates media devices on startup, which triggers macOS
  // permission prompts for device and media libraries, none of which this
  // app needs.
  const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-read', 'clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })

  try {
    await launchServer()
    await createWindow()
    // Best-effort update check — failures must not crash the app. With
    // autoDownload disabled, the in-app dialog (driven by the renderer's
    // periodic check) handles surfacing and downloading; checkForUpdates just
    // warms the cache here.
    autoUpdater.checkForUpdates().catch(() => {})
  } catch (err) {
    console.error('[electron] startup failed:', err)
    // app.exit() does not fire 'before-quit', so stop the server process
    // (and any ax-code child it spawned) here to avoid orphaning it when the
    // server booted but window creation failed.
    await stopServer().catch(() => {})
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  // On macOS, keep the server running so the user can reopen from the dock.
  if (process.platform !== 'darwin') {
    stopServer().finally(() => app.quit())
  }
})

app.on('activate', () => {
  if (!mainWindow && serverPort > 0) {
    createWindow().catch(console.error)
  }
})

let isQuitting = false
app.on('before-quit', (event) => {
  // Fire-and-forget would let the app exit before the server shuts down,
  // orphaning ax-code-server (and its ax-code child) and leaving the port
  // bound — the next launch then fails to rebind. Hold the quit, shut down
  // gracefully, then quit for real. stopServer() nulls serverChild
  // synchronously and the guard prevents intercepting the re-triggered quit.
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  stopServer().finally(() => app.quit())
})
