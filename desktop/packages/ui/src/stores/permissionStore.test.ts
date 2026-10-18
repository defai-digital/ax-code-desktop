import { afterEach, describe, expect, test, vi } from "vitest"

// vi.fn with zero declared parameters records `[]`; the assertions below read the
// recorded arguments, so name their shape once here.
const callsOf = (mock: { mock: { calls: unknown[] } }): Array<[string, { body?: string }]> =>
  mock.mock.calls as Array<[string, { body?: string }]>

const createMemoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size
    },
  } as Storage
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const importStore = async (options: {
  pendingPermissions: Deferred<Array<{ id: string; sessionID: string }>>
  sessions?: Array<{ id: string; parentID?: string }>
  connectionWait?: Promise<void>
}) => {
  vi.resetModules()

  const respondToPermissionMock = vi.fn(async () => undefined)
  const fetchMock = vi.fn(async () => ({ ok: true }))
  vi.stubGlobal("fetch", fetchMock)

  vi.doMock("./utils/safeStorage", () => ({
    getSafeStorage: () => createMemoryStorage(),
  }))
  vi.doMock("@/sync/sync-refs", () => ({
    getAllSyncSessions: () => options.sessions ?? [{ id: "root" }],
    getSyncChildStores: () => ({ children: new Map() }),
  }))
  vi.doMock("@/lib/ax-code/client", () => ({
    axCodeClient: {
      getDirectory: () => "/project",
      listPendingPermissions: vi.fn(() => options.pendingPermissions.promise),
    },
  }))
  vi.doMock("@/sync/session-actions", () => ({
    respondToPermission: respondToPermissionMock,
    waitForConnectionOrThrow: async () => {
      await (options.connectionWait ?? Promise.resolve())
    },
  }))
  vi.doMock("@/sync/session-ui-store", () => ({
    useSessionUIStore: {
      getState: () => ({
        getDirectoryForSession: () => "/project",
      }),
    },
  }))

  const { usePermissionStore } = await import("./permissionStore")
  return { usePermissionStore, respondToPermissionMock, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("permissionStore setSessionAutoAccept", () => {
  test("auto-accepts pending permissions gathered while enabling", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    const { usePermissionStore, respondToPermissionMock } = await importStore({ pendingPermissions })

    const enable = usePermissionStore.getState().setSessionAutoAccept("root", true)
    pendingPermissions.resolve([{ id: "perm-1", sessionID: "root" }])
    await enable

    expect(respondToPermissionMock).toHaveBeenCalledTimes(1)
    expect(respondToPermissionMock).toHaveBeenCalledWith("root", "perm-1", "once")
  })

  test("a disable during the enable gather stops the pending auto-approve batch", async () => {
    // The enable path awaits network lookups before bulk-approving; the user
    // can turn auto-accept back off in that window. The stale enable must
    // not keep approving permissions the user just declined to auto-grant.
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    const { usePermissionStore, respondToPermissionMock } = await importStore({ pendingPermissions })

    const enable = usePermissionStore.getState().setSessionAutoAccept("root", true)
    await usePermissionStore.getState().setSessionAutoAccept("root", false)
    pendingPermissions.resolve([{ id: "perm-1", sessionID: "root" }])
    await enable

    expect(respondToPermissionMock).not.toHaveBeenCalled()
    expect(usePermissionStore.getState().autoAccept["root"]).toBe(false)
  })

  test("does not auto-approve a descendant that has its own auto-accept turned off", async () => {
    // The nearest ancestor with an explicit setting wins, so enabling the parent
    // must not grant prompts for a child the user switched off.
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    const { usePermissionStore, respondToPermissionMock } = await importStore({
      pendingPermissions,
      sessions: [
        { id: "root" },
        { id: "child-off", parentID: "root" },
        { id: "child-default", parentID: "root" },
      ],
    })
    usePermissionStore.setState({ autoAccept: { "child-off": false } })

    const enable = usePermissionStore.getState().setSessionAutoAccept("root", true)
    pendingPermissions.resolve([
      { id: "perm-off", sessionID: "child-off" },
      { id: "perm-inherit", sessionID: "child-default" },
    ])
    await enable

    const approvedIds = callsOf(respondToPermissionMock).map((call) => call[1])
    expect(approvedIds).toEqual(["perm-inherit"])
  })

  test("re-checks the toggle after the connection wait, not before it", async () => {
    // respondToPermission waits up to its grace period for a connection; the
    // decision used to be taken before that wait, so a disable during it still
    // granted the prompt.
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    const connection = deferred<void>()
    const { usePermissionStore, respondToPermissionMock } = await importStore({
      pendingPermissions,
      connectionWait: connection.promise,
    })

    const enable = usePermissionStore.getState().setSessionAutoAccept("root", true)
    pendingPermissions.resolve([{ id: "perm-1", sessionID: "root" }])
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve()
    }

    // The batch is now waiting for the connection; the user switches it off.
    await usePermissionStore.getState().setSessionAutoAccept("root", false)
    connection.resolve()
    await enable

    expect(respondToPermissionMock).not.toHaveBeenCalled()
  })

  test("broadcasts each session's own value rather than the parent's", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore, fetchMock } = await importStore({
      pendingPermissions,
      sessions: [{ id: "root" }, { id: "child-off", parentID: "root" }],
    })
    usePermissionStore.setState({ autoAccept: { "child-off": false } })

    await usePermissionStore.getState().setSessionAutoAccept("root", true)

    const posts = callsOf(fetchMock).map((call) => JSON.parse(String(call[1]?.body)))
    expect(posts).toContainEqual({ sessionId: "root", enabled: true })
    expect(posts).toContainEqual({ sessionId: "child-off", enabled: false })
  })

  test("pruneAutoAccept drops entries for deleted sessions and keeps the rest", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore } = await importStore({ pendingPermissions })

    await usePermissionStore.getState().setSessionAutoAccept("root", true)
    usePermissionStore.setState((state) => ({ autoAccept: { ...state.autoAccept, other: true } }))

    usePermissionStore.getState().pruneAutoAccept(["root", "never-seen"])

    expect(usePermissionStore.getState().autoAccept).toEqual({ other: true })
  })
})

