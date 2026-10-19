import { describe, expect, test } from "vitest"
import { isAppPageTarget } from "./cdp.mjs"
import { parseCspDirectiveSources } from "./csp.mjs"
import { findForbiddenScriptSources, isCspConsoleMessage } from "./journeys.mjs"
import { buildLaunchSpec } from "./launch.mjs"
import { parseArgs, summarize } from "./run.mjs"
import { STUB_LIST_ROUTES, buildStubRuntimeScript } from "./stub-runtime.mjs"

const isolated = {
  executable: "/electron",
  appDir: "/app",
  userDataDir: "/tmp/e2e/user-data",
  dataDir: "/tmp/e2e/data",
  stubRuntime: "/tmp/e2e/ax-code",
  debuggingPort: 9555,
  serverPort: 9556,
}

describe("buildLaunchSpec", () => {
  test("isolates profile, data dir, runtime and updater, and binds debugging to loopback", () => {
    const spec = buildLaunchSpec({ ...isolated, platform: "darwin", baseEnv: { PATH: "/bin" } })
    expect(spec.command).toBe("/electron")
    expect(spec.args).toEqual([
      "/app",
      "--user-data-dir=/tmp/e2e/user-data",
      "--remote-debugging-port=9555",
      "--remote-debugging-address=127.0.0.1",
      "--use-mock-keychain",
    ])
    expect(spec.env).toMatchObject({
      PATH: "/bin",
      AX_CODE_BINARY: "/tmp/e2e/ax-code",
      AX_CODE_DESKTOP_DATA_DIR: "/tmp/e2e/data",
      AX_CODE_DESKTOP_ELECTRON_SERVER_PORT: "9556",
      AX_CODE_DESKTOP_DISABLE_AUTO_UPDATE: "1",
    })
  })

  test("drops inherited variables that would bypass the build or the stub runtime", () => {
    const spec = buildLaunchSpec({
      ...isolated,
      platform: "linux",
      baseEnv: {
        AX_CODE_DESKTOP_ELECTRON_RENDERER_URL: "http://127.0.0.1:5173",
        AX_CODE_PATH: "/real/ax-code",
        ELECTRON_RUN_AS_NODE: "1",
      },
    })
    expect(spec.env.AX_CODE_DESKTOP_ELECTRON_RENDERER_URL).toBeUndefined()
    expect(spec.env.AX_CODE_PATH).toBeUndefined()
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(spec.args).not.toContain("--use-mock-keychain")
  })

  test("refuses a launch without isolation", () => {
    expect(() => buildLaunchSpec({ ...isolated, userDataDir: "" })).toThrow(/Isolated profile/)
    expect(() => buildLaunchSpec({ ...isolated, debuggingPort: 0 })).toThrow(/debugging port/)
  })
})

describe("CSP helpers", () => {
  test("collects directive sources across combined policies", () => {
    const csp = "default-src 'self'; script-src 'self' 'sha256-a='; style-src 'self', script-src 'self' 'unsafe-inline'"
    expect(parseCspDirectiveSources(csp, "script-src")).toEqual(["'self'", "'sha256-a='", "'self'", "'unsafe-inline'"])
    expect(parseCspDirectiveSources("", "script-src")).toEqual([])
  })

  test("forbids eval everywhere and inline scripts in packaged documents", () => {
    const csp = "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    expect(findForbiddenScriptSources(csp, { packaged: false })).toEqual(["'unsafe-eval'"])
    expect(findForbiddenScriptSources(csp, { packaged: true })).toEqual(["'unsafe-eval'", "'unsafe-inline'"])
    expect(findForbiddenScriptSources("script-src 'self' 'wasm-unsafe-eval'", { packaged: true })).toEqual([])
  })

  test("recognizes CSP console messages", () => {
    expect(
      isCspConsoleMessage("Refused to execute inline script because it violates the Content Security Policy"),
    ).toBe(true)
    expect(isCspConsoleMessage("Failed to fetch")).toBe(false)
  })
})

describe("harness plumbing", () => {
  test("selects only the app's own renderer page", () => {
    expect(isAppPageTarget({ type: "page", url: "app://ax-code/" })).toBe(true)
    expect(isAppPageTarget({ type: "page", url: "http://127.0.0.1:5000/" })).toBe(true)
    expect(isAppPageTarget({ type: "page", url: "https://example.com/" })).toBe(false)
    expect(isAppPageTarget({ type: "webview", url: "app://ax-code/" })).toBe(false)
    expect(isAppPageTarget({ type: "page", url: "devtools://devtools/bundled/inspector.html" })).toBe(false)
  })

  test("parses arguments and summarizes results", () => {
    expect(parseArgs(["--app", "/A.app", "--artifacts", "/out", "--timeout-ms", "5000"])).toEqual({
      app: "/A.app",
      artifacts: "/out",
      timeoutMs: 5000,
    })
    expect(parseArgs(["--timeout-ms", "nope"]).timeoutMs).toBe(60_000)
    expect(summarize([{ name: "boot", ok: true, detail: "x" }]).ok).toBe(true)
    expect(summarize([]).ok).toBe(false)
    expect(summarize([{ name: "csp-clean", ok: false, detail: "y" }]).failed).toEqual(["csp-clean"])
  })

  test("stub runtime reports the requested version and answers list routes with arrays", () => {
    const script = buildStubRuntimeScript({ version: "7.27.6" })
    expect(script).toContain('version: "7.27.6"')
    expect(STUB_LIST_ROUTES).toContain("/session")
    expect(script.startsWith("#!/usr/bin/env node")).toBe(true)
  })
})
