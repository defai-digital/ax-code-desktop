"use strict"

const {
  app,
  autoUpdater: nativeAutoUpdater,
  BrowserWindow,
  WebContentsView,
  dialog,
  globalShortcut,
  ipcMain,
  shell,
  session,
  utilityProcess,
  Menu,
  nativeTheme,
  Notification,
  screen,
  net: electronNet,
  powerMonitor,
  webContents,
  protocol,
} = require("electron")
const { autoUpdater } = require("electron-updater")
const path = require("path")
const os = require("os")
const fs = require("fs")
const fsp = require("fs/promises")
const { execFile, spawn, spawnSync } = require("child_process")
const { runOpenSpecChain } = require("./open-app-launcher")
const { promisify } = require("util")
const { createWikiViewer } = require("./wiki-viewer")
const { createStartupDiagnostics } = require("./startup-diagnostics")
const { assertShellOpenPathSucceeded, collectOpenPathCandidates } = require("./open-paths")
const { FOCUS_MAIN_WINDOW_ACTION, resolveFocusMainWindowAction } = require("./focus-main-window")
const { mapWithConcurrency } = require("./map-with-concurrency")
const { assertDesktopReadFileAllowed } = require("./desktop-read-file-policy")
const { sanitizeDesktopWindowTitle } = require("./desktop-window-title")
const { collectNativeSearchResults, resolveSearchableNativeRoot } = require("./desktop-file-search")
const { AX_CODE_INSTALL_DOCS_URL, GITHUB_BUG_REPORT_URL, GITHUB_FEATURE_REQUEST_URL } = require("./support-urls")
const { createSupervisionFsm } = require("./supervision-fsm")
const { buildComputerUseServerEnv } = require("./computer-use-server-env")
const { applyBundledAxCodeEnv, buildBundledAxCodeEnv } = require("./bundled-ax-code-env")
const { desktopBrowserRuntimeEnv } = require("./browser-runtime-policy")
const { verifyBundledAxCodeIntegrityAsync } = require("./bundled-ax-code-integrity")
const {
  LOGIN_SHELL_ENV_VAR,
  resolveForwardedLoginShellEnv,
  startLoginShellEnvCapture,
  runtimeExecutionEnv,
} = require("./login-shell-env")
const { getRuntimeAuthPassword } = require("./runtime-auth-password")
const { requireBrowserClosure, restartDesktop } = require("./browser-shutdown")
const { createDesktopWebMcpBrowser, DESKTOP_BROWSER_TOKEN } = require("./desktop-webmcp-browser")

const wikiViewer = createWikiViewer({
  BrowserWindow,
  getRuntimeRoot: () => {
    // Resolve the runtime the same way the supervisor does (settings > env >
    // bundled > PATH): in dev there is no staged bundle, and the viewer used
    // to report the runtime as unavailable there even though the app was
    // talking to a PATH-installed ax-code the whole time.
    const resolved = resolveRuntimeBinary({
      env: applyBundledAxCodeEnv(runtimeSearchEnv || process.env, bundledAxCodeEnv),
      settings: readSettingsRoot(),
    })
    if (!resolved) return null
    // A PATH hit is usually a symlinked launcher (~/.local/bin/ax-code ->
    // versions/<runtime>/bin/ax-code); the tree root must be derived from the
    // real file, not the link.
    let binary = resolved.binary
    try {
      binary = fs.realpathSync(binary)
    } catch {}
    const root = path.dirname(path.dirname(binary))
    // The viewer spawns <root>/node/bin/node <root>/lib/index-node-tui.js, so
    // only a full runtime tree qualifies — a bare launcher shim has neither.
    return fs.existsSync(path.join(root, "lib", "index-node-tui.js")) ? root : null
  },
})

// Native WebMCP is supplied by the bundled engine; agent access is separately enrolled.
app.commandLine.appendSwitch("enable-features", "WebMCP")
// UI inspection is an explicit developer opt-in, never enabled in a packaged app.
process.env.AX_CODE_DESKTOP_UI_WEBMCP = require("./webview-policy").isDesktopUiWebMcpEnabled(
  app.isPackaged,
  process.env,
)
  ? "1"
  : "0"
const {
  createAxCodeRuntimeSupervision,
  defaultIsExecutable,
  resolveRuntimeBinary,
  RUNTIME_NOT_FOUND_CODE,
  RUNTIME_START_CANCELLED_CODE,
} = require("./axcode-runtime-supervisor")
const { recoverFromMissingRuntime } = require("./runtime-missing-recovery")
const { createRuntimeRestartRequestHandler } = require("./runtime-restart-request")
const { createRendererCrashPolicy } = require("./renderer-crash-policy")
const { createSettingsWriteHandler } = require("./settings-write-handler")
const { indexContract, validateCommandArgs } = require("./ipc-args")
const { loadUrlWithTimeout } = require("./load-url-timeout")
const { createSupervisionWindowController } = require("./supervision-window")
const { shouldCheckForUpdatesOnStartup } = require("./startup-update-policy")
const { sendUpdateProgressToWindows } = require("./update-progress")
const { resolveDesktopUpdateFeed } = require("./desktop-update-feed")
const { createInstalledAppsRefresher, normalizeInstalledAppsCache } = require("./installed-apps-cache")
const {
  reloadLocalRendererWindowsAfterServerRestart,
  resolveServerRestartReloadUrl,
} = require("./server-window-reload")
const {
  DESKTOP_BROWSER_WEBVIEW_PARTITION,
  attachDesktopBrowserWebviewPolicy,
  createDesktopRendererWebPreferences,
} = require("./webview-policy")
const {
  isAllowedDesktopHostTargetUrl,
  isLocalDesktopSenderUrl,
  isLocalOnlyDesktopHostsConfigInput,
  normalizeHostUrl,
  removeDisabledRemoteAccessSettingsFromRoot,
} = require("./desktop-hosts")
const { normalizeDevRendererUrl } = require("./renderer-navigation-policy")
const { createLaunchAnimationController, ANIMATION_PRIVILEGED_SCHEMES } = require("./launch-animation-controller")
const { createQuitCoordinator } = require("./quit-coordinator")
const {
  QUICK_DISPATCH_ACCELERATOR,
  readQuickDispatchShortcutEnabled,
  syncQuickDispatchShortcut,
} = require("./quick-dispatch-shortcut")
const {
  DEFAULT_BACKGROUND_DARK,
  DEFAULT_BACKGROUND_LIGHT,
  attachTrafficLightRefresh,
  macTrafficLightPosition,
  macosMajorFromDarwinRelease,
  nativeWindowChromeOptions,
  normalizeHexColor,
  resolveWindowBackgroundColor,
} = require("./desktop-window-chrome")
const launchAnimationManifest = require("../resources/launch-animations/manifest.json")
const {
  PACKAGED_RENDERER_ORIGIN,
  PACKAGED_RENDERER_PRIVILEGED_SCHEMES,
  PACKAGED_RENDERER_SCHEME,
  resolvePackagedResponseCsp,
  buildRendererApiOrigin,
  createPackagedRendererProtocolHandler,
  isPackagedRendererUrl,
  isTrustedRendererNavigationUrl,
} = require("./desktop-renderer-protocol")

protocol.registerSchemesAsPrivileged([...PACKAGED_RENDERER_PRIVILEGED_SCHEMES, ...ANIMATION_PRIVILEGED_SCHEMES])
const { normalizeSafeExternalUrl } = require("./external-url")
const { buildDesktopOpenDialogOptions, resolveDesktopDialogOwnerWindow } = require("./desktop-dialog")
const {
  attachRendererNavigationGuards,
  createUpdateInstallGate,
  quotePowerShellLiteral,
  createUpdateInstaller,
} = require("./desktop-renderer-guards")
const { createTrayController } = require("./tray.mjs")
const { createLanguageController } = require("../../../shared/localization.mjs")
const { createNativeLocalizer, localizeMenuTemplate, createLocalizedDialog } = require("./native-localization")
const { isDesktopBrowserCaptureTargetForSender } = require("./desktop-browser-capture-policy")

const execFileAsync = promisify(execFile)

// Override the package name so macOS menus show "AX Code" instead
// of the scoped npm package name "@ax-code/electron".
app.name = "AX Code"
app.setAppUserModelId("ai.defai.ax-code-app")

// When run UNPACKAGED (e.g. `electron dist/main.js` for local testing), the dock
// shows Electron's default icon and "Electron" as the name. A packaged build
// gets these from its bundle; for dev runs, set the dock icon explicitly so the
// app is recognizably AX Code. No-op when packaged (bundle wins).
if (process.platform === "darwin" && !app.isPackaged && app.dock) {
  try {
    app.dock.setIcon(path.join(__dirname, "..", "build", "icon.png"))
  } catch {
    // Best-effort branding; never block startup on it.
  }
}

// ── Resource paths ──────────────────────────────────────────────────────────
// In production, renderer assets live inside the integrity-protected app.asar.
// Electron patches fs in main and utility processes to read ASAR paths. In
// development, point at the Vite build output directly.
function getWebDistPath() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "web-dist")
  }
  return path.join(__dirname, "..", "..", "..", "packages", "web", "dist")
}

function getDevRendererUrl() {
  if (app.isPackaged) return null
  return normalizeDevRendererUrl(process.env.AX_CODE_DESKTOP_ELECTRON_RENDERER_URL)
}

// ── State ───────────────────────────────────────────────────────────────────
let mainWindow = null
let serverPort = 0
let serverChild = null
// Latest ax-code runtime origin. Two sources depending on supervision mode:
// main's own runtime supervision (S2.5 default, via onOriginChange) or the
// web server over the utilityProcess channel ({ type: "runtime-origin" };
// S2.4a, SPEC §2 D3) when the web supervises (escape hatch). null/empty
// means the runtime is unavailable; the packaged app:// protocol handler
// 503s runtime-target requests until a fresh report arrives.
let runtimeOrigin = null
// Retry-exhausted flag reported alongside the origin (from the supervisor's
// onOriginChange context or the web's bootstrap report). When the origin is
// null and this is true, the runtime is permanently down (not restarting)
// and the protocol handler answers {restarting:false} so the renderer
// switches from the "restarting" loader to the failure UI.
let runtimeRetryExhausted = false
let isQuitting = false
let launchAnimations = null
let openingAnimation = Promise.resolve()
let desktopStartupComplete = false
let rendererStabilityTimer = null
let rendererReadyForOpenProject = false
let externalOpenPathDrainRunning = false
let externalOpenPathHandlerReady = false
const pendingExternalOpenRequests = []
const pendingOpenProjectPaths = []
// Session/draft hand-offs requested while the main window was being created.
// Flushed on 'ax-code:renderer-app-ready' (same mechanism as open-project),
// because loadURL resolves before React mounts the IPC listeners. A real
// queue, not a single slot: each mini-chat closes itself when this command
// reports success, so a second hand-off overwriting a queued first one would
// strand the session whose window already closed.
const pendingFocusOpens = []
const startupDiagnostics = createStartupDiagnostics({
  logPath:
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Logs", "AX Code", "main.log")
      : path.join(os.homedir(), ".ax-code-desktop", "logs", "main.log"),
})

function recordStartupEvent(name, details = {}, options = {}) {
  const event =
    options.once === false
      ? startupDiagnostics.record(name, details, options)
      : startupDiagnostics.markOnce(name, details, options)
  if (event && options.forward !== false && serverChild) {
    try {
      serverChild.postMessage({ type: "desktop-startup-event", event })
    } catch {
      // The utilityProcess may not be accepting messages yet.
    }
  }
  return event
}

recordStartupEvent("electron.process.start")

