import { describe, expect, test, beforeEach, vi } from "vitest"
import type { PermissionRequest } from "@/types/permission"
import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { resolveResyncedSessionStatus, hasCompletedAssistantReply } from "./reconnect-recovery"
import { useConnectionStore } from "@/lib/event-stream/connection-state"
import { PartMap } from "./part-map"

// Mock SDK client that records permission.reply / question.reply calls
let pendingListResult: { data?: unknown; error?: { message: string } } = { data: [] }
const listCalls: Array<{ kind: string; params: Record<string, unknown> }> = []
const replyCalls: Array<{ method: string; params: Record<string, unknown> }> = []
const createSessionCalls: Array<{ client: "scoped" | "global"; params: Record<string, unknown> }> = []
const sessionCalls: Array<{ method: string; params: Record<string, unknown> }> = []
const toastErrorMock = vi.fn()
const setCurrentSessionMock = vi.fn()
const markSessionAbortedMock = vi.fn()
const clearSessionAbortMock = vi.fn()
const upsertSessionMock = vi.fn()
const removeSessionsMock = vi.fn()
const archiveSessionsMock = vi.fn()
const deleteArchivedSessionMock = vi.fn()
const registeredSessionDirectories: Array<{ sessionID: string; directory: string }> = []
const inputCalls: Array<{ method: string; params?: Record<string, unknown> }> = []
const inheritSessionAutoAcceptMock = vi.fn()
let mockCurrentSessionId: string | null = null
let inputStoreState: {
  pendingInputText: string | null
  pendingInputMode: "replace" | "append"
  attachedFiles: Array<Record<string, unknown>>
} = {
  pendingInputText: null,
  pendingInputMode: "replace",
  attachedFiles: [],
}
type MockSessionCreateResult = {
  data?: { id: string; directory: unknown }
  error?: { message: string }
}
// A failed fork returns an error and no session, which the mock must be able to
// express: the SDK's own result type is a union of both shapes.
type MockSessionForkResult = {
  data?: { id: string; directory: unknown; title: string; time: { created: number; updated: number } }
  error?: { message: string }
}

let configState: {
  probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>
} = {
  probeConnection: () => Promise.resolve(true),
}

// S4.7: isConnected/hasEverConnected/lastDisconnectReason moved to the
// transport-owned connection store; session-actions reads it directly, so
// tests drive the real store instead of mocking those fields.
function resetConnectionState(overrides: { connected?: boolean; hasEverConnected?: boolean } = {}) {
  const hasEverConnected = overrides.hasEverConnected ?? true
  useConnectionStore.setState({
    phase: (overrides.connected ?? true) ? "connected" : hasEverConnected ? "reconnecting" : "connecting",
    hasEverConnected,
    lastDisconnectReason: null,
  })
}

function resetConfigState() {
  configState = {
    probeConnection: () => Promise.resolve(true),
  }
  resetConnectionState()
}

// Configurable result for the session.messages refetch the accepted-prompt
// watchdog performs before fabricating a failure. Defaults to "server has
// nothing" so the watchdog falls through to the synthetic error.
let scopedMessagesResult: { data: Array<{ info: Message; parts?: Part[] }>; error?: { message: string } } = {
  data: [],
}
// Answers for the next `session.messages` calls, in order — a test that needs the first read to fail and the
// next to succeed (the unrevert retry) queues them here.
let scopedMessagesQueue: Array<{ data: Array<{ info: Message; parts?: Part[] }>; error?: { message: string } }> = []
function resetScopedMessagesResult() {
  scopedMessagesResult = { data: [] }
  scopedMessagesQueue = []
}

const mockScopedClient = {
  permission: {
    list: vi.fn((params: Record<string, unknown>) => {
      listCalls.push({ kind: "permission", params })
      return Promise.resolve(pendingListResult)
    }),
    reply: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "permission.reply", params })
      return Promise.resolve({ data: true })
    }),
  },
  session: {
    create: vi.fn((params: Record<string, unknown>): Promise<MockSessionCreateResult> => {
      createSessionCalls.push({ client: "scoped", params })
      return Promise.resolve({ data: { id: "ses_scoped", directory: params.directory } })
    }),
    messages: vi.fn(() => Promise.resolve(scopedMessagesQueue.shift() ?? scopedMessagesResult)),
    abort: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.abort", params })
      return Promise.resolve({ data: true })
    }),
    revert: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.revert", params })
      return Promise.resolve({
        data: {
          id: params.sessionID,
          directory: params.directory,
          revert: { messageID: params.messageID },
          time: { created: 1, updated: 2 },
        },
      })
    }),
    unrevert: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.unrevert", params })
      return Promise.resolve({
        data: {
          id: params.sessionID,
          directory: params.directory,
          revert: undefined,
          time: { created: 1, updated: 3 },
        },
      })
    }),
    fork: vi.fn((params: Record<string, unknown>): Promise<MockSessionForkResult> => {
      sessionCalls.push({ method: "session.fork", params })
      return Promise.resolve({
        data: {
          id: "session-b-fork",
          directory: params.directory,
          title: "Forked",
          time: { created: 2, updated: 2 },
        },
      })
    }),
    rollback: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.rollback", params })
      return Promise.resolve({
        data: {
          id: params.sessionID,
          directory: params.directory,
          revert: { messageID: "msg-kept" },
          time: { created: 1, updated: 4 },
        },
      })
    }),
    moveValidate: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.moveValidate", params })
      return Promise.resolve({
        data: {
          sessionID: params.sessionID,
          valid: true,
          reason: "ok",
          current: {
            directory: params.directory,
            projectID: "proj_1",
            worktree: "/worktree",
          },
          target: {
            directory: params.targetDirectory,
            exists: true,
            isDirectory: true,
            sameDirectory: false,
            withinCurrentProject: true,
            git: { worktree: "/worktree", branch: "main", dirty: false },
          },
          warnings: [],
        },
      })
    }),
    move: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.move", params })
      return Promise.resolve({
        data: {
          id: params.sessionID,
          directory: params.targetDirectory,
          title: "Moved",
          time: { created: 1, updated: 5 },
        },
      })
    }),
    update: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.update", params })
      return Promise.resolve({
        data: {
          id: params.sessionID,
          directory: params.directory,
          time: { created: 1, updated: 6 },
        },
      })
    }),
    delete: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.delete", params })
      return Promise.resolve({ data: true })
    }),
  },
  question: {
    list: vi.fn((params: Record<string, unknown>) => {
      listCalls.push({ kind: "question", params })
      return Promise.resolve(pendingListResult)
    }),
    reply: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reply", params })
      return Promise.resolve({ data: true })
    }),
    reject: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reject", params })
      return Promise.resolve({ data: true })
    }),
  },
}

const mockSdk = {
  session: {
    create: vi.fn((params: Record<string, unknown>): Promise<MockSessionCreateResult> => {
      createSessionCalls.push({ client: "global", params })
      return Promise.resolve({ data: { id: "ses_global", directory: params.directory } })
    }),
    update: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.update", params })
      return Promise.resolve({ data: { id: params.sessionID, directory: params.directory, metadata: params.metadata } })
    }),
    abort: vi.fn((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.abort", params })
      return Promise.resolve({ data: true })
    }),
  },
  permission: {
    reply: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "permission.reply", params })
      return Promise.resolve({ data: true })
    }),
  },
  question: {
    reply: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reply", params })
      return Promise.resolve({ data: true })
    }),
    reject: vi.fn((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reject", params })
      return Promise.resolve({ data: true })
    }),
  },
}

// Mock axCodeClient singleton. `ascendingId` is a pure, monotonic id generator used by
// optimisticSend — provide a faithful stub so store insertion order (sorted by id) is stable.
let mockIdCounter = 0
vi.doMock("@/components/ui", () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
}))
vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getScopedSdkClient: () => mockScopedClient,
    deleteArchivedSession: deleteArchivedSessionMock,
    getDirectory: () => "/test/project",
    checkHealth: () => Promise.resolve(true),
  },
  ascendingId: (prefix: "msg" | "prt") => `${prefix}_${(mockIdCounter++).toString(16).padStart(12, "0")}mockrandom0001`,
  // Mirrors the client's own validation: only a msg-branded id may be forwarded.
  isValidMessageId: (id: unknown) => typeof id === "string" && id.startsWith("msg_"),
}))

// Mock useConfigStore
vi.doMock("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => configState,
  },
}))

// Mock useSessionUIStore
vi.doMock("./session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      currentSessionId: mockCurrentSessionId,
      getDirectoryForSession: (sessionId: string) => {
        if (sessionId === "session-a") return "/test/project"
        if (sessionId === "session-b") return "/other/project"
        return null
      },
      setCurrentSession: setCurrentSessionMock,
      markSessionAborted: markSessionAbortedMock,
      clearSessionAbort: clearSessionAbortMock,
    }),
  },
}))

vi.doMock("./input-store", () => ({
  useInputStore: {
    getState: () => ({
      ...inputStoreState,
      clearAttachedFiles: () => {
        inputCalls.push({ method: "clearAttachedFiles" })
        inputStoreState = { ...inputStoreState, attachedFiles: [] }
      },
      addRestoredAttachment: (params: Record<string, unknown>) => {
        inputCalls.push({ method: "addRestoredAttachment", params })
        inputStoreState = {
          ...inputStoreState,
          attachedFiles: [...inputStoreState.attachedFiles, { source: "server", ...params }],
        }
      },
      addMcpResourceAttachment: (params: Record<string, unknown>) => {
        inputCalls.push({ method: "addMcpResourceAttachment", params })
        inputStoreState = {
          ...inputStoreState,
          attachedFiles: [...inputStoreState.attachedFiles, { source: "mcp-resource", ...params }],
        }
      },
      setActiveAttachmentDraft: (key: string | null) => {
        inputCalls.push({ method: "setActiveAttachmentDraft", params: { key } })
      },
    }),
    setState: (patch: Partial<typeof inputStoreState>) => {
      inputStoreState = { ...inputStoreState, ...patch }
    },
  },
}))

