import { beforeEach, describe, expect, test, vi } from "vitest"

const harness = vi.hoisted(() => ({
  openContextPanelTab: vi.fn(),
  setContextPanelWidth: vi.fn(),
  width: undefined as number | undefined,
  activeMainTab: "chat",
  setState: vi.fn(),
  currentDirectory: "/repo/a" as string | undefined,
}))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: {
    getState: () => ({
      openContextPanelTab: harness.openContextPanelTab,
      setContextPanelWidth: harness.setContextPanelWidth,
      activeMainTab: harness.activeMainTab,
      contextPanelByDirectory: harness.width === undefined ? {} : { "/repo/a": { width: harness.width } },
    }),
    setState: harness.setState,
  },
}))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: { getState: () => ({ currentDirectory: harness.currentDirectory }) } }))

import { openSessionBeside } from "./openSessionBeside"

describe("openSessionBeside", () => {
  beforeEach(() => {
    harness.openContextPanelTab.mockClear()
    harness.setState.mockClear()
    harness.setContextPanelWidth.mockClear()
    harness.width = undefined
    harness.activeMainTab = "chat"
    harness.currentDirectory = "/repo/a"
  })

  test("adds a chat tab to the current project's panel with the session's own directory and shows the pane", () => {
    expect(openSessionBeside({ sessionId: "ses_b", directory: "/repo/b", title: "Other" })).toBe(true)
    expect(harness.openContextPanelTab).toHaveBeenCalledWith("/repo/a", {
      mode: "chat",
      dedupeKey: "session:ses_b",
      label: "Other",
      targetPath: "/repo/b",
    })
    expect(harness.setState).not.toHaveBeenCalled()
    harness.activeMainTab = "files"
    openSessionBeside({ sessionId: "ses_b", directory: "/repo/b", title: "Other" })
    expect(harness.setState).toHaveBeenCalledWith({ activeMainTab: "chat" })
  })

  test("falls back to the session's directory when no project is showing, and refuses without a place to put it", () => {
    harness.currentDirectory = undefined
    expect(openSessionBeside({ sessionId: "ses_b", directory: "/repo/b", title: "Other" })).toBe(true)
    expect(harness.openContextPanelTab.mock.calls[0]?.[0]).toBe("/repo/b")
    harness.openContextPanelTab.mockClear()
    expect(openSessionBeside({ sessionId: "ses_b", directory: null, title: "Other" })).toBe(false)
    expect(openSessionBeside({ sessionId: "", directory: "/repo/b", title: "Other" })).toBe(false)
    expect(harness.openContextPanelTab).not.toHaveBeenCalled()
  })

  test("widens a narrow panel to half the window and keeps a wider one", () => {
    vi.stubGlobal("innerWidth", 1600)
    try {
      harness.width = 380
      openSessionBeside({ sessionId: "ses_b", directory: "/repo/b", title: "Other" })
      expect(harness.setContextPanelWidth).toHaveBeenCalledWith("/repo/a", 800)
      harness.setContextPanelWidth.mockClear()
      harness.width = 1000
      openSessionBeside({ sessionId: "ses_b", directory: "/repo/b", title: "Other" })
      expect(harness.setContextPanelWidth).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
