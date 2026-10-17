import { afterEach, describe, expect, it, vi } from "vitest"
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

// `startup disable` tears down the real launchd agent, systemd unit or Task Scheduler entry, and its
// paths come from the home directory, not from the data dir a test can redirect. A test that reached
// it uninstalled the developer's own integration, so these three commands are refused here and
// everything else in the module passes through untouched.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal()
  const startupCommands = new Set(["launchctl", "systemctl", "schtasks.exe"])
  return {
    ...actual,
    spawnSync: vi.fn((command, args, options) => {
      if (startupCommands.has(path.basename(String(command)))) {
        return { status: 0, stdout: "", stderr: "", error: undefined, pid: 1, output: [], signal: null }
      }
      return actual.spawnSync(command, args, options)
    }),
  }
})

import { isModuleCliExecution, normalizeCliEntryPath } from "./cli-entry.js"
import {
  assertRestartCanCarryPassword,
  buildTunnelServeOptions,
  stopInstanceProcess,
  followFile,
  readTailWithSize,
  commands,
  parseArgs,
  terminateProcessTree,
  resolveAvailablePort,
  resolveTunnelProviderAndMode,
  toModuleUrl,
  windowsCommandQuote,
  CliError,
  EXIT_CODE,
} from "./cli.js"
import {
  buildCloudflaredArgs,
  createTunnelManager,
  normalizeTunnelMode,
  normalizeTunnelProvider,
  parseCloudflareQuickTunnelUrl,
} from "./tunnel-manager.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cli args", () => {
  it("defaults the browser UI to the less crowded product port", () => {
    expect(parseArgs([]).options.port).toBe(3100)
  })

  it("accepts legacy daemon flags as no-ops", () => {
    expect(parseArgs(["serve", "--daemon"]).removedFlagErrors).toEqual([])
    expect(parseArgs(["serve", "-d"]).removedFlagErrors).toEqual([])
  })

  it("parses tunnel subcommands and options", () => {
    const parsed = parseArgs([
      "tunnel",
      "start",
      "--provider",
      "cloudflare",
      "--mode",
      "quick",
      "--port",
      "3100",
      "--force",
    ])

    expect(parsed.command).toBe("tunnel")
    expect(parsed.tunnelAction).toBe("start")
    expect(parsed.options.provider).toBe("cloudflare")
    expect(parsed.options.mode).toBe("quick")
    expect(parsed.options.port).toBe(3100)
    expect(parsed.options.force).toBe(true)
  })

  it("refuses --ui-password with no value instead of starting unprotected", () => {
    // `consumeValue` answers `undefined` when the next token is another flag, and the case assigned `""`: the
    // server started without password protection and reported success, and under `--quiet` nothing said so.
    expect(() => parseArgs(["serve", "--ui-password", "--port", "3100"])).toThrow(/Missing value for --ui-password/)
    expect(() => parseArgs(["serve", "--ui-password"])).toThrow(/Missing value for --ui-password/)
    // A value is still taken, inline or as the next token.
    expect(parseArgs(["serve", "--ui-password", "s3cret"]).options.uiPassword).toBe("s3cret")
    expect(parseArgs(["serve", "--ui-password=s3cret"]).options.uiPassword).toBe("s3cret")
  })

  it("rejects non-loopback bind hosts", () => {
    expect(() => parseArgs(["serve", "--host", "0.0.0.0"])).toThrow("local-only")
  })

  it("keeps tunnel auto-started server output silent even in json mode", () => {
    expect(
      buildTunnelServeOptions(
        {
          json: true,
          quiet: false,
          uiPassword: "secret",
          port: 3100,
        },
        true,
      ),
    ).toMatchObject({
      json: false,
      quiet: true,
      suppressQuietOutput: true,
      suppressStartupSummary: true,
      suppressUiPasswordWarning: true,
      explicitPort: true,
      uiPassword: "secret",
      port: 3100,
    })
  })
})

describe("update command", () => {
  it("reports the disabled package-manager updater as up to date in quiet mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    await commands.update({ quiet: true })

    expect(write).toHaveBeenCalledTimes(1)
    expect(String(write.mock.calls[0]?.[0])).toMatch(/^up-to-date /)
  })
})

