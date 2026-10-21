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

const syncSessions: Array<Record<string, unknown>> = [
  { id: "root-1", title: "Tray session", time: { created: 1, updated: 2 } },
]

const defaultPermissions = () => [
  { id: "perm-1", sessionID: "root-1", permission: "Bash", patterns: ["rm -rf x"], always: [] as string[] },
]
let trayPermissions: Array<Record<string, unknown>> = defaultPermissions()
let extraChildState: (() => Record<string, unknown>) | null = null

vi.doMock("@/sync/sync-refs", () => ({
  getAllSyncSessions: () => syncSessions,
  getSyncChildStores: () => ({
    children: new Map([
      [
        "/repo",
        {
          getState: () => ({
            session: syncSessions,
            session_status: { "root-1": { type: "busy" } },
            permission: { "root-1": trayPermissions },
            question: {},
          }),
        },
      ],
      ...(extraChildState ? [["/extra", { getState: extraChildState }] as const] : []),
    ]),
  }),
}))

const { useTraySync } = await import("./useTraySync")
const { useGitStore } = await import("@/stores/useGitStore")
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
    syncSessions.length = 0
    syncSessions.push({ id: "root-1", title: "Tray session", time: { created: 1, updated: 2 } })
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      pendingRemoval: new Map(),
      deleteTombstones: new Map(),
      hasLoaded: true,
      status: "ready",
    })
    useGitStore.setState({ directories: new Map() })
    trayPermissions = defaultPermissions()
    extraChildState = null
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

  test("keeps a busy status when another store holds a stale idle copy", async () => {
    extraChildState = () => ({
      session: syncSessions,
      session_status: { "root-1": { type: "idle" } },
      permission: {},
      question: {},
    })

    await render()

    const trayCall = invokeCalls().find((call) => call[0] === "desktop_tray_update")
    const snapshot = trayCall?.[1] as { sessions: Array<{ id: string; status: string }> }
    expect(snapshot.sessions[0]).toMatchObject({ id: "root-1", status: "busy" })
  })

  test("lists a must-decide approval first and never offers allow-always for it", async () => {
    trayPermissions = [
      {
        id: "risky",
        sessionID: "root-1",
        permission: "edit",
        patterns: ["src/a.ts"],
        always: ["src/*"],
        riskClass: "risk",
      },
      {
        id: "decide",
        sessionID: "root-1",
        permission: "bash_destructive",
        patterns: ["rm -rf build"],
        always: ["rm *"],
        riskClass: "risk",
        interactiveOnly: true,
      },
    ]
    await render()

    const trayCall = invokeCalls().find((call) => call[0] === "desktop_tray_update")
    const approvals = (trayCall?.[1] as { approvals: Array<{ id: string; canSave: boolean }> }).approvals
    expect(approvals.map((approval) => [approval.id, approval.canSave])).toEqual([
      ["decide", false],
      ["risky", true],
    ])
  })

  test("reports a rejected tray update instead of letting it escape", async () => {
    // The try/catch around the flush only covers the synchronous snapshot build: a rejected invoke
    // (the window gone, the handler throwing) came back as an unhandled rejection on every store
    // change and on the five-second poll for as long as it kept failing.
    invokeDesktopMock.mockRejectedValue(new Error("ipc dead"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    try {
      await render()

      expect(warn).toHaveBeenCalledWith("[tray-sync] failed to update the tray", expect.any(Error))
    } finally {
      warn.mockRestore()
    }
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
      const snapshot = trayCall?.[1] as { dockBadgeCount: number; sessions: Array<{ id: string; unseen: number }> }
      expect(snapshot.sessions.find((session) => session.id === "root-1")?.unseen).toBe(3)
      // The badge counts decisions waiting for the person (one pending permission here), not unread activity.
      expect(snapshot.dockBadgeCount).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("shows the current git branch in the session subtitle when the git store knows it", async () => {
    syncSessions.push({ id: "root-2", title: "Branched session", directory: "/repo", time: { created: 3, updated: 4 } })
    useGlobalSessionsStore.setState({ sessionsByDirectory: new Map([["/repo", []]]) })
    useGitStore.setState({
      directories: new Map([["/repo", { branches: { all: ["main"], current: "main", branches: {} } } as never]]),
    })

    await render()

    const trayCall = invokeCalls().find((call) => call[0] === "desktop_tray_update")
    const snapshot = trayCall?.[1] as { sessions: Array<{ id: string; branch: string; subtitle: string }> }
    const branched = snapshot.sessions.find((session) => session.id === "root-2")
    expect(branched).toMatchObject({ branch: "main", subtitle: "repo · main" })
  })
})
