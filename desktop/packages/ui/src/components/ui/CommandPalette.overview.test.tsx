import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render } from "@/test/dom"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import type { SupervisionRow } from "@/lib/supervision/rows"

vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return { useI18n: () => ({ t: (key: keyof typeof dict) => dict[key] }) }
})
vi.mock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ setThemeMode: vi.fn() }) }))
vi.mock("@/hooks/useWebMcpBrowser", () => ({ useOpenProjectBrowser: () => vi.fn() }))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ git: null, files: null }) }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/alpha" }))

import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { CommandPalette } from "./CommandPalette"

const sessions = ["open", "draft", "merged", "closed", "unknown"].map((state, index) => ({
  id: state,
  title: `Session ${state}`,
  directory: index % 2 ? "/beta" : "/alpha",
  time: { created: 1, updated: 2 },
})) as Session[]
const rows: SupervisionRow[] = sessions.map((session, index) => ({
  sessionId: session.id,
  title: session.title,
  directory: session.directory,
  projectId: session.directory,
  projectLabel: session.directory === "/alpha" ? "Alpha" : "Beta",
  state: "running",
  updatedAt: 2,
  treeSessionIds: [session.id],
  evidence: null,
  goal: null,
  pullRequest: index < 4 ? { number: 123 + index, state: session.id as "open" | "draft" | "merged" | "closed" } : null,
}))
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
const input = () => document.querySelector<HTMLInputElement>("[cmdk-input]")!
const results = () =>
  Array.from(document.querySelectorAll('[cmdk-item][data-value^="session:"]'), (e) => e.getAttribute("data-value"))
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  useGlobalSessionsStore.setState({ activeSessions: sessions })
  useSupervisionStore.setState({ rows, workingSets: [] })
  useSessionUIStore.setState({ currentSessionId: "open" })
  useDirectoryStore.setState({ currentDirectory: "/alpha" })
  useUIStore.setState({ isCommandPaletteOpen: true, isCommandPaletteSearchMode: false, activeMainTab: "chat" })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test("searches exact PR numbers and every state, excluding absent and stale PRs", async () => {
  render(<CommandPalette />)
  fireEvent.change(input(), { target: { value: "#123" } })
  await settle()
  expect(results()).toEqual(["session:open"])
  fireEvent.change(input(), { target: { value: "#12" } })
  expect(results()).toEqual([])
  fireEvent.change(input(), { target: { value: "#PR" } })
  expect(results()).toEqual(["session:open", "session:draft", "session:merged", "session:closed"])
  for (const state of ["open", "draft", "merged", "closed"]) {
    fireEvent.change(input(), { target: { value: `#PR ${state}` } })
    expect(results()).toEqual([`session:${state}`])
  }
  act(() =>
    useSupervisionStore.setState({
      rows: rows.map((row) => ({ ...row, pullRequest: row.pullRequest ? { ...row.pullRequest, stale: true } : null })),
    }),
  )
  expect(results()).toEqual([])
})

test("Tab reaches a labelled host/project filter; scope combines with PR search and Enter returns to search", async () => {
  render(<CommandPalette />)
  fireEvent.change(input(), { target: { value: "#PR" } })
  act(() => input().focus())
  fireEvent.keyDown(input(), { key: "Tab" })
  const select = document.querySelector("select")!
  expect(document.activeElement).toBe(select)
  expect(document.querySelector(`label[for="${select.id}"]`)?.textContent).toBe("Host / project")
  fireEvent.change(select, { target: { value: "project:/beta" } })
  expect(results()).toEqual(["session:draft", "session:closed"])
  fireEvent.keyDown(select, { key: "Enter" })
  expect(document.activeElement).toBe(input())
  expect(document.getElementById(input().getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Search files, sessions, commands...",
  )
  expect(useUIStore.getState().isCommandPaletteOpen).toBe(true)
  fireEvent.keyDown(input(), { key: "Tab" })
  fireEvent.keyDown(select, { key: "Home" })
  fireEvent.keyDown(select, { key: "ArrowDown" })
  expect(select.value).toBe("host")
  expect(results()).toHaveLength(4)
  fireEvent.keyDown(select, { key: "End" })
  expect(select.value).toBe("project:/beta")
  expect(results()).toEqual(["session:draft", "session:closed"])
  fireEvent.keyDown(select, { key: "ArrowUp" })
  expect(select.value).toBe("project:/alpha")
  expect(results()).toEqual(["session:open", "session:merged"])
  fireEvent.keyDown(select, { key: "Tab", shiftKey: true })
  expect(document.activeElement).toBe(input())
  expect(document.getElementById(input().getAttribute("aria-describedby")!)?.textContent).toContain("Shift+Enter")
  await settle()
})

test("Shift+Enter opens the keyboard-selected session beside the current session without replacing it", async () => {
  render(<CommandPalette />)
  fireEvent.change(input(), { target: { value: "#PR" } })
  await settle()
  act(() => input().focus())
  fireEvent.keyDown(input(), { key: "ArrowDown" })
  await settle()
  expect(document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value")).toBe("session:draft")
  fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
  await settle()
  expect(useUIStore.getState().activeMainTab).toBe("session-grid")
  expect(useUIStore.getState().sessionGrid.slots).toEqual([
    { sessionId: "open", directory: "/alpha" },
    { sessionId: "draft", directory: "/beta" },
  ])
  expect(useSessionUIStore.getState().currentSessionId).toBe("open")
  expect(useUIStore.getState().isCommandPaletteOpen).toBe(false)
})

test("plain Enter opens normally and Shift+Enter on the current session does not duplicate a pane", async () => {
  const open = vi.spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation(() => {})
  render(<CommandPalette />)
  fireEvent.change(input(), { target: { value: "#124" } })
  await settle()
  fireEvent.keyDown(input(), { key: "Enter" })
  expect(open).toHaveBeenCalledWith("draft", "/beta")
  expect(useUIStore.getState().activeMainTab).toBe("chat")
  act(() => useUIStore.setState({ isCommandPaletteOpen: true }))
  fireEvent.change(input(), { target: { value: "#123" } })
  await settle()
  fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
  expect(open).toHaveBeenCalledWith("open", "/alpha")
  expect(useUIStore.getState().activeMainTab).toBe("chat")
})