// Mock useGlobalSessionsStore (imported but not used in permission functions)
vi.doMock("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      upsertSession: upsertSessionMock,
      removeSessions: removeSessionsMock,
      archiveSessions: archiveSessionsMock,
    }),
  },
}))

// Mock sync-refs (imported but not used in permission functions)
vi.doMock("./sync-refs", () => ({
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredSessionDirectories.push({ sessionID, directory })
  },
}))

// The permission store owns the registered handler; the fork path must hand the
// source session's setting to it instead of losing it to the legacy default.
vi.doMock("@/stores/utils/sessionAutoAcceptSeed", () => ({
  seedSessionAutoAccept: vi.fn(),
  inheritSessionAutoAccept: inheritSessionAutoAcceptMock,
}))

import { create, type StoreApi } from "zustand"
import { INITIAL_STATE } from "./types"
import type { DirectoryStore } from "./child-store"
import type { AxCodeClient } from "@defai-digital/ax-code-sdk/v2/client"

function createStore(permissions: Record<string, PermissionRequest[]>): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    permission: permissions,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

function createChildStores(entries: Array<[string, StoreApi<DirectoryStore>]>) {
  return {
    children: new Map(entries),
    ensureChild: (dir: string) => {
      const store = new Map(entries).get(dir)
      if (!store) throw new Error(`No store for ${dir}`)
      return store
    },
  } as unknown as import("./child-store").ChildStoreManager
}

// Each test re-imports "./session-actions" via dynamic import; reset the module
// registry first so the SUT's module-level state (acceptedPromptAt, watchdog
// timer maps) starts clean per test. Without this, a prior test's accepted
// prompt leaks in and the grace-window watchdog re-arms unboundedly (OOM).
beforeEach(() => {
  vi.resetModules()
  resetScopedMessagesResult()
  pendingListResult = { data: [] }
  listCalls.length = 0
  sessionCalls.length = 0
  inputCalls.length = 0
  registeredSessionDirectories.length = 0
  upsertSessionMock.mockClear()
  removeSessionsMock.mockClear()
  setCurrentSessionMock.mockClear()
  inheritSessionAutoAcceptMock.mockClear()
  mockCurrentSessionId = null
  inputStoreState = {
    pendingInputText: null,
    pendingInputMode: "replace",
    attachedFiles: [],
  }
})

describe("respondToPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory from child store when permission is found", async () => {
    const permission: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-a",
      permission: "bash",
      patterns: [],
      metadata: {},
      always: [],
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToPermission("session-a", "perm-1", "once")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-1")
    expect(replyCalls[0].params.reply).toBe("once")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("passes directory from session mapping when permission not in store", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToPermission("session-b", "perm-2", "always")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-2")
    expect(replyCalls[0].params.reply).toBe("always")
    expect(replyCalls[0].params.directory).toBe("/other/project")
  })

  test("reports a failed message refetch instead of reading it as nothing to restore", async () => {
    // The refetch ignored `result.error` and returned on an empty list, so the revert and redo paths applied their
    // marker onto whatever messages were already in the store and the restored toast was shown for a read that
    // had returned nothing. `assertSessionCallSucceeded` exists for exactly this and the sibling reader uses it.
    const store = createStore({ "session-a": [] })
    const childStores = createChildStores([["/test/project", store]])
    const { refetchSessionMessages, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    scopedMessagesResult = { data: [], error: { message: "boom" } }

    await expect(refetchSessionMessages("session-a")).rejects.toThrow("refetchSessionMessages failed")
  })

  test("keeps retrying the unrevert refetch after a failed read", async () => {
    // `refetchSessionMessages` reports a failed read now, and this loop exists for a read that has not caught up
    // yet: a transient failure on the first attempt must not end the retries, or the restore is applied
    // server-side and reported as failed with the messages never fetched.
    const store = createStore({ "session-a": [] })
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, unrevertSession } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    scopedMessagesQueue = [
      { data: [], error: { message: "boom" } },
      { data: [{ info: { id: "msg_restored", role: "user", time: { created: 1 } } as Message, parts: [] }] },
    ]

    await expect(unrevertSession("session-a")).resolves.toBeUndefined()

    expect(store.getState().message["session-a"]?.map((message: { id: string }) => message.id)).toEqual([
      "msg_restored",
    ])
  })

  test("reports the unrevert refetch failure when every attempt fails", async () => {
    const store = createStore({ "session-a": [] })
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, unrevertSession } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    scopedMessagesQueue = [
      { data: [], error: { message: "boom" } },
      { data: [], error: { message: "boom" } },
      { data: [], error: { message: "boom" } },
    ]

    await expect(unrevertSession("session-a")).rejects.toThrow("refetchSessionMessages failed")
  })

  test("passes directory from current directory as last resort", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/fallback/dir")

    await respondToPermission("unknown-session", "perm-3", "reject")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-3")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/fallback/dir")
  })
})

describe("createSession passes directory", () => {
  beforeEach(() => {
    createSessionCalls.length = 0
    mockScopedClient.session.create.mockImplementation(
      (params: Record<string, unknown>): Promise<MockSessionCreateResult> => {
        createSessionCalls.push({ client: "scoped", params })
        return Promise.resolve({ data: { id: "ses_scoped", directory: params.directory } })
      },
    )
    mockSdk.session.create.mockImplementation((params: Record<string, unknown>): Promise<MockSessionCreateResult> => {
      createSessionCalls.push({ client: "global", params })
      return Promise.resolve({ data: { id: "ses_global", directory: params.directory } })
    })
  })

  test("uses a directory-scoped SDK client when a directory is provided", async () => {
    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")

    const session = await createSession("Desktop session", "/selected/project", null)

    expect(session?.id).toBe("ses_scoped")
    expect(createSessionCalls).toEqual([
      {
        client: "scoped",
        params: {
          directory: "/selected/project",
          title: "Desktop session",
          parentID: undefined,
        },
      },
    ])
  })

  test("throws the SDK error message when session creation fails", async () => {
    mockScopedClient.session.create.mockImplementationOnce((params: Record<string, unknown>) => {
      createSessionCalls.push({ client: "scoped", params })
      return Promise.resolve({ error: { message: "Project directory is not accessible" } })
    })

    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")

    await expect(createSession("Desktop session", "/selected/project", null)).rejects.toThrow(
      "Failed to create session: Project directory is not accessible",
    )
  })

  test("rejects a response that carries no session id", async () => {
    mockScopedClient.session.create.mockImplementationOnce((params: Record<string, unknown>) => {
      createSessionCalls.push({ client: "scoped", params })
      return Promise.resolve({ data: [] }) as unknown as Promise<MockSessionCreateResult>
    })

    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")
    setCurrentSessionMock.mockClear()
    upsertSessionMock.mockClear()

    await expect(createSession("Desktop session", "/selected/project", null)).rejects.toThrow(
      "Failed to create session: response did not include a session id",
    )
    expect(setCurrentSessionMock).not.toHaveBeenCalled()
    expect(upsertSessionMock).not.toHaveBeenCalled()
  })

  test("stores the request directory when the created response omits it", async () => {
    mockScopedClient.session.create.mockImplementationOnce((params: Record<string, unknown>) => {
      createSessionCalls.push({ client: "scoped", params })
      return Promise.resolve({ data: { id: "ses_scoped" } }) as unknown as Promise<MockSessionCreateResult>
    })

    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")

    const created = await createSession("Desktop session", "/selected/project", null)

    expect(created).toMatchObject({ id: "ses_scoped", directory: "/selected/project" })
    expect(setCurrentSessionMock).toHaveBeenCalledWith("ses_scoped", "/selected/project")
    expect(upsertSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ses_scoped", directory: "/selected/project" }),
    )
  })
})