// Install process-level safety nets before any async work. Without these,
// an unhandled rejection in Node >=18 terminates the main process with no
// graceful shutdown — the server utility process stays alive holding its
// port, and the next launch fails to bind.
process.on("unhandledRejection", (reason) => {
  console.error("[electron] unhandled rejection:", reason)
})
process.on("uncaughtException", (error) => {
  console.error("[electron] uncaught exception:", error)
  // Give the log a moment to flush, then exit. The before-quit handler
  // will still fire and shut down the server process cleanly.
  setTimeout(() => {
    if (!isQuitting) app.quit()
  }, 100)
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  console.warn(
    "[electron] Another AX Code instance is already running; quit it completely before starting this instance.",
  )
  app.quit()
  // app.quit() is async; force immediate exit so we don't register
  // handlers on the doomed second instance.
  process.exit(0)
}

app.on("second-instance", (_event, argv, cwd) => {
  queueExternalOpenRequest({
    argv,
    cwd,
    source: "second-instance",
  })
  // macOS keeps the app alive after its last window closes; launching the
  // app bundle again must bring the window back, not focus a destroyed one.
  void revealMainWindow()
})

app.on("open-file", (event, filePath) => {
  event.preventDefault()
  queueExternalOpenRequest({
    argv: [filePath],
    cwd: process.cwd(),
    source: "open-file",
  })
})

// ── Server ──────────────────────────────────────────────────────────────────
// S2.5 (SPEC-2026-08-29-desktop-process-model-collapse §5 S2.5): main spawns
// and supervises the ax-code runtime itself (axcode-runtime-supervisor.js +
// the supervision FSM) instead of letting the web server's lifecycle manage
// it. S2.5b flipped the default: main supervision is ON unless
// AX_CODE_DESKTOP_SUPERVISE_RUNTIME is "0"/"false" — that escape hatch
// restores the pre-S2.5 behavior (the web server supervises the runtime).
// Every code path below guards on `runtimeSupervision` being non-null, so
// escape-hatch behavior is byte-identical to before S2.5.
const isMainSupervisedRuntimeEnabled = () => {
  const raw =
    typeof process.env.AX_CODE_DESKTOP_SUPERVISE_RUNTIME === "string"
      ? process.env.AX_CODE_DESKTOP_SUPERVISE_RUNTIME.trim().toLowerCase()
      : ""
  return raw !== "0" && raw !== "false"
}
// Bundled ax-code runtime staged by Slice 3 (packaged builds only); computed
// once and shared between the web-server fork env and the main-supervised
// runtime's binary resolution.
const bundledAxCodeEnv = buildBundledAxCodeEnv({
  platform: process.platform,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
})
// The web server needs the user's login-shell environment (PATH and friends)
// before it can listen, and capturing it costs ~1 s of shell init. Start it now
// so it overlaps Chromium start-up, integrity verification and runtime
// preparation; the encoded result is handed to the server fork below. Main
// itself never applies it. POSIX only: Windows has no login shell to capture.
const loginShellEnvCapture = startLoginShellEnvCapture()
let loginShellEnvEncoded = null
// Runtime environment with the merged search path; set once the login-shell capture settles so a
// PATH-installed runtime resolves for the wiki viewer exactly as it does for the supervisor.
let runtimeSearchEnv = null
// Created unless the S2.5 escape hatch is set; the supervision owns the
// runtime origin/exhausted state in that mode.
let runtimeSupervision = null
const desktopWebMcpBrowser = createDesktopWebMcpBrowser({
  recoverOwner: async () => {
    const survivor = BrowserWindow.getAllWindows().find((win) =>
      !win.isDestroyed() && !win.webContents.isDestroyed() && isTrustedRendererNavigation(win.webContents.getURL()),
    )
    if (survivor) return survivor
    await createWindow()
    return mainWindow
  },
  confirmClose: async (owner, pages, { closeAnyway = false } = {}) => {
    const result = await localizedDialog.showMessageBox(owner, {
      type: "warning",
      title: "Please confirm",
      message: nativeT("These pages may contain unsaved work. Close them and discard unsaved changes? {pages}", {
        pages: pages.map((page) => `${page.sessionID ?? page.id} · ${page.title} · ${page.id}`).join("\n"),
      }),
      buttons: ["Cancel", closeAnyway ? "Close anyway" : "Confirm"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    return result.response === 1
  },
  BrowserWindow,
  WebContentsView,
  session,
  getRuntime: () => runtimeOrigin,
  getAuthorization: () => `Basic ${Buffer.from(`ax-code:${getRuntimeAuthPassword()}`).toString("base64")}`,
})
// S2.5c: the web server asks main to restart the supervised runtime (with
// binary re-resolution) after settings.axCodeBinary changes; serialized here.
const runtimeRestartRequests = createRuntimeRestartRequestHandler({
  getSupervision: () => runtimeSupervision,
  logger: console,
})

// The web server runs in a dedicated utilityProcess (dist/server-process.js)
// rather than in-process, so its CPU/IO never blocks the main event loop that
// drives the window, IPC, and auto-update. The renderer reaches it over HTTP
// loopback exactly as before — only where the server runs changes.
//
// Supervision (boot timeout, crash-restart budget/backoff, stability window,
// graceful-stop escalation) is owned by the unified supervision FSM
// (supervision-fsm.js; SPEC-2026-08-29-desktop-process-model-collapse §4).
// This file only provides the driver that forks/stops the utilityProcess and
// the app-specific reactions: window reloads, the failure dialog, and logging.
const SERVER_START_TIMEOUT_MS = 30_000
const SERVER_STOP_TIMEOUT_MS = 5_000
const SERVER_KILL_TIMEOUT_MS = 3_000
const MAX_SERVER_CRASH_RESTARTS = 5
const SERVER_CRASH_RETRY_BASE_MS = 500
const SERVER_CRASH_RETRY_CAP_MS = 5_000
const SERVER_STABILITY_RESET_MS = 60_000
// Port the server held when the current crash was detected; renderer windows
// are retargeted from it onto the replacement's port after a restart.
let portBeforeServerCrash = 0

const MAX_RENDERER_CRASH_RELOADS = 3
const RENDERER_STABILITY_RESET_MS = 60_000
const WINDOW_LOAD_TIMEOUT_MS = 30_000
const rendererCrashPolicy = createRendererCrashPolicy({ maxReloads: MAX_RENDERER_CRASH_RELOADS })

function scheduleRendererStabilityReset() {
  if (rendererStabilityTimer) clearTimeout(rendererStabilityTimer)
  rendererStabilityTimer = setTimeout(() => {
    rendererStabilityTimer = null
    rendererCrashPolicy.markStable()
  }, RENDERER_STABILITY_RESET_MS)
  rendererStabilityTimer.unref?.()
}

async function showServerRecoveryFailure(error) {
  const detail = error instanceof Error ? error.message : String(error)
  await localizedDialog
    .showMessageBox({
      type: "error",
      title: "AX Code server stopped",
      message: "The local AX Code server could not be restarted.",
      detail: `${detail}\n\n${nativeT("Quit and reopen AX Code. If the problem continues, check the application logs.")}`,
      buttons: ["OK"],
    })
    .catch((dialogError) => console.error("[electron] failed to show server recovery dialog:", dialogError))
}

// S2.5: surfaced when the main-supervised ax-code runtime exhausts its
// restart budget (or, under S2.5b parallel boot, when the initial boot never
// became healthy). The diagnostics payload comes from the supervision module
// and never contains the runtime credential.
async function showRuntimeRecoveryFailure(diagnostics = {}) {
  const lines = [
    diagnostics.error ? `Error: ${diagnostics.error}` : null,
    diagnostics.binary ? `Binary: ${diagnostics.binary}` : null,
    diagnostics.version ? `Version: ${diagnostics.version}` : null,
    Number.isInteger(diagnostics.exitCode) ? `Last exit code: ${diagnostics.exitCode}` : null,
    diagnostics.exitSignal ? `Last exit signal: ${diagnostics.exitSignal}` : null,
    diagnostics.logHint || null,
  ].filter(Boolean)
  await localizedDialog
    .showMessageBox({
      type: "error",
      title: "AX Code runtime stopped",
      message: "The local ax-code runtime could not be restarted.",
      detail: `${lines.join("\n")}\n\n${nativeT("Quit and reopen AX Code. If the problem continues, check the application logs.")}`,
      buttons: ["Restart", "OK"],
      defaultId: 0,
      cancelId: 1,
    })
    .then(async ({ response }) => {
      // Exhaustion leaves the app-wide runtime route answering 503 until relaunch; the supervisor's restart() resets the
      // crash budget, so offering it here saves a full app relaunch. A user quit that lands meanwhile still wins.
      if (response !== 0 || isQuitting || !runtimeSupervision) return
      await runtimeSupervision.restart({ reprepare: true })
    })
    .catch((dialogError) => console.error("[electron] runtime recovery dialog or restart failed:", dialogError))
}

// Spawn the web-server utilityProcess and route its lifecycle events into the
// supervision FSM through `wire`. Returns the child as the driver handle.
function spawnServerProcess(wire) {
  const serverEntry = path.join(__dirname, "server-process.js")
  recordStartupEvent("server.utilityProcess.launch", {}, { once: false })
  const child = utilityProcess.fork(serverEntry, [], {
    serviceName: "ax-code-server",
    env: applyBundledAxCodeEnv(
      {
        ...process.env,
        // Login-shell snapshot captured at process start (see
        // loginShellEnvCapture). Always set, empty when absent, so a value
        // inherited from the parent environment can never be mistaken for one.
        [LOGIN_SHELL_ENV_VAR]: loginShellEnvEncoded || "",
        // The server reads these at module-init time; previously set on the
        // main process before require, now passed into the forked process.
        AX_CODE_DESKTOP_DIST_DIR: getWebDistPath(),
        AX_CODE_DESKTOP_RUNTIME: "desktop",
        AX_CODE_BROWSER_MODE: "embedded",
        // Per-boot ax-code runtime Basic-auth password, owned by main since
        // S2.2 (SPEC-2026-08-29-desktop-process-model-collapse §2 D2). The web
        // server adopts it instead of self-generating and forwards it to the
        // runtime child env; the proxy's Basic credential is unchanged.
        // Never log or persist this value. S2.4 will reuse
        // getRuntimeAuthPassword() in the app:// protocol handler. The
        // username stays the runtime default ("ax-code").
        AX_CODE_SERVER_PASSWORD: getRuntimeAuthPassword(),
        AX_CODE_DESKTOP_SHUTDOWN_TIMEOUT_MS: "4000",
        AX_CODE_DESKTOP_STARTUP_SNAPSHOT: JSON.stringify(startupDiagnostics.snapshot()),
        // Bundled computer-use server (packaged macOS builds with a staged
        // artifact only); no-op in dev/OSS builds.
        ...buildComputerUseServerEnv({
          platform: process.platform,
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          execPath: process.execPath,
        }),
        // S2.5: when main supervises the runtime, the web lifecycle must
        // treat it as EXTERNAL and skip its managed spawn. AX_CODE_PORT pins
        // the fixed loopback port (stable across runtime restarts);
        // AX_CODE_HOST gives the exact origin for the web's external probe
        // (it must be a full URL per env-config.js validation). Both are
        // ALWAYS passed in supervise mode — the port is reserved by
        // prepare() before this process forks, even though the runtime may
        // not be healthy yet (S2.5b parallel boot): a configured AX_CODE_HOST
        // is what guarantees the web never managed-spawns a second runtime.
        // The runtime password is already shared via AX_CODE_SERVER_PASSWORD
        // above.
        ...(runtimeSupervision
          ? {
              AX_CODE_PORT: String(runtimeSupervision.port),
              AX_CODE_HOST: `http://127.0.0.1:${runtimeSupervision.port}`,
            }
          : {}),
      },
      // Bundled ax-code runtime (packaged builds with a staged CLI tree
      // only). Also strips any inherited AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY
      // when this build has no staged runtime, so a user export cannot leak
      // through ...process.env and masquerade as a bundled runtime.
      bundledAxCodeEnv,
    ),
  })
  serverChild = child
  // A (re)spawn always takes over the port; clear it so windows and IPC never
  // target the dead server while the replacement boots.
  serverPort = 0
  // The runtime origin reported by the previous server is stale across a
  // restart; the fresh server re-reports it after its runtime bootstrap
  // (S2.1 FSM recovery path — the report always re-arrives). S2.5: when main
  // supervises the runtime, its origin is independent of the web server and
  // stays valid across web-server restarts — keep it.
  if (!runtimeSupervision) {
    runtimeOrigin = null
    runtimeRetryExhausted = false
  }

  child.on("message", (msg) => {
    // settings-write requests are consumed by the sole-writer handler (S2.3).
    if (settingsWriteHandler.handleMessage(msg)) return
    // S2.5c: configuration-driven runtime restart requests (settings.
    // axCodeBinary changes) restart the main-supervised runtime with
    // re-resolution; serialized and a no-op in escape-hatch mode.
    if (runtimeRestartRequests.handleMessage(msg)) return
    if (msg?.type === "runtime-busy") {
      // S2.5c: the web server reports its active-session count so the
      // supervisor's wedged-kill can honor the busy-session restart grace.
      if (runtimeSupervision && Number.isInteger(msg.count) && msg.count >= 0) {
        runtimeSupervision.setActiveSessionCount(msg.count)
      }
      return
    }
    if (msg?.type === "runtime-origin") {
      // S2.5: when main supervises the runtime it owns the origin directly;
      // web reports describe the web's external view and are ignored here.
      if (runtimeSupervision) return
      // S2.4a: the web server reports the managed runtime's current loopback
      // origin (or null when down/restarting), plus the bootstrap
      // retry-exhausted flag. Never log the associated credential; the
      // origin itself carries none.
      runtimeOrigin = typeof msg.origin === "string" && msg.origin ? msg.origin : null
      runtimeRetryExhausted = msg.exhausted === true
      return
    }
    if (msg?.type === "desktop-notify") {
      // Completion/error/question notifications the web server generated, forwarded instead of
      // written to the sidecar-only stdout protocol.
      maybeShowNativeNotification(msg.payload)
      return
    }
    if (msg?.type === "startup-event" && msg.event?.name) {
      recordStartupEvent(msg.event.name, msg.event.details ?? {}, {
        source: msg.event.source || "web-server",
        atEpochMs: Number.isFinite(msg.event.atEpochMs) ? msg.event.atEpochMs : undefined,
        forward: false,
        milestone: msg.event.name,
      })
      return
    }
    if (msg?.type === "ready") {
      serverPort = msg.port
      recordStartupEvent("server.utilityProcess.ready", { port: serverPort }, { once: false })
      wire.ready({ port: msg.port })
    } else if (msg?.type === "error") {
      wire.failed(new Error(msg.message || "server process failed to start"))
    }
  })

  child.on("exit", (code, signal) => {
    // Only null the module variable if it still points to THIS process.
    // After crash recovery the old process's exit event may fire AFTER
    // the new process is assigned, which would incorrectly null the
    // reference to the new server.
    if (serverChild === child) serverChild = null
    // Electron's utilityProcess emits only the code today (signal stays
    // undefined); the FSM renders null codes as "unknown exit code".
    wire.exited(code, signal)
  })
  return child
}

// Ask the server to shut down gracefully (which also stops the ax-code child it
// spawned), then ensure the process is gone. A wedged server may ignore the
// graceful stop and even SIGTERM, so escalate to SIGKILL rather than hang the
// quit path forever. Resolves once the child exits or a kill is sent.
function gracefulStopServerProcess(child, { termTimeoutMs, killTimeoutMs }) {
  return new Promise((resolve) => {
    let done = false
    let killTimer = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(termTimer)
      if (killTimer) clearTimeout(killTimer)
      resolve()
    }
    const termTimer = setTimeout(() => {
      try {
        child.kill("SIGTERM")
      } catch {
        /* ignore */
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL")
        } catch {
          /* ignore */
        }
        finish()
      }, killTimeoutMs)
    }, termTimeoutMs)
    child.once("exit", finish)
    try {
      child.postMessage({ type: "stop" })
    } catch {
      try {
        child.kill("SIGTERM")
      } catch {
        /* ignore */
      }
      finish()
    }
  })
}

function handleServerSupervisionEvent(event) {
  if (event.type === "state-change" && event.to === "degraded") {
    portBeforeServerCrash = serverPort
    if (Number.isInteger(event.exitCode)) {
      console.error("[electron] server process exited unexpectedly with code", event.exitCode)
    }
  } else if (event.type === "restart-backoff") {
    console.error("[electron] server restart attempt %d failed:", event.attempt, event.error)
  } else if (event.type === "state-change" && event.to === "exhausted") {
    console.error("[electron] server process crashed too many times (%d), giving up on restart", event.crashRestarts)
  }
}

// After a successful crash-restart, point every local renderer window at the
// replacement server's port (packaged windows reload the same app:// URL).
async function reloadRenderersAfterServerRecovery(info) {
  const newPort = Number.isInteger(info?.port) ? info.port : serverPort
  const oldPort = portBeforeServerCrash
  // The replacement server binds a fresh port. Point the renderers at it before
  // loading them: the reloaded page re-reads the env through the preload, and
  // the old port is dead, so without this the app reloads into a renderer whose
  // API and event connections go nowhere (and a manual reload cannot fix it).
  applyRendererApiOrigin(newPort)
  const willReloadMainWindow = Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      resolveServerRestartReloadUrl(mainWindow.webContents.getURL(), {
        oldPort,
        newPort,
      }),
  )
  if (willReloadMainWindow) rendererReadyForOpenProject = false
  const result = await reloadLocalRendererWindowsAfterServerRestart(BrowserWindow.getAllWindows(), {
    oldPort,
    newPort,
  })
  if (result.failed > 0) {
    console.warn("[electron] failed to reload %d renderer window(s) after server restart", result.failed)
  }
}

const serverSupervision = createSupervisionFsm({
  label: "server",
  policy: {
    maxCrashRestarts: MAX_SERVER_CRASH_RESTARTS,
    stabilityWindowMs: SERVER_STABILITY_RESET_MS,
    backoffBaseMs: SERVER_CRASH_RETRY_BASE_MS,
    backoffCapMs: SERVER_CRASH_RETRY_CAP_MS,
    bootTimeoutMs: SERVER_START_TIMEOUT_MS,
    stopTermTimeoutMs: SERVER_STOP_TIMEOUT_MS,
    stopKillTimeoutMs: SERVER_KILL_TIMEOUT_MS,
  },
  driver: {
    spawn: (wire) => spawnServerProcess(wire),
    terminate: (child) => {
      try {
        child.kill()
      } catch {
        /* the process may already be gone */
      }
    },
    gracefulStop: (child, timeouts) => gracefulStopServerProcess(child, timeouts),
  },
  onEvent: handleServerSupervisionEvent,
  onRecovered: (info) => reloadRenderersAfterServerRecovery(info),
  onExhausted: (error) => {
    showServerRecoveryFailure(error)
  },
})

function launchServer() {
  return serverSupervision.start()
}

function stopServer() {
  // Null the handle synchronously (the before-quit guard relies on this),
  // then let the FSM run the graceful stop sequence and suppress recovery.
  serverChild = null
  return serverSupervision.stop()
}

// ── Window ──────────────────────────────────────────────────────────────────
function isTrustedRendererNavigation(url) {
  return isTrustedRendererNavigationUrl(url, { serverPort, devRendererUrl: getDevRendererUrl() || "" })
}

// Only allow safe protocols for shell.openExternal. Electron's docs explicitly
// recommend validating the URL protocol to prevent launching arbitrary OS handlers
// (file://, ms-settings:, javascript:, etc.) from the renderer.
function safeOpenExternal(url) {
  const normalized = normalizeSafeExternalUrl(url)
  if (normalized) shell.openExternal(normalized)
}

// The sandboxed preload reads this to expose __AX_CODE_DESKTOP_MACOS_MAJOR__;
// the renderer header sizes itself around the traffic lights from it.
const MACOS_MAJOR = process.platform === "darwin" ? macosMajorFromDarwinRelease(os.release()) : 0
if (MACOS_MAJOR > 0) process.env.AX_CODE_DESKTOP_MACOS_MAJOR = String(MACOS_MAJOR)

// Title bar, traffic lights and first-paint colour shared by every app window.
const appWindowChromeOptions = () => ({
  ...nativeWindowChromeOptions({ platform: process.platform, macosMajor: MACOS_MAJOR }),
  backgroundColor: resolveWindowBackgroundColor(readSettingsRoot(), nativeTheme.shouldUseDarkColors),
})

const attachAppWindowChrome = (browserWindow) => {
  if (process.platform === "darwin") attachTrafficLightRefresh(browserWindow, macTrafficLightPosition(MACOS_MAJOR))
}

function rendererWebPreferences() {
  // Do not forward --ax-code-desktop-api-origin= into Chromium argv.
  // Those look like command-line switches and stopped Vite module scripts
  // from executing on app://. Session checks go through the protocol proxy.
  return createDesktopRendererWebPreferences(path.join(__dirname, "preload.js"))
}

function localRendererOrigin() {
  return getDevRendererUrl() || (app.isPackaged ? PACKAGED_RENDERER_ORIGIN : `http://127.0.0.1:${serverPort}`)
}

