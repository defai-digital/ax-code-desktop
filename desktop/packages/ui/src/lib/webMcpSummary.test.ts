import { describe, expect, test } from "vitest"
import { summarizeWebMcpBrowser } from "./webMcpSummary"

const base = {
  phase: "idle" as const,
  nativeAvailable: false,
  runtimeCompatible: null,
  enabled: false,
  origin: null,
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
