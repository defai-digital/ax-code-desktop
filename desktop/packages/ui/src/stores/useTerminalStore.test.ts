import { beforeEach, describe, expect, test, vi } from "vitest"

import { closeTerminal } from "@/lib/terminalApi"
import { useTerminalStore } from "./useTerminalStore"

vi.mock("@/lib/terminalApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/terminalApi")>()),
  closeTerminal: vi.fn(async () => undefined),
}))

describe("useTerminalStore", () => {
  beforeEach(() => {
    vi.mocked(closeTerminal).mockClear()
    useTerminalStore.setState({
      sessions: new Map(),
      projectActionRuns: {},
      nextChunkId: 1,
      nextTabId: 1,
      hasHydrated: true,
    })
  })

  test("normalizes Windows directory variants to the same terminal state", () => {
    useTerminalStore.getState().ensureDirectory("c:\\Repo\\")

    const firstState = useTerminalStore.getState().getDirectoryState("C:/Repo")
    expect(firstState?.tabs).toHaveLength(1)

    const secondTabId = useTerminalStore.getState().createTab("C:/Repo/")
    const normalizedState = useTerminalStore.getState().getDirectoryState("c:/Repo")

    expect(useTerminalStore.getState().sessions).toHaveLength(1)
    // New tabs are prepended (leftmost on the bar).
    expect(normalizedState?.tabs.map((tab) => tab.id)).toEqual([secondTabId, "tab-1"])
  })

  test("does not rehydrate ephemeral terminal session state from storage", () => {
    const persistApi = (
      useTerminalStore as unknown as {
        persist: {
          getOptions: () => {
            merge?: (persisted: unknown, current: unknown) => unknown
            partialize?: (state: unknown) => unknown
          }
        }
      }
    ).persist

    const options = persistApi.getOptions()
    const current = useTerminalStore.getState()
    const merged = options.merge?.(
      {
        sessions: [
          [
            "/repo",
            {
              activeTabId: "tab-1",
              tabs: [
                {
                  id: "tab-1",
                  label: "Terminal",
                  iconKey: null,
                  terminalSessionId: "stale-session-from-last-boot",
                  lifecycle: "exited",
                  createdAt: 1,
                },
              ],
            },
          ],
        ],
        projectActionRuns: {
          legacy: { status: "setup-required", token: "retired", progress: { stage: "installing" } },
        },
        nextTabId: 2,
      },
      current,
    ) as typeof current

    const tab = merged.sessions.get("/repo")?.tabs[0]
    expect(tab?.terminalSessionId).toBeNull()
    expect(tab?.lifecycle).toBe("idle")
    expect(merged.projectActionRuns).toEqual({})
    expect(closeTerminal).not.toHaveBeenCalled()

    // partialize must also avoid writing session ids or lifecycle back out
    useTerminalStore.setState({
      sessions: new Map([
        [
          "/repo",
          {
            activeTabId: "tab-1",
            tabs: [
              {
                id: "tab-1",
                label: "Terminal",
                iconKey: null,
                terminalSessionId: "live-session",
                lifecycle: "running",
                createdAt: 1,
                bufferChunks: [],
                bufferLength: 0,
                isConnecting: false,
                previewUrl: null,
                previewAutoOpened: false,
                previewUrlLocked: false,
              },
            ],
          },
        ],
      ]),
    })
    const partial = options.partialize?.(useTerminalStore.getState()) as {
      sessions: Array<
        [string, { tabs: Array<{ terminalSessionId?: string | null; lifecycle?: "idle" | "running" | "exited" }> }]
      >
    }
    expect(partial.sessions[0][1].tabs[0]).not.toHaveProperty("terminalSessionId")
    expect(partial.sessions[0][1].tabs[0]).not.toHaveProperty("lifecycle")
  })

  test("can atomically recover a missing server session to idle", () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()

    store.setTabSessionId("/repo", tabId!, "live-session")
    store.setTabSessionId("/repo", tabId!, null, { lifecycle: "idle" })

    const tab = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]
    expect(tab?.terminalSessionId).toBeNull()
    expect(tab?.lifecycle).toBe("idle")
  })

  test("ignores late events from a replaced terminal session", () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()

    store.setTabSessionId("/repo", tabId!, "old-session")
    store.appendToBuffer("/repo", tabId!, "old output", { expectedSessionId: "old-session" })
    store.setTabSessionId("/repo", tabId!, "replacement-session")

    expect(
      store.appendToBuffer("/repo", tabId!, "late output", {
        expectedSessionId: "old-session",
      }),
    ).toBe(false)
    store.clearBuffer("/repo", tabId!, { expectedSessionId: "old-session" })
    store.setTabSessionId("/repo", tabId!, null, {
      lifecycle: "exited",
      expectedSessionId: "old-session",
    })

    const tab = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]
    expect(tab?.terminalSessionId).toBe("replacement-session")
    expect(tab?.lifecycle).toBe("running")
    expect(tab?.bufferChunks).toEqual([])
  })

  test("capped append keeps exactly the newest tail within the buffer limit", () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()

    const chunkText = "x".repeat(64)
    const total = 20000
    for (let i = 0; i < total; i += 1) {
      store.appendToBuffer("/repo", tabId!, chunkText)
    }

    const tab = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]
    expect(tab).toBeTruthy()
    const retained = tab!.bufferChunks
    // 1_000_000 / 64 = 15625 chunks fit exactly.
    expect(retained).toHaveLength(15625)
    expect(tab!.bufferLength).toBe(retained.reduce((sum, chunk) => sum + chunk.data.length, 0))
    expect(tab!.bufferLength).toBeLessThanOrEqual(1000000)
    // Retained chunks are exactly the newest tail: ids are the last 15625 issued.
    const expectedFirstId = total - retained.length + 1
    expect(retained[0].id).toBe(expectedFirstId)
    expect(retained[retained.length - 1].id).toBe(total)
    for (let i = 1; i < retained.length; i += 1) {
      expect(retained[i].id).toBe(retained[i - 1].id + 1)
    }
    expect(retained.every((chunk) => chunk.data === chunkText)).toBe(true)
  })

  test("keeps at least one chunk even when a single chunk exceeds the cap", () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()

    const huge = "y".repeat(1000001)
    store.appendToBuffer("/repo", tabId!, huge)

    const tab = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]
    expect(tab!.bufferChunks).toHaveLength(1)
    expect(tab!.bufferChunks[0].data).toBe(huge)
    expect(tab!.bufferLength).toBe(huge.length)

    // A following chunk evicts the huge one but is itself retained.
    store.appendToBuffer("/repo", tabId!, "small")
    const next = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]
    expect(next!.bufferChunks.map((chunk) => chunk.data)).toEqual(["small"])
    expect(next!.bufferLength).toBe(5)
  })

  test("removeDirectory closes the directory's PTY sessions before dropping them", () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()
    store.setTabSessionId("/repo", tabId!, "pty-1")

    store.removeDirectory("/repo")

    expect(useTerminalStore.getState().getDirectoryState("/repo")).toBeUndefined()
    expect(vi.mocked(closeTerminal)).toHaveBeenCalledWith("pty-1")
  })

  test("closeTab keeps a tab that was rebound to another session while closing", async () => {
    const store = useTerminalStore.getState()
    store.ensureDirectory("/repo")
    const tabId = useTerminalStore.getState().getDirectoryState("/repo")?.tabs[0]?.id
    expect(tabId).toBeTruthy()
    store.setTabSessionId("/repo", tabId!, "pty-1")

    // The close is in flight when the tab is rebound to another session.
    vi.mocked(closeTerminal).mockImplementationOnce(async () => {
      useTerminalStore.getState().setTabSessionId("/repo", tabId!, "pty-2")
    })

    await store.closeTab("/repo", tabId!)

    const state = useTerminalStore.getState().getDirectoryState("/repo")
    expect(state?.tabs.some((tab) => tab.id === tabId)).toBe(true)
    expect(vi.mocked(closeTerminal)).toHaveBeenCalledWith("pty-1")
    // The rebound session's PTY must not be closed by this tab's close.
    expect(vi.mocked(closeTerminal)).not.toHaveBeenCalledWith("pty-2")
  })
})