describe("unarchiveSession", () => {
  test("clears the archive timestamp through the session's scoped client and lets the event restore the global list", async () => {
    const { setActionRefs, unarchiveSession } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")

    await expect(unarchiveSession("session-a")).resolves.toBe(true)

    expect(sessionCalls).toContainEqual({
      method: "session.update",
      params: {
        sessionID: "session-a",
        directory: "/test/project",
        time: { archived: null },
      },
    })
    // S4.5: no manual global-store write — the session.updated(archived: null)
    // event is the writer of record that restores the session to active.
    expect(upsertSessionMock).not.toHaveBeenCalled()
  })

  test("waits out the runtime rate limit instead of reporting a failure", async () => {
    // Archive and unarchive share the runtime's PATCH /session bucket: a bulk
    // archive that fills the window must not make the immediate undo fail.
    vi.useFakeTimers()
    try {
      mockScopedClient.session.update
        .mockResolvedValueOnce({
          error: { name: "ServiceUnavailableError", message: "Too many requests", status: 429 },
          response: { status: 429 },
        } as never)
        .mockResolvedValueOnce({ data: {}, response: { status: 200 } } as never)

      const { setActionRefs, unarchiveSession } = await import("./session-actions")
      setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/current/project")

      const pending = unarchiveSession("session-a")
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(pending).resolves.toBe(true)
      expect(toastErrorMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("session mutations treat an SDK error response as a failure", () => {
  beforeEach(() => {
    sessionCalls.length = 0
    toastErrorMock.mockClear()
    removeSessionsMock.mockClear()
    markSessionAbortedMock.mockClear()
  })

  test("deleteSession rolls back and reports failure when the SDK answers with an error", async () => {
    // The generated SDK resolves with `{ error }` instead of throwing on a
    // non-2xx response; treating that as success deleted the session from the
    // UI, dropped its persisted state and showed no error.
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    mockScopedClient.session.delete.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.delete", params })
      return Promise.resolve({ error: { message: "Internal error" } } as never)
    })

    const { deleteSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )

    await expect(deleteSession("session-a")).resolves.toBe(false)

    expect(store.getState().session.map((session) => session.id)).toEqual(["session-a"])
    expect(removeSessionsMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to delete session", {
      id: "session-action-delete-failed",
    })
  })

  test.each(["delete", "archive"] as const)(
    "%s does not treat a missing project route as a missing session",
    async (action) => {
      const session = { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as Session
      const store = createStore({})
      store.setState({ session: [session] })
      const method = action === "delete" ? mockScopedClient.session.delete : mockScopedClient.session.update
      method.mockResolvedValueOnce({
        error: { name: "NotFoundError", data: { message: "Project directory not found: /test/project" } },
        response: { status: 404 },
      } as never)
      const actions = await import("./session-actions")
      actions.setActionRefs(
        mockSdk as unknown as AxCodeClient,
        createChildStores([["/test/project", store]]),
        () => "/test/project",
      )
      await expect(
        action === "delete" ? actions.deleteSession(session.id) : actions.archiveSession(session.id),
      ).resolves.toBe(false)
      expect(store.getState().session).toEqual([session])
      expect(removeSessionsMock).not.toHaveBeenCalled()
      expect(archiveSessionsMock).not.toHaveBeenCalled()
    },
  )

  test.each([200, 409, 404])("archived deletion uses maintenance and handles status %s safely", async (status) => {
    const session = {
      id: "session-a",
      directory: "/test/project",
      time: { created: 1, updated: 1, archived: 2 },
    } as Session
    const store = createStore({})
    store.setState({ session: [session] })
    deleteArchivedSessionMock.mockResolvedValueOnce(
      status === 200
        ? { data: true, response: { status } }
        : { error: { message: status === 409 ? "Active descendant" : "Unknown route" }, response: { status } },
    )
    const scopedCalls = mockScopedClient.session.delete.mock.calls.length
    const actions = await import("./session-actions")
    actions.setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )
    await expect(actions.deleteSession(session.id)).resolves.toBe(status === 200)
    expect(deleteArchivedSessionMock).toHaveBeenLastCalledWith(session.id)
    expect(mockScopedClient.session.delete.mock.calls.length - scopedCalls).toBe(0)
    expect(store.getState().session).toEqual(status === 200 ? [] : [session])
  })

  test.each(["delete", "archive"] as const)(
    "%s recognizes the runtime's normalized session-specific 404",
    async (action) => {
      const store = createStore({})
      store.setState({
        session: [{ id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as Session],
      })
      const method = action === "delete" ? mockScopedClient.session.delete : mockScopedClient.session.update
      method.mockResolvedValueOnce({
        error: {
          name: "SessionNotFoundError",
          message: "Session not found",
          status: 404,
          details: { resource: "session" },
        },
        response: { status: 404 },
      } as never)
      const actions = await import("./session-actions")
      actions.setActionRefs(
        mockSdk as unknown as AxCodeClient,
        createChildStores([["/test/project", store]]),
        () => "/test/project",
      )
      await expect(
        action === "delete" ? actions.deleteSession("session-a") : actions.archiveSession("session-a"),
      ).resolves.toBe(true)
      expect(removeSessionsMock).toHaveBeenCalledWith(["session-a"])
      expect(store.getState().session).toEqual([])
    },
  )

  test("deleteSession treats an already-deleted session as deleted", async () => {
    // Deleting a parent cascades to its children on the runtime, so a bulk
    // delete that also selected a child gets 404 for it.
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    mockScopedClient.session.delete.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.delete", params })
      return Promise.resolve({
        error: { name: "NotFoundError", data: { message: "Session not found: session-a" } },
        response: { status: 404 },
      } as never)
    })

    const { deleteSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )

    await expect(deleteSession("session-a")).resolves.toBe(true)

    expect(store.getState().session).toEqual([])
    expect(removeSessionsMock).toHaveBeenCalledWith(["session-a"])
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  test("deleteSession waits out the runtime rate limit instead of failing", async () => {
    // The runtime allows 120 mutating session requests a minute; a bulk delete of
    // hundreds of sessions used to fail every request after the cap.
    vi.useFakeTimers()
    try {
      const store = createStore({})
      store.setState({
        session: [
          { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
        ],
      })
      mockScopedClient.session.delete
        .mockImplementationOnce(() =>
          Promise.resolve({
            error: { name: "ServiceUnavailableError", message: "Too many requests", status: 429 },
            response: { status: 429 },
          } as never),
        )
        .mockImplementationOnce(() => Promise.resolve({ data: true, response: { status: 200 } } as never))

      const { deleteSession, setActionRefs } = await import("./session-actions")
      setActionRefs(
        mockSdk as unknown as AxCodeClient,
        createChildStores([["/test/project", store]]),
        () => "/test/project",
      )

      const pending = deleteSession("session-a")
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(pending).resolves.toBe(true)
      expect(store.getState().session).toEqual([])
      expect(toastErrorMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  test("archiveSession removes an already-gone session without restoring a ghost row", async () => {
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    mockScopedClient.session.update.mockImplementationOnce(() =>
      Promise.resolve({
        error: { name: "NotFoundError", data: { message: "Session not found: session-a" } },
        response: { status: 404 },
      } as never),
    )
    const { archiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )
    await expect(archiveSession("session-a")).resolves.toBe(true)
    expect(store.getState().session).toEqual([])
    expect(removeSessionsMock).toHaveBeenCalledWith(["session-a"])
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  test("archiveSession rolls back and reports failure when the SDK answers with an error", async () => {
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    mockScopedClient.session.update.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.update", params })
      return Promise.resolve({ error: { message: "Internal error" } } as never)
    })

    const { archiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )

    await expect(archiveSession("session-a")).resolves.toBe(false)

    expect(store.getState().session.map((session) => session.id)).toEqual(["session-a"])
    expect(archiveSessionsMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to archive session", {
      id: "session-action-archive-failed",
    })
  })

  test("updateSessionTitle surfaces the failure instead of silently keeping the old title", async () => {
    mockScopedClient.session.update.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.update", params })
      return Promise.resolve({ error: { message: "Internal error" } } as never)
    })

    const { setActionRefs, updateSessionTitle } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", createStore({})]]),
      () => "/test/project",
    )

    await expect(updateSessionTitle("session-a", "new title")).rejects.toThrow(/Internal error/)
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to rename session", {
      id: "session-action-rename-failed",
    })
  })

  test("updateSessionTitle waits out the runtime rate limit instead of surfacing a failure", async () => {
    vi.useFakeTimers()
    try {
      mockScopedClient.session.update
        .mockResolvedValueOnce({
          error: { name: "ServiceUnavailableError", message: "Too many requests", status: 429 },
          response: { status: 429 },
        } as never)
        .mockResolvedValueOnce({ data: {}, response: { status: 200 } } as never)

      const { setActionRefs, updateSessionTitle } = await import("./session-actions")
      setActionRefs(
        mockSdk as unknown as AxCodeClient,
        createChildStores([["/test/project", createStore({})]]),
        () => "/test/project",
      )

      const pending = updateSessionTitle("session-a", "new title")
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(pending).resolves.toBeUndefined()
      expect(toastErrorMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a rejected abort clears the stop marker it armed", async () => {
    mockSdk.session.abort.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.abort", params })
      return Promise.resolve({ error: { message: "Run is not active" } } as never)
    })

    const { abortCurrentOperation, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", createStore({})]]),
      () => "/test/project",
    )

    await abortCurrentOperation("session-a")
    // The marker is armed before the call (the idle edge can beat the response)
    // and cleared again when the runtime refused the abort.
    expect(markSessionAbortedMock).toHaveBeenCalledWith("session-a")
    expect(clearSessionAbortMock).toHaveBeenCalledWith("session-a")
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to stop the run", {
      id: "session-action-abort-failed",
    })

    markSessionAbortedMock.mockClear()
    clearSessionAbortMock.mockClear()

    await abortCurrentOperation("session-a")
    expect(markSessionAbortedMock).toHaveBeenCalledWith("session-a")
    expect(clearSessionAbortMock).not.toHaveBeenCalled()
  })

  test("a refused abort before a revert clears the stop marker and lets the mutation proceed", async () => {
    // The SDK resolves `{ error }` on a refused abort. Without inspecting the result the
    // marker armed for the abort stayed set, so the still-running turn was reported as
    // stopped and the busy -> idle queue auto-send was blocked.
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
      session_status: { "session-a": { type: "busy" } },
      message: {
        "session-a": [
          { id: "msg-a", sessionID: "session-a", role: "user", time: { created: 1 } } as unknown as Message,
        ],
      },
    })
    mockScopedClient.session.abort.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.abort", params })
      return Promise.resolve({ error: { message: "Run is not active" } } as never)
    })
    markSessionAbortedMock.mockClear()
    clearSessionAbortMock.mockClear()

    const { revertToMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )

    await expect(revertToMessage("session-a", "msg-a")).resolves.toBeUndefined()

    expect(markSessionAbortedMock).toHaveBeenCalledWith("session-a")
    expect(clearSessionAbortMock).toHaveBeenCalledWith("session-a")
    // The local mutation still runs even though the runtime refused the abort.
    expect(sessionCalls.map((call) => call.method)).toContain("session.revert")
  })
})

