import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import { webMcpToolIdentity } from "@/lib/webMcpCatalog"
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
    expect(restoreWebMcpAddress(directory.replaceAll("\\", "/") + "/", "ses_one")).toBe("https://example.org")
    expect(restoreWebMcpAddress(directory, "ses_two")).toBeNull()
    expect(restoreWebMcpAddress(directory + "-other", "ses_one")).toBeNull()
  }
  useWebMcpBrowserStore.setState({ enabled: true, paused: true, browserId: "live" })
  useWebMcpBrowserStore.getState().resetSnapshot()
  expect(useWebMcpBrowserStore.getState()).toMatchObject({ enabled: false, paused: false, browserId: null })
  expect(restoreWebMcpAddress("/home/dev/project", "ses_one")).toBe("https://example.org")
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
  expect(restoreWebMcpAddress("/repo", "ses_79")).toBe("https://example.org")
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
  expect(restoreWebMcpAddress("/repo", "ses_two")).toBe("https://example.org")
})

test("a changed definition marks the previous result stale and the same definition does not", () => {
  // Mutation probe: clearing the stale flag on a digest mismatch, or setting it when the digest matches, fails.
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  const tool = nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema: { type: "object" } })
  const identity = webMcpToolIdentity(tool)!
  store.updateSnapshot({ origin: "https://example.test", catalog: [tool] })
  const digest = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  store.recordToolRun(identity, { digest, outcome: "completed", text: "5", stale: false })
  store.updateSnapshot({ catalog: [nativeWebMcpTool({ ...tool, description: "Echo revised" })] })
  expect(useWebMcpBrowserStore.getState().toolRuns[identity]).toMatchObject({ stale: true, digest, text: "5" })
  expect(useWebMcpBrowserStore.getState().registration.some((event) => event.kind === "changed")).toBe(true)

  store.resetSnapshot()
  store.updateSnapshot({ origin: "https://example.test", catalog: [tool] })
  const same = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  store.recordToolRun(identity, { digest: same, outcome: "completed", text: "5", stale: false })
  const registration = useWebMcpBrowserStore.getState().registration
  store.updateSnapshot({ catalog: [{ ...tool }] })
  expect(useWebMcpBrowserStore.getState().toolRuns[identity]?.stale).toBe(false)
  expect(useWebMcpBrowserStore.getState().registration).toBe(registration)
  store.updateSnapshot({ catalog: [] })
  expect(useWebMcpBrowserStore.getState().toolRuns[identity]?.stale).toBe(true)
  store.updateSnapshot({ busy: true })
  expect(useWebMcpBrowserStore.getState().registration.length).toBeGreaterThan(0)
})

