import { beforeEach, expect, test, vi } from "vitest"
import {
  WEBMCP_HISTORY_KEY,
  rememberWebMcpAddress,
  restoreWebMcpAddress,
  safeWebMcpAddress,
  useWebMcpBrowserStore,
} from "./useWebMcpBrowserStore"

beforeEach(() => localStorage.clear())

test("restores only normalized project and session addresses across a store reset", () => {
  for (const directory of ["/Users/dev/project", "/home/dev/project", "C:\\Users\\dev\\project"]) {
    rememberWebMcpAddress(directory, "ses_one", "https://example.org/one?token=secret#credential")
    expect(restoreWebMcpAddress(directory.replaceAll("\\", "/") + "/", "ses_one")).toBe("https://example.org/one")
    expect(restoreWebMcpAddress(directory, "ses_two")).toBeNull()
    expect(restoreWebMcpAddress(directory + "-other", "ses_one")).toBeNull()
  }
  useWebMcpBrowserStore.setState({ enabled: true, paused: true, browserId: "live" })
  useWebMcpBrowserStore.getState().resetSnapshot()
  expect(useWebMcpBrowserStore.getState()).toMatchObject({ enabled: false, paused: false, browserId: null })
  expect(restoreWebMcpAddress("/home/dev/project", "ses_one")).toBe("https://example.org/one")
  expect(localStorage.getItem(WEBMCP_HISTORY_KEY)).not.toMatch(/secret|credential|enabled|grant|browserId/)
})

test("rejects credentials, non-web schemes, invalid identities and oversized addresses", () => {
  for (const url of [
    "https://user:secret@example.org",
    "file:///secret",
    "javascript:alert(1)",
    "not a URL",
    "https://example.org/" + "x".repeat(2048),
  ]) {
    expect(safeWebMcpAddress(url)).toBeNull()
    rememberWebMcpAddress("/repo", "ses_one", url)
  }
  for (const directory of ["relative", "", "/repo\0secret"])
    rememberWebMcpAddress(directory, "ses_one", "https://example.org")
  rememberWebMcpAddress("/repo", null, "https://example.org")
  rememberWebMcpAddress("/repo", "bad", "https://example.org")
  expect(localStorage.getItem(WEBMCP_HISTORY_KEY)).toBeNull()
})

test("bounds history and validates persisted data on every restore", () => {
  for (let i = 0; i < 80; i++) rememberWebMcpAddress("/repo", `ses_${i}`, `https://example.org/${i}`)
  expect(JSON.parse(localStorage.getItem(WEBMCP_HISTORY_KEY)!)).toHaveLength(64)
  expect(restoreWebMcpAddress("/repo", "ses_0")).toBeNull()
  expect(restoreWebMcpAddress("/repo", "ses_79")).toBe("https://example.org/79")
  for (const raw of [
    "{bad",
    "null",
    "{}",
    JSON.stringify([
      { directory: "/repo", sessionID: "ses_one", url: "https://example.org", padding: "x".repeat(200001) },
    ]),
    JSON.stringify(Array(65).fill({ directory: "/repo", sessionID: "ses_one", url: "https://example.org" })),
  ]) {
    localStorage.setItem(WEBMCP_HISTORY_KEY, raw)
    expect(restoreWebMcpAddress("/repo", "ses_one")).toBeNull()
  }
  localStorage.setItem(
    WEBMCP_HISTORY_KEY,
    JSON.stringify([
      { directory: "/repo", sessionID: "ses_one", url: "https://user:secret@example.org" },
      {
        directory: "/repo",
        sessionID: "ses_two",
        url: "https://example.org/path?token=secret",
        enabled: true,
        grants: ["secret"],
      },
    ]),
  )
  expect(restoreWebMcpAddress("/repo", "ses_one")).toBeNull()
  expect(restoreWebMcpAddress("/repo", "ses_two")).toBe("https://example.org/path")
})