// Builds the main window without loading the renderer. Startup creates it
// before the local server is ready so the opening artwork plays inside the
// main window; createWindow() below loads the renderer into it later.
function createMainWindowShell() {
  rendererReadyForOpenProject = false
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "AX Code",
    ...appWindowChromeOptions(),
    show: false,
    webPreferences: rendererWebPreferences(),
  })
  attachDesktopBrowserWebviewPolicy(mainWindow.webContents)
  attachAppWindowChrome(mainWindow)

  // Restore saved geometry before first paint, then persist future changes.
  restoreMainWindowGeometry(mainWindow)
  attachWindowStateListeners(mainWindow)

  mainWindow.once("ready-to-show", () => {
    recordStartupEvent("renderer.ready-to-show")
    const window = mainWindow
    openingAnimation.finally(() => {
      if (isQuitting || window.isDestroyed()) return
      applyMacVibrancy(window)
      window.show()
    })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Keep internal navigation inside the window; open everything else in the
    // default OS browser. Match host+port exactly via URL parsing — a prefix
    // check (startsWith) would treat e.g. `http://localhost:<port>@evil.com` or
    // `http://localhost:<port>9` as internal and load it in the trusted window
    // (which has privileged preload IPC capabilities).
    // No window.open target gets its own window either way: a child window
    // inherits this window's privileged preload without the navigation guards
    // attached below, and a trusted loopback URL includes the preview proxy
    // paths, whose content is not the app's own.
    if (!isTrustedRendererNavigation(url)) {
      safeOpenExternal(url)
    }
    return { action: "deny" }
  })

  attachRendererNavigationGuards(mainWindow.webContents, {
    isTrustedUrl: isTrustedRendererNavigation,
    onBlocked: safeOpenExternal,
  })

  mainWindow.webContents.on("console-message", (_event, details) => {
    // Electron 32+ passes one MessageDetails object with a numeric level
    // (0 verbose, 1 info, 2 warning, 3 error). The old positional
    // (level, message, line, sourceId) shape is gone, and the previous
    // dual-signature read fell back to the details object itself, so
    // `level >= 2` never matched and renderer console errors went unlogged.
    const level = typeof details?.level === "number" ? details.level : -1
    const message = typeof details?.message === "string" ? details.message : ""
    if (level >= 2 && message) {
      recordStartupEvent(
        "renderer.console",
        {
          level,
          message,
          line: details?.lineNumber,
          source: details?.sourceUrl,
        },
        { once: false },
      )
    }
  })

  mainWindow.webContents.on("did-finish-load", () => {
    recordStartupEvent("renderer.did-finish-load")
    // Every successful load, including an automatic post-crash reload,
    // starts a fresh stability window. Scheduling this only after the initial
    // load leaves the crash counter permanently elevated after the first
    // early renderer crash.
    scheduleRendererStabilityReset()
  })

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    recordStartupEvent(
      "renderer.did-fail-load",
      {
        errorCode,
        errorDescription,
        url: validatedUrl,
      },
      { once: false },
    )
  })

  // Any reload of the main window — the "Reload Webview" menu item, the
  // View→Reload role, crash recovery, or the post-server-restart reload —
  // unmounts the renderer's IPC listeners. Reset the hand-off readiness flag
  // for every load start so reload paths main did not initiate cannot leave it
  // stale; the fresh renderer re-arms it via 'ax-code:renderer-app-ready'.
  mainWindow.webContents.on("did-start-loading", () => {
    rendererReadyForOpenProject = false
  })

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (isQuitting || details.reason === "clean-exit" || mainWindow.isDestroyed()) return
    recordStartupEvent(
      "renderer.render-process-gone",
      {
        reason: details.reason,
        exitCode: details.exitCode,
      },
      { once: false },
    )
    rendererReadyForOpenProject = false
    if (rendererStabilityTimer) {
      clearTimeout(rendererStabilityTimer)
      rendererStabilityTimer = null
    }
    if (rendererCrashPolicy.beginReload()) {
      console.error("[electron] renderer process gone (%s), reloading window", details.reason)
      mainWindow.webContents.reload()
      return
    }
    console.error(
      "[electron] renderer crashed too many times (%d), giving up on auto-reload",
      rendererCrashPolicy.crashReloads,
    )
    localizedDialog
      .showMessageBox({
        type: "error",
        title: "AX Code window crashed",
        message: "The AX Code window crashed repeatedly.",
        detail:
          "Reload to try again, or quit and reopen AX Code. If the problem continues, check the application logs.",
        buttons: ["Reload", "Quit"],
      })
      .then(({ response }) => {
        if (response === 0) {
          rendererCrashPolicy.markStable()
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
        } else {
          // app.exit() skips 'before-quit', so shut the server (and its
          // ax-code child) down first to avoid orphaning them.
          shutdownForExit()
            .then(() => app.exit(1))
            .catch(console.error)
        }
      })
      .catch((dialogError) => console.error("[electron] failed to show renderer crash dialog:", dialogError))
  })

  mainWindow.webContents.on("unresponsive", () => {
    if (isQuitting || mainWindow.isDestroyed()) return
    recordStartupEvent("renderer.unresponsive", {}, { once: false })
    localizedDialog
      .showMessageBox({
        type: "warning",
        title: "AX Code is not responding",
        message: "The AX Code window is not responding.",
        detail: "Wait for it to recover, or reload the window.",
        buttons: ["Wait", "Reload"],
      })
      .then(({ response }) => {
        if (response === 1 && mainWindow && !mainWindow.isDestroyed()) {
          rendererReadyForOpenProject = false
          mainWindow.webContents.reload()
        }
      })
      .catch((dialogError) => console.error("[electron] failed to show unresponsive dialog:", dialogError))
  })

  mainWindow.on("close", (event) => {
    // Startup is still running: letting the close through destroys the window
    // under the in-flight loadURL, which then reports a false "failed to
    // start" (or leaves a headless app when the load settles). Quit cleanly
    // through the normal path instead.
    if (!desktopStartupComplete && !isQuitting) {
      event.preventDefault()
      app.quit()
      return
    }
    // Closing the last window quits on Windows/Linux, but by then the window is
    // gone and the closing artwork has nowhere to play. Route it through the
    // quit coordinator so the artwork plays inside this window first.
    if (process.platform === "darwin" || isQuitting) return
    if (!launchAnimations?.enabled()) return
    if (BrowserWindow.getAllWindows().some((win) => win !== mainWindow && !win.isDestroyed())) return
    event.preventDefault()
    app.quit()
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// Points the renderer's API origin at `port`. The sandboxed preload reads this
// env value on every document load, so it has to be refreshed before any window
// (re)loads — a reload after a crash-restart lands on a new port while this
// value still names the dead one.
function applyRendererApiOrigin(port = serverPort) {
  if (Number.isInteger(port) && port > 0) {
    process.env.AX_CODE_DESKTOP_RENDERER_API_ORIGIN = buildRendererApiOrigin(port, getDevRendererUrl())
  }
}

async function createWindowOnce() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindowShell()
  applyRendererApiOrigin()
  const rendererUrl =
    getDevRendererUrl() || (app.isPackaged ? `${PACKAGED_RENDERER_ORIGIN}/` : `http://127.0.0.1:${serverPort}`)
  recordStartupEvent("renderer.load-url.start", {
    devRenderer: Boolean(getDevRendererUrl()),
    packagedProtocol: app.isPackaged && !getDevRendererUrl(),
  })
  // Rejects on timeout into the whenReady startup-failure path, so a wedged
  // server cannot leave the app looking dead with a hidden window.
  try {
    await loadUrlWithTimeout(mainWindow, rendererUrl, { timeoutMs: WINDOW_LOAD_TIMEOUT_MS })
  } catch (error) {
    // Never leave a hidden show:false window behind a wedged load, like the
    // additional/mini-chat windows: keeping the global set would make every
    // later activate/open-project path take the "window already exists" branch
    // and focus a window the user can never see.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
    mainWindow = null
    throw error
  }
}

// Two callers can race a slow first load (dock activate, quick dispatch, tray
// reveal while the renderer is still loading): the second saw the shell exist,
// skipped creating one and called loadURL again on the same window, which
// cancels the first load. Both rejections then hit the catch above and destroy
// the half-loaded window, leaving the app with no window at all. Serialize
// instead: a concurrent caller awaits the in-flight creation.
let createWindowInFlight = null
function createWindow() {
  if (!createWindowInFlight) {
    createWindowInFlight = createWindowOnce().finally(() => {
      createWindowInFlight = null
    })
  }
  return createWindowInFlight
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
  sendUpdateProgressToWindows(BrowserWindow.getAllWindows(), event, data)
}

autoUpdater.on("download-progress", (p) => {
  sendUpdateProgress("Progress", { downloaded: p.transferred, total: p.total })
})
// electron-updater's quitAndInstall() does NOT quit when nothing is downloaded
// (it emits `error` and returns). Check the gate before starting an install;
// service cleanup is deferred to the app's actual quit.
const updateInstallGate = createUpdateInstallGate()
autoUpdater.on("update-downloaded", (info) => {
  updateInstallGate.onDownloaded(info)
  sendUpdateProgress("Finished", {})
})
autoUpdater.on("update-not-available", () => {
  updateInstallGate.onNotInstallable()
})
// electron-updater emits 'error' alongside rejecting its promises; without a
// listener, Node's EventEmitter turns the emit into an uncaught exception that
// crashes the main process. The IPC handlers already report failures to the
// renderer, so logging here is enough.
autoUpdater.on("error", (err) => {
  // A failed check (an offline moment during the renderer's periodic poll,
  // a GitHub hiccup) says nothing about an update that already finished
  // downloading: clearing the gate here made "Quit and install" refuse a
  // verified download until the user re-downloaded it.
  if (!updateInstallGate.canInstall()) {
    updateInstallGate.onNotInstallable()
  }
  console.warn("[updater] error:", err instanceof Error ? err.message : err)
})

// electron-updater's GitHub provider always follows the repo-wide "latest"
// release. This repository ships CLI releases (v*) and Desktop releases
// (desktop-v*) side by side, and the latest release is usually a CLI one
// whose assets carry no update manifests — every check then fails with
// ERR_UPDATER_CHANNEL_FILE_NOT_FOUND and the app can never self-update.
// Point the updater at the newest published desktop-v* release instead.
let desktopUpdateFeed = null
async function ensureDesktopUpdateFeed({ force = false } = {}) {
  if (desktopUpdateFeed && !force) return desktopUpdateFeed
  // Node's fetch ignores the app's proxy and certificate configuration; net.fetch
  // uses the same Chromium network stack the updater's own downloads use.
  const feed = await resolveDesktopUpdateFeed({ fetchImpl: (url, init) => electronNet.fetch(url, init) })
  // setFeedURL replaces the updater's provider client; only swap it when the
  // target release actually changed so an in-flight download keeps its
  // resolved provider.
  if (!desktopUpdateFeed || desktopUpdateFeed.url !== feed.url) {
    autoUpdater.setFeedURL({ provider: "generic", url: feed.url })
  }
  desktopUpdateFeed = feed
  return feed
}

// ── Origin guard & registration helper ───────────────────────────────────────
// The preload shim is only trusted on the active loopback server (or loopback
// development renderer). Wildcard and network addresses are not local senders.
const isLocalSender = (wc) => {
  const raw = typeof wc?.getURL === "function" ? wc.getURL() : ""
  return isLocalDesktopSenderUrl(raw, { serverPort, devRendererUrl: getDevRendererUrl() || "" })
}

// Registration helper: rejects privileged IPC from any untrusted renderer.
// ADR-019: commands that declare `params` in the contract are validated here
// before their handler runs; undeclared commands pass through during migration.
const desktopIpcContract = indexContract(require("./desktop-ipc-contract.json"))

const handleCommand = (name, fn, { safeForRemote = false } = {}) => {
  const contractEntry = desktopIpcContract.get(name)
  ipcMain.handle(name, async (event, args) => {
    if (!isLocalSender(event.sender) && !safeForRemote) {
      throw new Error("IPC not available for this origin")
    }
    // The preload bridge only exists in a window's main frame (the app never
    // sets nodeIntegrationInSubFrames), so requiring the main frame here costs
    // nothing and keeps privileged commands out of any embedded frame.
    if (!safeForRemote && event.senderFrame && event.senderFrame !== event.sender.mainFrame) {
      throw new Error("IPC is only available to the window's main frame")
    }
    const validation = validateCommandArgs(contractEntry, args)
    if (!validation.ok) throw new Error(`Invalid arguments for ${name}: ${validation.error}`)
    return fn(args || {}, event)
  })
}

// ── IPC handlers (Tauri-compatible surface, all guarded by handleCommand) ────
handleCommand("desktop_webmcp_browser", async (args, event) => {
  if (event.senderFrame !== event.sender.mainFrame) throw new Error("Browser commands require the main local frame")
  return desktopWebMcpBrowser.command(event.sender, args)
})
handleCommand("desktop_get_launch_at_login", async () => ({
  enabled: app.getLoginItemSettings().openAtLogin,
  supported: true,
}))

handleCommand("desktop_set_launch_at_login", async (args) => {
  const { enabled } = args ?? {}
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
  return { enabled: Boolean(enabled), supported: true }
})

handleCommand("desktop_check_for_updates", async (args) => {
  // The startup auto-update policy only gates automatic checks (the startup
  // warm-up below and the renderer's periodic poll). A manual "Check for
  // updates" click must still run, otherwise managed fleets would silently
  // lose the ability to update at all — and the renderer would misreport "up
  // to date" because it drops the `disabled` flag.
  const manual = Boolean(args?.manual)
  if (!manual && !shouldCheckForUpdatesOnStartup()) {
    return { available: false, currentVersion: app.getVersion(), disabled: true }
  }
  try {
    // Refresh the feed on every check so a release published after the
    // previous check is seen; download reuses this resolved provider.
    await ensureDesktopUpdateFeed({ force: true })
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) return { available: false, currentVersion: app.getVersion() }
    // Trust electron-updater's own semver comparison. A plain !== would
    // report a downgrade as "available" whenever the newest published
    // desktop release is older than the running app (e.g. while a newer
    // desktop release is still in draft).
    const available = result.isUpdateAvailable === true
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

handleCommand("desktop_download_and_install_update", async () => {
  sendUpdateProgress("Started", {})
  // Belt-and-braces: the download button is only reachable after a check,
  // which already resolved the feed — reuse it instead of re-resolving.
  await ensureDesktopUpdateFeed()
  await autoUpdater.downloadUpdate()
})

// Only the local web server is active; remote background services are disabled.
// Shutdown order (S2.5): the web server first (it may still be proxying to
// the runtime), then the main-supervised runtime.
const stopBackgroundServices = async () => {
  await requireBrowserClosure(desktopWebMcpBrowser)
  loginShellEnvCapture.cancel()
  // Revoke browser access while the runtime can still acknowledge enrollment
  // teardown. This also covers restart/update paths that bypass normal quit.
  await Promise.allSettled([wikiViewer.closeAll(), stopServer()])
  if (runtimeSupervision) {
    await runtimeSupervision.stop().catch((error) => {
      console.error("[electron] failed to stop runtime supervision:", error)
    })
  }
}

const quitCoordinator = createQuitCoordinator({
  onStarting: () => {
    isQuitting = true
  },
  onCancelled: () => {
    isQuitting = false
  },
  playEnding: () => launchAnimations?.playEnding(),
  stopServices: stopBackgroundServices,
  quit: () => app.quit(),
})

// Assigned after dispatchMenuAction exists. Settings writes and shutdown call these.
// app.exit() skips will-quit, so shutdownForExit releases the shortcut too.
let quickDispatchShortcutRegistered = false
let syncQuickDispatchGlobalShortcutFromSettings = (_settings) => {}
let releaseQuickDispatchGlobalShortcut = () => {}
// Non-null while shutdownForExit's async cleanup is still running.
let shutdownCleanupPromise = null

async function shutdownForExit() {
  isQuitting = true
  // before-quit treats `isQuitting && coordinator idle` as "cleanup already
  // finished", so a second quit landing during this await used to exit before
  // the runtime child was stopped. Track the in-flight cleanup so the guard
  // can hold the quit until it settles.
  const cleanup = stopBackgroundServices()
  // Observed in both directions: a bare `finally` would leave a rejected
  // derived promise unhandled, and before-quit only needs to know it settled.
  const tracked = cleanup.then(
    () => {
      if (shutdownCleanupPromise === tracked) shutdownCleanupPromise = null
    },
    (error) => {
      if (shutdownCleanupPromise === tracked) shutdownCleanupPromise = null
      throw error
    },
  )
  void tracked.catch(() => {})
  shutdownCleanupPromise = tracked
  try {
    await cleanup
    releaseQuickDispatchGlobalShortcut()
    launchAnimations?.dispose()
  } catch (error) {
    isQuitting = false
    throw error
  }
}

// Only a real quit may stop services. A downloaded installer can still be
// refused by native verification or fail to spawn; the app must remain usable.
handleCommand(
  "desktop_quit_and_install",
  createUpdateInstaller({
    updater: autoUpdater,
    nativeUpdater: nativeAutoUpdater,
    gate: updateInstallGate,
    isQuitting: () => isQuitting,
    beforeInstall: () => requireBrowserClosure(desktopWebMcpBrowser),
  }),
)

handleCommand("desktop_restart", async () => {
  await restartDesktop(app, shutdownForExit)
})

// State push from the renderer (see the UI's useTraySync): the tray controller
// owns presentation only, so the renderer streams the session/approval snapshot
// here. Ignored when the platform has no tray (the badge has its own command).
handleCommand("desktop_tray_update", async (args) => {
  if (!trayController) {
    return { updated: false }
  }
  trayController.update(args ?? {})
  return { updated: true }
})

handleCommand("desktop_set_badge_count", async (args) => {
  const { count } = args ?? {}
  const value = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  // macOS dock and Linux launchers; returns false where unsupported (Windows).
  return app.setBadgeCount(value)
})

handleCommand("desktop_dialog_open", async (args, event) => {
  const options = args ?? {}
  const dialogOptions = buildDesktopOpenDialogOptions(options)
  const ownerWindow = resolveDesktopDialogOwnerWindow(BrowserWindow, event, mainWindow)
  const result = ownerWindow
    ? await localizedDialog.showOpenDialog(ownerWindow, dialogOptions)
    : await localizedDialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return options?.multiple === true ? result.filePaths : result.filePaths[0]
})

handleCommand("desktop_record_startup_event", async (args) => {
  const payload = args ?? {}
  const name = typeof payload?.name === "string" ? payload.name.trim() : ""
  if (!/^[a-z0-9._:-]{1,96}$/i.test(name)) {
    return { ok: false, error: "Invalid startup event name" }
  }

  recordStartupEvent(name, payload?.details ?? {}, {
    source: "renderer",
    milestone: name,
  })
  return { ok: true }
})

// ── Ported handlers & features (from upstream OpenChamber main.mjs) ──────────
// Adapted to our CJS shell and single utilityProcess server model. The upstream
// shell ran the web server in-process and supported multiple remote "hosts";
// AX Code keeps a single local utilityProcess server model.

const LOCAL_HOST_ID = "local"
const MIN_WINDOW_WIDTH = 800
const MIN_WINDOW_HEIGHT = 520
const MIN_RESTORE_WINDOW_WIDTH = 900
const MIN_RESTORE_WINDOW_HEIGHT = 560
const MAX_CAPTURE_PAGE_RECT_AREA = 4_000_000
const INSTALLED_APPS_CACHE_TTL_SECS = 60 * 60 * 24
const INSTALLED_APPS_CACHE_FILE = "discovered-apps.json"

// Broadcast a renderer event. Our preload listens on the literal `openchamber:*`
// channels (a retained contract), so emit on the literal event name directly —
// no `openchamber:emit` envelope.
// Desktop events reach the renderer two ways, so send both:
//  - the literal channel, consumed via the preload's __TAURI__.event.listen
//    shim (menu-action, check-for-updates, update-progress, ssh-instance-status)
//  - an envelope on 'ax-code:dom-event', which the preload re-dispatches as a DOM
//    CustomEvent for consumers using window.addEventListener (open-session,
//    open-draft-session, open-project, installed-apps-updated, system-resume).
const sendDesktopEvent = (webContents, event, detail) => {
  webContents.send(event, detail)
  webContents.send("ax-code:dom-event", { event, detail })
}

const emitToAllWindows = (event, detail) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) sendDesktopEvent(w.webContents, event, detail)
  }
}

const emitToWindow = (win, event, detail) => {
  if (win && !win.isDestroyed()) sendDesktopEvent(win.webContents, event, detail)
}

function focusMainWindowIfPresent() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

function queueExternalOpenRequest(request) {
  pendingExternalOpenRequests.push(request)
  if (externalOpenPathHandlerReady) {
    void drainExternalOpenRequests().catch((error) => {
      console.error("[electron] failed to process external open request:", error)
    })
  }
}

function enqueueOpenProjectPath(projectPath) {
  const key = process.platform === "win32" ? projectPath.toLowerCase() : projectPath
  const alreadyPending = pendingOpenProjectPaths.some((candidate) => {
    const candidateKey = process.platform === "win32" ? candidate.toLowerCase() : candidate
    return candidateKey === key
  })
  if (!alreadyPending) pendingOpenProjectPaths.push(projectPath)
}

async function revealMainWindowForOpenProject() {
  if (!app.isReady() || serverPort <= 0) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow()
  }
  focusMainWindowIfPresent()
}

function flushPendingOpenProjectPaths() {
  if (!rendererReadyForOpenProject || !mainWindow || mainWindow.isDestroyed()) return

  while (pendingOpenProjectPaths.length > 0) {
    const projectPath = pendingOpenProjectPaths.shift()
    if (projectPath) emitToWindow(mainWindow, "openchamber:open-project", { projectPath })
  }
}

