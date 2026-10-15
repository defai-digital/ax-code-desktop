import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process"
import nodeFs from "node:fs"
import nodeOs from "node:os"
import nodePath from "node:path"
import { compareVersions } from "./version-compat.js"

// ── Standalone AX Code CLI/TUI ──────────────────────────────────────────────
// Packaged Desktop runs its own pinned runtime, which only an app update
// replaces. Users usually also have the CLI/TUI installed on their own (curl
// installer or Homebrew). This module finds that install, asks it whether it
// is current (`ax-code upgrade check --json`), and asks it to upgrade itself
// (`ax-code upgrade --method <method>`). Desktop never downloads or replaces
// the CLI itself: the CLI owns its installer and its version resolution.
//
// Trust: these routes sit behind the same request-security gate as the
// existing `/api/ax-code/upgrade` (loopback origins only, UI password when
// one is set). The upgrade runs the binary the user's own shell resolves,
// and the UI shows that absolute path before and after.

const CHECK_TIMEOUT_MS = 60_000
const VERSION_TIMEOUT_MS = 15_000
const UPGRADE_TIMEOUT_MS = 10 * 60_000
const STATUS_TTL_MS = 10 * 60_000
const FAILED_STATUS_TTL_MS = 30_000
const OUTPUT_TAIL_BYTES = 64 * 1024
const REAP_BACKSTOP_MS = 60_000
const KNOWN_METHODS = new Set(["curl", "brew"])
// `ax-code upgrade check` arrived in 7.19.5. Older CLIs read `check` as the
// positional upgrade target, and the brew path ignores the target and runs
// `brew upgrade`, so a status probe would upgrade them. Never pass it below.
export const MIN_CHECK_VERSION = "7.19.5"
const MIN_REFRESH_INTERVAL_MS = 5_000

// Secrets and markers the server holds that a spawned CLI must not inherit.
const SCRUBBED_ENV_KEYS = [
  "AX_CODE_SERVER_PASSWORD",
  "AX_CODE_DESKTOP_UI_PASSWORD",
  "AX_CODE_UI_PASSWORD",
  "AX_CODE_BROWSER_MODE",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ASAR",
  "BASH_XTRACEFD",
  "BASH_ENV",
  "ENV",
]

// Anything that looks like a credential goes too (UI session signing keys,
// OAuth client secrets, tokens). Homebrew's own settings stay: its GitHub
// token only raises API rate limits for the upgrade itself.
const SECRET_ENV_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|CREDENTIAL|API_KEY|AUTH)/i

export const buildCliEnv = (env, pathValue) => {
  const next = { ...env }
  for (const key of SCRUBBED_ENV_KEYS) delete next[key]
  for (const key of Object.keys(next)) {
    if (!key.startsWith("HOMEBREW_") && SECRET_ENV_PATTERN.test(key)) delete next[key]
  }
  return { ...next, PATH: pathValue, NO_COLOR: "1", AX_CODE_DISABLE_AUTOUPDATE: "1" }
}

// Strip ANSI escape and OSC sequences from CLI output.
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g
export const stripAnsi = (value) => String(value ?? "").replace(ANSI_PATTERN, "")

const trimVersion = (value) => {
  if (typeof value !== "string") return null
  const match = value.trim().match(/v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/)
  return match ? match[1] : null
}

// Parses the JSON report of `ax-code upgrade check --json`, whatever the exit
// code (1 = update available and 2 = check failed both print the report).
// Returns null when the output is not that report: older CLIs print help.
export const parseUpgradeCheckReport = (stdout) => {
  const text = stripAnsi(stdout).trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  let report
  try {
    report = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!report || typeof report !== "object" || typeof report.current !== "string") return null
  return {
    current: trimVersion(report.current),
    latest: typeof report.latest === "string" ? trimVersion(report.latest) : null,
    upToDate: typeof report.upToDate === "boolean" ? report.upToDate : null,
    method: typeof report.method === "string" ? report.method : "unknown",
    error: typeof report.error === "string" && report.error.trim() ? report.error.trim() : null,
  }
}

// The command to suggest for a terminal. An unknown method gets none: a bare
// `ax-code upgrade` there asks "Install anyways?" and runs the curl installer
// over what may be a package-manager or source install.
const manualCommandFor = (method) =>
  method === "brew" ? "brew upgrade ax-code" : method === "curl" ? "ax-code upgrade" : null

const appendTail = (buffer, chunk) => {
  const next = buffer + chunk
  return next.length > OUTPUT_TAIL_BYTES ? next.slice(next.length - OUTPUT_TAIL_BYTES) : next
}

