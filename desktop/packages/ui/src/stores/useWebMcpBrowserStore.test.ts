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
