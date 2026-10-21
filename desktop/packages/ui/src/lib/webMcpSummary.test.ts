import { describe, expect, test } from "vitest"
import { summarizeWebMcpBrowser } from "./webMcpSummary"

const base = {
  phase: "idle" as const,
  nativeAvailable: false,
  runtimeCompatible: true,
  enabled: false,
  origin: null,
  page: null as "blank" | "unsupported" | "ready" | null,
  tools: 0,
  error: null,
}

describe("summarizeWebMcpBrowser", () => {
  test("explains that the browser needs the desktop app", () => {
    expect(summarizeWebMcpBrowser(base, { isElectron: false })).toMatchObject({
      tone: "default",
      detailKey: "webmcp.detail.desktopOnly",
      canOpen: false,
    })
  })

  test("reports an old runtime before any browser exists", () => {
    expect(summarizeWebMcpBrowser({ ...base, runtimeCompatible: false }, { isElectron: true })).toMatchObject({
      tone: "error",
      stateKey: "webmcp.state.unavailable",
      detailKey: "webmcp.detail.runtimeIncompatible",
    })
  })

  test("invites the user to open the browser when it is closed", () => {
    expect(summarizeWebMcpBrowser(base, { isElectron: true })).toMatchObject({
      tone: "default",
      stateKey: "webmcp.state.off",
      detailKey: "webmcp.detail.closed",
      canOpen: true,
    })
  })

  test("shows origin and tool count once agent access is on", () => {
    expect(
      summarizeWebMcpBrowser(
        { ...base, phase: "ready", nativeAvailable: true, enabled: true, origin: "https://example.com", tools: 3 },
        { isElectron: true },
      ),
    ).toEqual({
      tone: "success",
      stateKey: "webmcp.state.on",
      detailKey: "webmcp.detail.enabledWithOrigin",
      detailParams: { origin: "https://example.com", count: 3 },
      canOpen: true,
    })
  })

  test("asks for a page while agent access is on but the pane is blank", () => {
    const enrolled = { ...base, phase: "ready" as const, nativeAvailable: true, enabled: true }
    expect(summarizeWebMcpBrowser({ ...enrolled, page: "blank" }, { isElectron: true })).toEqual({
      tone: "warning",
      stateKey: "webmcp.state.waitingForPage",
      detailKey: "webmcp.detail.waitingForPage",
      canOpen: true,
    })
    // An older main process that does not report the page kind is treated the same way.
    expect(summarizeWebMcpBrowser(enrolled, { isElectron: true })).toMatchObject({
      stateKey: "webmcp.state.waitingForPage",
    })
  })

  test("flags a loaded page the agent cannot be granted", () => {
    const unsupported = { ...base, phase: "ready" as const, nativeAvailable: true, page: "unsupported" as const }
    expect(summarizeWebMcpBrowser({ ...unsupported, enabled: true }, { isElectron: true })).toEqual({
      tone: "warning",
      stateKey: "webmcp.state.pageUnsupported",
      detailKey: "webmcp.detail.pageUnsupported",
      canOpen: true,
    })
    expect(summarizeWebMcpBrowser(unsupported, { isElectron: true })).toEqual({
      tone: "warning",
      stateKey: "webmcp.state.off",
      detailKey: "webmcp.detail.pageUnsupported",
      canOpen: true,
    })
  })

  test("reports a page without registered tools as a normal result", () => {
    expect(
      summarizeWebMcpBrowser(
        { ...base, phase: "ready", nativeAvailable: true, enabled: true, origin: "https://trip.com", page: "ready" },
        { isElectron: true },
      ),
    ).toEqual({
      tone: "default",
      stateKey: "webmcp.state.on",
      detailKey: "webmcp.detail.enabledNoTools",
      detailParams: { origin: "https://trip.com" },
      canOpen: true,
    })
  })

  test("keeps an operation failure ahead of the enabled branch", () => {
    expect(
      summarizeWebMcpBrowser(
        { ...base, phase: "ready", nativeAvailable: true, enabled: true, page: "blank", error: "operation-failed" },
        { isElectron: true },
      ),
    ).toMatchObject({ tone: "error", stateKey: "webmcp.state.error", detailKey: "webmcp.detail.operationFailed" })
  })

  test("keeps agent access off as a warning rather than an error", () => {
    expect(
      summarizeWebMcpBrowser(
        { ...base, phase: "ready", nativeAvailable: true, origin: "https://example.com", tools: 2 },
        { isElectron: true },
      ),
    ).toMatchObject({ tone: "warning", stateKey: "webmcp.state.off", detailKey: "webmcp.detail.readyWithOrigin" })
  })

  test("keeps an operation failure visible on a live browser", () => {
    expect(
      summarizeWebMcpBrowser(
        {
          ...base,
          phase: "ready",
          nativeAvailable: true,
          origin: "https://example.com",
          tools: 1,
          error: "enable-failed",
        },
        { isElectron: true },
      ),
    ).toMatchObject({ tone: "error", stateKey: "webmcp.state.error", detailKey: "webmcp.detail.enableFailed" })
  })

  test("treats a missing session as guidance, not a failure", () => {
    expect(
      summarizeWebMcpBrowser({ ...base, phase: "error", error: "session-required" }, { isElectron: true }),
    ).toMatchObject({ tone: "default", detailKey: "webmcp.detail.sessionRequired" })
    expect(
      summarizeWebMcpBrowser({ ...base, phase: "error", error: "enable-failed" }, { isElectron: true }),
    ).toMatchObject({ tone: "error", detailKey: "webmcp.detail.enableFailed" })
  })
})