test("keeps drafts for the same definition in memory and drops them with the page", () => {
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  const setItem = vi.spyOn(Storage.prototype, "setItem")
  const tool = nativeWebMcpTool({ name: "echo", description: "Echo" })
  store.updateSnapshot({ origin: "https://example.test", catalog: [tool] })
  const digest = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  store.saveToolDraft("echo", { digest, values: { title: "Ship" }, sendEmpty: {}, json: "{}", jsonMode: false })
  store.updateSnapshot({ catalog: [] })
  store.updateSnapshot({ catalog: [tool] })
  expect(useWebMcpBrowserStore.getState().toolDrafts.echo).toMatchObject({ digest, values: { title: "Ship" } })
  expect(useWebMcpBrowserStore.getState().registration.map((event) => event.kind)).toEqual(["added"])
  store.updateSnapshot({ origin: "https://other.test", catalog: [tool] })
  expect(useWebMcpBrowserStore.getState().toolDrafts).toEqual({})
  expect(useWebMcpBrowserStore.getState().toolRuns).toEqual({})
  expect(useWebMcpBrowserStore.getState().registration.map((event) => event.kind)).toEqual(["added"])
  for (let index = 0; index < 65; index += 1) {
    store.saveToolDraft(`tool_${index}`, { digest: "abcdabcd", values: {}, sendEmpty: {}, json: "{}", jsonMode: false })
  }
  const names = Object.keys(useWebMcpBrowserStore.getState().toolDrafts)
  expect(names).toHaveLength(64)
  expect(names).not.toContain("tool_0")
  expect(names).toContain("tool_64")
  useWebMcpBrowserStore.setState({ runtimeCompatible: true })
  store.resetSnapshot()
  expect(useWebMcpBrowserStore.getState()).toMatchObject({
    runtimeCompatible: true,
    catalog: [],
    catalogRejection: null,
    registration: [],
    toolDrafts: {},
    toolRuns: {},
  })
  expect(setItem).not.toHaveBeenCalled()
  setItem.mockRestore()
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
  expect(fresh.restoreWebMcpAddress(directory, "ses_63")).toBe("https://example.org")
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

test("catalog metadata, registration, drafts and results belong to their view across selection and hidden updates", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null })
  const store = () => useWebMcpBrowserStore.getState()
  const first = viewKeyFor("/repo", "ses_first")
  const second = viewKeyFor("/repo", "ses_second")
  const tool = nativeWebMcpTool({ name: "echo", description: "Echo" })
  const rejection = { code: "invalid-catalog", reason: "duplicate-name", tool: "echo" }
  store().selectView("/repo", "ses_first")
  store().updateSnapshot({
    origin: "https://same.test",
    generation: "first",
    catalog: [tool],
    catalogLimit: { total: 70, shown: 1, truncation: "count" },
    catalogRejection: rejection,
  })
  const digest = store().catalog[0].digest!
  const draft = { digest, values: { title: "First" }, sendEmpty: {}, json: "{}", jsonMode: false }
  const identity = webMcpToolIdentity(tool)!
  const run = { digest, outcome: "completed", text: "First result", stale: false }
  store().saveToolDraft("echo", draft)
  store().recordToolRun(identity, run)
  store().selectView("/repo", "ses_second")
  store().updateSnapshot({ origin: "https://same.test", generation: "second", catalog: [tool] })
  expect(store()).toMatchObject({
    generation: "second",
    catalogLimit: { total: 1, shown: 1, truncation: null },
    catalogRejection: null,
    toolDrafts: {},
    toolRuns: {},
  })
  store().saveToolDraft("echo", { ...draft, values: { title: "Second" } })
  store().recordToolRun(identity, { ...run, text: "Second result" })
  const untouched = store().views[second]
  store().updateView(first, {
    generation: "first-reloaded",
    catalog: [nativeWebMcpTool({ ...tool, description: "Changed" })],
    catalogLimit: { total: 70, shown: 1, truncation: "count" },
  })
  // A manual invocation started before switching still writes to its original page and stays stale.
  store().recordToolRun(identity, run, first)
  expect(store().views[second]).toBe(untouched)
  expect(store().toolRuns[identity]).toMatchObject({ text: "Second result", stale: false })
  store().selectView("/repo", "ses_first")
  expect(store()).toMatchObject({
    generation: "first-reloaded",
    catalogRejection: rejection,
    catalogLimit: { total: 70, shown: 1, truncation: "count" },
    toolDrafts: { echo: draft },
    toolRuns: { [identity]: { ...run, stale: true } },
  })
  expect(store().registration.some((event) => event.kind === "changed")).toBe(true)
  store().clearToolRun(identity, second)
  expect(store().toolRuns[identity]).toBeDefined()
  expect(store().views[second].toolRuns).toEqual({})
  store().updateView(first, { origin: "https://other.test", catalog: [tool] })
  expect(store().toolDrafts).toEqual({})
  expect(store().toolRuns).toEqual({})
  expect(store().views[second].toolDrafts.echo.values.title).toBe("Second")
  store().resetView(first)
  store().recordToolRun(identity, run, first)
  store().saveToolDraft("echo", draft, first)
  expect(store().views[first]).toBeUndefined()
  expect(store()).toMatchObject({
    generation: null,
    registration: [],
    toolDrafts: {},
    toolRuns: {},
    catalogRejection: null,
  })
  store().selectView("/repo", "ses_second")
  expect(store().generation).toBe("second")
  store().resetSnapshot()
  expect(store().views[second]).toMatchObject({ generation: null, registration: [], toolDrafts: {}, toolRuns: {} })
})

test("the manual journal keeps the last 32 runs per view in memory and drops them when the origin changes", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  const { WEBMCP_JOURNAL_LIMIT } = await import("@/lib/webMcpCatalog")
  useWebMcpBrowserStore.setState({ views: {}, order: [], activeKey: null, toolJournal: [] })
  const store = () => useWebMcpBrowserStore.getState()
  const first = viewKeyFor("/repo", "ses_first")
  const entry = (id: string) => ({
    id,
    tool: "echo",
    input: { title: id },
    outcome: "completed",
    text: id,
    durationMs: 12.4,
    digest: "ab".repeat(8),
    at: 1,
  })
  store().selectView("/repo", "ses_first")
  store().updateSnapshot({ origin: "https://same.test", catalog: [{ name: "echo", description: "Echo" }] })
  for (let index = 0; index < WEBMCP_JOURNAL_LIMIT + 3; index += 1) store().recordToolJournal(entry(`j${index}`))
  expect(store().toolJournal).toHaveLength(WEBMCP_JOURNAL_LIMIT)
  expect(store().toolJournal[0]).toMatchObject({ id: `j${WEBMCP_JOURNAL_LIMIT + 2}`, durationMs: 12, input: { title: `j${WEBMCP_JOURNAL_LIMIT + 2}` } })
  expect(store().toolJournal.some((item) => item.id === "j0")).toBe(false)
  const kept = store().toolJournal
  store().updateSnapshot({ catalog: [{ name: "echo", description: "Echo" }] })
  expect(store().toolJournal).toBe(kept)
  store().selectView("/repo", "ses_second")
  store().updateSnapshot({ origin: "https://same.test", catalog: [{ name: "echo", description: "Echo" }] })
  store().recordToolJournal(entry("other"))
  expect(store().toolJournal.map((item) => item.id)).toEqual(["other"])
  expect(store().views[first].toolJournal).toHaveLength(WEBMCP_JOURNAL_LIMIT)
  store().recordToolJournal({ ...entry("bad"), input: ["no"] as never })
  store().recordToolJournal({ ...entry("wide"), digest: "f".repeat(65) })
  expect(store().toolJournal.map((item) => item.id)).toEqual(["other"])
  store().updateSnapshot({ origin: "https://other.test" })
  expect(store().toolJournal).toEqual([])
  expect(store().views[first].toolJournal).toHaveLength(WEBMCP_JOURNAL_LIMIT)
  expect(localStorage.length).toBe(0)
  expect(JSON.stringify(localStorage)).not.toContain("j34")
})