function flushPendingFocusOpen() {
  if (!rendererReadyForOpenProject || !mainWindow || mainWindow.isDestroyed()) return
  while (pendingFocusOpens.length > 0) {
    const pending = pendingFocusOpens.shift()
    if (pending.event === "openchamber:menu-action") {
      // The renderer listens for menu actions on both the literal IPC channel
      // and the DOM-event envelope; the dual send applied every queued action
      // twice (toggles cancelled out, step navigation skipped two). Match the
      // direct dispatch path, which sends the literal channel only.
      mainWindow.webContents.send(pending.event, pending.detail)
    } else if (pending.event) {
      emitToWindow(mainWindow, pending.event, pending.detail)
    } else if (pending.sessionId) {
      emitToWindow(mainWindow, "openchamber:open-session", {
        sessionId: pending.sessionId,
        directory: pending.directory,
      })
    } else if (pending.mode === "draft") {
      emitToWindow(mainWindow, "openchamber:open-draft-session", {
        directory: pending.directory,
        projectId: pending.projectId,
      })
    }
  }
}

// Hand an event to the main window's renderer, or queue it until the renderer has
// mounted its listeners. Transporting it over IPC only works once the renderer is
// listening, and a window this code just created is not: loadURL resolves after
// 'did-finish-load', not after 'ax-code:renderer-app-ready', so sending straight away
// showed the window and dropped the event - the tray's session and approval clicks did
// nothing while the app looked like it had honored them.
function handOffToMainWindow(event, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (rendererReadyForOpenProject) {
    emitToWindow(mainWindow, event, detail)
    return
  }
  pendingFocusOpens.push({ event, detail })
  flushPendingFocusOpen()
}

async function handleExternalOpenRequest(request) {
  const candidates = collectOpenPathCandidates(request.argv, {
    appExecutablePath: process.execPath,
    cwd: request.cwd,
    platform: process.platform,
  })
  if (candidates.length === 0) return

  const directoryPaths = []
  for (const candidate of candidates) {
    try {
      const stat = await fsp.stat(candidate)
      if (stat.isDirectory()) directoryPaths.push(candidate)
    } catch {
      // Dropped files or stale paths are ignored; only directories become projects.
    }
  }
  if (directoryPaths.length === 0) return

  for (const projectPath of directoryPaths) enqueueOpenProjectPath(projectPath)
  recordStartupEvent(
    "external-open.directories",
    {
      source: request.source,
      count: directoryPaths.length,
    },
    { once: false },
  )

  await revealMainWindowForOpenProject()
  flushPendingOpenProjectPaths()
}

async function drainExternalOpenRequests() {
  if (externalOpenPathDrainRunning) return
  externalOpenPathDrainRunning = true
  try {
    while (pendingExternalOpenRequests.length > 0) {
      const request = pendingExternalOpenRequests.shift()
      if (request) await handleExternalOpenRequest(request)
    }
  } finally {
    externalOpenPathDrainRunning = false
    if (pendingExternalOpenRequests.length > 0) {
      void drainExternalOpenRequests().catch((error) => {
        console.error("[electron] failed to continue external open requests:", error)
      })
    }
  }
}

ipcMain.on("ax-code:renderer-app-ready", (event) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (event.sender !== mainWindow.webContents) return
  rendererReadyForOpenProject = true
  flushPendingOpenProjectPaths()
  flushPendingFocusOpen()
})

externalOpenPathHandlerReady = true
if (hasSingleInstanceLock) {
  queueExternalOpenRequest({
    argv: process.argv,
    cwd: process.cwd(),
    source: "startup-argv",
  })
}

// ── Settings persistence ──────────────────────────────────────────────────
const settingsFilePath = () => {
  const dataDir =
    typeof process.env.AX_CODE_DESKTOP_DATA_DIR === "string" && process.env.AX_CODE_DESKTOP_DATA_DIR.trim()
      ? process.env.AX_CODE_DESKTOP_DATA_DIR.trim()
      : null
  if (dataDir) return path.join(dataDir, "settings.json")
  return path.join(os.homedir(), ".config", "openchamber", "settings.json")
}

// A missing file is an empty document; an unreadable or invalid one is not, and callers that write
// back what they read need to tell the two apart.
const readJsonFileResult = (filePath) => {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) }
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: true, value: {} }
    console.warn("[electron] failed to read JSON file", filePath, error)
    return { ok: false, value: null }
  }
}

const readJsonFile = (filePath) => {
  const result = readJsonFileResult(filePath)
  return result.ok ? result.value : {}
}

const writeJsonFile = async (filePath, data) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  // Atomic: write to a temp file then rename. Readers never see a partial JSON
  // file that could parse-error and get coerced to {}.
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2))
    await fsp.rename(tmp, filePath)
  } catch (error) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

let languageController
const getLanguageController = () => {
  if (!languageController) {
    const file = path.join(app.getPath("userData"), "language-preferences.json")
    languageController = createLanguageController({
      read: () => readJsonFile(file),
      write: (value) => writeJsonFile(file, value),
      systemLanguages: () => app.getPreferredSystemLanguages(),
      onChange: (value) => {
        const notify = (callback) => {
          try {
            callback()
          } catch (error) {
            console.warn("[electron] language presentation refresh failed", error)
          }
        }
        notify(setupApplicationMenu)
        notify(() => trayController?.refreshLanguage?.())
        for (const window of BrowserWindow.getAllWindows()) {
          notify(() => {
            if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
              window.webContents.send("openchamber:language-changed", value)
            }
          })
        }
      },
    })
  }
  return languageController
}
const nativeT = createNativeLocalizer(() => getLanguageController().get().locale)
const localizedDialog = createLocalizedDialog(dialog, nativeT)
const buildLocalizedMenu = (template) => Menu.buildFromTemplate(localizeMenuTemplate(template, nativeT))

const animationPreferencesPath = () => path.join(app.getPath("userData"), "launch-animation-preferences.json")
const animationPreferences = () => {
  const value = readJsonFile(animationPreferencesPath())
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}
const launchAnimationsEnabled = () =>
  process.env.AX_CODE_DESKTOP_ANIMATIONS !== "0" && animationPreferences().enabled !== false
let animationPreferenceWrites = Promise.resolve()
const setLaunchAnimationsEnabled = (enabled) => {
  const next = animationPreferenceWrites.then(async () => {
    await writeJsonFile(animationPreferencesPath(), { ...animationPreferences(), enabled })
    setupApplicationMenu()
  })
  animationPreferenceWrites = next.catch(() => {})
  return next
}
const animationMenuItem = () => ({
  label: "Launch and Quit Animations",
  type: "checkbox",
  checked: launchAnimationsEnabled(),
  enabled: process.env.AX_CODE_DESKTOP_ANIMATIONS !== "0",
  click: (item) => {
    setLaunchAnimationsEnabled(item.checked).catch((error) => {
      console.warn("[electron] animation preference write failed", error.message)
      setupApplicationMenu()
    })
  },
})

handleCommand("desktop_language_get", async () => getLanguageController().get())
handleCommand("desktop_language_set", async (args) => getLanguageController().update(args))

const readSettingsRoot = () => {
  const root = readJsonFile(settingsFilePath())
  return root && typeof root === "object" && !Array.isArray(root) ? root : {}
}

// Serializes read-modify-write of the settings file so interleaved RMW pairs
// across awaits don't overwrite each other's just-persisted changes.
let settingsMutationChain = Promise.resolve()
const mutateSettingsRoot = (mutator) => {
  const next = settingsMutationChain.then(async () => {
    // Refuse to write over a file this process could not read. Answering `{}` for a truncated or
    // unreadable settings.json and then persisting the mutation would replace the user's theme,
    // projects, runtime path and shortcuts with whatever this one change carries — a window
    // geometry, most often. The failure reaches the caller, which reports it.
    const read = readJsonFileResult(settingsFilePath())
    if (!read.ok) {
      throw new Error("settings.json could not be read; the change was not written")
    }
    const current = read.value && typeof read.value === "object" && !Array.isArray(read.value) ? read.value : {}
    const result = await mutator(current)
    const nextRoot = result ?? current
    await writeJsonFile(settingsFilePath(), nextRoot)
    // Same settings.json write the renderer already uses. No extra IPC channel.
    syncQuickDispatchGlobalShortcutFromSettings(nextRoot)
  })
  settingsMutationChain = next.catch((err) => {
    console.error("[electron] settings mutation failed:", err)
  })
  return next
}

// S2.3 (SPEC-2026-08-29-desktop-process-model-collapse §2 D5): main is the sole
// writer of settings.json. The web-server utilityProcess delegates every
// settings mutation here as a "settings-write" message instead of writing the
// file itself. The handler is created after mutateSettingsRoot because it
// applies each request through that serialized chain.
const settingsWriteHandler = createSettingsWriteHandler({
  mutateSettingsRoot,
  postMessage: (message) => {
    if (!serverChild) throw new Error("server process is not running")
    serverChild.postMessage(message)
  },
})

// AX Code Desktop is intentionally local-only. Remote host and SSH settings may
// remain in an older settings file, but no runtime path reads or activates them.
const localOriginUrl = () => `http://localhost:${serverPort}`
const localOnlyHostConfig = () => ({
  hosts: [],
  defaultHostId: LOCAL_HOST_ID,
  initialHostChoiceCompleted: true,
  localOrigin: localOriginUrl(),
})
const remoteAccessDisabled = () => {
  throw new Error("Remote AX Code access is disabled by the local-only policy")
}

const purgeDisabledRemoteAccessSettings = async () => {
  const current = readSettingsRoot()
  if (!removeDisabledRemoteAccessSettingsFromRoot(current)) return
  await mutateSettingsRoot((root) => {
    removeDisabledRemoteAccessSettingsFromRoot(root)
  })
}

// ── Host probe ─────────────────────────────────────────────────────────────
const buildVersionUrl = (url) => {
  try {
    const parsed = new URL(url)
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "") || ""}/api/version`
    return parsed.toString()
  } catch {
    return null
  }
}

const classifyVersionPayload = (payload) => {
  const compatibility = payload?.compatibility
  if (!payload || payload.status !== "ok" || !compatibility || typeof compatibility !== "object") {
    return "wrong-service"
  }
  if (!Array.isArray(compatibility.capabilities) || !compatibility.capabilities.includes("api.runtime-url.v1")) {
    return "incompatible"
  }
  if (compatibility.apiVersion !== 1 || compatibility.minClientApiVersion > 1) {
    return "update-recommended"
  }
  return "ok"
}

const fetchVersionPayload = async (versionUrl, { headers, timeoutMs }) => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  try {
    return await fetch(versionUrl, { signal: timeoutSignal, headers })
  } catch (error) {
    if (timeoutSignal.aborted) throw error
    // Node's fetch failed before the deadline; retry through Chromium's network stack.
    return await electronNet.fetch(versionUrl, { headers, signal: AbortSignal.timeout(timeoutMs) })
  }
}

const probeHostWithTimeout = async (url, timeoutMs, clientToken = "") => {
  const versionUrl = buildVersionUrl(url)
  if (!versionUrl) throw new Error("Invalid URL")
  const started = Date.now()
  try {
    const headers = { Accept: "application/json" }
    const token = typeof clientToken === "string" ? clientToken.trim() : ""
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetchVersionPayload(versionUrl, { headers, timeoutMs })
    const status = response.status
    if (status === 401 || status === 403) return { status: "auth", latencyMs: Date.now() - started }
    if (status < 200 || status >= 300) return { status: "unreachable", latencyMs: Date.now() - started }
    const payload = await response.json().catch(() => null)
    return { status: classifyVersionPayload(payload), latencyMs: Date.now() - started }
  } catch {
    return { status: "unreachable", latencyMs: Date.now() - started }
  }
}

// ── Native notifications ───────────────────────────────────────────────────
const normalizeNotificationInput = (raw) => {
  if (!raw || typeof raw !== "object") return {}
  if (raw.payload && typeof raw.payload === "object") return { ...raw, ...raw.payload }
  return raw
}

const isAnyWindowFocused = () => BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused())

const focusForegroundWindow = () => {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (windows.length === 0) return
  const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : windows.find((w) => w.isVisible()) || windows[0]
  if (process.platform === "darwin") app.focus({ steal: true })
  if (target.isMinimized()) target.restore()
  target.show()
  target.focus()
  if (typeof target.moveTop === "function") target.moveTop()
}

// Keep references to live notifications so click/close still fire (macOS GC bug).
const activeNotifications = new Set()

const maybeShowNativeNotification = (rawInput) => {
  const payload = normalizeNotificationInput(rawInput)
  const requireHidden = Boolean(payload.requireHidden ?? payload.require_hidden)
  if (requireHidden && isAnyWindowFocused()) return { success: false, reason: "focused" }
  if (!Notification.isSupported()) return { success: false, reason: "unsupported" }

  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "AX Code"
  const body = typeof payload.body === "string" ? payload.body : ""
  const sessionId = typeof payload.sessionId === "string" && payload.sessionId.trim() ? payload.sessionId.trim() : null
  const directory = typeof payload.directory === "string" && payload.directory.trim() ? payload.directory.trim() : null

  let notification
  try {
    notification = new Notification({
      title,
      body,
      silent: false,
      ...(process.platform === "darwin" ? { sound: "Glass" } : {}),
    })
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : String(error) }
  }

  activeNotifications.add(notification)
  // Fallback cleanup: macOS suppresses lifecycle events for notifications
  // sent from hidden apps, which would leave stale references in the set.
  // Use a generous timeout (5 min) so users still have time to click.
  const RELEASE_TIMEOUT_MS = 5 * 60 * 1000
  let released = false
  const release = () => {
    if (released) return
    released = true
    clearTimeout(fallbackTimer)
    activeNotifications.delete(notification)
  }
  const fallbackTimer = setTimeout(release, RELEASE_TIMEOUT_MS)
  // Don't keep the process alive just for this timer.
  if (typeof fallbackTimer.unref === "function") fallbackTimer.unref()

  notification.on("click", () => {
    focusForegroundWindow()
    if (sessionId) {
      // The tray's session click already reveals the window and queues the event until the renderer
      // is listening: this path only focused a window that existed, so a click with every window
      // closed opened nothing, and a click while a window was still loading dropped the session.
      void revealMainWindow()
        .then((target) => {
          if (target && !target.isDestroyed()) {
            handOffToMainWindow("openchamber:open-session", { sessionId, directory })
          }
        })
        .catch((error) => {
          console.error("[electron] failed to open the session from a notification:", error)
        })
    }
    release()
  })
  notification.on("close", release)
  notification.on("failed", release)

  try {
    notification.show()
  } catch (error) {
    release()
    return { success: false, reason: error instanceof Error ? error.message : String(error) }
  }
  return { success: true }
}

// ── Installed-app discovery / open-in-app (macOS + Windows) ────────────────
const buildInstalledAppsCachePath = () => path.join(path.dirname(settingsFilePath()), INSTALLED_APPS_CACHE_FILE)

const pathExists = async (candidate) => {
  try {
    await fsp.access(candidate)
    return true
  } catch {
    return false
  }
}

const resolveAppBundlePath = async (appName) => {
  if (process.platform !== "darwin") return null
  // The renderer names the app; a separator or a parent hop would steer the
  // candidate paths below outside the application directories.
  if (!appName || /[/\\]/.test(appName) || appName.includes("..")) return null
  const bundleName = appName.endsWith(".app") ? appName : `${appName}.app`
  const candidates = [
    `/Applications/${bundleName}`,
    `/System/Applications/${bundleName}`,
    `/System/Applications/Utilities/${bundleName}`,
    path.join(os.homedir(), "Applications", bundleName),
  ]
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  try {
    const { stdout } = await execFileAsync("mdfind", ["-name", bundleName], { encoding: "utf8" })
    // mdfind -name matches substrings, so "Code.app" also finds
    // "Visual Studio Code.app" and "Code.app.zip"; only an exact
    // bundle basename names the requested app.
    const first = (stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => path.basename(line) === bundleName)
      .find(Boolean)
    return first || null
  } catch {
    return null
  }
}

const isAppBundleInstalled = async (appName) => Boolean(await resolveAppBundlePath(appName))

let iconTempCounter = 0
const iconToDataUrl = async (iconPath, appName) => {
  if (!iconPath || !(await pathExists(iconPath))) return null
  const safeName = String(appName || "app").replace(/[^a-z0-9]/gi, "_")
  const tempPath = path.join(os.tmpdir(), `ax-code-icon-${safeName}-${process.pid}-${iconTempCounter++}.png`)
  try {
    await execFileAsync("sips", ["-s", "format", "png", "-Z", "32", iconPath, "--out", tempPath], { stdio: "ignore" })
  } catch {
    return null
  }
  if (!(await pathExists(tempPath))) return null
  try {
    const bytes = await fsp.readFile(tempPath)
    return `data:image/png;base64,${bytes.toString("base64")}`
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
  }
}

const resolveAppIconPath = async (appPath) => {
  if (!appPath || !(await pathExists(appPath))) return null
  const resourcesPath = path.join(appPath, "Contents", "Resources")
  if (!(await pathExists(resourcesPath))) return null
  let entries
  try {
    entries = await fsp.readdir(resourcesPath)
  } catch {
    return null
  }
  const icon = entries.find((entry) => entry.toLowerCase().endsWith(".icns"))
  return icon ? path.join(resourcesPath, icon) : null
}

// Each app costs up to a few subprocess round trips (mdfind, sips), so resolve
// them in parallel but bounded to avoid a process-spawn storm.
const APP_LOOKUP_CONCURRENCY = 4

const resolveInstalledApp = async (name) => {
  const appPath = await resolveAppBundlePath(name)
  if (!appPath) return null
  return { name, iconDataUrl: await iconToDataUrl(await resolveAppIconPath(appPath), name) }
}

const buildInstalledApps = async (apps) => {
  const seen = new Set()
  const names = apps.map((raw) => String(raw || "").trim()).filter((raw) => raw && !seen.has(raw) && seen.add(raw))
  const resolved = await mapWithConcurrency(names, APP_LOOKUP_CONCURRENCY, resolveInstalledApp)
  return resolved.filter(Boolean)
}

const JETBRAINS_APP_IDS = new Set([
  "pycharm",
  "intellij",
  "webstorm",
  "phpstorm",
  "rider",
  "rustrover",
  "android-studio",
])

const CLI_BY_APP_ID = {
  vscode: "code",
  cursor: "cursor",
  vscodium: "codium",
  windsurf: "windsurf",
  zed: "zed",
}

const WINDOWS_CLI_BY_APP_ID = {
  vscode: "code.cmd",
  cursor: "cursor.cmd",
  vscodium: "codium.cmd",
  windsurf: "windsurf.cmd",
  zed: "zed.cmd",
}

const WINDOWS_APP_EXECUTABLES = {
  terminal: ["wt.exe", "WindowsTerminal.exe"],
  vscode: ["code.exe", "code.cmd"],
  cursor: ["cursor.exe", "cursor.cmd"],
  vscodium: ["codium.exe", "codium.cmd"],
  windsurf: ["windsurf.exe", "windsurf.cmd"],
  zed: ["zed.exe", "zed.cmd"],
  "visual-studio": ["devenv.exe"],
  "sublime-text": ["subl.exe", "sublime_text.exe"],
}

const WINDOWS_APP_ID_BY_NAME = new Map([
  ["finder", "finder"],
  ["file explorer", "finder"],
  ["terminal", "terminal"],
  ["windows terminal", "terminal"],
  ["visual studio code", "vscode"],
  ["cursor", "cursor"],
  ["vscodium", "vscodium"],
  ["windsurf", "windsurf"],
  ["zed", "zed"],
  ["visual studio", "visual-studio"],
  ["sublime text", "sublime-text"],
])

const getWindowsAppIdForName = (appName) =>
  WINDOWS_APP_ID_BY_NAME.get(
    String(appName || "")
      .trim()
      .toLowerCase(),
  ) || ""

const runWhere = (program) => {
  const result = spawnSync("where.exe", [program], { encoding: "utf8", windowsHide: true })
  if (result.error || result.status !== 0) return null
  const first = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return first || null
}

const resolveWindowsCommandProcessor = () => {
  const systemCmd = "C:\\Windows\\System32\\cmd.exe"
  return fs.existsSync(systemCmd) ? systemCmd : runWhere("cmd.exe")
}

const findWindowsExecutable = (appId) => {
  for (const program of WINDOWS_APP_EXECUTABLES[appId] || []) {
    const resolved = runWhere(program)
    if (resolved) return resolved
  }
  return null
}

const resolveWindowsScriptIconExecutable = (scriptPath) => {
  if (!scriptPath || !/\.(?:cmd|bat)$/i.test(scriptPath)) return null
  let source = ""
  try {
    source = fs.readFileSync(scriptPath, "utf8")
  } catch {
    return null
  }
  const scriptDir = path.dirname(scriptPath)
  const matches = [
    ...source.matchAll(/(?:(?:%~dp0|%~dp0\\|%~dp0\/|\.\.\\|\.\.\/|[A-Za-z]:\\|[A-Za-z]:\/)[^"'\r\n]*?\.exe)/gi),
  ]
  for (const match of matches) {
    const raw = String(match[0] || "")
      .replace(/^%~dp0[\\/]?/i, "")
      .trim()
    const candidate = path.isAbsolute(raw) ? raw : path.resolve(scriptDir, raw)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

let windowsTerminalPackagePathCache
const resolveWindowsTerminalPackagePath = () => {
  if (windowsTerminalPackagePathCache !== undefined) return windowsTerminalPackagePathCache
  const powershell = runWhere("powershell.exe") || runWhere("pwsh.exe")
  if (powershell) {
    const command =
      "$packages = @(" +
      "Get-AppxPackage -Name Microsoft.WindowsTerminal -ErrorAction SilentlyContinue;" +
      "Get-AppxPackage -Name Microsoft.WindowsTerminalPreview -ErrorAction SilentlyContinue" +
      ") | Where-Object { $_.InstallLocation } | Sort-Object Version -Descending; " +
      "if ($packages) { $packages[0].InstallLocation }"
    const result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
    })
    if (!result.error && result.status === 0) {
      const packagePath = String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (packagePath && fs.existsSync(packagePath)) {
        windowsTerminalPackagePathCache = packagePath
        return windowsTerminalPackagePathCache
      }
    }
  }
  const programFilesRoots = [process.env.ProgramW6432, process.env.ProgramFiles, "C:\\Program Files"].filter(
    (value, index, values) => typeof value === "string" && value && values.indexOf(value) === index,
  )
  for (const root of programFilesRoots) {
    const windowsAppsPath = path.join(root, "WindowsApps")
    let entries = []
    try {
      entries = fs.readdirSync(windowsAppsPath, { withFileTypes: true })
    } catch {
      continue
    }
    const packageNames = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^Microsoft\.WindowsTerminal(?:Preview)?_.*__8wekyb3d8bbwe$/i.test(name))
      .sort()
      .reverse()
    const stable = packageNames.find((name) => /^Microsoft\.WindowsTerminal_/i.test(name))
    const selected = stable || packageNames[0]
    if (selected) {
      windowsTerminalPackagePathCache = path.join(windowsAppsPath, selected)
      return windowsTerminalPackagePathCache
    }
  }
  windowsTerminalPackagePathCache = null
  return windowsTerminalPackagePathCache
}

const resolveWindowsTerminalIconPath = () => {
  const packagePath = resolveWindowsTerminalPackagePath()
  if (!packagePath) return null
  const candidates = [
    path.join(packagePath, "Images", "Square44x44Logo.targetsize-96_altform-unplated.png"),
    path.join(packagePath, "Images", "Square44x44Logo.targetsize-96.png"),
    path.join(packagePath, "Images", "StoreLogo.scale-200.png"),
    path.join(packagePath, "Images", "StoreLogo.scale-100.png"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

const resolveWindowsTerminalExecutable = () => {
  const packagePath = resolveWindowsTerminalPackagePath()
  if (packagePath) {
    const executable = path.join(packagePath, "WindowsTerminal.exe")
    if (fs.existsSync(executable)) return executable
  }
  return findWindowsExecutable("terminal")
}

const imageFileToDataUrl = (filePath) => {
  if (!filePath) return null
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`
  } catch {
    return null
  }
}