describe("rollback and fork actions use the session directory", () => {
  beforeEach(() => {
    sessionCalls.length = 0
    inputCalls.length = 0
  })

  test("revertToMessage uses the mapped session directory and restores MCP resource attachments", async () => {
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      message: {
        "session-b": [
          {
            id: "msg-b",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
        ],
      },
      part: PartMap.from({
        "msg-b": [
          {
            id: "prt-text",
            type: "text",
            messageID: "msg-b",
            text: "redo this",
          } as unknown as Part,
          {
            id: "prt-resource",
            type: "file",
            messageID: "msg-b",
            mime: "text/markdown",
            filename: "readme.md",
            source: {
              type: "resource",
              clientName: "docs",
              uri: "mcp://docs/readme.md",
            },
          } as unknown as Part,
        ],
      }),
    })

    const { revertToMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await revertToMessage("session-b", "msg-b")

    expect(sessionCalls).toContainEqual({
      method: "session.revert",
      params: {
        sessionID: "session-b",
        directory: "/other/project",
        messageID: "msg-b",
      },
    })
    expect(inputStoreState.pendingInputText).toBe("redo this")
    expect(inputCalls).toContainEqual({
      method: "addMcpResourceAttachment",
      params: {
        client: "docs",
        name: "readme.md",
        uri: "mcp://docs/readme.md",
        mimeType: "text/markdown",
      },
    })
  })

  test("revertToMessage keeps session-list updates that land during the abort round-trip", async () => {
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      session_status: { "session-b": { type: "busy" } },
      message: {
        "session-b": [
          {
            id: "msg-b",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
        ],
      },
      part: PartMap.from({
        "msg-b": [{ id: "prt-text", type: "text", messageID: "msg-b", text: "redo this" } as unknown as Part],
      }),
    })

    // A subagent's session.created event lands while the abort call is in flight.
    mockScopedClient.session.abort.mockImplementationOnce(() => {
      const current = store.getState()
      store.setState({
        session: [
          ...current.session,
          {
            id: "session-child",
            directory: "/other/project",
            parentID: "session-b",
            time: { created: 2, updated: 2 },
          } as unknown as Session,
        ],
      })
      return Promise.resolve({ data: true })
    })

    const { revertToMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await revertToMessage("session-b", "msg-b")

    const sessions = store.getState().session
    expect(sessions.map((s) => s.id)).toEqual(["session-b", "session-child"])
    const reverted = sessions.find((s) => s.id === "session-b") as Session & { revert?: { messageID?: string } }
    expect(reverted.revert?.messageID).toBe("msg-b")
  })

  test("forkFromMessage rejects when the runtime returns no fork", async () => {
    // Regression: the SDK call omitted throwOnError, so a failed fork resolved and
    // the caller showed its success toast with no new session behind it.
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      part: PartMap.from({
        "msg-b": [
          { id: "prt-text", type: "text", messageID: "msg-b", text: "try an alternate path" } as unknown as Part,
        ],
      }),
    })
    mockScopedClient.session.fork.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.fork", params })
      return Promise.resolve({ error: { message: "Session is busy" }, data: undefined })
    })

    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await expect(forkFromMessage("session-b", "msg-b")).rejects.toThrow("Failed to fork session")
  })

  test("forkFromMessage switches to the fork in the original session directory", async () => {
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      part: PartMap.from({
        "msg-b": [
          {
            id: "prt-text",
            type: "text",
            messageID: "msg-b",
            text: "try an alternate path",
          } as unknown as Part,
        ],
      }),
    })

    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await forkFromMessage("session-b", "msg-b")

    expect(sessionCalls).toContainEqual({
      method: "session.fork",
      params: {
        sessionID: "session-b",
        directory: "/other/project",
        messageID: "msg-b",
      },
    })
    expect(setCurrentSessionMock).toHaveBeenCalledWith("session-b-fork", "/other/project")
    // A fork is a new root session with no parentID; it must carry the source
    // session's effective auto-accept value instead of falling to the default.
    expect(inheritSessionAutoAcceptMock).toHaveBeenCalledWith("session-b-fork", "session-b")
    // The attachment draft must switch to the fork before the restored files
    // land, or they are filed under the source session's draft.
    const draftSwitch = inputCalls.findIndex((call) => call.method === "setActiveAttachmentDraft")
    const firstRestore = inputCalls.findIndex(
      (call) => call.method === "addRestoredAttachment" || call.method === "addMcpResourceAttachment",
    )
    expect(inputCalls[draftSwitch]?.params).toEqual({ key: "session-b-fork" })
    if (firstRestore !== -1) expect(draftSwitch).toBeLessThan(firstRestore)
    expect(inputStoreState.pendingInputText).toBe("try an alternate path")
  })

  test("applyRollbackPoint uses the mapped session directory and replaces stale local messages", async () => {
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      message: {
        "session-b": [
          {
            id: "msg-kept",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
          {
            id: "msg-stale",
            sessionID: "session-b",
            role: "assistant",
            time: { created: 2 },
          } as unknown as Message,
        ],
      },
      part: PartMap.from({
        "msg-kept": [{ id: "prt-kept-old", type: "text", messageID: "msg-kept", text: "old" } as unknown as Part],
        "msg-stale": [{ id: "prt-stale", type: "text", messageID: "msg-stale", text: "stale" } as unknown as Part],
      }),
    })
    scopedMessagesResult = {
      data: [
        {
          info: {
            id: "msg-kept",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
          parts: [{ id: "prt-kept-new", type: "text", messageID: "msg-kept", text: "new" } as unknown as Part],
        },
      ],
    }

    const { applyRollbackPoint, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await applyRollbackPoint("session-b", { step: 2 })

    expect(sessionCalls).toContainEqual({
      method: "session.rollback",
      params: {
        sessionID: "session-b",
        directory: "/other/project",
        sessionRollbackApplyInput: { step: 2 },
      },
    })
    expect(store.getState().message["session-b"].map((message) => message.id)).toEqual(["msg-kept"])
    expect(
      store
        .getState()
        .part.get("msg-kept")
        ?.map((part) => part.id),
    ).toEqual(["prt-kept-new"])
    expect(store.getState().part.get("msg-stale")).toBeUndefined()
  })

  test("applyRollbackPoint keeps the messages when the follow-up read fails", async () => {
    // The SDK resolves with `{ error }` rather than rejecting, and an empty record list is a
    // legitimate answer here (a rollback can leave a session with no messages), so an unchecked
    // failure wiped the whole conversation off the screen while the rollback toast said success.
    const store = createStore({})
    store.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      message: {
        "session-b": [
          {
            id: "msg-kept",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
        ],
      },
      part: PartMap.from({
        "msg-kept": [{ id: "prt-kept", type: "text", messageID: "msg-kept", text: "kept" } as unknown as Part],
      }),
    })
    mockScopedClient.session.messages.mockImplementationOnce(() =>
      Promise.resolve({ error: { message: "Unavailable" } } as never),
    )

    const { applyRollbackPoint, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    await applyRollbackPoint("session-b", { step: 2 })

    expect(store.getState().message["session-b"].map((message) => message.id)).toEqual(["msg-kept"])
    expect(
      store
        .getState()
        .part.get("msg-kept")
        ?.map((part) => part.id),
    ).toEqual(["prt-kept"])
  })

  test("applyRollbackPoint surfaces a rejected rollback instead of reporting success", async () => {
    const store = createStore({})
    mockScopedClient.session.rollback.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.rollback", params })
      return Promise.resolve({ error: { message: "Rollback refused" } } as never)
    })

    const { applyRollbackPoint, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", store]]),
      () => "/test/project",
    )

    // The caller (TimelineDialog) closes the dialog and clears the preview on a
    // resolved call, so a rejected rollback must reject.
    await expect(applyRollbackPoint("session-b", { step: 3 })).rejects.toThrow(/Rollback refused/)
  })

  test("revertToMessage rolls the optimistic marker back when the runtime rejects it", async () => {
    const store = createStore({})
    store.setState({
      session: [
        { id: "session-a", directory: "/test/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    mockScopedClient.session.revert.mockImplementationOnce((params: Record<string, unknown>) => {
      sessionCalls.push({ method: "session.revert", params })
      return Promise.resolve({ error: { message: "Revert refused" } } as never)
    })

    const { revertToMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/test/project", store]]),
      () => "/test/project",
    )

    await expect(revertToMessage("session-a", "msg-a")).rejects.toThrow(/Revert refused/)

    // The optimistic revert marker is gone again.
    expect((store.getState().session[0] as { revert?: unknown }).revert ?? null).toBeNull()
  })

  test("validateSessionMoveTarget uses the mapped session directory", async () => {
    const { validateSessionMoveTarget, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/other/project", createStore({})]]),
      () => "/test/project",
    )

    const validation = await validateSessionMoveTarget("session-b", "/target/project")

    expect(validation.valid).toBe(true)
    expect(sessionCalls).toContainEqual({
      method: "session.moveValidate",
      params: {
        sessionID: "session-b",
        directory: "/other/project",
        targetDirectory: "/target/project",
      },
    })
  })

  test("moveSession moves local session cache to the target directory", async () => {
    mockCurrentSessionId = "session-b"
    const sourceStore = createStore({})
    const targetStore = createStore({})
    sourceStore.setState({
      session: [
        {
          id: "session-b",
          directory: "/other/project",
          time: { created: 1, updated: 1 },
        } as unknown as Session,
      ],
      session_status: { "session-b": { type: "idle" } },
      message: {
        "session-b": [
          {
            id: "msg-b",
            sessionID: "session-b",
            role: "user",
            time: { created: 1 },
          } as unknown as Message,
        ],
      },
      part: PartMap.from({
        "msg-b": [{ id: "prt-b", type: "text", messageID: "msg-b", text: "keep me" } as unknown as Part],
      }),
    })

    const { moveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([
        ["/other/project", sourceStore],
        ["/target/project", targetStore],
      ]),
      () => "/test/project",
    )

    const moved = await moveSession("session-b", "/target/project")

    expect(moved).toMatchObject({ id: "session-b", directory: "/target/project" })
    expect(sessionCalls).toContainEqual({
      method: "session.move",
      params: {
        sessionID: "session-b",
        directory: "/other/project",
        targetDirectory: "/target/project",
      },
    })
    expect(sourceStore.getState().session).toHaveLength(0)
    expect(sourceStore.getState().message["session-b"]).toBeUndefined()
    expect(sourceStore.getState().part.get("msg-b")).toBeUndefined()
    expect(sourceStore.getState().session_status["session-b"]).toBeUndefined()
    expect(targetStore.getState().session.map((session) => session.id)).toEqual(["session-b"])
    expect(targetStore.getState().message["session-b"]?.map((message) => message.id)).toEqual(["msg-b"])
    expect(
      targetStore
        .getState()
        .part.get("msg-b")
        ?.map((part) => part.id),
    ).toEqual(["prt-b"])
    expect(targetStore.getState().session_status["session-b"]).toEqual({ type: "idle" })
    // S4.5: no manual global-store write — the session.updated event
    // re-buckets the session under its new directory as the writer of record.
    expect(upsertSessionMock).not.toHaveBeenCalled()
    expect(registeredSessionDirectories).toContainEqual({ sessionID: "session-b", directory: "/target/project" })
    expect(setCurrentSessionMock).toHaveBeenCalledWith("session-b", "/target/project")
  })

  test("moveSession keeps the target directory's session list sorted by id (Binary.search invariant)", async () => {
    // Every Binary.search/findIndex call in session-actions.ts (delete, revert,
    // fork, feedback, ...) assumes `session` stays sorted by id. Regression
    // test for upsertSessionList prepending unsorted, which silently broke
    // later lookups on the target directory after a move.
    // "session-b" is the id the mocked useSessionUIStore maps to "/other/project"
    // (see the ./session-ui-store mock above) — it sorts between the two
    // pre-existing target-directory sessions below.
    const sourceStore = createStore({})
    const targetStore = createStore({})
    sourceStore.setState({
      session: [
        { id: "session-b", directory: "/other/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })
    targetStore.setState({
      session: [
        { id: "session-a", directory: "/target/project", time: { created: 1, updated: 1 } } as unknown as Session,
        { id: "session-z", directory: "/target/project", time: { created: 1, updated: 1 } } as unknown as Session,
      ],
    })

    const { moveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([
        ["/other/project", sourceStore],
        ["/target/project", targetStore],
      ]),
      () => "/test/project",
    )

    await moveSession("session-b", "/target/project")

    expect(targetStore.getState().session.map((session) => session.id)).toEqual(["session-a", "session-b", "session-z"])
  })
})

describe("dismissPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory and reply=reject", async () => {
    const permission: PermissionRequest = {
      id: "perm-10",
      sessionID: "session-a",
      permission: "edit",
      patterns: [],
      metadata: {},
      always: [],
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await dismissPermission("session-a", "perm-10")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-10")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("respondToQuestion passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory to question.reply", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToQuestion } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToQuestion("session-a", "q-1", [["answer1"]])

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("q-1")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("rejectQuestion passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory to question.reject", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, rejectQuestion } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await rejectQuestion("session-a", "q-2")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("q-2")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("optimisticSend responsiveness", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("inserts the optimistic user message before waiting for connection recovery", async () => {
    const store = createStore({})
    const childStores = createChildStores([["/test/project", store]])
    let sawOptimisticBeforeProbe = false

    // Start disconnected so waitForConnectionOrThrow enters its grace loop
    // and runs the probe (which then reports the server reachable).
    resetConnectionState({ connected: false })
    configState = {
      probeConnection: () => {
        sawOptimisticBeforeProbe = (store.getState().message["session-a"] ?? []).length === 1
        return Promise.resolve(true)
      },
    }

    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextMessages = messages.filter((message) => message.id !== messageID)
          const nextPart = state.part.without([messageID])
          return {
            message: {
              ...state.message,
              [sessionID]: nextMessages,
            },
            part: nextPart,
          }
        })
      },
    )

    let sendSawOptimistic = false
    await optimisticSend({
      sessionId: "session-a",
      content: "hello",
      providerID: "provider",
      modelID: "model",
      variant: "high",
      send: (messageID) => {
        const state = store.getState()
        sendSawOptimistic = state.message["session-a"]?.some((message: Message) => message.id === messageID) ?? false
        expect(state.part.get(messageID)?.some((part: Part) => part.type === "text")).toBe(true)
        return Promise.resolve()
      },
    })

    expect(sawOptimisticBeforeProbe).toBe(true)
    expect(sendSawOptimistic).toBe(true)
    expect(store.getState().session_status["session-a"]).toEqual({ type: "busy" })
    const optimistic = store.getState().message["session-a"]?.[0] as
      | (Message & {
          model?: { providerID?: string; modelID?: string; variant?: string }
          modelOrigin?: string
          variant?: string
        })
      | undefined
    expect(optimistic?.model).toEqual({ providerID: "provider", modelID: "model", variant: "high" })
    expect(optimistic?.variant).toBe("high")
    expect(optimistic?.modelOrigin).toBe("request")
  })

  test("stamps a session's status events without tracking ids forever", async () => {
    // The stamp is per session and the map is bounded like the rest of the sync layer's per-session
    // state: a client naming many sessions must not grow it one entry per id.
    const { noteServerSessionStatus, serverSessionStatusStamp } = await import("./session-status-events")

    noteServerSessionStatus("ses_bounded")
    expect(serverSessionStatusStamp("ses_bounded")).toBeGreaterThan(0)

    for (let index = 0; index < 2_100; index += 1) {
      noteServerSessionStatus(`ses_filler_${index}`)
    }

    // The bound has to have held on the write path, not just on paper: 2 000 is the cap, so the first
    // id is gone and the newest survives. Asserting only that the older value is low enough would also
    // pass with an unbounded map.
    expect(serverSessionStatusStamp("ses_bounded")).toBe(0)
    expect(serverSessionStatusStamp("ses_filler_0")).toBe(0)
    expect(serverSessionStatusStamp("ses_filler_2099")).toBeGreaterThan(0)
  })

  test("keeps a server busy the reducer deduped while the send was in flight", async () => {
    // The reducer drops an equal `session.status {busy}`, so the store still holds the object this call
    // wrote — identity alone says nothing, and rolling back showed the running turn as idle. The event
    // count is what distinguishes "nothing was published" from "the turn started".
    const store = createStore({})
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    const { noteServerSessionStatus } = await import("./session-status-events")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: { ...state.message, [sessionID]: [...(state.message[sessionID] ?? []), message] },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: (state.message[sessionID] ?? []).filter((m) => m.id !== messageID),
          },
          part: state.part.without([messageID]),
        }))
      },
    )

    await expect(
      optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: async () => {
          // What the reducer does for the server's own busy: counted, deduped, no store write.
          noteServerSessionStatus("session-a")
          throw new Error("network")
        },
      }),
    ).rejects.toThrow("network")

    expect(store.getState().session_status["session-a"]).toEqual({ type: "busy" })
  })

  test("keeps a server-published busy when the send response fails", async () => {
    // `optimisticSend` writes `{type:"busy"}` before the POST, and its failure path rolled that back
    // whenever the status merely *was* busy. A POST that reached the runtime and started the turn
    // before its response failed leaves the server's own busy in the store: restoring the previous
    // (idle) status showed a live turn as idle — working indicator and Stop gone, and the
    // queued-message auto-send firing on a busy-to-idle edge that never happened — until the turn
    // ended. Only the object this call wrote may be rolled back.
    const store = createStore({})
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          return {
            message: { ...state.message, [sessionID]: messages.filter((message) => message.id !== messageID) },
            part: state.part.without([messageID]),
          }
        })
      },
    )

    const serverBusy = { type: "busy" as const }
    await expect(
      optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: async () => {
          store.setState((state) => ({ session_status: { ...state.session_status, "session-a": serverBusy } }))
          throw new Error("network")
        },
      }),
    ).rejects.toThrow("network")

    expect(store.getState().session_status["session-a"]).toBe(serverBusy)
  })

  test("adds a visible fallback when an accepted prompt goes idle without assistant output", async () => {
    resetScopedMessagesResult()
    const originalSetTimeout = globalThis.setTimeout
    // Fire callbacks synchronously, but advance a fake clock by each timer's
    // delay. The watchdog re-arms while the prompt is "recently accepted"
    // (Date.now() within the grace window); without advancing the clock the
    // re-arm never expires and recurses until OOM. Advancing past the grace
    // window lets the watchdog fall through to fabricating the fallback.
    let fakeNow = Date.now()
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow)
    globalThis.setTimeout = ((callback: TimerHandler, ms?: number) => {
      fakeNow += typeof ms === "number" ? ms : 0
      if (typeof callback === "function") (callback as () => void)()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    try {
      const store = createStore({})
      const childStores = createChildStores([["/test/project", store]])

      const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
      setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
      setOptimisticRefs(
        ({ sessionID, message, parts }) => {
          store.setState((state) => ({
            message: {
              ...state.message,
              [sessionID]: [...(state.message[sessionID] ?? []), message],
            },
            part: state.part.withEntries([[message.id, parts]]),
          }))
        },
        ({ sessionID, messageID }) => {
          store.setState((state) => {
            const messages = state.message[sessionID] ?? []
            const nextMessages = messages.filter((message) => message.id !== messageID)
            const nextPart = state.part.without([messageID])
            return {
              message: {
                ...state.message,
                [sessionID]: nextMessages,
              },
              part: nextPart,
            }
          })
        },
      )

      await optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: () => {
          store.setState((state) => ({
            session_status: {
              ...state.session_status,
              "session-a": { type: "idle" as const },
            },
          }))
          return Promise.resolve()
        },
      })

      // The watchdog now verifies against the server before fabricating, so the
      // synthetic fallback is injected after the (empty) refetch resolves.
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      const messages = store.getState().message["session-a"] ?? []
      const fallback = messages.find((message) => message.role === "assistant")
      expect(fallback).toBeTruthy()
      expect((fallback as (Message & { metadata?: Record<string, unknown> }) | undefined)?.metadata?.source).toBe(
        "desktop-accepted-prompt-watchdog",
      )
      expect((fallback as (Message & { metadata?: Record<string, unknown> }) | undefined)?.metadata?.error).toBe(true)
      expect(store.getState().part.get(fallback?.id ?? "")?.[0]?.type).toBe("text")
    } finally {
      globalThis.setTimeout = originalSetTimeout
      nowSpy.mockRestore()
    }
  })

  test("recovers a server-side response instead of fabricating a failure", async () => {
    resetScopedMessagesResult()
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    try {
      const store = createStore({})
      const childStores = createChildStores([["/test/project", store]])

      const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
      setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
      setOptimisticRefs(
        ({ sessionID, message, parts }) => {
          store.setState((state) => ({
            message: {
              ...state.message,
              [sessionID]: [...(state.message[sessionID] ?? []), message],
            },
            part: state.part.withEntries([[message.id, parts]]),
          }))
        },
        () => {},
      )

      await optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          // Simulate a turn whose streamed events were dropped: the session
          // goes idle locally, but the server actually has the assistant reply.
          scopedMessagesResult = {
            data: [
              {
                info: {
                  id: messageID,
                  sessionID: "session-a",
                  role: "user",
                  time: { created: 1 },
                } as unknown as Message,
                parts: [],
              },
              {
                info: {
                  id: "msg_assistant",
                  sessionID: "session-a",
                  role: "assistant",
                  parentID: messageID,
                  time: { created: 2, completed: 3 },
                } as unknown as Message,
                parts: [
                  {
                    id: "prt_assistant",
                    type: "text",
                    messageID: "msg_assistant",
                    text: "real reply",
                  } as unknown as Part,
                ],
              },
            ],
          }
          store.setState((state) => ({
            session_status: {
              ...state.session_status,
              "session-a": { type: "idle" as const },
            },
          }))
          return Promise.resolve()
        },
      })

      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      const messages = store.getState().message["session-a"] ?? []
      const synthetic = messages.find(
        (message) =>
          (message as Message & { metadata?: Record<string, unknown> }).metadata?.source ===
          "desktop-accepted-prompt-watchdog",
      )
      expect(synthetic).toBeFalsy()
      const recovered = messages.find((message) => message.role === "assistant")
      expect(recovered?.id).toBe("msg_assistant")
      expect(store.getState().part.get("msg_assistant")?.[0]?.type).toBe("text")
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })
})