describe("permissionStore default auto-accept", () => {
  test("keeps existing sessions off while the new-chat default is on", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore } = await importStore({ pendingPermissions })

    expect(usePermissionStore.getState().defaultAutoAccept).toBe(true)
    expect(usePermissionStore.getState().isSessionAutoAccepting("root")).toBe(false)
    expect(usePermissionStore.getState().isSessionAutoAccepting("unknown-session")).toBe(false)
  })

  test("toggles the default before a session exists", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore, fetchMock } = await importStore({ pendingPermissions })

    await usePermissionStore.getState().setSessionAutoAccept(null, false)

    expect(usePermissionStore.getState().defaultAutoAccept).toBe(false)
    expect(usePermissionStore.getState().autoAccept).toEqual({})
    expect(usePermissionStore.getState().isSessionAutoAccepting("root")).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("a new root session records the current default and children inherit", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore } = await importStore({ pendingPermissions })

    usePermissionStore.getState().applyDefaultToNewSession("new-root", null)

    expect(usePermissionStore.getState().autoAccept).toEqual({ "new-root": true })
    expect(usePermissionStore.getState().isSessionAutoAccepting("new-root")).toBe(true)

    // A child has no entry of its own, so it follows the parent.
    usePermissionStore.getState().applyDefaultToNewSession("new-child", "new-root")
    expect(usePermissionStore.getState().autoAccept).toEqual({ "new-root": true })

    await usePermissionStore.getState().setSessionAutoAccept(null, false)
    usePermissionStore.getState().applyDefaultToNewSession("later-root", null)

    expect(usePermissionStore.getState().autoAccept).toEqual({
      "new-root": true,
      "later-root": false,
    })
  })

  test("per-session settings keep precedence over a later default change", async () => {
    const pendingPermissions = deferred<Array<{ id: string; sessionID: string }>>()
    pendingPermissions.resolve([])
    const { usePermissionStore } = await importStore({ pendingPermissions })

    await usePermissionStore.getState().setSessionAutoAccept("root", false)
    await usePermissionStore.getState().setSessionAutoAccept(null, true)
    usePermissionStore.getState().applyDefaultToNewSession("other", null)

    expect(usePermissionStore.getState().defaultAutoAccept).toBe(true)
    expect(usePermissionStore.getState().isSessionAutoAccepting("root")).toBe(false)
    expect(usePermissionStore.getState().isSessionAutoAccepting("other")).toBe(true)
  })
})