describe("startup quoting", () => {
  it.skipIf(process.platform === "win32")("takes the daemon's process group with it, not just its leader", async () => {
    // The daemon is spawned as its own process-group leader (`detached: true`) and starts the runtime, the terminal
    // sessions and the preview servers as its children. Signalling the leader's pid alone left them running — still
    // holding their loopback ports — while `stop` reported the instance stopped; the Windows branch kills the tree.
    const { spawn } = await import("child_process")
    const fs = await import("fs")
    const os = await import("os")
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-stop-tree-"))
    const fixturePath = path.join(fixtureDir, "leader.js")
    fs.writeFileSync(
      fixturePath,
      [
        'const { spawn } = require("child_process")',
        'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })',
        "console.log(child.pid)",
        "setInterval(() => {}, 1000)",
      ].join("\n"),
    )

    const leader = spawn(process.execPath, [fixturePath], { detached: true, stdio: ["ignore", "pipe", "ignore"] })
    const isAlive = (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }

    try {
      const childPid = await new Promise((resolve, reject) => {
        let buffered = ""
        leader.stdout.on("data", (chunk) => {
          buffered += String(chunk)
          const first = buffered.split("\n")[0]
          if (/^\d+$/.test(first)) {
            resolve(Number(first))
          }
        })
        leader.on("error", reject)
        setTimeout(() => reject(new Error("the fixture never printed its child pid")), 5000)
      })
      expect(isAlive(childPid)).toBe(true)

      expect(await terminateProcessTree(leader.pid, { gracefulTimeoutMs: 1500, forceTimeoutMs: 2000 })).toBe(true)

      const deadline = Date.now() + 3000
      while (isAlive(childPid) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(isAlive(childPid)).toBe(false)
    } finally {
      try {
        process.kill(-leader.pid, "SIGKILL")
      } catch {}
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it("refuses to restart an instance whose record is missing and gives it no password", () => {
    // The record is what says whether the instance it replaces had a password. Without it the restarted server
    // came up unprotected on a port that may have had one — silently, and especially in quiet mode.
    const base = { port: 3999, storedOptions: null, explicitUiPassword: false, uiPassword: undefined, envPassword: undefined }

    expect(() => assertRestartCanCarryPassword(base)).toThrow(/instance record is missing/)

    // Any of the three sources of a password is enough to carry one over.
    expect(() => assertRestartCanCarryPassword({ ...base, storedOptions: { port: 3999 } })).not.toThrow()
    expect(() =>
      assertRestartCanCarryPassword({ ...base, explicitUiPassword: true, uiPassword: "s3cret" }),
    ).not.toThrow()
    expect(() => assertRestartCanCarryPassword({ ...base, envPassword: "s3cret" })).not.toThrow()
    // An instance that deliberately had no password has a record saying so, and still restarts.
    expect(() =>
      assertRestartCanCarryPassword({ ...base, storedOptions: { port: 3999, hasUiPassword: false } }),
    ).not.toThrow()
  })


  it.skipIf(process.platform === "win32")("forces the group even when the leader is already gone", async () => {
    // The reason this signals the group is that the leader's children outlive it. The graceful wait asks about the
    // pid only, so a leader that has already exited answers at once — and the survivors were never sent anything.
    const calls = []
    const killSpy = vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      calls.push([target, signal])
      if (target > 0) {
        const error = new Error("kill ESRCH")
        error.code = "ESRCH"
        throw error
      }
      return true
    })
    try {
      await expect(terminateProcessTree(4242, { gracefulTimeoutMs: 10, forceTimeoutMs: 10 })).resolves.toBe(true)

      expect(calls).toContainEqual([-4242, "SIGTERM"])
      expect(calls).toContainEqual([-4242, "SIGKILL"])
    } finally {
      killSpy.mockRestore()
    }
  })

  it.skipIf(process.platform === "win32")("forces the group when the graceful stop already saw the leader go", async () => {
    // `stop` asks the server to shut down and returns as soon as the leader exits: the group signal lived only in
    // `terminateProcessTree`, which that path never reached, so a child that ignored the shutdown outlived a `stop`
    // that reported the instance stopped.
    const calls = []
    const killSpy = vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      calls.push([target, signal])
      if (target > 0) {
        const error = new Error("kill ESRCH")
        error.code = "ESRCH"
        throw error
      }
      return true
    })
    try {
      await expect(stopInstanceProcess(4343, { shutdownWaitMs: 10, forceTimeoutMs: 10 })).resolves.toBe(true)

      expect(calls).toContainEqual([-4343, "SIGKILL"])
    } finally {
      killSpy.mockRestore()
    }
  })

  it("escapes Windows task command arguments", () => {
    expect(windowsCommandQuote(String.raw`C:\Program Files\AX "Code"\run.ps1`)).toBe(
      String.raw`"C:\\Program Files\\AX \"Code\"\\run.ps1"`,
    )
  })

  it("converts the packaged server path to an importable file URL", () => {
    const serverPath = path.join(
      "/Applications",
      "AX Code.app",
      "Contents",
      "Resources",
      "app.asar",
      "dist",
      "server.js",
    )
    expect(toModuleUrl(serverPath)).toBe(pathToFileURL(serverPath).href)
  })
})