export const createAxCodeCliInstallRuntime = (dependencies = {}) => {
  const {
    spawn = nodeSpawn,
    spawnSync = nodeSpawnSync,
    killProcess = (pid, signal) => process.kill(pid, signal),
    fs = nodeFs,
    os = nodeOs,
    path = nodePath,
    platform = process.platform,
    env = process.env,
    now = () => Date.now(),
    buildAugmentedPath = () => env.PATH || "",
    // Returns { path, source } of the binary Desktop's runtime launches.
    getRuntimeBinary = async () => null,
    onRuntimeBinaryUpgraded = async () => undefined,
    logger = console,
  } = dependencies

  const realpath = (candidate) => {
    try {
      return fs.realpathSync(candidate)
    } catch {
      return candidate
    }
  }

  const isExecutable = (candidate) => {
    try {
      const stat = fs.statSync(candidate)
      if (!stat.isFile()) return false
      if (platform === "win32") return true
      fs.accessSync(candidate, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  // Windows tries extensions in PATHEXT order, as `where` and shells do.
  const executableNames = (() => {
    if (platform !== "win32") return ["ax-code"]
    const pathExt = env.PATHEXT || env.PathExt || ".COM;.EXE;.BAT;.CMD"
    const names = pathExt
      .split(";")
      .map((ext) => ext.trim().toLowerCase())
      .filter((ext) => [".com", ".exe", ".bat", ".cmd"].includes(ext))
      .map((ext) => `ax-code${ext}`)
    return names.length ? names : ["ax-code.exe", "ax-code.cmd"]
  })()

  // The bundled launcher lives inside the app bundle; it is never the user's
  // own CLI even when a PATH entry points into the app resources.
  const isBundledLauncher = (candidate) => {
    const bundled =
      typeof env.AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY === "string"
        ? env.AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY.trim()
        : ""
    if (!bundled) return false
    const bundledReal = realpath(bundled)
    const candidateReal = realpath(candidate)
    if (candidateReal === bundledReal) return true
    const bundledRoot = path.dirname(path.dirname(bundledReal))
    return candidateReal.startsWith(bundledRoot + path.sep)
  }

  const fallbackLocations = () => {
    const home = os.homedir()
    if (platform === "win32") {
      const profile = env.USERPROFILE || home
      return [path.join(profile, ".ax-code", "bin", "ax-code.exe"), path.join(profile, ".ax-code", "bin", "ax-code.cmd")]
    }
    return [
      path.join(home, ".ax-code", "bin", "ax-code"),
      path.join(home, ".local", "bin", "ax-code"),
      "/opt/homebrew/bin/ax-code",
      "/usr/local/bin/ax-code",
    ]
  }

  // Every user-installed `ax-code`, deduplicated by real path, in the order
  // the user's shell would try them. The first PATH entry is the one a
  // terminal runs; the installers' default locations follow.
  const findStandaloneClis = () => {
    const seen = new Set()
    const found = []
    const consider = (candidate, onPath) => {
      if (platform === "win32" && /["%\r\n]/.test(candidate)) return
      if (!isExecutable(candidate) || isBundledLauncher(candidate)) return
      const key = realpath(candidate)
      if (seen.has(key)) return
      seen.add(key)
      found.push({ path: candidate, onPath })
    }
    const dirs = (buildAugmentedPath() || "").split(path.delimiter).filter(Boolean)
    for (const dir of dirs) {
      for (const name of executableNames) consider(path.join(dir, name), true)
    }
    for (const candidate of fallbackLocations()) consider(candidate, false)
    return found
  }

  const findStandaloneCli = () => findStandaloneClis()[0] || null

  const readRuntime = async () => {
    try {
      const runtime = await getRuntimeBinary()
      const runtimePath = typeof runtime === "string" ? runtime : runtime?.path
      const source = typeof runtime === "object" && typeof runtime?.source === "string" ? runtime.source : null
      if (typeof runtimePath !== "string" || !runtimePath.trim() || runtimePath.startsWith("wsl:")) {
        return { path: null, source }
      }
      return { path: runtimePath.trim(), source }
    } catch {
      return { path: null, source: null }
    }
  }

  // brew and git children outlive a plain kill, so a timeout ends the whole
  // tree: the POSIX process group, or taskkill /T on Windows.
  const killTree = (child) => {
    if (!child?.pid) return
    try {
      if (platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true })
        return
      }
      killProcess(-child.pid, "SIGKILL")
    } catch {
      try {
        child.kill("SIGKILL")
      } catch {
        /* already gone */
      }
    }
  }

  // Runs the CLI with stdin closed so nothing can wait on a prompt, draining
  // both pipes into capped tails. A .cmd launcher on Windows goes through the
  // command interpreter.
  const runCli = (cliPath, args, timeoutMs) =>
    new Promise((resolve) => {
      let command = cliPath
      let commandArgs = args
      let windowsVerbatimArguments = false
      if (platform === "win32" && /\.(cmd|bat)$/i.test(cliPath)) {
        command = env.ComSpec || env.COMSPEC || "cmd.exe"
        // `/s` strips the outermost quote pair, so wrap the quoted path once
        // more (as Node does for `shell: true`); a path with spaces or shell
        // metacharacters then stays one quoted argument.
        commandArgs = ["/d", "/s", "/c", `""${cliPath}" ${args.join(" ")}"`]
        windowsVerbatimArguments = true
      }
      let stdout = ""
      let stderr = ""
      let timedOut = false
      let settled = false
      let reapTimer = null
      const finish = (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(reapTimer)
        resolve({ code, timedOut, stdout, stderr })
      }
      let child
      try {
        child = spawn(command, commandArgs, {
          stdio: ["ignore", "pipe", "pipe"],
          detached: platform !== "win32",
          windowsHide: true,
          windowsVerbatimArguments,
          env: buildCliEnv(env, buildAugmentedPath() || env.PATH || ""),
        })
      } catch {
        resolve({ code: -1, timedOut: false, stdout: "", stderr: "" })
        return
      }
      // On timeout, kill the tree and settle only when the child is reaped,
      // so the upgrade lock is not released while an installer still writes.
      // The long backstop only covers a child that never reports close.
      const timer = setTimeout(() => {
        timedOut = true
        killTree(child)
        reapTimer = setTimeout(() => finish(-1), REAP_BACKSTOP_MS)
      }, timeoutMs)
      child.stdout?.setEncoding?.("utf8")
      child.stderr?.setEncoding?.("utf8")
      child.stdout?.on("data", (chunk) => {
        stdout = appendTail(stdout, String(chunk))
      })
      child.stderr?.on("data", (chunk) => {
        stderr = appendTail(stderr, String(chunk))
      })
      child.on("error", () => finish(-1))
      child.on("close", (code) => finish(typeof code === "number" ? code : -1))
    })

  const probeVersion = async (cliPath) => {
    const result = await runCli(cliPath, ["--version"], VERSION_TIMEOUT_MS)
    if (result.code !== 0) return null
    return trimVersion(stripAnsi(result.stdout).split(/\r?\n/).find((line) => line.trim()) || "")
  }

  const checkCli = async (found, others, runtime) => {
    const base = {
      installed: true,
      path: found.path,
      onPath: found.onPath,
      otherPaths: others.map((entry) => entry.path),
      isRuntimeBinary: Boolean(runtime.path && realpath(runtime.path) === realpath(found.path)),
      runtimeSource: runtime.source,
      checkedAt: now(),
    }
    const versionOnly = (currentVersion, checkSupported, error) => ({
      ...base,
      currentVersion,
      latestVersion: null,
      updateAvailable: null,
      method: "unknown",
      checkSupported,
      canUpgrade: false,
      manualCommand: checkSupported === false ? "ax-code upgrade" : null,
      blockedReason: null,
      error,
    })
    const installedVersion = await probeVersion(found.path)
    if (!installedVersion) return versionOnly(null, null, "unreadable")
    // Older CLIs have no machine-readable check; report the version only.
    if (compareVersions(installedVersion, MIN_CHECK_VERSION) < 0) return versionOnly(installedVersion, false, null)

    const result = await runCli(found.path, ["upgrade", "check", "--json"], CHECK_TIMEOUT_MS)
    const report = result.timedOut ? null : parseUpgradeCheckReport(result.stdout)
    if (!report) return versionOnly(installedVersion, true, result.timedOut ? "timeout" : "check-failed")
    const method = KNOWN_METHODS.has(report.method) ? report.method : "unknown"
    const updateAvailable = report.error || report.upToDate === null ? null : !report.upToDate
    // `brew upgrade` removes the keg a running process uses, so Desktop does
    // not upgrade a Homebrew CLI that its own runtime is running.
    const blockedReason = method === "unknown" ? "unknown-method" : method === "brew" && base.isRuntimeBinary ? "runtime-in-use" : null
    return {
      ...base,
      currentVersion: report.current || installedVersion,
      latestVersion: report.latest,
      updateAvailable,
      method,
      checkSupported: true,
      canUpgrade: blockedReason === null,
      manualCommand: manualCommandFor(method),
      blockedReason,
      error: report.error ? "check-failed" : null,
    }
  }

  const notInstalled = () => ({
    installed: false,
    path: null,
    onPath: false,
    otherPaths: [],
    isRuntimeBinary: false,
    runtimeSource: null,
    currentVersion: null,
    latestVersion: null,
    updateAvailable: null,
    method: "unknown",
    checkSupported: null,
    canUpgrade: false,
    manualCommand: null,
    blockedReason: null,
    error: null,
    checkedAt: now(),
  })

  const loadStatus = async () => {
    const runtime = await readRuntime()
    const [found, ...others] = findStandaloneClis()
    return found ? checkCli(found, others, runtime) : { ...notInstalled(), runtimeSource: runtime.source }
  }

  let cachedStatus = null
  let statusInFlight = null
  // The last upgrade: { state: "running" | "succeeded" | "failed", ... }.
  let upgradeJob = null

  const isFresh = (status) => {
    if (!status) return false
    const ttl = status.error ? FAILED_STATUS_TTL_MS : STATUS_TTL_MS
    return now() - status.checkedAt < ttl
  }

  const withJob = (status) => ({ ...status, upgrade: upgradeJob ? { ...upgradeJob } : null })

  const refreshStatus = () => {
    if (!statusInFlight) {
      statusInFlight = loadStatus()
        .then((status) => {
          cachedStatus = status
          return status
        })
        .finally(() => {
          statusInFlight = null
        })
    }
    return statusInFlight
  }

  const getStatus = async ({ refresh = false } = {}) => {
    // While an upgrade runs, the CLI is mid-install: report the last status.
    if (upgradeJob?.state === "running" && cachedStatus) return withJob(cachedStatus)
    const recent = cachedStatus && now() - cachedStatus.checkedAt < MIN_REFRESH_INTERVAL_MS
    if ((!refresh || recent) && isFresh(cachedStatus)) return withJob(cachedStatus)
    // A new check supersedes the last finished upgrade's outcome.
    if (upgradeJob && upgradeJob.state !== "running") upgradeJob = null
    return withJob(await refreshStatus())
  }

  // The cached status without starting a check, or null before the first one.
  const peekStatus = () => (cachedStatus ? withJob(cachedStatus) : null)

  const runUpgrade = async (before) => {
    const result = await runCli(before.path, ["upgrade", "--method", before.method], UPGRADE_TIMEOUT_MS)
    const output = stripAnsi(`${result.stdout}\n${result.stderr}`).trim()
    if (result.code !== 0 || result.timedOut) {
      logger.warn?.(`[ax-code cli] upgrade exited with ${result.timedOut ? "timeout" : result.code}: ${output.slice(-2000)}`)
    }

    // `ax-code upgrade` exits 0 even when the install fails, so the outcome
    // is what a fresh check reports afterwards.
    const after = await refreshStatus()
    const upgradedBinary = after.path === before.path ? after : await checkCli({ path: before.path, onPath: before.onPath }, [], await readRuntime())
    const advanced =
      upgradedBinary.currentVersion &&
      before.currentVersion &&
      compareVersions(upgradedBinary.currentVersion, before.currentVersion) > 0
    // Done means current, or at least at the version the check announced (a
    // release published mid-upgrade does not turn that into a failure).
    const current = upgradedBinary.updateAvailable === false
    const reachedTarget = before.latestVersion
      ? Boolean(upgradedBinary.currentVersion) && compareVersions(upgradedBinary.currentVersion, before.latestVersion) >= 0
      : advanced
    if (result.timedOut || !(current || reachedTarget)) {
      logger.warn?.(`[ax-code cli] upgrade did not reach ${before.latestVersion || "the latest version"}: ${output.slice(-2000)}`)
      return { state: "failed", reason: result.timedOut ? "timeout" : "upgrade-failed" }
    }

    // A different launcher earlier on PATH can still shadow the upgraded one.
    const shadowed =
      realpath(after.path || "") !== realpath(before.path) ||
      Boolean(after.currentVersion && upgradedBinary.currentVersion && after.currentVersion !== upgradedBinary.currentVersion)
    let runtimeRestarted = false
    let runtimeRestartFailed = false
    if (before.isRuntimeBinary) {
      try {
        await onRuntimeBinaryUpgraded()
        runtimeRestarted = true
      } catch (error) {
        // The CLI is upgraded, but this session still runs the old process.
        runtimeRestartFailed = true
        logger.warn?.("[ax-code cli] runtime restart after CLI upgrade failed:", error instanceof Error ? error.message : error)
      }
    }
    return {
      state: "succeeded",
      previousVersion: before.currentVersion,
      version: upgradedBinary.currentVersion,
      shadowedBy: shadowed ? { path: after.path, version: after.currentVersion } : null,
      runtimeRestarted,
      runtimeRestartFailed,
    }
  }

  // Starts an upgrade and returns at once; callers poll getStatus().upgrade.
  const startUpgrade = async () => {
    if (upgradeJob?.state === "running") {
      return { accepted: false, status: 409, reason: "already-running" }
    }
    // Take the lock before the pre-check: that check can take a minute, and
    // a second request in the meantime must not start a second installer.
    const previousJob = upgradeJob
    const startedAt = now()
    const job = { state: "running", path: null, fromVersion: null, targetVersion: null, startedAt }
    upgradeJob = job
    const refuse = (result) => {
      if (upgradeJob === job) upgradeJob = previousJob
      return result
    }
    let before
    try {
      before = await refreshStatus()
    } catch (error) {
      refuse(null)
      throw error
    }
    if (!before.installed) return refuse({ accepted: false, status: 404, reason: "not-installed", cli: before })
    if (!before.canUpgrade) return refuse({ accepted: false, status: 409, reason: "manual-upgrade-required", cli: before })
    if (before.updateAvailable === false) return refuse({ accepted: false, status: 409, reason: "up-to-date", cli: before })

    Object.assign(job, { path: before.path, fromVersion: before.currentVersion, targetVersion: before.latestVersion })
    const settle = (outcome) => {
      if (upgradeJob === job) upgradeJob = { ...job, ...outcome, finishedAt: now() }
    }
    void runUpgrade(before).then(settle, (error) => {
      logger.warn?.("[ax-code cli] upgrade crashed:", error instanceof Error ? error.message : error)
      settle({ state: "failed", reason: "upgrade-failed" })
    })
    return { accepted: true, status: 202, upgrade: { ...upgradeJob } }
  }

  // Test hook: resolves when the running upgrade settles.
  const whenIdle = async () => {
    while (upgradeJob?.state === "running") {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
  }

  return { findStandaloneCli, findStandaloneClis, getStatus, peekStatus, startUpgrade, whenIdle }
}

const toIso = (value) => (typeof value === "number" ? new Date(value).toISOString() : null)

export const serializeCliStatus = (status) => {
  if (!status) return null
  const { checkedAt, upgrade, ...rest } = status
  return {
    ...rest,
    checkedAt: toIso(checkedAt),
    upgrade: upgrade
      ? { ...upgrade, startedAt: toIso(upgrade.startedAt), finishedAt: toIso(upgrade.finishedAt) }
      : null,
  }
}

export const registerAxCodeCliInstallRoutes = (app, { runtime }) => {
  // GET is a safe method that any page can send to the loopback port, so it
  // never spawns anything: it serves the last check, or `{ checked: false }`
  // before the first one. Checks are POSTs, which the request-security
  // middleware limits to loopback origins.
  app.get("/api/ax-code/cli/status", (_req, res) => {
    const status = runtime.peekStatus()
    res.json(status ? serializeCliStatus(status) : { checked: false })
  })

  app.post("/api/ax-code/cli/check", async (req, res) => {
    try {
      const refresh = req.body?.refresh !== false
      res.json(serializeCliStatus(await runtime.getStatus({ refresh })))
    } catch (error) {
      console.error("[ax-code cli] status check failed:", error instanceof Error ? error.message : error)
      res.status(500).json({ error: "Failed to check the AX Code CLI" })
    }
  })

  app.post("/api/ax-code/cli/upgrade", async (_req, res) => {
    try {
      const { status, cli, upgrade, ...rest } = await runtime.startUpgrade()
      res.status(status).json({
        ...rest,
        upgrade: upgrade ? serializeCliStatus({ upgrade }).upgrade : null,
        cli: cli ? serializeCliStatus(cli) : null,
      })
    } catch (error) {
      console.error("[ax-code cli] upgrade failed to start:", error instanceof Error ? error.message : error)
      res.status(500).json({ accepted: false, reason: "upgrade-failed", error: "Failed to upgrade the AX Code CLI" })
    }
  })
}
