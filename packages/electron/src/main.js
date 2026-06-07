'use strict'

const { app, BrowserWindow, ipcMain, shell, session } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const os = require('os')

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

// Must be set before the server module is required so the server picks them up
// at module init time.
process.env.OPENCHAMBER_DIST_DIR = getWebDistPath()
process.env.OPENCHAMBER_RUNTIME = 'desktop'

// ── State ───────────────────────────────────────────────────────────────────
let mainWindow = null
let serverPort = 0
let serverHandle = null

// Bundled server (dist/server.js produced by bundle-main.mjs).
const { startWebUiServer } = require('./server.js')

// ── Server ──────────────────────────────────────────────────────────────────
async function launchServer() {
  serverHandle = await startWebUiServer({ port: 0 })
  serverPort = serverHandle.getPort()
}

// ── Window ──────────────────────────────────────────────────────────────────
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

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Keep internal navigation inside the window; open everything else in the
    // default OS browser. Match host+port exactly via URL parsing — a prefix
    // check (startsWith) would treat e.g. `http://localhost:<port>@evil.com` or
    // `http://localhost:<port>9` as internal and load it in the trusted window
    // (which runs with webSecurity disabled and the preload IPC bridge).
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }
    if (parsed && parsed.protocol === 'http:' && parsed.hostname === 'localhost' && parsed.port === String(serverPort)) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  await mainWindow.loadURL(`http://localhost:${serverPort}`)
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

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Deny all permission requests except clipboard and fullscreen.
  // Chromium enumerates media devices on startup, which triggers macOS
  // permission prompts for camera, microphone, music, and photos — none
  // of which this app needs.
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
    // app.exit() does not fire 'before-quit', so stop the in-process server
    // (and any ax-code child it spawned) here to avoid orphaning it when the
    // server booted but window creation failed.
    await serverHandle?.stop({ exitProcess: false }).catch(() => {})
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  // On macOS, keep the server running so the user can reopen from the dock.
  if (process.platform !== 'darwin') {
    serverHandle?.stop({ exitProcess: false }).catch(() => {}).finally(() => app.quit())
  }
})

app.on('activate', () => {
  if (!mainWindow && serverPort > 0) {
    createWindow().catch(console.error)
  }
})

app.on('before-quit', () => {
  serverHandle?.stop({ exitProcess: false }).catch(() => {})
})
