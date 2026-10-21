import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  buildSmokeAppArgs,
  buildSmokeBundleIdentifier,
  bundledAxCodeLauncherPath,
  desktopMainLogPath,
  findMissingStartupEvents,
  isStubProcessCommand,
  outputConfirmsBundledRuntime,
  parseArgs,
  readExpectedBundledAxCodeVersion,
  resolveBundledPhaseAction,
  resolveDesktopRoot,
} from "./smoke-packaged-app.mjs"

describe("smoke-packaged-app args", () => {
  test("resolves the desktop root from the module URL without percent-encoding", () => {
    const moduleUrl =
      "file:///Users/a/my%20project/ax-code-desktop/desktop/packages/electron/scripts/smoke-packaged-app.mjs"

    expect(resolveDesktopRoot(moduleUrl)).toBe(path.resolve("/Users/a/my project/ax-code-desktop/desktop"))
  })

  test("expects the independently pinned runtime rather than the Desktop release version", async () => {
    expect(await readExpectedBundledAxCodeVersion({})).toBe("7.28.2")
    expect(await readExpectedBundledAxCodeVersion({ AX_CODE_DESKTOP_SMOKE_EXPECTED_AX_CODE_VERSION: "v7.24.3" })).toBe(
      "7.24.3",
    )
  })
  test("uses an isolated Electron profile", () => {
    expect(buildSmokeAppArgs({ userDataDir: "/tmp/ax-code-smoke-user-data" })).toEqual([
      "--user-data-dir=/tmp/ax-code-smoke-user-data",
      "--use-mock-keychain",
    ])
  })

  test("creates a distinct macOS bundle identifier for each smoke app copy", () => {
    expect(buildSmokeBundleIdentifier("smoke-run-123")).toBe("ai.defai.ax-code-app.smoke.smokerun123")
    expect(() => buildSmokeBundleIdentifier("")).toThrow("smoke run identifier")
  })

  test("never matches unrelated processes when the stub path is missing", () => {
    // setup can fail before createStubAxCode() returns; `includes(null)` used to compare
    // against the string "null" and swept unrelated commands such as `node /dev/null ...`.
    expect(isStubProcessCommand("node /dev/null serve --port 3000", null)).toBe(false)
    expect(isStubProcessCommand("node /dev/null serve --port 3000", undefined)).toBe(false)
    expect(isStubProcessCommand("node /dev/null serve --port 3000", "")).toBe(false)
    expect(isStubProcessCommand("/tmp/smoke/ax-code", "/tmp/smoke/ax-code")).toBe(true)
  })

  test("reports startup events that did not reach diagnostics", () => {
    expect(
      findMissingStartupEvents(
        ["electron.app.ready", "renderer.first-paint"],
        [{ name: "electron.app.ready" }, { name: "renderer.entry.start" }],
      ),
    ).toEqual(["renderer.first-paint"])
  })

  test("requires a temporary Electron profile", () => {
    expect(() => buildSmokeAppArgs({ userDataDir: "" })).toThrow("temporary Electron user-data directory")
  })

  test("locates the bundled runtime launcher inside a packaged app", () => {
    expect(bundledAxCodeLauncherPath("/tmp/AX Code.app")).toBe(
      "/tmp/AX Code.app/Contents/Resources/ax-code/bin/ax-code",
    )
  })

  test("locates the Electron main-process log used by startup diagnostics", () => {
    expect(desktopMainLogPath({ platform: "darwin", home: "/Users/smoke" })).toBe(
      "/Users/smoke/Library/Logs/AX Code/main.log",
    )
    expect(desktopMainLogPath({ platform: "linux", home: "/home/smoke" })).toBe(
      "/home/smoke/.ax-code-desktop/logs/main.log",
    )
  })

  test("recognizes the main supervisor's authoritative bundled source", () => {
    expect(
      outputConfirmsBundledRuntime(
        "[electron] supervising ax-code runtime: /Applications/AX Code.app/Contents/Resources/ax-code/bin/ax-code (source: bundled)",
      ),
    ).toBe(true)
    expect(
      outputConfirmsBundledRuntime("[electron] supervising ax-code runtime: /usr/bin/ax-code (source: path)"),
    ).toBe(false)
  })

  test("bundled phase runs when the launcher is executable", () => {
    expect(resolveBundledPhaseAction({ launcherExecutable: true, env: {} })).toBe("run")
    expect(resolveBundledPhaseAction({ launcherExecutable: true, env: { AX_CODE_STAGE_REQUIRED: "true" } })).toBe("run")
  })

  test("bundled phase skips on a placeholder tree outside release builds", () => {
    expect(resolveBundledPhaseAction({ launcherExecutable: false, env: {} })).toBe("skip")
    expect(resolveBundledPhaseAction({ launcherExecutable: false, env: { AX_CODE_STAGE_REQUIRED: "false" } })).toBe(
      "skip",
    )
  })

  test("bundled phase fails on a missing/broken launcher in release builds", () => {
    expect(resolveBundledPhaseAction({ launcherExecutable: false, env: { AX_CODE_STAGE_REQUIRED: "true" } })).toBe(
      "fail",
    )
    expect(resolveBundledPhaseAction({ launcherExecutable: false, env: { AX_CODE_STAGE_REQUIRED: "1" } })).toBe("fail")
  })

  test("uses environment defaults", () => {
    expect(
      parseArgs([], {
        AX_CODE_DESKTOP_SMOKE_APP: "/tmp/AX Code.app",
        AX_CODE_DESKTOP_SMOKE_ARTIFACTS: "/tmp/artifacts",
        AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "12000",
      }),
    ).toEqual({
      app: "/tmp/AX Code.app",
      artifacts: "/tmp/artifacts",
      skipIfMissing: false,
      timeoutMs: 12000,
    })
  })

  test("CLI arguments override environment defaults", () => {
    expect(
      parseArgs(["--app", "/tmp/Other.app", "--artifacts", "/tmp/other-artifacts", "--timeout-ms", "7000"], {
        AX_CODE_DESKTOP_SMOKE_APP: "/tmp/AX Code.app",
        AX_CODE_DESKTOP_SMOKE_ARTIFACTS: "/tmp/artifacts",
        AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "12000",
      }),
    ).toEqual({
      app: "/tmp/Other.app",
      artifacts: "/tmp/other-artifacts",
      skipIfMissing: false,
      timeoutMs: 7000,
    })
  })

  test("allows missing packaged apps to be skipped explicitly", () => {
    expect(parseArgs(["--skip-if-missing"], {}).skipIfMissing).toBe(true)
    expect(parseArgs([], { AX_CODE_DESKTOP_SMOKE_SKIP_IF_MISSING: "1" }).skipIfMissing).toBe(true)
  })

  test("falls back when timeout values are invalid", () => {
    expect(parseArgs([], { AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "not-a-number" }).timeoutMs).toBe(45_000)
    expect(parseArgs(["--timeout-ms", "0"], { AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "12000" }).timeoutMs).toBe(12000)
    expect(parseArgs(["--timeout-ms", "-5"], { AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "12000" }).timeoutMs).toBe(12000)
    expect(parseArgs(["--timeout-ms", "bad"], { AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "12000" }).timeoutMs).toBe(12000)
    expect(parseArgs(["--timeout-ms", "12000ms"], { AX_CODE_DESKTOP_SMOKE_TIMEOUT_MS: "9000" }).timeoutMs).toBe(9000)
  })
})