const findWindowsAppNameExecutable = (appName) => {
  const program = `${String(appName || "").trim()}.exe`.replace(/\s+/g, "")
  return program === ".exe" ? null : runWhere(program)
}

const resolveWindowsAppIconExecutable = ({ appId, appName }) => {
  if (appId === "finder") {
    const explorerPath = path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe")
    return fs.existsSync(explorerPath) ? explorerPath : "explorer.exe"
  }
  if (appId === "terminal") return resolveWindowsTerminalExecutable()
  const executable = findWindowsExecutable(appId) || findWindowsAppNameExecutable(appName)
  if (!executable) return null
  if (/\.exe$/i.test(executable)) return executable
  return resolveWindowsScriptIconExecutable(executable) || executable
}

const windowsIconToDataUrl = async (executablePath) => {
  if (!executablePath) return null
  try {
    const image = await app.getFileIcon(executablePath, { size: "normal" })
    if (image.isEmpty()) return null
    return image.toDataURL()
  } catch {
    return null
  }
}

const isWindowsAppInstalled = ({ appId, appName }) => {
  if (appId === "finder") return true
  if (appId === "terminal") return Boolean(resolveWindowsTerminalExecutable())
  if (findWindowsExecutable(appId)) return true
  return Boolean(findWindowsAppNameExecutable(appName))
}

const buildWindowsInstalledApps = async (apps) => {
  const seen = new Set()
  const names = (Array.isArray(apps) ? apps : [])
    .map((appName) => String(appName || "").trim())
    .filter((appName) => appName && !seen.has(appName) && seen.add(appName))
    .filter((appName) => isWindowsAppInstalled({ appId: getWindowsAppIdForName(appName), appName }))
  const results = []
  for (const name of names) {
    const appId = getWindowsAppIdForName(name)
    const executablePath = resolveWindowsAppIconExecutable({ appId, appName: name })
    const iconDataUrl =
      appId === "terminal"
        ? imageFileToDataUrl(resolveWindowsTerminalIconPath()) || (await windowsIconToDataUrl(executablePath))
        : await windowsIconToDataUrl(executablePath)
    results.push({ name, iconDataUrl })
  }
  return results
}

const buildWindowsOpenProjectSpecs = ({ projectPath, appId, appName }) => {
  if (appId === "finder") return [{ program: "explorer.exe", args: [projectPath] }]
  if (appId === "terminal") {
    const specs = []
    const terminal = findWindowsExecutable("terminal")
    if (terminal) specs.push({ program: terminal, args: ["-d", projectPath] })
    const shellProgram = runWhere("pwsh.exe") || runWhere("powershell.exe")
    if (shellProgram) {
      specs.push({
        program: shellProgram,
        args: ["-NoExit", "-Command", `Set-Location -LiteralPath ${quotePowerShellLiteral(projectPath)}`],
        shellStart: true,
      })
    }
    const commandPrompt = resolveWindowsCommandProcessor()
    if (commandPrompt) specs.push({ program: commandPrompt, args: ["/k", "cd", "/d", projectPath], shellStart: true })
    return specs
  }
  const specs = []
  const cli = WINDOWS_CLI_BY_APP_ID[appId]
  if (cli) {
    const resolvedCli = runWhere(cli)
    if (resolvedCli) specs.push({ program: resolvedCli, args: [projectPath] })
  }
  const exe = findWindowsExecutable(appId)
  if (exe) specs.push({ program: exe, args: [projectPath] })
  const namedExe = findWindowsAppNameExecutable(appName)
  if (namedExe && !specs.some((spec) => spec.program === namedExe)) {
    specs.push({ program: namedExe, args: [projectPath] })
  }
  return specs
}

const buildWindowsOpenFileSpecs = ({ filePath, appId, appName }) => {
  if (appId === "terminal") {
    return buildWindowsOpenProjectSpecs({ projectPath: path.dirname(filePath), appId, appName })
  }
  return buildWindowsOpenProjectSpecs({ projectPath: filePath, appId, appName })
}

const buildOpenProjectSpecs = ({ projectPath, appId, appName }) => {
  if (appId === "finder") return [{ program: "open", args: [projectPath] }]
  if (appId === "terminal" || appId === "iterm2" || appId === "ghostty") {
    return [{ program: "open", args: ["-a", appName, projectPath] }]
  }
  const specs = []
  const cli = CLI_BY_APP_ID[appId]
  if (cli) specs.push({ program: cli, args: ["-n", projectPath] })
  if (JETBRAINS_APP_IDS.has(appId)) specs.push({ program: "open", args: ["-na", appName, "--args", projectPath] })
  specs.push({ program: "open", args: ["-a", appName, projectPath] })
  return specs
}

const buildOpenFileSpecs = ({ filePath, appId, appName }) => {
  if (appId === "finder") return [{ program: "open", args: ["-R", filePath] }]
  if (appId === "terminal" || appId === "iterm2" || appId === "ghostty") {
    return buildOpenProjectSpecs({ projectPath: path.dirname(filePath), appId, appName })
  }
  const specs = []
  const cli = CLI_BY_APP_ID[appId]
  if (cli) specs.push({ program: cli, args: ["-n", filePath] })
  if (JETBRAINS_APP_IDS.has(appId)) specs.push({ program: "open", args: ["-na", appName, "--args", filePath] })
  specs.push({ program: "open", args: ["-a", appName, filePath] })
  return specs
}

const quoteWindowsCommandArg = (value) => `"${String(value).replace(/"/g, '""')}"`

const resolveWindowsLaunchProgram = (program) => {
  if (path.isAbsolute(program)) return fs.existsSync(program) ? program : null
  return runWhere(program)
}

// A detached launch has nobody waiting on it, so a spawn failure (the program
// disappearing between the lookup above and here, say) surfaces as an unhandled
// 'error' event, reaches the process-level uncaughtException handler and quits
// the whole app over a failed "open in editor". Record it instead; the caller's
// chain still moves on when a candidate fails synchronously.
const launchDetachedWindowsProcess = (program, args, options) => {
  const child = spawn(program, args, { detached: true, stdio: "ignore", windowsHide: false, ...options })
  child.once("error", (error) => console.warn(`[electron] Failed to launch ${program}:`, error))
  child.unref()
  return child
}

const launchWindowsCommandScript = (spec, program) => {
  const commandLine = ["call", quoteWindowsCommandArg(program), ...spec.args.map(quoteWindowsCommandArg)].join(" ")
  launchDetachedWindowsProcess(resolveWindowsCommandProcessor() || "cmd.exe", ["/d", "/s", "/c", commandLine], {
    windowsVerbatimArguments: true,
  })
}

const launchWindowsSpec = (spec) => {
  const program = resolveWindowsLaunchProgram(spec.program)
  if (!program) throw new Error("program not found")
  if (spec.shellStart) {
    const commandLine = ["start", '""', quoteWindowsCommandArg(program), ...spec.args.map(quoteWindowsCommandArg)].join(
      " ",
    )
    launchDetachedWindowsProcess(resolveWindowsCommandProcessor() || "cmd.exe", ["/d", "/s", "/c", commandLine], {
      windowsVerbatimArguments: true,
    })
    return
  }
  if (/\.(cmd|bat)$/i.test(program)) {
    launchWindowsCommandScript(spec, program)
    return
  }
  launchDetachedWindowsProcess(program, spec.args, {})
}