describe("port selection", () => {
  it("falls back by scanning upward instead of asking the OS for a random port", async () => {
    const selected = await resolveAvailablePort(3100, false, undefined, undefined, {
      isPortAvailable: async (port) => port !== 3100,
      fetchSystemInfoFromPort: async () => null,
    })
    expect(selected).toBe(3101)
  })
})

describe("tunnel args", () => {
  it("disables tunnel commands at runtime", async () => {
    await expect(commands.tunnel({}, "start")).rejects.toThrow("local-only")
  })

  it("supports only the Cloudflare quick tunnel MVP", () => {
    expect(normalizeTunnelProvider(undefined)).toBe("cloudflare")
    expect(normalizeTunnelProvider("Cloudflare")).toBe("cloudflare")
    expect(normalizeTunnelMode(undefined)).toBe("quick")
    expect(normalizeTunnelMode("Quick")).toBe("quick")
    expect(() => normalizeTunnelProvider("ngrok")).toThrow("Unsupported tunnel provider")
    expect(() => normalizeTunnelMode("managed-remote")).toThrow("Unsupported tunnel mode")
  })

  it("maps unsupported tunnel provider and mode to CLI usage errors", () => {
    expect(resolveTunnelProviderAndMode({ provider: "cloudflare", mode: "quick" })).toEqual({
      provider: "cloudflare",
      mode: "quick",
    })

    try {
      resolveTunnelProviderAndMode({ provider: "ngrok" })
      throw new Error("expected provider error")
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect(error.exitCode).toBe(EXIT_CODE.USAGE_ERROR)
      expect(error.message).toContain("Unsupported tunnel provider")
    }
  })

  it("builds the cloudflared quick tunnel invocation", () => {
    expect(buildCloudflaredArgs({ mode: "quick", originUrl: "http://127.0.0.1:3100" })).toEqual([
      "tunnel",
      "--no-autoupdate",
      "--url",
      "http://127.0.0.1:3100",
    ])
  })

  it("does not report a foreground restart when the instance survived the stop", async () => {
    // A foreground instance is restarted by its process manager, not by this command, and the daemon path
    // fails on its own when `serve` finds the port taken — the foreground path calls no serve, so a stop
    // that did not take read as a successful restart.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const dataDir = fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-restart-"))
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    process.env.AX_CODE_DESKTOP_DATA_DIR = dataDir
    const runDir = nodePath.join(dataDir, "run")
    fsImpl.mkdirSync(runDir, { recursive: true })
    // A live pid (this process) with a stub for `stop`, so nothing is signalled.
    fsImpl.writeFileSync(nodePath.join(runDir, "ax-code-desktop-3100.pid"), String(process.pid))
    fsImpl.writeFileSync(
      nodePath.join(runDir, "ax-code-desktop-3100.json"),
      JSON.stringify({ port: 3100, launchMode: "foreground", startedAt: Date.now() }),
    )

    const originalStop = commands.stop
    commands.stop = async () => {}
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      await expect(commands.restart({ json: true })).rejects.toThrow("Timed out stopping pid")
    } finally {
      commands.stop = originalStop
      stdoutWrite.mockRestore()
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      fsImpl.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it("carries an environment password into the restarted instance", async () => {
    // The guard accepts a password from the environment when the record is missing, but the restart then handed
    // `serve` only the record's (absent) password. The first server was protected by the inherited environment
    // alone, and its new record said `hasUiPassword: false` — so the next restart, from a shell without the
    // variable, passed the guard on that record and came up unprotected without a word.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const dataDir = fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-restart-env-"))
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    const originalEnvPassword = process.env.AX_CODE_DESKTOP_UI_PASSWORD
    process.env.AX_CODE_DESKTOP_DATA_DIR = dataDir
    process.env.AX_CODE_DESKTOP_UI_PASSWORD = "env-secret"
    const runDir = nodePath.join(dataDir, "run")
    fsImpl.mkdirSync(runDir, { recursive: true })
    fsImpl.writeFileSync(nodePath.join(runDir, "ax-code-desktop-3100.pid"), String(process.pid))
    // No instance record beside the pid file: the environment is the only password source.

    const originalStop = commands.stop
    const originalServe = commands.serve
    let served
    commands.stop = async () => {}
    commands.serve = async (options) => {
      served = options
      return 3100
    }
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      await commands.restart({ json: true })
      expect(served?.uiPassword).toBe("env-secret")
    } finally {
      commands.stop = originalStop
      commands.serve = originalServe
      stdoutWrite.mockRestore()
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      if (originalEnvPassword === undefined) delete process.env.AX_CODE_DESKTOP_UI_PASSWORD
      else process.env.AX_CODE_DESKTOP_UI_PASSWORD = originalEnvPassword
      fsImpl.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it("prefers the environment password over an empty stored one", async () => {
    // The record can hold a password the server treats as unset (empty or whitespace). `??` kept it, so serve
    // started unprotected while `hasUiPassword` said otherwise, and the environment password was ignored.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const dataDir = fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-restart-empty-"))
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    const originalEnvPassword = process.env.AX_CODE_DESKTOP_UI_PASSWORD
    process.env.AX_CODE_DESKTOP_DATA_DIR = dataDir
    process.env.AX_CODE_DESKTOP_UI_PASSWORD = "env-secret"
    const runDir = nodePath.join(dataDir, "run")
    fsImpl.mkdirSync(runDir, { recursive: true })
    fsImpl.writeFileSync(nodePath.join(runDir, "ax-code-desktop-3100.pid"), String(process.pid))
    fsImpl.writeFileSync(
      nodePath.join(runDir, "ax-code-desktop-3100.json"),
      JSON.stringify({ port: 3100, launchMode: "daemon", uiPassword: "", hasUiPassword: true }),
    )

    const originalStop = commands.stop
    const originalServe = commands.serve
    let served
    commands.stop = async () => {}
    commands.serve = async (options) => {
      served = options
      return 3100
    }
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      await commands.restart({ json: true })
      expect(served?.uiPassword).toBe("env-secret")
    } finally {
      commands.stop = originalStop
      commands.serve = originalServe
      stdoutWrite.mockRestore()
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      if (originalEnvPassword === undefined) delete process.env.AX_CODE_DESKTOP_UI_PASSWORD
      else process.env.AX_CODE_DESKTOP_UI_PASSWORD = originalEnvPassword
      fsImpl.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it("removes the startup env file when the integration is disabled", async () => {
    // The file holds the UI password and a snapshot of the environment (API keys included), and only the
    // macOS *enable* path ever removed it: a disabled integration left those credentials on disk.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const dataDir = fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-startup-"))
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    process.env.AX_CODE_DESKTOP_DATA_DIR = dataDir
    // The service path is built from the home directory: keep it inside the temp dir so nothing
    // outside it can be named, let alone unlinked (see the child_process mock at the top).
    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE
    process.env.HOME = dataDir
    process.env.USERPROFILE = dataDir

    const envFile = nodePath.join(dataDir, "startup.env")
    fsImpl.writeFileSync(envFile, "AX_CODE_DESKTOP_UI_PASSWORD=hunter2\n")
    const printed = []
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed.push(String(chunk))
      return true
    })

    try {
      await commands.startup({}, "disable")
      expect(fsImpl.existsSync(envFile)).toBe(false)
      // The teardown really reached the platform command — through the stub, not the machine.
      const startupCommands = vi
        .mocked(spawnSync)
        .mock.calls.map(([command]) => path.basename(String(command)))
        .filter((command) => ["launchctl", "systemctl", "schtasks.exe"].includes(command))
      expect(startupCommands.length).toBeGreaterThan(0)
    } finally {
      stdoutWrite.mockRestore()
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      if (originalUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = originalUserProfile
      fsImpl.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it("answers an explicit stop port with no CLI-tracked instance", async () => {
    // `stop --port N` used to hit the "no running instances" early return before it probed the port, so a
    // desktop-managed or orphaned server kept the port with the command reporting nothing to do.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const dataDir = fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-stop-"))
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    process.env.AX_CODE_DESKTOP_DATA_DIR = dataDir

    const printed = []
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed.push(String(chunk))
      return true
    })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ runtime: "desktop", pid: 4321 }), { status: 200 }))

    try {
      await commands.stop({ explicitPort: true, port: 3100, json: true })

      const payload = JSON.parse(printed.join(""))
      expect(payload.results[0]).toMatchObject({ port: 3100, runtime: "desktop", reason: "desktop-managed" })
      expect(payload.messages?.[0]?.code).toBe("DESKTOP_MANAGED_PORT")
    } finally {
      stdoutWrite.mockRestore()
      fetchSpy.mockRestore()
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      fsImpl.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it("keeps a tunnel's state file when the process survived the stop", async () => {
    // The file is how this CLI finds the tunnel again. Removing it after a stop that did not take
    // untracked a tunnel that is still public: `tunnel status` stopped listing it and a retry reported
    // "not-running" with no way to stop it.
    const fsImpl = await import("node:fs")
    const os = await import("node:os")
    const nodePath = await import("node:path")
    const runDir = nodePath.join(fsImpl.mkdtempSync(nodePath.join(os.tmpdir(), "ax-code-tunnel-")), "run")
    fsImpl.mkdirSync(runDir, { recursive: true })
    const statePath = nodePath.join(runDir, "ax-code-desktop-tunnel-3100.json")
    fsImpl.writeFileSync(statePath, JSON.stringify({ port: 3100, pid: 4321 }))

    const manager = createTunnelManager({
      getRunDir: () => runDir,
      getLogsDir: () => runDir,
      isProcessRunning: () => true,
      terminateProcessTree: async () => false,
      searchPathFor: () => "/usr/bin/cloudflared",
      processLike: { env: {} },
    })

    const result = await manager.stopTunnel({ port: 3100 })
    expect(result).toMatchObject({ port: 3100, stopped: false })
    expect(fsImpl.existsSync(statePath)).toBe(true)

    // A stop that did take effect clears it. `isProcessRunning` keeps reporting a live process until
    // the kill succeeds, so this reaches the branch that decides on `stopped` instead of the
    // "not-running" early return.
    let terminated = false
    const stoppedManager = createTunnelManager({
      getRunDir: () => runDir,
      getLogsDir: () => runDir,
      isProcessRunning: () => !terminated,
      terminateProcessTree: async () => {
        terminated = true
        return true
      },
      searchPathFor: () => "/usr/bin/cloudflared",
      processLike: { env: {} },
    })
    await expect(stoppedManager.stopTunnel({ port: 3100 })).resolves.toMatchObject({ port: 3100, stopped: true })
    expect(fsImpl.existsSync(statePath)).toBe(false)

    // The other half of the same condition: the kill reported failure but the process is gone, so the
    // file still has to go. The first poll (the guard) sees it alive, the poll after the kill does not.
    fsImpl.writeFileSync(statePath, JSON.stringify({ port: 3100, pid: 4321 }))
    let polls = 0
    const diedAnyway = createTunnelManager({
      getRunDir: () => runDir,
      getLogsDir: () => runDir,
      isProcessRunning: () => {
        polls += 1
        return polls === 1
      },
      terminateProcessTree: async () => false,
      searchPathFor: () => "/usr/bin/cloudflared",
      processLike: { env: {} },
    })
    await expect(diedAnyway.stopTunnel({ port: 3100 })).resolves.toMatchObject({ port: 3100, stopped: false })
    expect(fsImpl.existsSync(statePath)).toBe(false)

    fsImpl.rmSync(nodePath.dirname(runDir), { recursive: true, force: true })
  })

  it("parses Cloudflare quick tunnel URLs from logs", () => {
    expect(
      parseCloudflareQuickTunnelUrl(
        "2026-06-30 INF +--------------------------------------------------------------------------------------------+\nhttps://demo-abc.trycloudflare.com",
      ),
    ).toBe("https://demo-abc.trycloudflare.com")
    expect(parseCloudflareQuickTunnelUrl("no public URL yet")).toBeNull()
  })

  it("checks cloudflared availability before tunnel startup", () => {
    const baseDependencies = {
      getRunDir: () => "/tmp/unused-run-dir",
      getLogsDir: () => "/tmp/unused-log-dir",
      isProcessRunning: () => false,
      terminateProcessTree: async () => true,
    }

    const missing = createTunnelManager({
      ...baseDependencies,
      searchPathFor: () => null,
      processLike: { env: {} },
    })
    expect(missing.checkDependency()).toMatchObject({
      ok: false,
      dependency: "cloudflared",
      path: null,
    })

    const configuredInvalid = createTunnelManager({
      ...baseDependencies,
      searchPathFor: () => "/usr/bin/cloudflared",
      isExecutable: () => false,
      processLike: { env: { AX_CODE_DESKTOP_CLOUDFLARED_BINARY: "/missing/cloudflared" } },
    })
    expect(configuredInvalid.checkDependency()).toMatchObject({
      ok: false,
      path: null,
    })

    const configuredValid = createTunnelManager({
      ...baseDependencies,
      searchPathFor: () => null,
      isExecutable: () => true,
      processLike: { env: { AX_CODE_DESKTOP_CLOUDFLARED_BINARY: "/opt/bin/cloudflared" } },
    })
    expect(configuredValid.checkDependency()).toMatchObject({
      ok: true,
      path: "/opt/bin/cloudflared",
    })
  })

  it("blocks direct tunnel-manager startup", async () => {
    const manager = createTunnelManager({
      getRunDir: () => "/tmp/unused-run-dir",
      getLogsDir: () => "/tmp/unused-log-dir",
      searchPathFor: () => "/usr/bin/cloudflared",
      isExecutable: () => true,
      isProcessRunning: () => false,
      terminateProcessTree: async () => true,
    })

    await expect(manager.startTunnel({ port: 3100 })).rejects.toThrow("local-only")
  })
})

describe("cli entry detection", () => {
  const modulePath = "/tmp/openchamber/bin/cli.js"
  const moduleUrl = pathToFileURL(modulePath).href

  it("resolves symlinked entry paths before comparing", () => {
    const symlinkPath = "/usr/local/bin/openchamber"
    const realpath = (filePath) => {
      if (filePath === path.resolve(symlinkPath)) {
        return modulePath
      }
      return filePath
    }

    expect(isModuleCliExecution(symlinkPath, moduleUrl, realpath)).toBe(true)
  })

  it("falls back to resolved paths when realpath fails", () => {
    const realpath = () => {
      throw new Error("realpath unavailable")
    }

    expect(isModuleCliExecution(modulePath, moduleUrl, realpath)).toBe(true)
  })

  it("returns false for non-matching entry path", () => {
    expect(isModuleCliExecution("/tmp/other-cli.js", moduleUrl)).toBe(false)
  })

  it("returns false for empty entry path", () => {
    expect(isModuleCliExecution("", moduleUrl)).toBe(false)
  })

  it("returns false when module url is not provided", () => {
    expect(isModuleCliExecution(modulePath)).toBe(false)
  })

  it("accepts wrapper binary name fallback when requested", () => {
    const wrapperPath = "/home/user/.local/bin/openchamber"
    expect(isModuleCliExecution(wrapperPath, moduleUrl, undefined, "openchamber")).toBe(true)
  })

  it("normalizes direct paths when realpath fails", () => {
    const unresolvedPath = "./packages/web/bin/cli.js"
    const realpath = () => {
      throw new Error("no symlink resolution")
    }

    expect(normalizeCliEntryPath(unresolvedPath, realpath)).toBe(path.resolve(unresolvedPath))
  })
})

describe("logs --follow", () => {
  const waitFor = async (predicate, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  it("starts at the offset the tail read reached, not at the file's end", async () => {
    // The tail was printed and the follow then started at the current size, so every line written in between —
    // the ones the followed run was producing — was dropped from the output.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-logs-follow-"))
    const logPath = path.join(dir, "daemon.log")
    fs.writeFileSync(logPath, "first\n")
    const fromOffset = fs.statSync(logPath).size
    // Written after the tail read and before the follow starts.
    fs.appendFileSync(logPath, "second\n")

    const seen = []
    const stop = followFile(logPath, (line) => seen.push(line), { startAt: fromOffset })
    try {
      await waitFor(() => seen.includes("second"))
      expect(seen).toContain("second")
      // And it keeps following.
      fs.appendFileSync(logPath, "third\n")
      await waitFor(() => seen.includes("third"))
      expect(seen).toContain("third")
    } finally {
      stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("treats the first file it opens after a missing log as the baseline", async () => {
    // The follower can start before the daemon has written its log. The identity it compares against was only set
    // when the file existed at start, so the later rotation had nothing to be compared with and was read from the
    // old offset — the new file's beginning was lost.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-logs-late-"))
    const logPath = path.join(dir, "daemon.log")
    const seen = []
    const stop = followFile(logPath, (line) => seen.push(line))
    try {
      fs.writeFileSync(logPath, "first\n")
      await waitFor(() => seen.includes("first"))

      fs.rmSync(logPath, { force: true })
      fs.writeFileSync(logPath, "rotated-one\nrotated-two\nrotated-three\n")
      await waitFor(() => seen.includes("rotated-one"))

      expect(seen).toContain("first")
      expect(seen).toContain("rotated-one")
    } finally {
      stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not splice a rotated log into the output", async () => {
    // A liveness restart replaces the file at the same path: reading the new one from the old offset printed a
    // middle slice of it. Only a rotation shorter than the old file was caught by the size check.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-logs-rotate-"))
    const logPath = path.join(dir, "daemon.log")
    fs.writeFileSync(logPath, "old-line-one\nold-line-two\n")
    const fromOffset = fs.statSync(logPath).size

    const seen = []
    const stop = followFile(logPath, (line) => seen.push(line), { startAt: fromOffset })
    try {
      // The same path, a new file, longer than the old one.
      fs.rmSync(logPath, { force: true })
      fs.writeFileSync(logPath, "rotated-first\nrotated-second\nrotated-third\n")
      await waitFor(() => seen.includes("rotated-first"))

      expect(seen).toContain("rotated-first")
      // Nothing that is not a whole line of the new file.
      for (const line of seen) {
        expect(line).toMatch(/^(rotated-first|rotated-second|rotated-third)$/)
      }
    } finally {
      stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reports the bytes it read as the offset, not the bytes of the decoded text", async () => {
    // A write cut a multibyte character in half. Decoding replaced it with U+FFFD, which is three UTF-8 bytes, so
    // the reported offset ran past the file's real size. The follower then clamped to the size it saw at open and
    // dropped every line written between the tail and the follow — the race the offset was added to close.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-logs-bytes-"))
    const logPath = path.join(dir, "daemon.log")
    fs.writeFileSync(logPath, Buffer.from([0x61, 0x0a, 0xe2, 0x82]))
    try {
      const tail = readTailWithSize(logPath)
      expect(tail.size).toBe(4)
      expect(tail.size).toBe(fs.statSync(logPath).size)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