describe("optimisticSend: stale watchdog from previous prompt is cancelled (stale-watchdog fix)", () => {
  // Regression test for the bug where the 1st prompt's 12s watchdog fired
  // DURING the 2nd prompt's turn, found the 1st prompt's completed assistant
  // reply, saw the 2nd prompt's busy status, and incorrectly forced idle —
  // clobbering the 2nd turn and tripping its own watchdog to fabricate the
  // "no assistant response" error.
  //
  // Root cause: scheduleAcceptedPromptWatchdog used globalThis.setTimeout but
  // never stored or cancelled the timer. Each new prompt leaked a stale
  // watchdog for the previous prompt.

  const setupOptimistic = async (store: ReturnType<typeof createStore>) => {
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextPart = state.part.without([messageID])
          return {
            message: { ...state.message, [sessionID]: messages.filter((m) => m.id !== messageID) },
            part: nextPart,
          }
        })
      },
    )
    return { optimisticSend }
  }

  test("cancels the stale watchdog when a new prompt is sent for the same session", async () => {
    // Timer mock: store callbacks so we can fire them manually.
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers = new Map<number, () => void>()
    let nextTimerId = 1

    globalThis.setTimeout = ((callback: () => void) => {
      const id = nextTimerId++
      timers.set(id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    globalThis.clearTimeout = ((id: unknown) => {
      timers.delete(id as number)
    }) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimistic(store)

      // 1st prompt
      let firstMessageId = ""
      await optimisticSend({
        sessionId: "session-a",
        content: "first prompt",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          firstMessageId = messageID
          return Promise.resolve()
        },
      })

      // At this point exactly 1 timer should exist (the 1st prompt's watchdog)
      expect(timers.size).toBe(1)

      // Simulate the 1st prompt completing: add assistant response + idle status
      store.setState((state) => ({
        session_status: {
          ...state.session_status,
          "session-a": { type: "idle" as const },
        },
        message: {
          ...state.message,
          "session-a": [
            ...(state.message["session-a"] ?? []),
            {
              id: "msg_first_assistant",
              role: "assistant",
              sessionID: "session-a",
              parentID: firstMessageId,
              time: { created: 1, completed: 2 },
            } as unknown as Message,
          ],
        },
      }))

      // 2nd prompt — should cancel the 1st prompt's watchdog
      await optimisticSend({
        sessionId: "session-a",
        content: "second prompt",
        providerID: "provider",
        modelID: "model",
        send: () => Promise.resolve(),
      })

      // The 1st watchdog was cancelled. Only 1 timer should remain (the 2nd's)
      expect(timers.size).toBe(1)

      // Status should be busy (from the 2nd prompt's optimistic set)
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })

      // Now manually fire ALL remaining timers (simulating the 12s timeout).
      // Only the 2nd prompt's watchdog should fire — the 1st was cancelled.
      const callbacks = [...timers.values()]
      for (const cb of callbacks) {
        await cb()
      }
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      // The 2nd prompt's watchdog fires. Since the session is still busy
      // (no idle event for the 2nd prompt), the watchdog returns early without
      // fabricating. The KEY assertion: the status is still busy — the stale
      // 1st watchdog never fired to clobber it.
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })

      // No synthetic error messages were created (watchdog returned early)
      const messages = store.getState().message["session-a"] ?? []
      const syntheticErrors = messages.filter(
        (m) =>
          (m as Message & { metadata?: Record<string, unknown> }).metadata?.source ===
          "desktop-accepted-prompt-watchdog",
      )
      expect(syntheticErrors.length).toBe(0)
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  test("does not let an in-flight watchdog's re-arm overwrite the next prompt's timer", async () => {
    // The watchdog's own timer removes its map entry before its async checks run, so a prompt sent
    // during those checks registers a *new* timer. The grace-window re-arm then wrote its handle over
    // that entry: the next prompt's timer could never be cancelled (the following clearTimeout hit the
    // re-arm handle instead), so it fired during a later turn — the cross-turn clobber the
    // cancellation above exists to prevent.
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers = new Map<number, () => void>()
    let nextTimerId = 1

    globalThis.setTimeout = ((callback: () => void) => {
      const id = nextTimerId++
      timers.set(id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = ((id: unknown) => {
      timers.delete(id as number)
    }) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimistic(store)

      await optimisticSend({
        sessionId: "session-a",
        content: "first prompt",
        providerID: "provider",
        modelID: "model",
        send: () => Promise.resolve(),
      })
      expect(timers.size).toBe(1)

      // Hold the watchdog's refetch so the second prompt can register its timer first.
      let releaseRefetch: () => void = () => {}
      const refetch = new Promise((resolve) => {
        releaseRefetch = () => resolve({ data: [] })
      })
      mockScopedClient.session.messages.mockReturnValueOnce(refetch as never)

      // The turn spin-up gap clobbers busy back to idle: this is what lets the check proceed (a
      // busy session returns immediately) and what the grace-window re-arm exists for.
      const setIdle = () =>
        store.setState((state) => ({
          session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
        }))
      setIdle()

      const [firstTimerId, firstCallback] = [...timers.entries()][0]
      const firing = firstCallback()
      // A fired timer is no longer pending; the map below counts pending timers only.
      timers.delete(firstTimerId)
      await new Promise((resolve) => originalSetTimeout(resolve, 0))
      // The check is parked on its refetch now, or the rest of this test proves nothing.
      expect(mockScopedClient.session.messages).toHaveBeenCalled()

      await optimisticSend({
        sessionId: "session-a",
        content: "second prompt",
        providerID: "provider",
        modelID: "model",
        send: () => Promise.resolve(),
      })
      expect(timers.size).toBe(1)
      setIdle()

      releaseRefetch()
      await firing

      // Only the second prompt's watchdog may be pending: the re-arm belongs to a prompt that no
      // longer owns this session.
      expect(timers.size).toBe(1)
    } finally {
      // The refetch mock above may be left unconsumed, and the next test's watchdog would then wait
      // on it forever.
      mockScopedClient.session.messages.mockReset()
      mockScopedClient.session.messages.mockImplementation(() => Promise.resolve(scopedMessagesResult))
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  test("does not force idle from a previous turn's completed assistant when a newer prompt is in progress", async () => {
    // This test exercises the defense-in-depth guard: even if the stale timer
    // somehow fires (e.g., race between clearTimeout and the event loop), the
    // newerUnanswered check prevents it from forcing idle.
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers: Array<{ id: number; callback: () => void; messageID?: string }> = []
    let nextTimerId = 1

    // Don't cancel — let ALL timers fire so we can test the guard
    globalThis.setTimeout = ((callback: () => void) => {
      const id = nextTimerId++
      timers.push({ id, callback })
      return id as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    globalThis.clearTimeout = (() => {
      // Intentionally a no-op: we WANT stale timers to fire to test the guard
    }) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimistic(store)

      // 1st prompt
      let firstMessageId = ""
      await optimisticSend({
        sessionId: "session-a",
        content: "first prompt",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          firstMessageId = messageID
          return Promise.resolve()
        },
      })

      // Simulate 1st prompt completing
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
        message: {
          ...state.message,
          "session-a": [
            ...(state.message["session-a"] ?? []),
            {
              id: "msg_first_assistant",
              role: "assistant",
              sessionID: "session-a",
              parentID: firstMessageId,
              time: { created: 1, completed: 2 },
            } as unknown as Message,
          ],
        },
      }))

      // 2nd prompt — optimistic busy
      await optimisticSend({
        sessionId: "session-a",
        content: "second prompt",
        providerID: "provider",
        modelID: "model",
        send: () => Promise.resolve(),
      })

      // Status is busy (2nd prompt)
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })

      // Fire the 1st prompt's watchdog (stale timer). Even though clearTimeout
      // is a no-op in this test, the newerUnanswered guard should prevent
      // it from forcing idle.
      await timers[0].callback()
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      // Status should STILL be busy — the stale watchdog's newerUnanswered
      // guard caught that the 2nd prompt (newer user message) has no assistant
      // response yet, so it did NOT force idle.
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  test("does not force idle while the newer turn's reply is still streaming", async () => {
    // The cross-turn guard used to treat ANY assistant message under the newer
    // user message as "answered". A reply that is still streaming has no
    // completion yet, so forcing idle there clobbered the live turn — and the
    // queued-message auto-send read that idle edge as "turn ended".
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers: Array<{ id: number; callback: () => void }> = []
    let nextTimerId = 1

    globalThis.setTimeout = ((callback: () => void) => {
      const id = nextTimerId++
      timers.push({ id, callback })
      return id as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    globalThis.clearTimeout = (() => {
      // Intentionally a no-op: the stale timer must be allowed to fire.
    }) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimistic(store)

      let firstMessageId = ""
      await optimisticSend({
        sessionId: "session-a",
        content: "first prompt",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          firstMessageId = messageID
          return Promise.resolve()
        },
      })

      // First turn completed.
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
        message: {
          ...state.message,
          "session-a": [
            ...(state.message["session-a"] ?? []),
            {
              id: "msg_first_assistant",
              role: "assistant",
              sessionID: "session-a",
              parentID: firstMessageId,
              time: { created: 1, completed: 2 },
            } as unknown as Message,
          ],
        },
      }))

      // Second prompt: busy again, its reply starts streaming (no completion).
      let secondMessageId = ""
      await optimisticSend({
        sessionId: "session-a",
        content: "second prompt",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          secondMessageId = messageID
          return Promise.resolve()
        },
      })
      store.setState((state) => ({
        message: {
          ...state.message,
          "session-a": [
            ...(state.message["session-a"] ?? []),
            {
              id: "msg_second_assistant",
              role: "assistant",
              sessionID: "session-a",
              parentID: secondMessageId,
              time: { created: 3 },
            } as unknown as Message,
          ],
        },
      }))

      // The first prompt's stale watchdog fires mid-stream.
      await timers[0].callback()
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })
})

