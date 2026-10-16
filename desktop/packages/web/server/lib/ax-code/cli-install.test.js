import { describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"
import path from "node:path"
import { EventEmitter } from "node:events"
import {
  createAxCodeCliInstallRuntime,
  parseUpgradeCheckReport,
  registerAxCodeCliInstallRoutes,
  stripAnsi,
} from "./cli-install.js"

const HOME = "/home/dev"
const CLI = "/home/dev/.ax-code/bin/ax-code"

const createFs = (executables) => ({
  constants: { X_OK: 1 },
  statSync: (candidate) => {
    if (!executables.includes(candidate)) throw new Error("ENOENT")
    return { isFile: () => true }
  },
  accessSync: (candidate) => {
    if (!executables.includes(candidate)) throw new Error("EACCES")
  },
  realpathSync: (candidate) => candidate,
})

// Fake CLI: answers `upgrade check --json`, `--version` and `upgrade`.
const createCli = ({ versions = ["7.25.0"], latest = "7.26.0", method = "curl", check = true, upgradeCode = 0, hang = false, hangCheck = false, checkError = null } = {}) => {
  let index = 0
  const calls = []
  const killers = new Map()
  const killProcess = vi.fn((pid) => killers.get(-pid)?.kill())
  const spawn = vi.fn((command, args) => {
    calls.push([command, ...args])
    const child = new EventEmitter()
    child.pid = 4242
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = vi.fn()
    const current = versions[Math.min(index, versions.length - 1)]
    const reply = (code, out) =>
      setTimeout(() => {
        if (out) child.stdout.emit("data", out)
        child.emit("close", code)
      }, 0)
    // A hung child closes only when killed.
    child.kill = vi.fn(() => setTimeout(() => child.emit("close", null), 0))
    killers.set(child.pid, child)
    if (hang) return child
    if (hangCheck && args[1] === "check") return child
    if (args[0] === "upgrade" && args[1] === "check") {
      if (!check) reply(0, "")
      else {
        const latestNow = typeof latest === "function" ? latest() : latest
        const upToDate = current === latestNow
        reply(upToDate ? 0 : 1, JSON.stringify({ current, latest: checkError ? null : latestNow, upToDate: checkError ? null : upToDate, method, error: checkError }))
      }
    } else if (args[0] === "--version") {
      reply(0, `${current}\n`)
    } else if (args[0] === "upgrade") {
      index += 1
      reply(upgradeCode, "\u001b[32m◇ Upgraded\u001b[0m")
    } else {
      reply(2, "")
    }
    return child
  })
  return { spawn, calls, killProcess }
}

const createRuntime = ({ cli = createCli(), executables = [CLI], pathValue = "/usr/bin", env = {}, ...rest } = {}) => {
  let clock = 1_000
  const runtime = createAxCodeCliInstallRuntime({
    spawn: cli.spawn,
    spawnSync: vi.fn(),
    killProcess: cli.killProcess,
    fs: createFs(executables),
    os: { homedir: () => HOME },
    path: path.posix,
    platform: "darwin",
    env: { PATH: pathValue, ...env },
    now: () => clock,
    buildAugmentedPath: () => pathValue,
    logger: { warn: () => undefined },
    ...rest,
  })
  return { runtime, cli, advance: (ms) => (clock += ms) }
}

describe("parseUpgradeCheckReport", () => {
  it("reads the JSON report and ignores surrounding noise", () => {
    expect(
      parseUpgradeCheckReport('\u001b[2mlog\u001b[0m\n{"current":"7.25.0","latest":"v7.26.0","upToDate":false,"method":"brew"}\n'),
    ).toEqual({ current: "7.25.0", latest: "7.26.0", upToDate: false, method: "brew", error: null })
  })

  it("returns null for help text from older CLIs", () => {
    expect(parseUpgradeCheckReport("Usage: ax-code upgrade [target]")).toBeNull()
    expect(parseUpgradeCheckReport('{"nope":1}')).toBeNull()
  })

  it("strips ANSI sequences", () => {
    expect(stripAnsi("\u001b[1mbold\u001b[0m")).toBe("bold")
  })
})

describe("createAxCodeCliInstallRuntime", () => {
  it("reports not installed when no CLI exists", async () => {
    const { runtime } = createRuntime({ executables: [] })
    const status = await runtime.getStatus()
    expect(status.installed).toBe(false)
    expect(status.canUpgrade).toBe(false)
  })

  it("prefers the PATH entry and skips the bundled launcher", () => {
    const bundled = "/Applications/AX Code.app/Contents/Resources/ax-code/bin/ax-code"
    const { runtime } = createRuntime({
      executables: [bundled, "/opt/homebrew/bin/ax-code", CLI],
      pathValue: "/Applications/AX Code.app/Contents/Resources/ax-code/bin:/opt/homebrew/bin",
      env: { AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY: bundled },
    })
    expect(runtime.findStandaloneCli()).toEqual({ path: "/opt/homebrew/bin/ax-code", onPath: true })
  })

  it("falls back to the installer location when PATH has no CLI", () => {
    const { runtime } = createRuntime()
    expect(runtime.findStandaloneCli()).toEqual({ path: CLI, onPath: false })
  })

  it("reports an available update with the install method", async () => {
    const { runtime } = createRuntime()
    const status = await runtime.getStatus()
    expect(status).toMatchObject({
      installed: true,
      path: CLI,
      currentVersion: "7.25.0",
      latestVersion: "7.26.0",
      updateAvailable: true,
      method: "curl",
      checkSupported: true,
      canUpgrade: true,
      upgrade: null,
    })
  })

  it("never passes `check` to a CLI older than the check subcommand", async () => {
    const { runtime, cli } = createRuntime({ cli: createCli({ versions: ["7.19.4"] }) })
    const status = await runtime.getStatus()
    expect(status).toMatchObject({
      currentVersion: "7.19.4",
      latestVersion: null,
      updateAvailable: null,
      checkSupported: false,
      canUpgrade: false,
      manualCommand: "ax-code upgrade",
    })
    expect(cli.calls).toEqual([[CLI, "--version"]])
    expect((await runtime.startUpgrade()).reason).toBe("manual-upgrade-required")
    expect(cli.calls.every((call) => call[1] === "--version")).toBe(true)
  })

  it("reports a failed check without JSON as check-failed", async () => {
    const { runtime } = createRuntime({ cli: createCli({ check: false }) })
    const status = await runtime.getStatus()
    expect(status).toMatchObject({ currentVersion: "7.25.0", checkSupported: true, canUpgrade: false, error: "check-failed" })
  })

  it("starts the CLI with the server secrets removed", async () => {
    const { runtime, cli } = createRuntime({
      env: {
        AX_CODE_SERVER_PASSWORD: "s1",
        AX_CODE_DESKTOP_UI_PASSWORD: "s2",
        AX_CODE_DESKTOP_JWT_SECRET: "s3",
        GOOGLE_CLIENT_SECRET: "s4",
        GITHUB_TOKEN: "s5",
        HOMEBREW_GITHUB_API_TOKEN: "brew",
        ELECTRON_RUN_AS_NODE: "1",
        HOME: HOME,
      },
    })
    await runtime.getStatus()
    const options = cli.spawn.mock.calls[0][2]
    expect(options.env).toMatchObject({ HOME, PATH: "/usr/bin", NO_COLOR: "1", AX_CODE_DISABLE_AUTOUPDATE: "1" })
    expect(options.env).not.toHaveProperty("AX_CODE_SERVER_PASSWORD")
    expect(options.env).not.toHaveProperty("AX_CODE_DESKTOP_UI_PASSWORD")
    expect(options.env).not.toHaveProperty("ELECTRON_RUN_AS_NODE")
    expect(options.env).not.toHaveProperty("AX_CODE_DESKTOP_JWT_SECRET")
    expect(options.env).not.toHaveProperty("GOOGLE_CLIENT_SECRET")
    expect(options.env).not.toHaveProperty("GITHUB_TOKEN")
    expect(options.env.HOMEBREW_GITHUB_API_TOKEN).toBe("brew")
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"])
  })

  it("does not upgrade a Homebrew CLI that Desktop's runtime is running", async () => {
    const { runtime } = createRuntime({ cli: createCli({ method: "brew" }), getRuntimeBinary: async () => ({ path: CLI, source: "path" }) })
    const status = await runtime.getStatus()
    expect(status).toMatchObject({
      isRuntimeBinary: true,
      runtimeSource: "path",
      canUpgrade: false,
      blockedReason: "runtime-in-use",
      manualCommand: "brew upgrade ax-code",
    })
  })

  it("does not offer an upgrade for an unknown install method", async () => {
    const { runtime } = createRuntime({ cli: createCli({ method: "unknown" }) })
    const status = await runtime.getStatus()
    expect(status).toMatchObject({ canUpgrade: false, blockedReason: "unknown-method", manualCommand: null })
    const result = await runtime.startUpgrade()
    expect(result).toMatchObject({ accepted: false, status: 409, reason: "manual-upgrade-required" })
  })

  it("caches a good status and refreshes on request or after the TTL", async () => {
    const { runtime, cli, advance } = createRuntime()
    const checks = () => cli.calls.filter((call) => call[1] === "upgrade").length
    await runtime.getStatus()
    await runtime.getStatus()
    expect(checks()).toBe(1)
    await runtime.getStatus({ refresh: true })
    expect(checks()).toBe(1)
    advance(6_000)
    await runtime.getStatus({ refresh: true })
    expect(checks()).toBe(2)
    advance(11 * 60_000)
    await runtime.getStatus()
    expect(checks()).toBe(3)
  })

  it("keeps a failed check only briefly", async () => {
    const { runtime, cli, advance } = createRuntime({ cli: createCli({ hangCheck: true }) })
    vi.useFakeTimers()
    try {
      const pending = runtime.getStatus()
      await vi.advanceTimersByTimeAsync(70_000)
      const status = await pending
      expect(status.error).toBe("timeout")
      expect(status.currentVersion).toBe("7.25.0")
    } finally {
      vi.useRealTimers()
    }
    const before = cli.calls.length
    advance(31_000)
    void runtime.getStatus()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cli.calls.length).toBe(before + 1)
  })

  it("shares one check between concurrent status requests", async () => {
    const { runtime, cli } = createRuntime()
    await Promise.all([runtime.getStatus({ refresh: true }), runtime.getStatus({ refresh: true })])
    expect(cli.calls).toHaveLength(2)
  })

  it("upgrades in the background with the detected method and verifies the new version", async () => {
    const onRuntimeBinaryUpgraded = vi.fn(async () => undefined)
    const { runtime, cli } = createRuntime({
      cli: createCli({ versions: ["7.25.0", "7.26.0"], method: "brew" }),
      onRuntimeBinaryUpgraded,
    })
    const started = await runtime.startUpgrade()
    expect(started).toMatchObject({ accepted: true, status: 202, upgrade: { state: "running", targetVersion: "7.26.0" } })
    expect((await runtime.getStatus()).upgrade.state).toBe("running")
    await runtime.whenIdle()
    expect(cli.calls).toContainEqual([CLI, "upgrade", "--method", "brew"])
    const status = await runtime.getStatus()
    expect(status.currentVersion).toBe("7.26.0")
    expect(status.upgrade).toMatchObject({
      state: "succeeded",
      previousVersion: "7.25.0",
      version: "7.26.0",
      shadowedBy: null,
      runtimeRestarted: false,
    })
    expect(onRuntimeBinaryUpgraded).not.toHaveBeenCalled()
  })

  it("fails when the CLI still reports the old version after an upgrade that exited 0", async () => {
    const { runtime } = createRuntime({ cli: createCli({ versions: ["7.25.0", "7.25.0"] }) })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    expect((await runtime.getStatus()).upgrade).toMatchObject({ state: "failed", reason: "upgrade-failed" })
  })

  it("fails when the upgrade stops short of the announced version", async () => {
    const { runtime } = createRuntime({ cli: createCli({ versions: ["7.24.0", "7.25.0"], latest: "7.26.0" }) })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    expect((await runtime.getStatus()).upgrade).toMatchObject({ state: "failed", reason: "upgrade-failed" })
  })

  it("succeeds at the announced version even if a newer one appeared meanwhile", async () => {
    let latest = "7.26.0"
    const cli = createCli({ versions: ["7.25.0", "7.26.0"], latest: () => latest })
    const spawn = cli.spawn.getMockImplementation()
    cli.spawn.mockImplementation((command, args) => {
      if (args[0] === "upgrade" && args[1] === "--method") latest = "7.27.0"
      return spawn(command, args)
    })
    const { runtime } = createRuntime({ cli })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    const status = await runtime.getStatus()
    expect(status.updateAvailable).toBe(true)
    expect(status.upgrade).toMatchObject({ state: "succeeded", version: "7.26.0" })
  })

  it("drops the finished upgrade's outcome once a new check runs", async () => {
    const { runtime, advance } = createRuntime({ cli: createCli({ versions: ["7.25.0", "7.26.0"] }) })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    expect((await runtime.getStatus()).upgrade?.state).toBe("succeeded")
    advance(6_000)
    expect((await runtime.getStatus({ refresh: true })).upgrade).toBeNull()
  })

  it("does not install when the authoritative pre-check fails", async () => {
    const cli = createCli({ checkError: "Network unavailable" })
    const { runtime } = createRuntime({ cli })
    const result = await runtime.startUpgrade()
    await runtime.whenIdle()
    expect(result).toMatchObject({ accepted: false, reason: "check-failed" })
    expect(cli.calls.some((call) => call[2] === "--method")).toBe(false)
    expect(runtime.peekStatus().upgrade).toBeNull()
  })

  it("refuses when already current", async () => {
    const { runtime, cli } = createRuntime({ cli: createCli({ versions: ["7.26.0"] }) })
    const result = await runtime.startUpgrade()
    expect(result).toMatchObject({ accepted: false, status: 409, reason: "up-to-date" })
    expect(cli.calls.some((call) => call[1] === "upgrade" && call[2] === "--method")).toBe(false)
  })

  it("rejects a second upgrade while one runs", async () => {
    const { runtime } = createRuntime({ cli: createCli({ versions: ["7.25.0", "7.26.0"] }) })
    await runtime.startUpgrade()
    const second = await runtime.startUpgrade()
    expect(second).toMatchObject({ accepted: false, status: 409, reason: "already-running" })
    await runtime.whenIdle()
  })

  it("reports a launcher that shadows the upgraded one", async () => {
    const stale = "/usr/local/bin/ax-code"
    let upgraded = false
    const spawn = vi.fn((command, args) => {
      const child = new EventEmitter()
      child.pid = 1
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      const version = command === stale ? "7.20.0" : upgraded ? "7.26.0" : "7.25.0"
      setTimeout(() => {
        if (args[0] === "upgrade" && args[1] === "--method") upgraded = true
        else if (args[0] === "--version") child.stdout.emit("data", `${version}\n`)
        else child.stdout.emit("data", JSON.stringify({ current: version, latest: "7.26.0", upToDate: version === "7.26.0", method: "curl" }))
        child.emit("close", 0)
      }, 0)
      return child
    })
    // The stale launcher only appears on PATH after the upgrade.
    let pathValue = "/home/dev/.ax-code/bin"
    const runtime = createAxCodeCliInstallRuntime({
      spawn,
      spawnSync: vi.fn(),
      fs: createFs([CLI, stale]),
      os: { homedir: () => HOME },
      path: path.posix,
      platform: "darwin",
      env: {},
      buildAugmentedPath: () => pathValue,
      logger: { warn: () => undefined },
    })
    await runtime.startUpgrade()
    pathValue = "/usr/local/bin:/home/dev/.ax-code/bin"
    await runtime.whenIdle()
    const status = await runtime.getStatus()
    expect(status.upgrade).toMatchObject({ state: "succeeded", version: "7.26.0", shadowedBy: { path: stale, version: "7.20.0" } })
  })

  it("restarts the runtime when Desktop runs this CLI", async () => {
    const onRuntimeBinaryUpgraded = vi.fn(async () => undefined)
    const { runtime } = createRuntime({
      cli: createCli({ versions: ["7.25.0", "7.26.0"] }),
      getRuntimeBinary: async () => ({ path: CLI, source: "env" }),
      onRuntimeBinaryUpgraded,
    })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    expect((await runtime.getStatus()).upgrade).toMatchObject({ state: "succeeded", runtimeRestarted: true })
    expect(onRuntimeBinaryUpgraded).toHaveBeenCalledTimes(1)
  })

  it("starts only one installer when two upgrades are requested at once", async () => {
    const { runtime, cli } = createRuntime({ cli: createCli({ versions: ["7.25.0", "7.26.0"] }) })
    const [first, second] = await Promise.all([runtime.startUpgrade(), runtime.startUpgrade()])
    expect(first).toMatchObject({ accepted: true })
    expect(second).toMatchObject({ accepted: false, status: 409, reason: "already-running" })
    await runtime.whenIdle()
    expect(cli.calls.filter((call) => call[1] === "upgrade" && call[2] === "--method")).toHaveLength(1)
  })

  it("releases the lock after a refused upgrade", async () => {
    const { runtime } = createRuntime({ cli: createCli({ versions: ["7.26.0"] }) })
    expect((await runtime.startUpgrade()).reason).toBe("up-to-date")
    expect((await runtime.startUpgrade()).reason).toBe("up-to-date")
    expect((await runtime.getStatus()).upgrade).toBeNull()
  })

  it("flags an upgrade whose runtime restart failed", async () => {
    const { runtime } = createRuntime({
      cli: createCli({ versions: ["7.25.0", "7.26.0"] }),
      getRuntimeBinary: async () => ({ path: CLI, source: "env" }),
      onRuntimeBinaryUpgraded: async () => {
        throw new Error("not ready")
      },
    })
    await runtime.startUpgrade()
    await runtime.whenIdle()
    expect((await runtime.getStatus()).upgrade).toMatchObject({
      state: "succeeded",
      runtimeRestarted: false,
      runtimeRestartFailed: true,
    })
  })

  it("quotes a Windows .cmd launcher path with spaces for cmd /s", async () => {
    const cmdPath = "C:\\Users\\Ada Lovelace\\.ax-code\\bin\\ax-code.cmd"
    const cli = createCli()
    const runtime = createAxCodeCliInstallRuntime({
      spawn: cli.spawn,
      spawnSync: vi.fn(),
      fs: createFs([cmdPath]),
      os: { homedir: () => "C:\\Users\\Ada Lovelace" },
      path: path.win32,
      platform: "win32",
      env: { PATH: "C:\\Users\\Ada Lovelace\\.ax-code\\bin", PATHEXT: ".EXE;.CMD", ComSpec: "C:\\Windows\\cmd.exe" },
      buildAugmentedPath: () => "C:\\Users\\Ada Lovelace\\.ax-code\\bin",
      logger: { warn: () => undefined },
    })
    await runtime.getStatus()
    const [command, args, options] = cli.spawn.mock.calls[0]
    expect(command).toBe("C:\\Windows\\cmd.exe")
    expect(args).toEqual(["/d", "/s", "/c", `""${cmdPath}" --version"`])
    expect(options.windowsVerbatimArguments).toBe(true)
  })

  it("kills the process group when a command times out and waits for it to exit", async () => {
    const { runtime, cli } = createRuntime({ cli: createCli({ hang: true }) })
    vi.useFakeTimers()
    try {
      const pending = runtime.getStatus()
      await vi.advanceTimersByTimeAsync(16_000)
      const status = await pending
      expect(cli.killProcess).toHaveBeenCalledWith(-4242, "SIGKILL")
      expect(status.error).toBe("unreadable")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("registerAxCodeCliInstallRoutes", () => {
  const createApp = (runtime) => {
    const app = express()
    app.use(express.json())
    registerAxCodeCliInstallRoutes(app, { runtime })
    return app
  }

  it("never spawns the CLI from a GET", async () => {
    const { runtime, cli, advance } = createRuntime()
    const app = createApp(runtime)
    const first = await request(app).get("/api/ax-code/cli/status?refresh=1").expect(200)
    expect(first.body).toEqual({ checked: false })
    expect(cli.calls).toHaveLength(0)
    await request(app).post("/api/ax-code/cli/check").send({ refresh: false }).expect(200)
    expect(cli.calls.filter((call) => call[1] === "upgrade")).toHaveLength(1)
    advance(6_000)
    await request(app).post("/api/ax-code/cli/check").send({ refresh: false }).expect(200)
    expect(cli.calls.filter((call) => call[1] === "upgrade")).toHaveLength(1)
    await request(app).post("/api/ax-code/cli/check").send({}).expect(200)
    expect(cli.calls.filter((call) => call[1] === "upgrade")).toHaveLength(2)
    const cached = await request(app).get("/api/ax-code/cli/status").expect(200)
    expect(cached.body.installed).toBe(true)
  })

  it("serves the status with ISO timestamps", async () => {
    const { runtime } = createRuntime()
    const response = await request(createApp(runtime)).post("/api/ax-code/cli/check").send({}).expect(200)
    expect(response.body).toMatchObject({
      installed: true,
      updateAvailable: true,
      checkedAt: new Date(1_000).toISOString(),
      upgrade: null,
    })
  })

  it("maps a refused upgrade to its status code with the manual command", async () => {
    const { runtime } = createRuntime({ cli: createCli({ method: "unknown" }) })
    const response = await request(createApp(runtime)).post("/api/ax-code/cli/upgrade").send({}).expect(409)
    expect(response.body).toMatchObject({ accepted: false, reason: "manual-upgrade-required" })
    expect(response.body.cli.blockedReason).toBe("unknown-method")
  })

  it("accepts an upgrade with 202", async () => {
    const { runtime } = createRuntime({ cli: createCli({ versions: ["7.25.0", "7.26.0"] }) })
    const response = await request(createApp(runtime)).post("/api/ax-code/cli/upgrade").send({}).expect(202)
    expect(response.body).toMatchObject({ accepted: true, upgrade: { state: "running", startedAt: new Date(1_000).toISOString() } })
    await runtime.whenIdle()
  })
})

// Contract with a real installed CLI. Opt in with AX_CODE_CLI_CONTRACT=1: it
// spawns the user's `ax-code` and the check reaches GitHub or Homebrew.
describe.skipIf(process.env.AX_CODE_CLI_CONTRACT !== "1")("installed CLI contract", () => {
  it("reports a parseable status from the real CLI", async () => {
    const runtime = createAxCodeCliInstallRuntime()
    const status = await runtime.getStatus()
    expect(status.installed).toBe(true)
    expect(status.currentVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(status.checkSupported).toBe(true)
    expect(["curl", "brew", "unknown"]).toContain(status.method)
    if (!status.error) expect(typeof status.updateAvailable).toBe("boolean")
  }, 120_000)
})