test.each([
  "ghp_" + "a".repeat(36),
  "Ab9Zx1Qk7Mv3Rs8Tn2Wp6Yd4Cf0Jh5Lu",
  "short-reset-code",
  "%67%68%70_" + "a".repeat(36),
])("history removes arbitrary path credentials on write and migrates old records: %s", (secret) => {
  const url = `https://example.test/reset-password/${secret}?token=hidden#hidden`
  rememberWebMcpAddress("/repo", "ses_one", url)
  expect(restoreWebMcpAddress("/repo", "ses_one")).toBe("https://example.test")
  expect(localStorage.getItem(WEBMCP_HISTORY_KEY)).not.toContain(secret)
  localStorage.setItem(WEBMCP_HISTORY_KEY, JSON.stringify([{ directory: "/repo", sessionID: "ses_one", url }]))
  expect(restoreWebMcpAddress("/repo", "ses_one")).toBe("https://example.test")
  expect(JSON.parse(localStorage.getItem(WEBMCP_HISTORY_KEY)!)).toEqual([
    { directory: "/repo", sessionID: "ses_one", url: "https://example.test" },
  ])
})

test("run and journal storage filter secrets before truncation without changing invocation identity", () => {
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  const secret = "ghp_" + "a".repeat(36)
  const text = "x".repeat(3990) + " " + secret
  store.recordToolRun("echo", { digest: "abc", outcome: "application-error", text, stale: false })
  store.recordToolJournal({ id: "one", tool: "echo", digest: "abc", outcome: "application-error", text,
    input: { password: "hidden", message: secret }, durationMs: 1, at: 1 })
  expect(useWebMcpBrowserStore.getState().toolRuns.echo.text).toBe("[redacted]")
  expect(useWebMcpBrowserStore.getState().toolJournal[0]).toMatchObject({
    tool: "echo", text: "[redacted]", input: { password: "<fill in>", message: "<fill in>" },
  })
})

test("draft retention preserves every accepted field name and explicit-empty flag", () => {
  const store = useWebMcpBrowserStore.getState()
  const keys = ["__proto__", "constructor", "x".repeat(257), "y".repeat(5000)]
  store.saveToolDraft("echo", { digest: "abcdabcd", values: Object.fromEntries(keys.map(key => [key, "draft"])), sendEmpty: Object.fromEntries(keys.map(key => [key, true])), json: "{}", jsonMode: false })
  const saved = useWebMcpBrowserStore.getState().toolDrafts.echo
  for (const key of keys) {
    expect(Object.hasOwn(saved.values, key)).toBe(true)
    expect(saved.values[key]).toBe("draft")
    expect(Object.hasOwn(saved.sendEmpty, key)).toBe(true)
    expect(saved.sendEmpty[key]).toBe(true)
  }
  expect(saved.truncated).toBe(false)
  store.saveToolDraft("echo", { ...saved, json: "x".repeat(65537) })
  expect(useWebMcpBrowserStore.getState().toolDrafts.echo.truncated).toBe(true)
})

test("bounded manual journal inputs explicitly retain truncation instead of claiming a complete input", () => {
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  let input: Record<string, unknown> = { unseen: 1 }
  for (let depth = 0; depth < 40; depth++) input = { nested: input }
  store.recordToolJournal({ id: "deep", tool: "echo", digest: "abc", outcome: "completed", text: "done", input, durationMs: 1, at: 1 })
  expect(useWebMcpBrowserStore.getState().toolJournal[0]).toMatchObject({ inputTruncated: true, input: {} })
})