describe("optimisticSend: markPromptAccepted is synchronous with busy-set (race condition fix)", () => {
  // Regression test for the bug where 2nd+ prompts always triggered the watchdog.
  //
  // Root cause: markPromptAccepted was called AFTER await input.send(), so any
  // status poll that fired during the connection-wait or POST round-trip saw
  // promptRecentlyAccepted=false and clobbered the optimistic busy→idle.
  //
  // The fix: markPromptAccepted is called synchronously with store.setState({busy}),
  // before any await. This test verifies the invariant holds for 4 consecutive prompts.

  const setupOptimistic = async (store: ReturnType<typeof createStore>) => {
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, setOptimisticRefs, optimisticSend, wasPromptRecentlyAccepted } = await import(
      "./session-actions"
    )
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextPart = state.part.without([messageID])
          return {
            message: { ...state.message, [sessionID]: messages.filter((m) => m.id !== messageID) },
            part: nextPart,
          }
        })
      },
    )
    return { optimisticSend, wasPromptRecentlyAccepted }
  }

  test("wasPromptRecentlyAccepted is true during the send for all 4 consecutive prompts", async () => {
    const store = createStore({})
    const { optimisticSend, wasPromptRecentlyAccepted } = await setupOptimistic(store)

    for (let i = 0; i < 4; i++) {
      // Simulate a completed turn: session goes back to idle with a finished assistant reply.
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
        message: {
          ...state.message,
          "session-a": [
            {
              id: `prev-assistant-${i}`,
              role: "assistant",
              sessionID: "session-a",
              time: { created: 1, completed: 2 },
            } as unknown as Message,
          ],
        },
      }))

      let acceptedDuringSend = false
      let pollResultDuringSend: ReturnType<typeof resolveResyncedSessionStatus> | undefined

      await optimisticSend({
        sessionId: "session-a",
        content: `prompt ${i + 1}`,
        providerID: "provider",
        modelID: "model",
        send: async () => {
          // This callback fires while awaiting the POST — the exact window the
          // periodic status poll can fire. Verify our invariants hold here.
          acceptedDuringSend = wasPromptRecentlyAccepted("session-a")

          // Simulate the status poll calling resolveResyncedSessionStatus with
          // serverStatus=undefined (ax-code hasn't registered the session yet).
          const state = store.getState()
          pollResultDuringSend = resolveResyncedSessionStatus({
            serverStatus: undefined,
            existingStatus: state.session_status?.["session-a"],
            promptRecentlyAccepted: wasPromptRecentlyAccepted("session-a"),
            hasCompletedAssistantReply: hasCompletedAssistantReply(state.message?.["session-a"]),
          })
        },
      })

      expect(acceptedDuringSend).toBe(true)
      expect(pollResultDuringSend).toEqual({ type: "busy" })
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })
    }
  })
})