test("bounds the total serialized size and restores after a fresh module load", async () => {
  const directory = "/" + "d".repeat(2040)
  const url = "https://example.org/" + "p".repeat(2000)
  for (let i = 0; i < 64; i++) {
    rememberWebMcpAddress(directory, `ses_${i}`, url)
    expect(localStorage.getItem(WEBMCP_HISTORY_KEY)!.length).toBeLessThanOrEqual(200000)
  }
  expect(localStorage.getItem(WEBMCP_HISTORY_KEY)!.length).toBeLessThanOrEqual(200000)
  vi.resetModules()
  const fresh = await import("./useWebMcpBrowserStore")
  expect(fresh.restoreWebMcpAddress(directory, "ses_63")).toBe(url)
  expect(fresh.useWebMcpBrowserStore.getState().enabled).toBe(false)
})

test("isolates keyed snapshots, reset and explicit request counters across projects and sessions", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  const store = () => useWebMcpBrowserStore.getState()
  const first = viewKeyFor("/repo", "ses_first")
  const second = viewKeyFor("/repo", "ses_second")
  const other = viewKeyFor("/other", "ses_first")
  store().selectView("/repo", "ses_first")
  store().updateView(first, { enabled: true, origin: "https://first.test", waiting: true })
  store().requestAgentMode({ enable: true }, first)
  store().selectView("/repo", "ses_second")
  store().updateView(second, { browserId: "second", origin: "https://second.test" })
  store().requestAgentMode(undefined, second)
  expect(store().consumeEnableRequest(second)).toBe(false)
  expect(store().consumeEnableRequest(first)).toBe(true)
  expect(store().consumeEnableRequest(first)).toBe(false)
  store().updateView(other, { enabled: true, origin: "https://other.test" })
  store().resetView(first)
  expect(store().views[first]).toBeUndefined()
  expect(store().views[second]).toMatchObject({
    browserId: "second",
    origin: "https://second.test",
    agentModeRequests: 1,
  })
  expect(store().views[other]).toMatchObject({ enabled: true, origin: "https://other.test" })
  // A late write to another view cannot overwrite the selected pane.
  expect(store().browserId).toBe("second")
  expect(store().origin).toBe("https://second.test")
  expect(store().order).toHaveLength(2)
})

test("view keys normalize paths and never confuse draft, sessions or projects", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  expect(viewKeyFor("/repo/a/../", "ses_first")).toBe(viewKeyFor("/repo", "ses_first"))
  expect(viewKeyFor("c:\\Users\\DEV\\project\\", null)).toBe(viewKeyFor("C:/Users/dev/project", null))
  expect(viewKeyFor("/repo", null)).not.toBe(viewKeyFor("/repo", "ses_first"))
  expect(viewKeyFor("/repo", "ses_first")).not.toBe(viewKeyFor("/other", "ses_first"))
})

test("selecting a view seeded by a capability probe restores its identity", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  const store = () => useWebMcpBrowserStore.getState()
  store().updateView(viewKeyFor("/repo", "ses_probe"), { runtimeCompatible: true })
  store().selectView("/repo", "ses_probe")
  expect(store()).toMatchObject({ directory: "/repo", sessionID: "ses_probe", runtimeCompatible: true })
})

test("closed views do not accumulate or resurrect on selection and release", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  const store = () => useWebMcpBrowserStore.getState()
  for (let i = 0; i < 200; i++) {
    const key = viewKeyFor("/repo", `ses_${i}`)
    store().selectView("/repo", `ses_${i}`)
    store().updateView(key, { browserId: `id-${i}`, catalog: [{ name: "tool", description: "test" }] })
    store().resetView(key)
    store().releaseView(key)
    expect(store().views).toEqual({})
    expect(store().order).toEqual([])
  }
})

test("transferred draft requests are consumed for both agent mode and enable", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  const store = () => useWebMcpBrowserStore.getState()
  store().selectView("/repo/", null)
  store().requestAgentMode({ enable: true })
  store().selectView("/repo/child/..", "ses_new")
  expect(store().consumeAgentModeRequest()).toBe(true)
  expect(store().consumeEnableRequest()).toBe(true)
  const draft = viewKeyFor("/repo", null)
  expect(store().consumeAgentModeRequest(draft)).toBe(false)
  expect(store().consumeEnableRequest(draft)).toBe(false)
  store().selectView("/repo", null)
  expect(store().consumeAgentModeRequest()).toBe(false)
})