test("shares a bounded error sentence across all surfaces and identifies paused access", () => {
  expect(
    summarizeWebMcpBrowser({ ...base, phase: "ready", error: "ERR_UNSAFE_PORT" }, { isElectron: true }),
  ).toMatchObject({ detailKey: "webmcp.detail.unsafePort", tone: "error" })
  expect(
    summarizeWebMcpBrowser({ ...base, phase: "ready", paused: true, enabled: false }, { isElectron: true }),
  ).toMatchObject({ stateKey: "webmcp.state.paused", tone: "warning" })
})

test("shows unknown when compatibility has not been reported", () => {
  expect(
    summarizeWebMcpBrowser({ ...base, phase: "ready", runtimeCompatible: null }, { isElectron: true }),
  ).toMatchObject({ stateKey: "webmcp.state.unknown", detailKey: "webmcp.detail.compatibilityUnknown" })
})

test("uses the native failure sentence even when the runtime is incompatible", () => {
  expect(
    summarizeWebMcpBrowser(
      { ...base, phase: "ready", runtimeCompatible: false, error: "ERR_UNSAFE_PORT" },
      { isElectron: true },
    ),
  ).toMatchObject({ detailKey: "webmcp.detail.unsafePort" })
  expect(summarizeWebMcpBrowser({ ...base, runtimeCompatible: null }, { isElectron: true })).toMatchObject({
    stateKey: "webmcp.state.unknown",
  })
})

test("runtime interruption never claims access is on and explains automatic recovery", () => {
  expect(
    summarizeWebMcpBrowser({ ...base, phase: "ready", enabled: false, interrupted: true }, { isElectron: true }),
  ).toMatchObject({
    tone: "warning",
    stateKey: "webmcp.pages.access.interrupted",
    detailKey: "webmcp.detail.interrupted",
  })
})

test("summary origin parameters use the shared redactor in each live state", () => {
  const origin = `https://ghp_${"e".repeat(36)}.test`
  for (const enabled of [true, false]) for (const tools of [0, 1]) {
    const summary = summarizeWebMcpBrowser({ ...base, phase: "ready", nativeAvailable: true, enabled, tools, origin }, { isElectron: true })
    expect(summary.detailParams?.origin).toBe("[redacted]")
  }
})