describe("optimisticSend: watchdog recovery does not clobber a newer prompt (async recovery race fix)", () => {
  // Regression test for the bug where the watchdog's async server-refetch
  // (recoverAcceptedPromptFromServer) completed during a NEWER prompt's turn.
  // The recovery found the OLD prompt's completed assistant response, saw the
  // NEW prompt's busy status, and incorrectly forced idle — clobbering the
  // new turn.
  //
  // Root cause: the recovery branch forced idle based on isSessionWorking()
  // alone, without checking whether a NEWER user message existed without its
  // own assistant reply (the same cross-turn guard the initial-match branch has).

  const setupOptimisticForRecovery = async (store: ReturnType<typeof createStore>) => {
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: { ...state.message, [sessionID]: [...(state.message[sessionID] ?? []), message] },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextPart = state.part.without([messageID])
          return {
            message: { ...state.message, [sessionID]: messages.filter((m) => m.id !== messageID) },
            part: nextPart,
          }
        })
      },
    )
    return { optimisticSend }
  }

  test("recovery finding an old completed response does not force idle when a newer prompt is in progress", async () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers: Array<() => void> = []

    // Fire timers immediately
    globalThis.setTimeout = ((callback: () => void) => {
      timers.push(callback)
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimisticForRecovery(store)

      // 1st prompt — response will be "dropped" (not in store, but on server)
      let firstMessageId = ""
      await optimisticSend({
        sessionId: "session-a",
        content: "first prompt",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          firstMessageId = messageID
          return Promise.resolve()
        },
      })

      // Simulate the 1st prompt's response being dropped: set idle, no assistant
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
      }))

      // Configure the mock server to return the 1st prompt's completed response
      resetScopedMessagesResult()
      scopedMessagesResult = {
        data: [
          {
            info: {
              id: firstMessageId,
              sessionID: "session-a",
              role: "user",
              time: { created: 1 },
            } as unknown as Message,
            parts: [],
          },
          {
            info: {
              id: "msg_first_assistant",
              sessionID: "session-a",
              role: "assistant",
              parentID: firstMessageId,
              time: { created: 2, completed: 3 },
            } as unknown as Message,
            parts: [
              { id: "prt_a", type: "text", messageID: "msg_first_assistant", text: "real reply" } as unknown as Part,
            ],
          },
        ],
      }

      // Fire the 1st prompt's watchdog. It will:
      // 1. Not find assistantResponse in store (dropped) → skip initial branch
      // 2. isSessionWorking → false → proceed to recovery
      // 3. recoverAcceptedPromptFromServer → async refetch
      // DURING the await, simulate the 2nd prompt starting:
      const watchdogPromise = timers[0]()
      // While watchdog is awaiting recovery, user sends 2nd prompt
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "busy" as const } },
        message: {
          ...state.message,
          "session-a": [
            ...(state.message["session-a"] ?? []),
            { id: "msg_user_2", role: "user", sessionID: "session-a", time: { created: 10 } } as unknown as Message,
          ],
        },
      }))
      await watchdogPromise
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      // The recovery found the 1st prompt's response, but the 2nd prompt is now
      // in progress (busy, no assistant reply for msg_user_2). The watchdog
      // must NOT have forced idle.
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })
})

