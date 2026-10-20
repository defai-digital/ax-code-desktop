import { describe, expect, test } from "vitest"
import { isAppPageTarget } from "./cdp.mjs"
import { parseCspDirectiveSources } from "./csp.mjs"
import {
  CSP_RECORDER_SCRIPT,
  FINAL_CHECKS,
  JOURNEYS,
  SHELL_READY_EXPRESSION,
  findForbiddenScriptSources,
  isCspConsoleMessage,
  isSupervisionPageTarget,
  journeyRendererErrors,
  journeyCspClean,
  waitForRuntimeReadiness,
} from "./journeys.mjs"
import { runInNewContext } from "node:vm"
import { normalizePreferences, resolvePreferences } from "../../../../shared/localization.mjs"
import { buildE2eLanguagePreferences, buildLaunchSpec } from "./launch.mjs"
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

test("shell readiness waits for the app to dismiss its startup splash", () => {
  let splash = {}
  const document = {
    getElementById: (id) => id === "root" ? { children: [{ id: "app" }] } : splash,
  }
  expect(runInNewContext(SHELL_READY_EXPRESSION, { document })).toBe(false)
  splash = null
  expect(runInNewContext(SHELL_READY_EXPRESSION, { document })).toBe(true)
})

describe("buildLaunchSpec", () => {
  test("UI WebMCP is opt-in and cannot leak from the caller environment", () => {
    const baseEnv = { AX_CODE_DESKTOP_UI_WEBMCP: "1" }
    expect(buildLaunchSpec({ ...isolated, baseEnv }).env.AX_CODE_DESKTOP_UI_WEBMCP).toBe("0")
    expect(buildLaunchSpec({ ...isolated, baseEnv, uiWebMcp: true }).env.AX_CODE_DESKTOP_UI_WEBMCP).toBe("1")
  })
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

describe("isolated profile language seed", () => {
  test("pins an explicit English interface that localization resolves on any host language", () => {
    const preferences = buildE2eLanguagePreferences()
    expect(preferences).toEqual({ schema: 1, interface: "en", conversation: "auto", revision: 0 })
    expect(normalizePreferences(preferences)).toEqual(preferences)
    expect(resolvePreferences(preferences, ["ja-JP"]).locale).toBe("en")
    expect(resolvePreferences({ ...preferences, interface: "system" }, ["ja-JP"]).locale).toBe("ja")
  })
})

describe("runtime readiness barrier", () => {
  const scenario = { session: { id: "ses_e2e_scripted", title: "E2E scripted session" } }
  const fakeSession = ({ health = [], loaded = [], seeded = [] } = {}) => {
    const events = []
    return {
      events,
      evaluate: async (expression) => {
        if (expression.includes("/api/global/health")) {
          events.push("health")
          return health.length ? health.shift() : true
        }
        if (expression.includes("document.readyState")) {
          events.push("loaded")
          return loaded.length ? loaded.shift() : true
        }
        events.push("seeded")
        return seeded.length ? seeded.shift() : true
      },
      send: async (method) => {
        events.push(method)
        return {}
      },
    }
  }

  test("waits for the initial navigation to complete before reloading a healthy runtime", async () => {
    const session = fakeSession({ health: [false, true], loaded: [false, true], seeded: [false, true] })
    await expect(
      waitForRuntimeReadiness({
        session,
        stubOriginPath: "/tmp/e2e/origin.txt",
        scenario,
        timeoutMs: 2000,
        readFile: async () => "http://127.0.0.1:4321",
      }),
    ).resolves.toBe(true)
    expect(session.events).toEqual(["health", "health", "loaded", "loaded", "Page.reload", "seeded", "seeded"])
  })

  test("names the stage that timed out", async () => {
    const unhealthy = fakeSession({ health: Array.from({ length: 100 }, () => false) })
    await expect(
      waitForRuntimeReadiness({
        session: unhealthy,
        stubOriginPath: "/tmp/e2e/origin.txt",
        scenario,
        timeoutMs: 250,
        readFile: async () => "http://127.0.0.1:4321",
      }),
    ).rejects.toThrow(/stage "runtime-health"/)
    const noOrigin = fakeSession()
    await expect(
      waitForRuntimeReadiness({
        session: noOrigin,
        stubOriginPath: "/tmp/e2e/origin.txt",
        scenario,
        timeoutMs: 250,
        readFile: async () => {
          throw new Error("missing")
        },
      }),
    ).rejects.toThrow(/stage "stub-origin"/)
    expect(noOrigin.events).toEqual([])
    const unknown = fakeSession({ seeded: Array.from({ length: 100 }, () => false) })
    await expect(
      waitForRuntimeReadiness({
        session: unknown,
        stubOriginPath: "/tmp/e2e/origin.txt",
        scenario,
        timeoutMs: 250,
        readFile: async () => "http://127.0.0.1:4321",
      }),
    ).rejects.toThrow(/stage "seeded-session"/)
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

  test("csp-clean covers the supervision pop-out policy, retained violations and console errors", async () => {
    const session = { evaluate: async () => [] }
    const clean = await journeyCspClean({
      session,
      documentCsp: "script-src 'self'",
      consoleMessages: [],
      packaged: false,
      cspViolations: [],
      popoutDocumentCsps: ["script-src 'self'"],
    })
    expect(clean.ok).toBe(true)
    const forbidden = await journeyCspClean({
      session,
      documentCsp: "script-src 'self'",
      consoleMessages: [],
      packaged: false,
      popoutDocumentCsps: ["script-src 'self' 'unsafe-eval'"],
    })
    expect(forbidden.ok).toBe(false)
    expect(forbidden.detail).toContain("supervision pop-out script-src allows 'unsafe-eval'")
    const missing = await journeyCspClean({
      session,
      documentCsp: "script-src 'self'",
      consoleMessages: [],
      packaged: false,
      popoutDocumentCsps: [""],
    })
    expect(missing.ok).toBe(false)
    expect(missing.detail).toContain("supervision pop-out document has no Content-Security-Policy")
    const retained = await journeyCspClean({
      session,
      documentCsp: "script-src 'self'",
      consoleMessages: [
        {
          source: "log",
          page: "http://127.0.0.1:1/supervision.html",
          text: "Refused to load the script because it violates the Content Security Policy",
        },
      ],
      packaged: false,
      cspViolations: ['{"directive":"script-src","blockedURI":"eval"}'],
      popoutDocumentCsps: ["script-src 'self'"],
    })
    expect(retained.ok).toBe(false)
    expect(retained.detail).toContain("blockedURI")
    expect(retained.detail).toContain("Content Security Policy")
  })
})

describe("harness plumbing", () => {
  test("late uncaught renderer errors fail the run, while ordinary logs stay diagnostic", async () => {
    expect((await journeyRendererErrors({ consoleMessages: [{ source: "console", text: "ready" }] })).ok).toBe(true)
    const result = await journeyRendererErrors({
      consoleMessages: [{ source: "exception", text: "TypeError: broken settings" }],
    })
    expect(result.ok).toBe(false)
    expect(result.detail).toContain("broken settings")
    expect(FINAL_CHECKS).toEqual([journeyCspClean, journeyRendererErrors])
    const names = JOURNEYS.map((journey) => journey.name)
    expect(names.indexOf("journeyNeedsYouApprove")).toBe(names.indexOf("journeyReload") + 1)
    expect(names.indexOf("journeyNeedsYouDeny")).toBe(names.indexOf("journeyNeedsYouApprove") + 1)
    expect(JOURNEYS.at(-1).name).toBe("journeyGoalRow")
  })

  test("forwards CSP failures to the host so a document reload cannot erase them", () => {
    const host = []
    const load = () => {
      let listener
      const window = { __axE2eReportCsp: (payload) => host.push(payload) }
      runInNewContext(CSP_RECORDER_SCRIPT, {
        window,
        document: {
          addEventListener: (_, callback) => {
            listener = callback
          },
        },
      })
      return { window, violate: (event) => listener(event) }
    }
    const first = load()
    first.violate({
      effectiveDirective: "script-src",
      blockedURI: "eval",
      sample: "",
      sourceFile: "app://ax-code/",
      lineNumber: 1,
    })
    const reloaded = load()
    expect(reloaded.window.__axE2eCspViolations).toEqual([])
    expect(host).toHaveLength(1)
    expect(JSON.parse(host[0])).toMatchObject({ directive: "script-src", blockedURI: "eval" })
  })
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

describe("supervision pop-out journey", () => {
  test("matches only the supervision window's page target", () => {
    expect(isSupervisionPageTarget({ type: "page", url: "http://127.0.0.1:9556/supervision.html" })).toBe(true)
    expect(isSupervisionPageTarget({ type: "page", url: "app://ax-code/supervision.html" })).toBe(true)
    expect(isSupervisionPageTarget({ type: "page", url: "http://127.0.0.1:9556/" })).toBe(false)
    expect(isSupervisionPageTarget({ type: "page", url: "http://127.0.0.1:9556/mini-chat.html" })).toBe(false)
    expect(isSupervisionPageTarget({ type: "service_worker", url: "http://127.0.0.1:9556/supervision.html" })).toBe(
      false,
    )
  })

  test("runs after the settings journey", () => {
    const names = JOURNEYS.map((journey) => journey.name)
    expect(names.indexOf("journeySupervisionPopout")).toBe(names.indexOf("journeySettings") + 1)
  })
})