const runSpecChain = async (specs, appName) => {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(`Failed to open in ${appName}: no launch candidates`)
  }
  if (process.platform === "win32") {
    const failures = []
    for (const spec of specs) {
      try {
        launchWindowsSpec(spec)
        return
      } catch (error) {
        failures.push(`${spec.program}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    throw new Error(`Failed to open in ${appName}: ${failures.join("; ")}`)
  }
  await runOpenSpecChain(specs, appName)
}

// ── Window-state persistence (main window geometry) ────────────────────────
const windowGeometryTimers = new Map()
const windowGeometryRevisions = new Map()

const readWindowState = () => {
  const stateValue = readSettingsRoot().desktopWindowState
  return stateValue && typeof stateValue === "object" ? stateValue : null
}

const clampWindowBoundsToVisibleWorkArea = (bounds) => {
  const width = Math.max(MIN_RESTORE_WINDOW_WIDTH, Math.round(Number(bounds?.width) || 0))
  const height = Math.max(MIN_RESTORE_WINDOW_HEIGHT, Math.round(Number(bounds?.height) || 0))
  const x = Math.round(Number(bounds?.x))
  const y = Math.round(Number(bounds?.y))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { width, height }
  try {
    const display = screen.getDisplayMatching({ x, y, width, height }) || screen.getPrimaryDisplay()
    const workArea = display.workArea
    const clampedWidth = Math.min(width, Math.max(MIN_WINDOW_WIDTH, workArea.width))
    const clampedHeight = Math.min(height, Math.max(MIN_WINDOW_HEIGHT, workArea.height))
    const maxX = workArea.x + workArea.width - clampedWidth
    const maxY = workArea.y + workArea.height - clampedHeight
    return {
      x: clampedWidth >= workArea.width ? workArea.x : Math.min(Math.max(x, workArea.x), maxX),
      y: clampedHeight >= workArea.height ? workArea.y : Math.min(Math.max(y, workArea.y), maxY),
      width: clampedWidth,
      height: clampedHeight,
    }
  } catch {
    return { x, y, width, height }
  }
}

const writeWindowState = async (browserWindow) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  if (!mainWindow || browserWindow.id !== mainWindow.id) return
  // Read the geometry now, not inside the mutator: the mutator runs later in the
  // settings mutation chain, and on macOS the window is destroyed by the very close that
  // triggers the final persist. The guard that skipped a destroyed window then returned
  // the root unchanged, discarding the bounds this call exists to record, so the app
  // reopened with its previous geometry.
  // getNormalBounds, not getBounds: while maximized/fullscreen the current bounds ARE the
  // maximized rectangle, and persisting that as the restore geometry meant unmaximizing
  // after a relaunch left the window at full-screen size instead of its previous size.
  const bounds = browserWindow.getNormalBounds()
  const maximized = browserWindow.isMaximized()
  const fullscreen = browserWindow.isFullScreen()
  await mutateSettingsRoot((root) => {
    root.desktopWindowState = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, MIN_WINDOW_WIDTH),
      height: Math.max(bounds.height, MIN_WINDOW_HEIGHT),
      maximized,
      fullscreen,
    }
  })
}

const debounceWindowStatePersist = (browserWindow, immediate = false) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const key = String(browserWindow.id)
  const revision = (windowGeometryRevisions.get(key) || 0) + 1
  windowGeometryRevisions.set(key, revision)
  const existingTimer = windowGeometryTimers.get(key)
  if (existingTimer) {
    clearTimeout(existingTimer)
    windowGeometryTimers.delete(key)
  }
  const persist = async () => {
    if (windowGeometryRevisions.get(key) !== revision) return
    windowGeometryTimers.delete(key)
    await writeWindowState(browserWindow)
  }
  if (immediate) {
    void persist().catch((error) => {
      console.warn("[electron] failed to persist window geometry", error)
    })
    return
  }
  const timer = setTimeout(() => {
    void persist().catch((error) => {
      console.warn("[electron] failed to persist window geometry", error)
    })
  }, 300)
  windowGeometryTimers.set(key, timer)
}

// Attach geometry-persist + vibrancy listeners to a window. Used for the main
// window; restores saved geometry on the main window at creation time.
const attachWindowStateListeners = (browserWindow) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const onChange = () => debounceWindowStatePersist(browserWindow)
  browserWindow.on("resize", onChange)
  browserWindow.on("move", onChange)
  browserWindow.on("maximize", onChange)
  browserWindow.on("unmaximize", onChange)
  // The custom Windows/Linux header button tracks this event: native maximize
  // paths (drag-region double-click, Aero Snap, Win+Up) never reached it, so
  // the button state went stale and the next click toggled the wrong way.
  browserWindow.on("maximize", () =>
    emitToWindow(browserWindow, "openchamber:window-maximized-changed", { maximized: true }),
  )
  browserWindow.on("unmaximize", () =>
    emitToWindow(browserWindow, "openchamber:window-maximized-changed", { maximized: false }),
  )
  browserWindow.on("close", () => debounceWindowStatePersist(browserWindow, true))
  // The id is unreadable once the window is destroyed, so capture it up front.
  const key = String(browserWindow.id)
  browserWindow.once("closed", () => {
    clearTimeout(windowGeometryTimers.get(key))
    windowGeometryTimers.delete(key)
    windowGeometryRevisions.delete(key)
  })
}

// Restore saved geometry onto the main window before it is shown.
const restoreMainWindowGeometry = (browserWindow) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const saved = readWindowState()
  if (!saved || typeof saved.width !== "number" || typeof saved.height !== "number") return
  const bounds = clampWindowBoundsToVisibleWorkArea(saved)
  try {
    browserWindow.setBounds(bounds)
    if (saved.fullscreen) browserWindow.setFullScreen(true)
    else if (saved.maximized) browserWindow.maximize()
  } catch {}
}

// macOS vibrancy preference (persisted; takes effect on a fresh launch).
const isVibrancyEnabled = () => readSettingsRoot().desktopVibrancy === true
const applyMacVibrancy = (browserWindow) => {
  if (process.platform !== "darwin" || !browserWindow || browserWindow.isDestroyed()) return
  if (!isVibrancyEnabled()) return
  try {
    browserWindow.setVibrancy("sidebar")
  } catch {}
}

// ── Additional windows ─────────────────────────────────────────────────────
// In our single-server model a new window simply loads the local server URL
// (or, when a non-local default host is configured, that host's URL). We do not
// inject runtime-config the way upstream's packaged-UI protocol did.
const createAdditionalWindow = async (url) => {
  applyRendererApiOrigin()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "AX Code",
    ...appWindowChromeOptions(),
    show: false,
    webPreferences: rendererWebPreferences(),
  })
  attachDesktopBrowserWebviewPolicy(win.webContents)
  attachAppWindowChrome(win)
  // The custom Windows/Linux maximize button reads this event; without it, native maximize
  // paths on a secondary window left the button stale (geometry persistence stays
  // main-window-only; writeWindowState guards that).
  attachWindowStateListeners(win)
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    // A window.open child inherits this window's privileged preload without the
    // navigation guards attached below, so no target gets its own window.
    if (!isTrustedRendererNavigation(targetUrl)) {
      safeOpenExternal(targetUrl)
    }
    return { action: "deny" }
  })
  attachRendererNavigationGuards(win.webContents, {
    isTrustedUrl: isTrustedRendererNavigation,
    onBlocked: safeOpenExternal,
  })
  try {
    await loadUrlWithTimeout(win, url, { timeoutMs: WINDOW_LOAD_TIMEOUT_MS })
  } catch (error) {
    // Never leave a hidden show:false window behind a wedged load.
    win.destroy()
    throw error
  }
  return win
}

// ── Menu (native application menu) ─────────────────────────────────────────
const sendMenuActionToWindow = (target, action) => {
  // The renderer registers its menu listener once the app has mounted, and a window this code just
  // created has only finished loading: sending straight away dropped the action (the same reason
  // handOffToMainWindow queues). Its own ready signal flushes what is queued.
  if (target === mainWindow && !rendererReadyForOpenProject) {
    pendingFocusOpens.push({ event: "openchamber:menu-action", detail: action })
    flushPendingFocusOpen()
    return
  }
  target.webContents.send("openchamber:menu-action", action)
}

const dispatchMenuAction = (action) => {
  const target = getMenuTargetWindow()
  if (!target || target.isDestroyed()) {
    // macOS keeps the app (and its menu bar) alive after the last window closes; a menu
    // command must bring the app back and then run instead of silently doing nothing.
    void revealMainWindow().then(() => {
      const next = getMenuTargetWindow()
      if (next && !next.isDestroyed()) sendMenuActionToWindow(next, action)
    })
    return
  }
  sendMenuActionToWindow(target, action)
}

const revealMainWindowForQuickDispatch = () => {
  if (!app.isReady() || serverPort <= 0) return
  const reveal = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      await createWindow()
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    dispatchMenuAction("quick-dispatch")
  }
  void reveal().catch((error) => {
    console.error("[electron] quick dispatch shortcut failed:", error)
  })
}

syncQuickDispatchGlobalShortcutFromSettings = (settings) => {
  quickDispatchShortcutRegistered = syncQuickDispatchShortcut({
    enabled: readQuickDispatchShortcutEnabled(settings),
    registered: quickDispatchShortcutRegistered,
    register: () => {
      const registered = globalShortcut.register(QUICK_DISPATCH_ACCELERATOR, revealMainWindowForQuickDispatch)
      if (!registered) {
        console.warn("[electron] Alt+Space could not be registered for quick dispatch")
      }
      return registered
    },
    unregister: () => {
      globalShortcut.unregister(QUICK_DISPATCH_ACCELERATOR)
    },
  })
}

releaseQuickDispatchGlobalShortcut = () => {
  syncQuickDispatchGlobalShortcutFromSettings({ quickDispatchGlobalShortcut: false })
}

const dispatchCheckForUpdates = async () => {
  // The event is delivered to the main window only, so gate on that window rather than on
  // whichever window the menu targets. On macOS the app menu stays usable after the main
  // window closes, and with a secondary window open getMenuTargetWindow() finds it while
  // handOffToMainWindow() still has no main window to deliver to: the click vanished.
  if (!mainWindow || mainWindow.isDestroyed()) {
    await revealMainWindow()
  }
  // A freshly created window's renderer has not mounted its listeners yet
  // (see handOffToMainWindow), so a direct emit dropped the click.
  handOffToMainWindow("openchamber:check-for-updates")
}

// Mini-chat windows (/mini-chat.html), the supervision pop-out (/supervision.html)
// and the wiki viewer (a temp file:// export) have no menu-action listener: sending Settings/New Session there
// dropped the command on the floor while the main window sat unfocused.
const isMenuCapableWindow = (win) => {
  if (!win || win.isDestroyed()) return false
  const url = win.webContents.getURL()
  // The main window has no committed URL yet during its first load.
  if (win === mainWindow && !url) return true
  return (
    Boolean(url) && !url.includes("/mini-chat.html") && !url.includes("/supervision.html") && !url.startsWith("file:")
  )
}

const getMenuTargetWindow = () => {
  const focused = BrowserWindow.getFocusedWindow()
  if (isMenuCapableWindow(focused)) return focused
  if (isMenuCapableWindow(mainWindow)) return mainWindow
  return BrowserWindow.getAllWindows().find(isMenuCapableWindow) ?? null
}

const reloadMenuTargetWindow = () => {
  const target = getMenuTargetWindow()
  if (!target || target.isDestroyed()) return
  target.webContents.reload()
}

const relaunchFromMenu = async () => {
  await restartDesktop(app, shutdownForExit)
}

const DISCORD_INVITE_URL = "https://discord.gg/gf9UyPxaN2"

const buildMacMenu = () => {
  const dispatchAction = (action) => dispatchMenuAction(action)
  const handleCopyAction = () => {
    const focused = BrowserWindow.getFocusedWindow()
    focused?.webContents.copy()
    // The renderer's copy handler re-copies its own selection. Sending it to a
    // window that is not focused (mini-chat, wiki viewer) overwrote what that
    // window had just copied with the main window's stale selection. Copy with
    // nothing focused does nothing — a menu command it is not, and dispatching
    // it re-created the main window.
    if (focused && focused === getMenuTargetWindow()) dispatchAction("copy")
  }
  return buildLocalizedMenu([
    {
      label: app.name,
      submenu: [
        { label: "About AX Code", click: () => dispatchAction("about") },
        { label: "Check for Updates", click: () => dispatchCheckForUpdates() },
        { type: "separator" },
        { label: "Settings", accelerator: "Cmd+,", click: () => dispatchAction("settings") },
        animationMenuItem(),
        { label: "Reload Webview", click: () => reloadMenuTargetWindow() },
        {
          label: "Restart",
          click: () => {
            void relaunchFromMenu()
          },
        },
        { label: "Command Palette", accelerator: "Cmd+P", click: () => dispatchAction("command-palette") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "Cmd+Shift+Alt+N",
          click: () => {
            void handleNewWindow()
          },
        },
        { type: "separator" },
        { label: "New Session", accelerator: "Cmd+N", click: () => dispatchAction("new-session") },
        { label: "New Worktree", accelerator: "Cmd+Shift+N", click: () => dispatchAction("new-worktree-session") },
        { type: "separator" },
        { label: "Add Workspace", click: () => dispatchAction("change-workspace") },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { label: "Copy", accelerator: "Cmd+C", click: () => handleCopyAction() },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Right Sidebar", click: () => dispatchAction("toggle-right-sidebar") },
        {
          label: "Open Git Sidebar",
          click: () => dispatchAction("open-right-sidebar-git"),
        },
        {
          label: "Open Files Sidebar",
          click: () => dispatchAction("open-right-sidebar-files"),
        },
        { type: "separator" },
        { label: "Toggle Terminal Dock", click: () => dispatchAction("toggle-terminal") },
        {
          label: "Toggle Terminal Expanded",
          click: () => dispatchAction("toggle-terminal-expanded"),
        },
        { type: "separator" },
        { label: "Light Theme", click: () => dispatchAction("theme-light") },
        { label: "Dark Theme", click: () => dispatchAction("theme-dark") },
        { label: "System Theme", click: () => dispatchAction("theme-system") },
        { type: "separator" },
        { label: "Toggle Session Sidebar", click: () => dispatchAction("toggle-sidebar") },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "Cmd+.", click: () => dispatchAction("help-dialog") },
        { label: "Show Diagnostics", accelerator: "Cmd+Shift+L", click: () => dispatchAction("download-logs") },
        { type: "separator" },
        {
          label: "Clear Cache",
          click: () => {
            void clearCacheAndReload()
          },
        },
        { type: "separator" },
        { label: "Report a Bug", click: () => safeOpenExternal(GITHUB_BUG_REPORT_URL) },
        { label: "Request a Feature", click: () => safeOpenExternal(GITHUB_FEATURE_REQUEST_URL) },
        { type: "separator" },
        { label: "Join Discord", click: () => safeOpenExternal(DISCORD_INVITE_URL) },
      ],
    },
  ])
}

const buildNonMacMenu = () => {
  const dispatchAction = (action) => dispatchMenuAction(action)
  const handleCopyAction = () => {
    const focused = BrowserWindow.getFocusedWindow()
    focused?.webContents.copy()
    // See buildMacMenu: only the focused window's own handler may run, and
    // copy with nothing focused does nothing instead of re-creating a window.
    if (focused && focused === getMenuTargetWindow()) dispatchAction("copy")
  }
  const isDev = !app.isPackaged
  return buildLocalizedMenu([
    {
      label: "AX Code",
      submenu: [
        { label: "About AX Code", click: () => dispatchAction("about") },
        { label: "Check for Updates", click: () => dispatchCheckForUpdates() },
        { type: "separator" },
        { label: "Settings", accelerator: "Ctrl+,", click: () => dispatchAction("settings") },
        animationMenuItem(),
        { label: "Reload Webview", click: () => reloadMenuTargetWindow() },
        {
          label: "Restart",
          click: () => {
            void relaunchFromMenu()
          },
        },
        { label: "Command Palette", accelerator: "Ctrl+P", click: () => dispatchAction("command-palette") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "Ctrl+Shift+Alt+N",
          click: () => {
            void handleNewWindow()
          },
        },
        { type: "separator" },
        { label: "New Session", accelerator: "Ctrl+N", click: () => dispatchAction("new-session") },
        { label: "New Worktree", accelerator: "Ctrl+Shift+N", click: () => dispatchAction("new-worktree-session") },
        { type: "separator" },
        { label: "Add Workspace", click: () => dispatchAction("change-workspace") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { label: "Copy", accelerator: "Ctrl+C", click: () => handleCopyAction() },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { label: "Toggle Right Sidebar", accelerator: "Ctrl+B", click: () => dispatchAction("toggle-right-sidebar") },
        { type: "separator" },
        { label: "Light Theme", click: () => dispatchAction("theme-light") },
        { label: "Dark Theme", click: () => dispatchAction("theme-dark") },
        { label: "System Theme", click: () => dispatchAction("theme-system") },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "Ctrl+.", click: () => dispatchAction("help-dialog") },
        { label: "Show Diagnostics", accelerator: "Ctrl+Shift+L", click: () => dispatchAction("download-logs") },
        { type: "separator" },
        {
          label: "Clear Cache",
          click: () => {
            void clearCacheAndReload()
          },
        },
        { type: "separator" },
        { label: "Report a Bug", click: () => safeOpenExternal(GITHUB_BUG_REPORT_URL) },
        { label: "Request a Feature", click: () => safeOpenExternal(GITHUB_FEATURE_REQUEST_URL) },
      ],
    },
  ])
}

const setupApplicationMenu = () => {
  Menu.setApplicationMenu(process.platform === "darwin" ? buildMacMenu() : buildNonMacMenu())
}

// ── Tray (macOS only; no-ops cleanly if icon assets are absent) ────────────
let trayController = null
// Packaged: extraResources land in process.resourcesPath (…/Resources/icons/tray).
// Dev: prefer package resources/ next to dist/, then dist/resources/ (bundle-main copy).
const resourceRoot = () => {
  if (app.isPackaged) return process.resourcesPath
  const candidates = [path.join(__dirname, "..", "resources"), path.join(__dirname, "resources")]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "icons", "tray", "trayTemplate-idle.png"))) {
      return candidate
    }
  }
  return candidates[0]
}

const trayIconAssets = () => {
  const dir = path.join(resourceRoot(), "icons", "tray")
  const statusDir = path.join(dir, "status")
  const TRAY_BREATH_FRAME_COUNT = 16
  return {
    idleIconPath: path.join(dir, "trayTemplate-idle.png"),
    unseenIconPath: path.join(dir, "trayTemplate-unseen.png"),
    breathIconPaths: Array.from({ length: TRAY_BREATH_FRAME_COUNT }, (_, i) =>
      path.join(dir, `trayTemplate-breath-${String(i).padStart(2, "0")}.png`),
    ),
    statusIconPaths: {
      busy: path.join(statusDir, "busy.png"),
      retry: path.join(statusDir, "retry.png"),
      error: path.join(statusDir, "error.png"),
      unseen: path.join(statusDir, "unseen.png"),
      blank: path.join(statusDir, "blank.png"),
    },
  }
}

const revealMainWindow = async () => {
  let target = mainWindow
  if ((!target || target.isDestroyed()) && serverPort > 0) {
    await createWindow().catch(() => {})
    target = mainWindow
  }
  if (target && !target.isDestroyed()) {
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
  }
  return target
}

const dispatchTrayAction = async (action) => {
  if (!action || typeof action !== "object") return
  if (action.type === "quit") {
    app.quit()
    return
  }
  if (action.type === "respond-permission") {
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : await revealMainWindow()
    // The tray action reaches the renderer through the ax-code:dom-event envelope (its
    // listener is a window event listener), so it goes through the same ready gate the
    // other hand-offs use - otherwise a click that revealed a fresh window answered
    // nothing and the agent stayed blocked on that approval.
    if (target && !target.isDestroyed()) handOffToMainWindow("openchamber:tray-action", action)
    return
  }
  if (action.type === "new-mini-chat") {
    try {
      await createMiniChatWindow({ mode: "draft" })
    } catch (error) {
      console.warn("[electron] failed to open mini chat from tray", error)
    }
    return
  }
  if (action.type === "focus-session") {
    const target = await revealMainWindow()
    if (target && !target.isDestroyed() && action.sessionId) {
      handOffToMainWindow("openchamber:open-session", {
        sessionId: action.sessionId,
        directory: action.directory || "",
      })
    }
    return
  }
  const target = await revealMainWindow()
  if (!target || target.isDestroyed()) return
  if (action.type === "new-session") {
    handOffToMainWindow("openchamber:open-draft-session", { directory: "", projectId: "" })
  }
  // show-main-window: revealing the window above is the whole action.
}

const setupTray = () => {
  if (process.platform !== "darwin" || trayController) return
  const assets = trayIconAssets()
  if (!fs.existsSync(assets.idleIconPath)) {
    console.warn("[electron] tray icon missing, skipping tray setup", { iconPath: assets.idleIconPath })
    return
  }
  try {
    trayController = createTrayController({
      translate: nativeT,
      ...assets,
      onAction: (action) => {
        void dispatchTrayAction(action)
      },
    })
    trayController.update({ sessions: [], approvals: [] })
  } catch (error) {
    console.warn("[electron] failed to set up tray", error)
    trayController = null
  }
}

// ── Shared command bodies (used by handlers and menu items) ────────────────
const clearCacheAndReload = async () => {
  await session.defaultSession.clearStorageData()
  // Every renderer reloads here, so none of them is listening until the ready
  // signal arrives again. Leaving the flag set made later open/hand-off requests
  // emit into a reloading renderer, where they were dropped, and the queue drained
  // with nothing delivered.
  rendererReadyForOpenProject = false
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    // The storage clear can take seconds; a window closed meanwhile must be skipped
    // like every other window fan-out in this file.
    if (browserWindow.isDestroyed()) continue
    browserWindow.webContents.reload()
  }
}

const handleNewWindow = async () => {
  await createAdditionalWindow(`${localRendererOrigin()}/`)
}

const applyWindowTheme = (browserWindow, args) => {
  const mode = typeof args?.themeMode === "string" ? args.themeMode : ""
  const variant = typeof args?.themeVariant === "string" ? args.themeVariant : ""
  if (mode === "system") nativeTheme.themeSource = "system"
  else if (mode === "light") nativeTheme.themeSource = "light"
  else if (mode === "dark") nativeTheme.themeSource = "dark"
  else if (variant === "light") nativeTheme.themeSource = "light"
  else if (variant === "dark") nativeTheme.themeSource = "dark"
  else nativeTheme.themeSource = "system"
  // Keep the native canvas (visible while resizing and behind the renderer)
  // on the active theme's background; an unusable colour falls back to the
  // default canvas for the variant rather than keeping the previous theme's.
  if (!browserWindow || browserWindow.isDestroyed()) return
  const backgroundColor =
    normalizeHexColor(args?.backgroundColor) ??
    (variant === "light" ? DEFAULT_BACKGROUND_LIGHT : variant === "dark" ? DEFAULT_BACKGROUND_DARK : null)
  if (backgroundColor) browserWindow.setBackgroundColor(backgroundColor)
}

// ── New command handlers (origin guard defined above) ─────────────────────────

// File / app ops (local-only)
handleCommand("desktop_open_path", async (args) => {
  const targetPath = typeof args.path === "string" ? args.path.trim() : ""
  const appName = typeof args.app === "string" ? args.app.trim() : ""
  if (!targetPath) throw new Error("Path is required")
  if (process.platform === "darwin") {
    if (appName) {
      await runOpenSpecChain([{ program: "open", args: ["-a", appName, targetPath] }], appName)
      return null
    }
    assertShellOpenPathSucceeded(await shell.openPath(targetPath))
    return null
  }
  if (process.platform === "win32" && appName) {
    // The name is the app the caller asked for: the default handler opened the path with whatever
    // owns it (Explorer for a folder) and answered success, so the renderer that fell back here
    // after `desktop_open_in_app` failed stopped offering the choice it was given.
    await runSpecChain(buildWindowsOpenProjectSpecs({ projectPath: targetPath, appId: "", appName }), appName)
    return null
  }
  assertShellOpenPathSucceeded(await shell.openPath(targetPath))
  return null
})

handleCommand("desktop_reveal_path", async (args) => {
  const targetPath = typeof args.path === "string" ? args.path.trim() : ""
  if (!targetPath) throw new Error("Path is required")
  shell.showItemInFolder(targetPath)
  return null
})

handleCommand("desktop_open_wiki_viewer", (args) => wikiViewer.open(args.directory))

handleCommand("desktop_open_external_url", async (args) => {
  const target = typeof args.url === "string" ? args.url.trim() : ""
  if (!target) throw new Error("URL is required")
  const normalized = normalizeSafeExternalUrl(target)
  if (!normalized) throw new Error("Only safe external URLs can be opened externally")
  await shell.openExternal(normalized)
  return null
})

handleCommand("desktop_open_in_app", async (args) => {
  const projectPath = typeof args.projectPath === "string" ? args.projectPath.trim() : ""
  const appId = typeof args.appId === "string" ? args.appId.trim().toLowerCase() : ""
  const appName = typeof args.appName === "string" ? args.appName.trim() : ""
  if (!projectPath || !appId || !appName) {
    throw new Error("Project path, app id, and app name are required")
  }
  if (process.platform === "win32") {
    if (appId === "finder") {
      const error = await shell.openPath(projectPath)
      if (error) throw new Error(error)
      return null
    }
    await runSpecChain(buildWindowsOpenProjectSpecs({ projectPath, appId, appName }), appName)
    return null
  }
  if (process.platform !== "darwin") {
    throw new Error("desktop_open_in_app is only supported on macOS and Windows")
  }
  await runSpecChain(buildOpenProjectSpecs({ projectPath, appId, appName }), appName)
  return null
})

handleCommand("desktop_open_file_in_app", async (args) => {
  const filePath = typeof args.filePath === "string" ? args.filePath.trim() : ""
  const appId = typeof args.appId === "string" ? args.appId.trim().toLowerCase() : ""
  const appName = typeof args.appName === "string" ? args.appName.trim() : ""
  if (!filePath || !appId || !appName) {
    throw new Error("File path, app id, and app name are required")
  }
  if (process.platform === "win32") {
    if (appId === "finder") {
      shell.showItemInFolder(filePath)
      return null
    }
    await runSpecChain(buildWindowsOpenFileSpecs({ filePath, appId, appName }), appName)
    return null
  }
  if (process.platform !== "darwin") {
    throw new Error("desktop_open_file_in_app is only supported on macOS and Windows")
  }
  await runSpecChain(buildOpenFileSpecs({ filePath, appId, appName }), appName)
  return null
})

// One installed-apps refresh at a time across all windows and requests.
let installedAppsRefreshInFlight = null

handleCommand("desktop_get_installed_apps", async (args) => {
  const cachePath = buildInstalledAppsCachePath()
  const now = Math.floor(Date.now() / 1000)
  let cache = null
  try {
    cache = JSON.parse(await fsp.readFile(cachePath, "utf8"))
  } catch {}
  const cacheState = normalizeInstalledAppsCache(cache, now, INSTALLED_APPS_CACHE_TTL_SECS)
  // macOS / Windows only: Linux does not enumerate installed apps yet. Return
  // an empty cache so the UI degrades cleanly instead of throwing over IPC.
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return { apps: [], hasCache: true, isCacheStale: false }
  }
  const refresh = createInstalledAppsRefresher({
    build: () =>
      process.platform === "win32"
        ? buildWindowsInstalledApps(args.apps)
        : buildInstalledApps(Array.isArray(args.apps) ? args.apps : []),
    writeCache: async (apps) => {
      // Atomic, like every other persisted JSON here: a reader must never see a partial file.
      await writeJsonFile(cachePath, { updatedAt: now, apps })
      emitToAllWindows("openchamber:installed-apps-updated", apps)
    },
  })
  if (!cacheState.hasCache || cacheState.isCacheStale || args.force === true) {
    // The single-flight lives at module scope, not per request: per-request
    // refreshers scanned independently and the slower, older one wrote the
    // cache last with its stale list.
    if (!installedAppsRefreshInFlight) {
      installedAppsRefreshInFlight = refresh().finally(() => {
        installedAppsRefreshInFlight = null
      })
    }
    void installedAppsRefreshInFlight.catch((error) => {
      console.warn("[electron] failed to refresh installed apps cache", error)
    })
  }
  return cacheState
})

handleCommand("desktop_filter_installed_apps", async (args) => {
  if (process.platform === "win32") {
    return (await buildWindowsInstalledApps(args.apps)).map((a) => a.name)
  }
  if (process.platform !== "darwin") {
    // Linux and other platforms: no installed-app enumeration yet.
    return []
  }
  if (!Array.isArray(args.apps)) return []
  const results = await Promise.all(
    args.apps.map(async (appName) => ((await isAppBundleInstalled(String(appName))) ? String(appName) : null)),
  )
  return results.filter(Boolean)
})

handleCommand("desktop_fetch_app_icons", async (args) => {
  if (process.platform === "win32") {
    const names = Array.isArray(args.apps) ? args.apps : []
    const results = []
    for (const name of names) {
      const appName = String(name || "").trim()
      if (!appName) continue
      const appId = getWindowsAppIdForName(appName)
      const dataUrl =
        appId === "terminal"
          ? imageFileToDataUrl(resolveWindowsTerminalIconPath()) ||
            (await windowsIconToDataUrl(resolveWindowsAppIconExecutable({ appId, appName })))
          : await windowsIconToDataUrl(resolveWindowsAppIconExecutable({ appId, appName }))
      if (dataUrl) results.push({ app: appName, dataUrl })
    }
    return results
  }
  if (process.platform !== "darwin") {
    // Linux and other platforms: no app-icon extraction yet.
    return []
  }
  const names = (Array.isArray(args.apps) ? args.apps : []).map(String)
  const icons = await mapWithConcurrency(names, APP_LOOKUP_CONCURRENCY, async (name) => {
    const appPath = await resolveAppBundlePath(name)
    if (!appPath) return null
    const dataUrl = await iconToDataUrl(await resolveAppIconPath(appPath), name)
    return dataUrl ? { app: name, dataUrl } : null
  })
  return icons.filter(Boolean)
})

handleCommand("desktop_read_file", async (args) => {
  const rawPath = typeof args.path === "string" ? args.path : ""
  if (!rawPath) throw new Error("Path is required")
  // Defense in depth behind the IPC origin gate: resolve the path, require it
  // under $HOME or tmpdir, and refuse known secret dirs / dotfiles.
  const filePath = path.resolve(rawPath)
  // Resolve symlinks so a symlink inside $HOME pointing to /etc/shadow or
  // ~/.ssh/id_rsa can't bypass the allowlist / DENIED_SEGMENTS check.
  let realPath
  try {
    realPath = await fsp.realpath(filePath)
  } catch {
    throw new Error("Cannot resolve file path")
  }
  assertDesktopReadFileAllowed(realPath)
  const handle = await fsp.open(realPath, "r")
  let bytes
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error("Path is not a file")
    if (stats.size > 50 * 1024 * 1024) throw new Error("File is too large. Maximum size is 50MB.")
    bytes = await handle.readFile()
  } finally {
    await handle.close()
  }
  // Classify by the resolved target we actually read, not the (possibly
  // symlinked) requested path — otherwise the mime can mislabel the bytes.
  const ext = path.extname(realPath).toLowerCase()
  const mime =
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".js": "text/javascript",
      ".ts": "text/typescript",
      ".tsx": "text/typescript-jsx",
      ".jsx": "text/javascript-jsx",
      ".html": "text/html",
      ".css": "text/css",
      ".py": "text/x-python",
    }[ext] || "application/octet-stream"
  return { mime, base64: bytes.toString("base64"), size: bytes.length }
})

handleCommand("desktop_save_markdown_file", async (args, event) => {
  const defaultPath = typeof args.defaultFileName === "string" ? args.defaultFileName.trim() : ""
  if (!defaultPath) throw new Error("Default file name is required")
  const content = typeof args.content === "string" ? args.content : ""
  const ownerWindow = event ? BrowserWindow.fromWebContents(event.sender) : undefined
  const result = await localizedDialog.showSaveDialog(ownerWindow || undefined, {
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  })
  if (result.canceled || !result.filePath) return null
  await fsp.writeFile(result.filePath, content, "utf8")
  return result.filePath
})

// desktop_search_files: upstream main.mjs has no such handler; implement a
// minimal recursive name search under an allowed root (HOME/tmp) so the
// renderer contract is satisfied.
// Matches the renderer contract in packages/ui/src/lib/desktop.ts:
//   args:   { directory, query, options?: { limit, includeHidden, respectGitignore } }
//   return: NativeFileSearchResult[] = { name, path, relativePath, extension? }
// Searches the given (user-opened) project directory directly — no HOME/tmp
// restriction, matching the previous Tauri desktop_search_files behaviour.
// respectGitignore is honoured best-effort via the SKIP_DIRS denylist; the
// renderer falls back to the gitignore-aware HTTP search when this returns null.
handleCommand("desktop_search_files", async (args) => {
  const root = typeof args.directory === "string" ? args.directory.trim() : ""
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : ""
  if (!root || !path.isAbsolute(root)) throw new Error("An absolute directory is required")
  if (!query) return []
  const options = args.options && typeof args.options === "object" ? args.options : {}
  const includeHidden = options.includeHidden === true
  const resultType = options.type === "directory" ? "directory" : "file"
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.min(Math.floor(options.limit), 1000) : 200
  const resolvedRoot = path.resolve(root)
  // The renderer names this root, so it is not necessarily the project it searched before: resolve
  // its symlinks and refuse one the read path would deny rather than enumerating a credential store
  // a link points at. The walk keeps the path as it was given, so the results stay where the
  // renderer expects them.
  const searchableRoot = await resolveSearchableNativeRoot(resolvedRoot, { realpath: (value) => fsp.realpath(value) })
  if (!searchableRoot) return []
  try {
    if (!(await fsp.stat(resolvedRoot)).isDirectory()) return []
  } catch {
    return []
  }
  return collectNativeSearchResults({
    root: resolvedRoot,
    query,
    includeHidden,
    resultType,
    limit,
    fs: fsp,
  })
})

handleCommand("desktop_clear_cache", async () => {
  await clearCacheAndReload()
  return null
})

handleCommand("desktop_notify", async (args) => {
  return maybeShowNativeNotification(args)
})

// Window-rect screen capture is a local desktop capability. Remote hosts must
// not be able to capture pixels from the user's Electron window.
handleCommand(
  "desktop_capture_page_rect",
  async (args, event) => {
    const browserWindow = event ? BrowserWindow.fromWebContents(event.sender) : mainWindow
    if (!browserWindow || browserWindow.isDestroyed()) throw new Error("Window is not available")
    // The renderer reports CSS pixels from getBoundingClientRect(), but capturePage() and
    // getContentBounds() use DIPs. Scale by the window zoom factor, or a zoomed window
    // captures a region offset and scaled from the one the renderer asked for.
    const zoom = typeof event?.sender?.getZoomFactor === "function" ? event.sender.getZoomFactor() : 1
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    const bounds = browserWindow.getContentBounds()
    const x = Number.isFinite(args.x) ? Math.max(0, Math.floor(args.x * scale)) : 0
    const y = Number.isFinite(args.y) ? Math.max(0, Math.floor(args.y * scale)) : 0
    const width = Number.isFinite(args.width) ? Math.max(1, Math.floor(args.width * scale)) : 1
    const height = Number.isFinite(args.height) ? Math.max(1, Math.floor(args.height * scale)) : 1
    const clampedX = Math.min(x, Math.max(0, bounds.width - 1))
    const clampedY = Math.min(y, Math.max(0, bounds.height - 1))
    const rect = {
      x: clampedX,
      y: clampedY,
      width: Math.min(width, Math.max(1, bounds.width - clampedX)),
      height: Math.min(height, Math.max(1, bounds.height - clampedY)),
    }
    if (rect.width * rect.height > MAX_CAPTURE_PAGE_RECT_AREA) throw new Error("Capture area is too large")
    const image = await browserWindow.webContents.capturePage(rect)
    const buffer = image.toJPEG(82)
    return {
      mime: "image/jpeg",
      base64: buffer.toString("base64"),
      width: image.getSize().width,
      height: image.getSize().height,
    }
  },
  { safeForRemote: false },
)

handleCommand("desktop_browser_capture_page", async (args, event) => {
  const wcId = Number.isFinite(args.webContentsId) ? Math.trunc(args.webContentsId) : null
  if (wcId === null || wcId < 0) throw new Error("webContentsId is required")
  const wc = webContents.fromId(wcId)
  if (!wc || wc.isDestroyed()) throw new Error("WebContents not found")
  if (!isDesktopBrowserCaptureTargetForSender(wc, event.sender)) {
    throw new Error("WebContents is not available for this window")
  }
  const image = await wc.capturePage()
  const buffer = image.toJPEG(82)
  return {
    mime: "image/jpeg",
    base64: buffer.toString("base64"),
    width: image.getSize().width,
    height: image.getSize().height,
  }
})

// Host switching remains in the IPC contract for compatibility, but only the
// current local instance is exposed and accepted.
handleCommand("desktop_hosts_get", async () => localOnlyHostConfig())

handleCommand("desktop_hosts_set", async (args) => {
  const input = args.input || args.config || {}
  if (!isLocalOnlyDesktopHostsConfigInput(input)) return remoteAccessDisabled()
  // Compatibility no-op: older local onboarding code records the local host
  // choice through this command. No remote host data is accepted or persisted.
  return null
})

handleCommand("desktop_host_probe", async (args) => {
  const targetUrl = String(args.url || "")
  if (!isAllowedDesktopHostTargetUrl(targetUrl, { localOrigin: localOriginUrl(), hosts: [] })) {
    return remoteAccessDisabled()
  }
  return probeHostWithTimeout(targetUrl, 2_000, "")
})

// Window / UI
handleCommand(
  "desktop_set_window_theme",
  async (args, event) => {
    const browserWindow = event ? BrowserWindow.fromWebContents(event.sender) : getMenuTargetWindow()
    applyWindowTheme(browserWindow, args)
    return null
  },
  { safeForRemote: true },
)

handleCommand("desktop_set_vibrancy", async (args) => {
  // Vibrancy is a window-creation option; persist the preference and relaunch.
  const enabled = args.enabled === true
  await mutateSettingsRoot((root) => {
    root.desktopVibrancy = enabled
  })
  setImmediate(() => {
    shutdownForExit()
      .then(() => {
        app.relaunch()
        app.exit(0)
      })
      .catch(console.error)
  })
  return { enabled, requiresRestart: true }
})

handleCommand("desktop_new_window", async () => {
  await handleNewWindow()
  return null
})

handleCommand("desktop_new_window_at_url", async (args) => {
  const targetUrl = normalizeHostUrl(String(args.url || ""))
  if (!targetUrl) throw new Error("Invalid URL")
  if (!isAllowedDesktopHostTargetUrl(targetUrl, { localOrigin: localOriginUrl(), hosts: [] })) {
    return remoteAccessDisabled()
  }
  await createAdditionalWindow(targetUrl)
  return null
})

// SSH-to-AX-Code commands fail closed, even if invoked outside the hidden UI.
handleCommand("desktop_ssh_instances_get", async () => ({ instances: [] }))
handleCommand("desktop_ssh_instances_set", async () => remoteAccessDisabled())
handleCommand("desktop_ssh_import_hosts", async () => remoteAccessDisabled())
handleCommand("desktop_ssh_connect", async () => remoteAccessDisabled())
handleCommand("desktop_ssh_disconnect", async () => remoteAccessDisabled())
handleCommand("desktop_ssh_status", async () => ({}))
handleCommand("desktop_ssh_logs", async () => [])
handleCommand("desktop_ssh_logs_clear", async () => remoteAccessDisabled())

// ── Window controls, app menu & mini-chat windows ──────────────────────────
const senderWindow = (event) => (event ? BrowserWindow.fromWebContents(event.sender) : null)

// Mini-chat is a small companion window that loads the dedicated mini-chat.html
// entry; the renderer (ElectronMiniChatApp) reads mode/sessionId/directory/
// projectId from the URL query string.
const sessionMiniChatWindows = new Map()

const createMiniChatWindow = async ({ mode, sessionId, directory, projectId }) => {
  applyRendererApiOrigin()
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 420,
    title: "AX Code",
    ...appWindowChromeOptions(),
    show: false,
    webPreferences: rendererWebPreferences(),
  })
  if (mode === "session" && sessionId && directory) {
    sessionMiniChatWindows.set(win, { sessionId, directory })
    emitToAllWindows("openchamber:session-windows-changed", {})
    win.once("closed", () => {
      sessionMiniChatWindows.delete(win)
      emitToAllWindows("openchamber:session-windows-changed", {})
    })
  }
  attachDesktopBrowserWebviewPolicy(win.webContents)
  attachAppWindowChrome(win)
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    // A window.open child inherits this window's privileged preload without the
    // navigation guards attached below, so no target gets its own window.
    if (!isTrustedRendererNavigation(targetUrl)) {
      safeOpenExternal(targetUrl)
    }
    return { action: "deny" }
  })
  attachRendererNavigationGuards(win.webContents, {
    isTrustedUrl: isTrustedRendererNavigation,
    onBlocked: safeOpenExternal,
  })
  const params = new URLSearchParams()
  params.set("mode", mode === "session" ? "session" : "draft")
  if (sessionId) params.set("sessionId", sessionId)
  if (directory) params.set("directory", directory)
  if (projectId) params.set("projectId", projectId)
  const base = localRendererOrigin()
  try {
    await loadUrlWithTimeout(win, `${base}/mini-chat.html?${params.toString()}`, { timeoutMs: WINDOW_LOAD_TIMEOUT_MS })
  } catch (error) {
    // Never leave a hidden show:false window behind a wedged load.
    win.destroy()
    throw error
  }
  return win
}

handleCommand("desktop_list_session_mini_chat_windows", async () =>
  [...sessionMiniChatWindows.entries()].filter(([win]) => !win.isDestroyed()).map(([, target]) => target),
)

handleCommand("desktop_open_session_mini_chat_window", async (args) => {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : ""
  if (!sessionId) throw new Error("Session id is required")
  const directory = typeof args.directory === "string" ? args.directory.trim() : ""
  await createMiniChatWindow({ mode: "session", sessionId, directory })
  return null
})

handleCommand("desktop_open_draft_mini_chat_window", async (args) => {
  const directory = typeof args.directory === "string" ? args.directory.trim() : ""
  const projectId = typeof args.projectId === "string" ? args.projectId.trim() : ""
  await createMiniChatWindow({ mode: "draft", directory, projectId })
  return null
})

// Mission Control in its own window (SPEC-2026-10-19-supervision-popout-v1).
const supervisionWindow = createSupervisionWindowController({
  BrowserWindow,
  webPreferences: rendererWebPreferences,
  chromeOptions: appWindowChromeOptions,
  attachChrome: attachAppWindowChrome,
  attachWebviewPolicy: attachDesktopBrowserWebviewPolicy,
  attachNavigationGuards: attachRendererNavigationGuards,
  isTrustedUrl: isTrustedRendererNavigation,
  openExternal: safeOpenExternal,
  loadUrlWithTimeout,
  getOrigin: localRendererOrigin,
  timeoutMs: WINDOW_LOAD_TIMEOUT_MS,
  beforeCreate: applyRendererApiOrigin,
})

handleCommand("desktop_open_supervision_window", async () => {
  await supervisionWindow.open()
  return null
})

handleCommand("desktop_set_window_pinned", async (args, event) => {
  const win = senderWindow(event)
  const pinned = Boolean(args && args.pinned === true)
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(pinned, "floating")
    if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(pinned)
    win.__ocPinned = pinned
  }
  return { pinned }
})

handleCommand("desktop_get_window_pinned", async (_args, event) => {
  const win = senderWindow(event)
  return { pinned: Boolean(win && win.__ocPinned) }
})

handleCommand("desktop_focus_main_window", async (args) => {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : ""
  const directory = typeof args.directory === "string" ? args.directory.trim() : ""
  const mode = typeof args.mode === "string" ? args.mode.trim() : ""
  const projectId = typeof args.projectId === "string" ? args.projectId.trim() : ""

  const emitOpen = () => {
    // Target the main window only — broadcasting would also hit the mini-chat
    // that requested the hand-off.
    if (sessionId) emitToWindow(mainWindow, "openchamber:open-session", { sessionId, directory })
    else if (mode === "draft") emitToWindow(mainWindow, "openchamber:open-draft-session", { directory, projectId })
  }

  const hadWindow = Boolean(mainWindow && !mainWindow.isDestroyed())
  if (!hadWindow) {
    try {
      await createWindow()
    } catch {
      // Fall through with no window: the UNAVAILABLE branch below reports
      // { focused: false } so the caller keeps its own window instead of
      // crashing on an unhandled IPC rejection.
    }
  }
  const action = resolveFocusMainWindowAction({
    hasUsableWindow: Boolean(mainWindow && !mainWindow.isDestroyed()),
    rendererReady: rendererReadyForOpenProject,
  })
  if (action === FOCUS_MAIN_WINDOW_ACTION.UNAVAILABLE) {
    // Nothing can deliver the hand-off (the window failed to open) and nothing is
    // queued for it: report failure so the caller keeps its own window instead of
    // closing onto an empty hand-off.
    return { focused: false }
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()

  if (action === FOCUS_MAIN_WINDOW_ACTION.DELIVER) {
    emitOpen()
  } else {
    // A renderer that has not signalled 'ax-code:renderer-app-ready' is not
    // listening: a freshly created window, one that is reloading, or one that was
    // reloaded after a server restart (loadURL resolves only after
    // 'did-finish-load', so a listener attached here would never run). Queue the
    // hand-off and let that signal flush it, the same path external open-project
    // requests take.
    pendingFocusOpens.push({ sessionId, directory, mode, projectId })
    flushPendingFocusOpen()
  }
  return { focused: true }
})

handleCommand(
  "desktop_close_current_window",
  async (_args, event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) win.close()
    return null
  },
  { safeForRemote: true },
)

handleCommand(
  "desktop_minimize_current_window",
  async (_args, event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) win.minimize()
    return null
  },
  { safeForRemote: true },
)

handleCommand(
  "desktop_toggle_current_window_maximized",
  async (_args, event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return { maximized: win.isMaximized() }
    }
    return { maximized: false }
  },
  { safeForRemote: true },
)

handleCommand(
  "desktop_get_current_window_state",
  async (_args, event) => {
    const win = senderWindow(event)
    return { maximized: Boolean(win && !win.isDestroyed() && win.isMaximized()) }
  },
  { safeForRemote: true },
)

handleCommand("desktop_show_app_menu", async (args, event) => {
  const win = senderWindow(event)
  if (!win || win.isDestroyed()) return null
  const menu = Menu.getApplicationMenu()
  if (!menu) return null
  const x = Number.isFinite(Number(args.x)) ? Math.max(0, Math.round(Number(args.x))) : undefined
  const y = Number.isFinite(Number(args.y)) ? Math.max(0, Math.round(Number(args.y))) : undefined
  menu.popup({ window: win, x, y })
  return null
})

handleCommand(
  "desktop_is_window_fullscreen",
  async (_args, event) => {
    const win = senderWindow(event)
    return Boolean(win && !win.isDestroyed() && win.isFullScreen())
  },
  { safeForRemote: true },
)

handleCommand(
  "desktop_set_window_title",
  async (args, event) => {
    const win = senderWindow(event)
    const title = sanitizeDesktopWindowTitle(args.title)
    if (win && !win.isDestroyed() && title) win.setTitle(title)
    return null
  },
  { safeForRemote: true },
)

handleCommand("desktop_get_app_version", async () => app.getVersion(), { safeForRemote: true })

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock || isQuitting) {
    return
  }

  recordStartupEvent("electron.app.ready")
  if (app.isPackaged) {
    protocol.handle(
      PACKAGED_RENDERER_SCHEME,
      createPackagedRendererProtocolHandler({
        webDistPath: getWebDistPath(),
        getApiOrigin: () => buildRendererApiOrigin(serverPort),
        // S2.4a (SPEC §2 D2/D3): runtime-shaped prefixes are proxied straight
        // to the ax-code runtime with the per-boot Basic credential injected
        // here in main. The renderer never holds the credential; never log
        // or persist this header value. A null origin = runtime unavailable
        // (503); `exhausted` distinguishes "permanently down" from
        // "still restarting" for that 503 payload.
        getRuntimeUpstream: () => {
          if (!runtimeOrigin) {
            return { origin: null, authorization: "", exhausted: runtimeRetryExhausted }
          }
          const credentials = Buffer.from(`ax-code:${getRuntimeAuthPassword()}`).toString("base64")
          return { origin: runtimeOrigin, authorization: `Basic ${credentials}`, exhausted: runtimeRetryExhausted }
        },
        fetchImpl: (url, init) => electronNet.fetch(url, init),
        readFile: (filePath) => fsp.readFile(filePath),
      }),
    )
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!isPackagedRendererUrl(details.url)) {
        callback({})
        return
      }
      const responseHeaders = { ...(details.responseHeaders || {}) }
      // A response may already carry a policy this one must not erase: the preview proxy
      // serves external pages with a `sandbox` directive that keeps them off the app
      // origin. CSP policies combine (the most restrictive wins per directive), so append
      // instead of replacing.
      const existingKey = Object.keys(responseHeaders).find((key) => key.toLowerCase() === "content-security-policy")
      const existing = existingKey ? responseHeaders[existingKey] : []
      const existingValues = (Array.isArray(existing) ? existing : [existing]).filter(
        (value) => typeof value === "string" && value.length > 0,
      )
      const appended = resolvePackagedResponseCsp(details.url, existingValues)
      if (!appended) {
        callback({})
        return
      }
      responseHeaders[existingKey ?? "Content-Security-Policy"] = [...existingValues, appended]
      callback({ responseHeaders })
    })
  }

  nativeTheme.themeSource = "system"
  setupApplicationMenu()
  setupTray()
  // Deny all permission requests except clipboard and fullscreen.
  // Chromium enumerates media devices on startup, which triggers macOS
  // permission prompts for device and media libraries, none of which this
  // app needs.
  const ALLOWED_PERMISSIONS = new Set(["fullscreen", "clipboard-read", "clipboard-sanitized-write"])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))

  // The embedded browser uses a separate persistent session. Electron grants
  // permissions by default when a session has no handler, so remote pages
  // must receive their own deny-by-default policy rather than inheriting an
  // assumption from defaultSession.
  const browserSession = session.fromPartition(DESKTOP_BROWSER_WEBVIEW_PARTITION)
  const WEBVIEW_ALLOWED_PERMISSIONS = new Set(["fullscreen"])
  browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(WEBVIEW_ALLOWED_PERMISSIONS.has(permission))
  })
  browserSession.setPermissionCheckHandler((_webContents, permission) => WEBVIEW_ALLOWED_PERMISSIONS.has(permission))

  try {
    // Hash the staged runtime off the main thread while the shell and opening
    // artwork come up. The result is awaited below, before anything can execute
    // the bundled runtime (the supervisor's prepare() runs `--version` on it) or
    // fork the web server, so a modified tree still fails closed before use.
    const bundledIntegrityCheck = verifyBundledAxCodeIntegrityAsync({
      platform: process.platform,
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
    })
    // The rejection is surfaced where it is awaited; this only keeps an early
    // failure from being reported as unhandled while the shell is created.
    bundledIntegrityCheck.catch(() => {})
    // The mini-chat and secondary windows never host the artwork. Only a
    // visible main window does, so a hidden or minimized app skips it.
    createMainWindowShell()
    launchAnimations = createLaunchAnimationController({
      WebContentsView,
      getHostWindow: () =>
        mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()
          ? mainWindow
          : null,
      ipcMain,
      manifest: launchAnimationManifest,
      assetDir: path.join(__dirname, "launch-animations"),
      preloadPath: path.join(__dirname, "launch-animation-preload.js"),
      preferencesReader: animationPreferences,
      disable: () => setLaunchAnimationsEnabled(false),
      translate: nativeT,
      onComplete: (result) =>
        recordStartupEvent(`animation.${result.kind}.complete`, {
          pair: result.pair,
          reason: result.reason,
          frames: result.frames,
        }),
    })
    // Show the shell now so the opening plays in the main window while the
    // server and renderer start behind it. Without animations the window stays
    // hidden until the renderer is ready, as before.
    if (launchAnimations.enabled()) mainWindow.show()
    openingAnimation = launchAnimations.playOpening()
    // Settle integrity before anything else touches persistent state or the
    // runtime, so a tampered tree still fails before any side effect.
    const bundledIntegrity = await bundledIntegrityCheck
    if (bundledIntegrity.status === "verified") {
      console.log(`[electron] verified bundled ax-code runtime integrity (${bundledIntegrity.entries} entries)`)
      recordStartupEvent("runtime.integrity.verified", { entries: bundledIntegrity.entries })
    }
    if (isQuitting) return
    await purgeDisabledRemoteAccessSettings().catch((error) => {
      // Runtime paths already ignore these values, so a read-only legacy
      // settings file must not prevent the local app from starting.
      console.warn("[electron] failed to purge disabled remote settings", error)
    })
    if (isQuitting) return
    // S2.5b: main spawns and supervises the ax-code runtime by default, IN
    // PARALLEL with the web server. prepare() resolves the binary and
    // reserves the fixed loopback port up front, so the web fork env (see
    // spawnServerProcess) ALWAYS carries AX_CODE_HOST/AX_CODE_PORT in this
    // mode — that is what keeps the web lifecycle in external mode and
    // guarantees it never managed-spawns a second runtime, even though the
    // runtime is typically not healthy yet when the web boots. The FSM boot
    // then runs concurrently with launchServer(): the renderer loads
    // immediately and runtime-target requests are gated by the app://
    // protocol handler from the supervisor's onOriginChange updates (503
    // {restarting:true} while booting/restarting, {restarting:false} once
    // exhausted). A runtime boot failure therefore surfaces through the FSM
    // exhaustion dialog (showRuntimeRecoveryFailure), not the
    // startup-failure path — only a prepare() failure (no usable binary, a
    // configuration error) still fails startup here.
    const loginShellEnv = await loginShellEnvCapture.promise
    if (isQuitting) return
    loginShellEnvEncoded = resolveForwardedLoginShellEnv(loginShellEnv)
    recordStartupEvent("login-shell-env.captured", { forwarded: loginShellEnvEncoded !== null })
    runtimeSearchEnv = runtimeExecutionEnv(process.env, loginShellEnv)
    if (isMainSupervisedRuntimeEnabled()) {
      recordStartupEvent("runtime.supervision.start", {}, { once: false })
      runtimeSupervision = createAxCodeRuntimeSupervision({
        env: desktopBrowserRuntimeEnv(
          applyBundledAxCodeEnv(runtimeSearchEnv, bundledAxCodeEnv),
          DESKTOP_BROWSER_TOKEN,
        ),
        settingsReader: readSettingsRoot,
        logger: console,
        onOriginChange: (origin, context = {}) => {
          desktopWebMcpBrowser.runtimeChanged()
          runtimeOrigin = typeof origin === "string" && origin ? origin : null
          runtimeRetryExhausted = context.exhausted === true
          if (origin) {
            recordStartupEvent("runtime.supervision.ready", { port: runtimeSupervision?.port }, { once: false })
          }
          if (context.exhausted === true) {
            showRuntimeRecoveryFailure(context.diagnostics || {})
          }
        },
      })
      // A missing runtime is user-recoverable: offer to pick an installed CLI
      // (saved as settings.axCodeBinary) and re-resolve instead of exiting.
      let runtimePort
      for (;;) {
        try {
          ;({ port: runtimePort } = await runtimeSupervision.prepare())
          break
        } catch (error) {
          if (error?.code !== RUNTIME_NOT_FOUND_CODE) throw error
          recordStartupEvent("runtime.supervision.binary-missing", {}, { once: false })
          const outcome = await recoverFromMissingRuntime({
            dialog: localizedDialog,
            openExternal: (url) => shell.openExternal(url),
            installDocsUrl: AX_CODE_INSTALL_DOCS_URL,
            isExecutable: defaultIsExecutable,
            saveBinaryPath: (binaryPath) => mutateSettingsRoot((root) => ({ ...root, axCodeBinary: binaryPath })),
          })
          if (outcome === "quit") {
            await shutdownForExit()
            app.exit(0)
            return
          }
        }
      }
      recordStartupEvent("runtime.supervision.prepared", { port: runtimePort }, { once: false })
      if (isQuitting) return
      runtimeSupervision.start().catch((error) => {
        // A restart() cancels the in-flight initial start on purpose; that is
        // not a boot failure, and the new start reports its own outcome.
        if (error?.code === RUNTIME_START_CANCELLED_CODE) return
        // A quitting app stops the FSM before readiness, which rejects
        // start() — that is normal shutdown, not a boot failure.
        if (isQuitting) return
        // The FSM deliberately leaves initial-start retries to the caller
        // (the crash budget only covers restarts of a once-healthy runtime).
        // With parallel boot there is no startup gate to fail, so surface
        // the same terminal state as FSM exhaustion: the origin stays null,
        // the protocol handler flips to {restarting:false}, and the manual
        // escape is the desktop_restart IPC (full app restart).
        console.error("[electron] ax-code runtime failed to start:", error)
        runtimeOrigin = null
        runtimeRetryExhausted = true
        showRuntimeRecoveryFailure({
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
    if (isQuitting) {
      await stopBackgroundServices()
      return
    }
    await launchServer()
    if (isQuitting) {
      await stopBackgroundServices()
      return
    }
    await createWindow()
    syncQuickDispatchGlobalShortcutFromSettings(readSettingsRoot())
    desktopStartupComplete = true
    // Best-effort update check — failures must not crash the app. With
    // autoDownload disabled, the in-app dialog (driven by the renderer's
    // periodic check) handles surfacing and downloading; checkForUpdates just
    // warms the cache here. Release smoke runs before updater metadata is
    // uploaded to the draft release, so it opts out with this environment flag.
    if (shouldCheckForUpdatesOnStartup()) {
      ensureDesktopUpdateFeed()
        .then(() => autoUpdater.checkForUpdates())
        .catch(() => {})
    }

    // Notify renderer on OS wake-from-sleep so the SSE event pipeline can
    // reconnect immediately instead of waiting for the heartbeat watchdog.
    powerMonitor.on("resume", () => {
      emitToAllWindows("openchamber:system-resume", { timestamp: Date.now() })
    })
  } catch (err) {
    launchAnimations?.dispose()
    // Startup failed before the renderer loaded; do not leave the shell open.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
    mainWindow = null
    if (isQuitting) {
      await stopBackgroundServices()
      return
    }
    console.error("[electron] startup failed:", err)
    localizedDialog.showErrorBox(
      "AX Code failed to start",
      `${nativeT("The application could not start.")}\n\n${err instanceof Error ? err.message : String(err)}\n\n${nativeT("Check the application logs for details.")}`,
    )
    // app.exit() does not fire 'before-quit', so stop the server process
    // (and any ax-code child it spawned, or the main-supervised runtime under
    // S2.5) here to avoid orphaning it when the server booted but window
    // creation failed.
    await stopBackgroundServices()
    app.exit(1)
  }
})

app.on("window-all-closed", () => {
  // On macOS, keep the server running so the user can reopen from the dock.
  if (isQuitting || !desktopStartupComplete) return
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (!isQuitting && !mainWindow && serverPort > 0) {
    createWindow().catch(console.error)
  }
})

app.on("will-quit", () => {
  releaseQuickDispatchGlobalShortcut()
})

app.on("before-quit", (event) => {
  // Hold every normal quit request while ending playback and service cleanup
  // run concurrently. Explicit restart paths already set isQuitting and bypass
  // artwork. Only the coordinator's final quit may pass its waiting guard.
  if (isQuitting && quitCoordinator.state === "idle") {
    const cleanup = shutdownCleanupPromise
    if (cleanup) {
      // shutdownForExit is still stopping the background services (the runtime
      // child among them): exiting now would strand it. Re-quit once it settles.
      event.preventDefault()
      void cleanup.then(() => app.quit()).catch(() => {})
      return
    }
    return
  }
  void quitCoordinator.handle(event)
})