describe("optimisticSend: grace-window re-arm prevents false error on same-turn SSE idle clobber", () => {
  // Regression test for the v1.2.7 bug where the watchdog fabricated a
  // synthetic error when an SSE session.idle / session.status:idle event
  // transiently clobbered busy→idle during the 30s prompt-accepted grace
  // window.
  //
  // Root cause: the grace window (wasPromptRecentlyAccepted) only guards the
  // status-poll path (resolveResyncedSessionStatus), NOT the event-reducer's
  // direct status writes. An SSE idle event clobbers busy→idle; the 12s
  // watchdog then sees idle + no response + server-recovery-finds-nothing and
  // fabricates a false error.
  //
  // Fix: the watchdog's fabrication branch re-arms itself until the grace
  // window expires, so a transient grace-window clobber does NOT fabricate.

  const setupOptimistic = async (store: ReturnType<typeof createStore>) => {
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: state.part.withEntries([[message.id, parts]]),
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextPart = state.part.without([messageID])
          return {
            message: { ...state.message, [sessionID]: messages.filter((m) => m.id !== messageID) },
            part: nextPart,
          }
        })
      },
    )
    return { optimisticSend }
  }

  test("does not fabricate a synthetic error when SSE idle clobbers busy during the grace window", async () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const timers: Array<() => void> = []

    // Capture timers so we can fire them on demand. clearTimeout is a no-op so
    // re-arm timers survive (we want to observe both the initial fire and the
    // re-arm path).
    globalThis.setTimeout = ((callback: () => void) => {
      timers.push(callback)
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout

    try {
      const store = createStore({})
      const { optimisticSend } = await setupOptimistic(store)
      resetScopedMessagesResult()
      // Server also has nothing — the fabrication branch is reachable.
      scopedMessagesResult = { data: [] }

      await optimisticSend({
        sessionId: "session-a",
        content: "prompt that will be clobbered by SSE idle",
        providerID: "provider",
        modelID: "model",
        send: () => Promise.resolve(),
      })

      // Simulate an SSE session.idle event clobbering busy→idle DURING the
      // grace window (the event-reducer writes idle directly, bypassing the
      // poll-path grace guard).
      store.setState((state) => ({
        session_status: {
          ...state.session_status,
          "session-a": { type: "idle" as const },
        },
      }))

      // Fire the watchdog (t=12s). Without the fix this would fabricate the
      // synthetic error because status=idle, no assistant response, server has
      // nothing — even though the prompt is still within the 30s grace window.
      await timers[0]()
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      // With the fix: no synthetic error fabricated — the watchdog re-armed
      // itself instead. Status remains idle (as clobbered), but NO error
      // message was added.
      const messages = store.getState().message["session-a"] ?? []
      const syntheticErrors = messages.filter(
        (m) =>
          (m as Message & { metadata?: Record<string, unknown> }).metadata?.source ===
          "desktop-accepted-prompt-watchdog",
      )
      expect(syntheticErrors.length).toBe(0)

      // The watchdog should have scheduled a re-arm timer (timers.length grew).
      expect(timers.length).toBeGreaterThan(1)
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })
})

describe("abortCurrentOperation", () => {
  test("aborts against the session's own project, not the active one", async () => {
    const childStores = createChildStores([["/test/project", createStore({})]])
    const { abortCurrentOperation, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    // session-b lives in /other/project while the active directory is
    // /test/project: the runtime rejects an abort for a foreign project with a
    // 409, so the run would keep going.
    await abortCurrentOperation("session-b")

    expect(sessionCalls).toEqual([
      { method: "session.abort", params: { sessionID: "session-b", directory: "/other/project" } },
    ])
    // A user-initiated abort records the flag that holds the queued-message
    // auto-send across the abort's busy -> idle edge.
    expect(markSessionAbortedMock).toHaveBeenCalledWith("session-b")
  })

  test("does not mark an abort flag for an empty session id", async () => {
    const childStores = createChildStores([["/test/project", createStore({})]])
    const { abortCurrentOperation, setActionRefs } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    markSessionAbortedMock.mockClear()

    await abortCurrentOperation("")

    expect(markSessionAbortedMock).not.toHaveBeenCalled()
  })
})

describe("optimisticSend message ids", () => {
  test("uses a caller-supplied message id so a retry is deduplicated", async () => {
    const store = createStore({})
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    const send = vi.fn<(messageId: string) => Promise<void>>(async () => {})
    await optimisticSend({
      sessionId: "session-a",
      content: "hello",
      providerID: "provider-1",
      modelID: "model-1",
      messageId: "msg_retry_stable_0001",
      send,
    })

    // The caller's id reaches the API call, which is what lets the server recognize a
    // repeated send of the same logical message instead of delivering it twice.
    expect(send).toHaveBeenCalledWith("msg_retry_stable_0001")

    // An unusable id must not be forwarded; a fresh one is minted instead.
    const fallbackSend = vi.fn<(messageId: string) => Promise<void>>(async () => {})
    await optimisticSend({
      sessionId: "session-a",
      content: "hello again",
      providerID: "provider-1",
      modelID: "model-1",
      messageId: "not-a-message-id",
      send: fallbackSend,
    })
    expect(fallbackSend).toHaveBeenCalledTimes(1)
    expect(fallbackSend.mock.calls[0][0]).toMatch(/^msg_/)
    expect(fallbackSend.mock.calls[0][0]).not.toBe("not-a-message-id")
  })
})

describe("captured blocking request recovery", () => {
  const permission: PermissionRequest = {
    id: "req-recovery",
    sessionID: "session-a",
    permission: "bash",
    patterns: ["git status"],
    metadata: {},
    always: [],
  }
  beforeEach(() => {
    resetConfigState()
    replyCalls.length = 0
  })

  test("pins reply and read to the original scope even after active action refs change", async () => {
    const actions = await import("./session-actions")
    const store = createStore({ "session-a": [permission] })
    actions.setActionRefs(
      mockSdk as unknown as AxCodeClient,
      createChildStores([["/original/project", store]]),
      () => "/original/project",
    )
    const operation = actions.captureBlockingRequest({
      kind: "permission",
      sessionId: "session-a",
      requestId: permission.id,
    })
    actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/replacement/project")
    pendingListResult = { data: [permission] }
    await operation.respond("once")
    await expect(operation.read()).resolves.toBe("pending")
    expect(replyCalls).toEqual([
      {
        method: "permission.reply",
        params: { requestID: permission.id, reply: "once", directory: "/original/project" },
      },
    ])
    expect(listCalls).toEqual([{ kind: "permission", params: { directory: "/original/project" } }])
    expect(store.getState().permission["session-a"]).toEqual([permission])
  })

  test.each([{}, { data: null }, { data: [{}] }, { data: [], error: { message: "offline" } }])(
    "does not mistake a failed or malformed list for resolution: %j",
    async (result) => {
      const actions = await import("./session-actions")
      actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/test/project")
      pendingListResult = result
      const operation = actions.captureBlockingRequest({
        kind: "permission",
        sessionId: "session-a",
        requestId: permission.id,
      })
      await expect(operation.read()).rejects.toThrow()
      expect(replyCalls).toHaveLength(0)
    },
  )

  test("filters by session and kind and never mutates the request collection", async () => {
    const actions = await import("./session-actions")
    actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/test/project")
    const operation = actions.captureBlockingRequest({ kind: "question", sessionId: "session-a", requestId: "q1" })
    pendingListResult = { data: [{ id: "q1", sessionID: "other-session" }] }
    await expect(operation.read()).resolves.toBe("resolved")
    pendingListResult = { data: [{ id: "q1", sessionID: "session-a" }] }
    await expect(operation.read()).resolves.toBe("pending")
    expect(listCalls.every((call) => call.kind === "question")).toBe(true)
    expect(replyCalls).toHaveLength(0)
  })

  test("rejects a snapshot superseded by a canonical event during its read", async () => {
    const actions = await import("./session-actions")
    const { noteBlockingRequestEvent } = await import("./blocking-request-events")
    actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "/test/project")
    let resolve!: (value: { data: unknown }) => void
    mockScopedClient.permission.list.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const operation = actions.captureBlockingRequest({
      kind: "permission",
      sessionId: "session-a",
      requestId: permission.id,
    })
    const read = operation.read()
    noteBlockingRequestEvent("session-a")
    resolve({ data: [permission] })
    await expect(read).rejects.toThrow("changed during the read")
  })

  test("cannot infer resolution without a known directory", async () => {
    const actions = await import("./session-actions")
    actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([]), () => "")
    const operation = actions.captureBlockingRequest({ kind: "permission", sessionId: "unknown", requestId: "unknown" })
    await expect(operation.read()).rejects.toThrow("scope is unavailable")
    expect(listCalls).toHaveLength(0)
  })
})


describe("archive directory hints for globally listed sessions", () => {
  for (const action of ["archiveSession", "unarchiveSession"] as const) {
    test(`${action} preserves an unhydrated worktree directory instead of the current project`, async () => {
      const actions = await import("./session-actions")
      actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([
        ["/current/project", createStore({})], ["/worktrees/hidden", createStore({})],
      ]), () => "/current/project")
      await expect(actions[action]("hidden-session", { directoryHint: "/worktrees/hidden" })).resolves.toBe(true)
      expect(sessionCalls).toContainEqual({ method: "session.update", params: {
        sessionID: "hidden-session", directory: "/worktrees/hidden",
        time: { archived: action === "archiveSession" ? expect.any(Number) : null },
      } })
    })
    test(`${action} prefers the current authoritative directory over an old snapshot hint`, async () => {
      const actions = await import("./session-actions")
      actions.setActionRefs(mockSdk as unknown as AxCodeClient, createChildStores([
        ["/test/project", createStore({})], ["/old/snapshot", createStore({})],
      ]), () => "/current/project")
      await expect(actions[action]("session-a", { directoryHint: "/old/snapshot" })).resolves.toBe(true)
      expect(sessionCalls).toContainEqual({ method: "session.update", params: {
        sessionID: "session-a", directory: "/test/project",
        time: { archived: action === "archiveSession" ? expect.any(Number) : null },
      } })
    })
  }
})
