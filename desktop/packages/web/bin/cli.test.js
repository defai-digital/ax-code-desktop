import { afterEach, describe, expect, it, vi } from "vitest"
import { spawnSync } from "child_process"
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
  buildTunnelServeOptions,
  commands,
  parseArgs,
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
