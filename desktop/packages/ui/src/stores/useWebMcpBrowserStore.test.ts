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

test("a changed definition marks the previous result stale and the same definition does not", () => {
  // Mutation probe: clearing the stale flag on a digest mismatch, or setting it when the digest matches, fails.
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  const tool = { name: "echo", description: "Echo", inputSchema: { type: "object" } }
  store.updateSnapshot({ origin: "https://example.test", catalog: [tool] })
  const digest = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  store.recordToolRun("echo", { digest, outcome: "completed", text: "5", stale: false })
  store.updateSnapshot({ catalog: [{ ...tool, description: "Echo revised" }] })
  expect(useWebMcpBrowserStore.getState().toolRuns.echo).toMatchObject({ stale: true, digest, text: "5" })
  expect(useWebMcpBrowserStore.getState().registration.some((event) => event.kind === "changed")).toBe(true)

  store.resetSnapshot()
  store.updateSnapshot({ origin: "https://example.test", catalog: [tool] })
  const same = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  store.recordToolRun("echo", { digest: same, outcome: "completed", text: "5", stale: false })
  const registration = useWebMcpBrowserStore.getState().registration
  store.updateSnapshot({ catalog: [{ ...tool }] })
  expect(useWebMcpBrowserStore.getState().toolRuns.echo?.stale).toBe(false)
  expect(useWebMcpBrowserStore.getState().registration).toBe(registration)
  store.updateSnapshot({ catalog: [] })
  expect(useWebMcpBrowserStore.getState().toolRuns.echo?.stale).toBe(false)
  store.updateSnapshot({ busy: true })
  expect(useWebMcpBrowserStore.getState().registration.length).toBeGreaterThan(0)
})

test("keeps drafts for the same definition in memory and drops them with the page", () => {
  const store = useWebMcpBrowserStore.getState()
  store.resetSnapshot()
  const setItem = vi.spyOn(Storage.prototype, "setItem")
  const tool = { name: "echo", description: "Echo" }
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
  expect(fresh.restoreWebMcpAddress(directory, "ses_63")).toBe(url)
  expect(fresh.useWebMcpBrowserStore.getState().enabled).toBe(false)
})
