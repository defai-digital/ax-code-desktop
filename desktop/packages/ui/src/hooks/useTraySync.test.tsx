import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Zero-arg mock: the assertions read the recorded calls through the helper below.
const invokeDesktopMock = vi.fn(async () => null)
const isDesktopShellMock = vi.fn(() => true)

vi.doMock("@/lib/desktop", () => ({
  invokeDesktop: invokeDesktopMock,
  isDesktopShell: isDesktopShellMock,
}))

vi.doMock("@/sync/sync-refs", () => ({
  getAllSyncSessions: () => [
    { id: "root-1", title: "Tray session", time: { created: 1, updated: 2 } },
  ],
  getSyncChildStores: () => ({
    children: new Map([
      [
        "/repo",
        {
          getState: () => ({
            session_status: { "root-1": { type: "busy" } },
            permission: { "root-1": [{ id: "perm-1", sessionID: "root-1", permission: "Bash", patterns: ["rm -rf x"], always: [] }] },
            question: {},
          }),
        },
      ],
    ]),
  }),
}))

const { useTraySync } = await import("./useTraySync")
const { useGlobalSessionsStore } = await import("@/stores/useGlobalSessionsStore")
const { useSyncNotificationStore } = await import("@/sync/notification-store")

type InvokeCall = [string, Record<string, unknown>]

const invokeCalls = (): InvokeCall[] => invokeDesktopMock.mock.calls as unknown as InvokeCall[]

describe("useTraySync", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    invokeDesktopMock.mockClear()
    isDesktopShellMock.mockReturnValue(true)
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      pendingRemoval: new Map(),
      deleteTombstones: new Map(),
      hasLoaded: true,
      status: "ready",
    })
  })

  afterEach(() => {
    React.act(() => {
      root.unmount()
    })
    container.remove()
    vi.resetModules()
  })

  const render = async () => {
    await React.act(async () => {
      root.render(React.createElement(Probe))
    })
  }

  const Probe: React.FC = () => {
    useTraySync()
    return React.createElement("div")
  }

  test("pushes a snapshot and the dock badge to the main process", async () => {
    await render()

    const trayCall = invokeCalls().find((call) => call[0] === "desktop_tray_update")
    expect(trayCall).toBeTruthy()
    const snapshot = trayCall?.[1] as {
      sessions: Array<{ id: string; status: string }>
      approvals: unknown[]
    }
    expect(snapshot.sessions[0]).toMatchObject({ id: "root-1", status: "busy" })
    expect(snapshot.approvals).toHaveLength(1)

    expect(invokeCalls().some((call) => call[0] === "desktop_set_badge_count")).toBe(true)
  })

  test("does nothing outside the desktop shell", async () => {
    isDesktopShellMock.mockReturnValue(false)

    await render()

    expect(invokeDesktopMock).not.toHaveBeenCalled()
  })

  test("flushes again when a subscribed store changes", async () => {
    vi.useFakeTimers()
    try {
      await render()
      invokeDesktopMock.mockClear()

      await React.act(async () => {
        useSyncNotificationStore.setState((state) => ({
          index: {
            ...state.index,
            session: {
              ...state.index.session,
              unseenCount: { ...state.index.session.unseenCount, "root-1": 3 },
            },
          },
        }))
      })
      await React.act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      const trayCall = invokeCalls().find((call) => call[0] === "desktop_tray_update")
      expect(trayCall).toBeTruthy()
      const snapshot = trayCall?.[1] as { dockBadgeCount: number }
      expect(snapshot.dockBadgeCount).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
