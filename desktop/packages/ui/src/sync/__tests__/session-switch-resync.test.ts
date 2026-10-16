import { describe, expect, test, beforeEach, vi } from "vitest"
import { create, type StoreApi } from "zustand"
import type { PermissionRequest, QuestionRequest } from "@defai-digital/ax-code-sdk/v2/client"

const listPendingQuestionsCalls: Array<{ directories?: Array<string | null | undefined> }> = []
const listPendingPermissionsCalls: Array<{ directories?: Array<string | null | undefined> }> = []
let pendingQuestionsResponse: QuestionRequest[] = []
let pendingPermissionsResponse: PermissionRequest[] = []
let pendingQuestionsShouldThrow = false
let pendingPermissionsShouldThrow = false
// Runs while the snapshot request is in flight, so a test can change the local store after the server
// computed its answer.
let onPendingQuestionsRequest: (() => void) | null = null
let onPendingPermissionsRequest: (() => void) | null = null

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    listPendingQuestions: vi.fn(async (opts?: { directories?: Array<string | null | undefined> }) => {
      listPendingQuestionsCalls.push(opts ?? {})
      onPendingQuestionsRequest?.()
      if (pendingQuestionsShouldThrow) throw new Error("question.list failed: simulated")
      return pendingQuestionsResponse
    }),
    listPendingPermissions: vi.fn(async (opts?: { directories?: Array<string | null | undefined> }) => {
      listPendingPermissionsCalls.push(opts ?? {})
      onPendingPermissionsRequest?.()
      if (pendingPermissionsShouldThrow) throw new Error("permission.list failed: simulated")
      return pendingPermissionsResponse
    }),
    getDirectory: () => "/repo",
    getScopedSdkClient: () => ({}),
    setDirectory: () => undefined,
  },
}))

vi.doMock("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: () => ({ isSessionAutoAccepting: () => false }),
  },
}))

vi.doMock("@/stores/useConfigStore", () => ({
  // Connection fields (isConnected/hasEverConnected) left this store in S4.7 —
  // the mock only exists so transitively imported modules never load the real
  // (browser-persisted) config store in a node test.
  useConfigStore: {
    getState: () => ({}),
    setState: () => undefined,
  },
}))

vi.doMock("@/stores/useTodosPersistStore", () => ({
  useTodosPersistStore: { getState: () => ({}) },
}))

vi.doMock("@/components/ui", () => ({
  toast: { info: () => undefined, error: () => undefined, success: () => undefined },
}))

import type { State } from "../types"
import type { DirectoryStore } from "../child-store"

const { INITIAL_STATE } = await import("../types")
const { resyncBlockingRequestsForDirectory } = await import("../sync-context")
const { applyDirectoryEvent } = await import("../event-reducer")

function buildQuestion(overrides: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    id: "que_1",
    sessionID: "ses_a",
    questions: [{ question: "Continue?", header: "Q", options: [{ label: "Yes", description: "" }] }],
    ...overrides,
  } as QuestionRequest
}

function buildPermission(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "perm_1",
    sessionID: "ses_a",
    permission: "bash",
    patterns: [],
    metadata: {},
    always: [],
    ...overrides,
  } as PermissionRequest
}

function createDirectoryStore(initial: Partial<State>): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    ...initial,
    session: initial.session ?? [
      { id: "ses_a", title: "ses_a", time: { created: 1, updated: 1 }, version: "1" } as State["session"][number],
    ],
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

describe("resyncBlockingRequestsForDirectory", () => {
  beforeEach(() => {
    listPendingQuestionsCalls.length = 0
    listPendingPermissionsCalls.length = 0
    pendingQuestionsResponse = []
    pendingPermissionsResponse = []
    pendingQuestionsShouldThrow = false
    pendingPermissionsShouldThrow = false
    onPendingQuestionsRequest = null
    onPendingPermissionsRequest = null
  })

  test("calls listPendingQuestions and listPendingPermissions exactly once for the directory", async () => {
    const store = createDirectoryStore({})
    pendingQuestionsResponse = [buildQuestion()]
    pendingPermissionsResponse = [buildPermission()]

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(listPendingQuestionsCalls).toHaveLength(1)
    expect(listPendingQuestionsCalls[0]).toEqual({ directories: ["/repo"] })
    expect(listPendingPermissionsCalls).toHaveLength(1)
    expect(listPendingPermissionsCalls[0]).toEqual({ directories: ["/repo"] })
  })

  test("does not restore a question the user answered while the snapshot was in flight", async () => {
    // The snapshot is computed before the request travels, so a question asked and answered inside that
    // window is still listed in it. The id list is back to what it was before the request, so the
    // signature comparison alone cannot tell that the answer is older than the store.
    // Own question/permission maps: `createDirectoryStore` shares the nested objects with INITIAL_STATE,
    // and the reducer mutates the draft in place.
    const store = createDirectoryStore({ question: {}, permission: {} })
    const stale = buildQuestion()
    pendingQuestionsResponse = [stale]
    onPendingQuestionsRequest = () => {
      applyDirectoryEvent(store.getState(), { type: "question.asked", properties: stale } as never)
      applyDirectoryEvent(store.getState(), {
        type: "question.replied",
        properties: { sessionID: "ses_a", requestID: stale.id },
      } as never)
    }

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_a"] ?? []).toEqual([])
  })

  test("does not restore a permission the user answered while the snapshot was in flight", async () => {
    const store = createDirectoryStore({ question: {}, permission: {} })
    const stale = buildPermission()
    pendingPermissionsResponse = [stale]
    onPendingPermissionsRequest = () => {
      applyDirectoryEvent(store.getState(), { type: "permission.asked", properties: stale } as never)
      applyDirectoryEvent(store.getState(), {
        type: "permission.replied",
        properties: { sessionID: "ses_a", requestID: stale.id },
      } as never)
    }

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().permission["ses_a"] ?? []).toEqual([])
  })

  test("does not restore a question the client never saw asked", async () => {
    // After a reconnect gap the store never held the question, so its answer reports no change to the
    // store at all. The stamp has to be module state: a counter carried on the reducer's draft is dropped
    // with the draft, and the snapshot the request was already computing puts the question back.
    const store = createDirectoryStore({ question: {}, permission: {} })
    const stale = buildQuestion()
    pendingQuestionsResponse = [stale]
    onPendingQuestionsRequest = () => {
      applyDirectoryEvent(store.getState(), {
        type: "question.replied",
        properties: { sessionID: "ses_a", requestID: stale.id },
      } as never)
    }

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_a"] ?? []).toEqual([])
  })

  test("merges newly fetched questions/permissions into the directory store", async () => {
    const store = createDirectoryStore({})
    pendingQuestionsResponse = [buildQuestion()]
    pendingPermissionsResponse = [buildPermission()]

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_a"]).toHaveLength(1)
    expect(store.getState().question["ses_a"]?.[0]?.id).toBe("que_1")
    expect(store.getState().permission["ses_a"]).toHaveLength(1)
    expect(store.getState().permission["ses_a"]?.[0]?.id).toBe("perm_1")
  })

  test("preserves an in-flight SSE-delivered question whose signature changed during the fetch", async () => {
    const store = createDirectoryStore({
      question: { ses_a: [{ ...buildQuestion(), id: "que_initial" }] },
    })
    pendingQuestionsResponse = []

    const promise = resyncBlockingRequestsForDirectory("/repo", store)
    store.setState({
      question: { ses_a: [{ ...buildQuestion(), id: "que_sse_arrived" }] },
    })
    await promise

    expect(store.getState().question["ses_a"]).toHaveLength(1)
    expect(store.getState().question["ses_a"]?.[0]?.id).toBe("que_sse_arrived")
  })

  test("preserves an in-flight SSE-delivered question even when the session still has other pending questions in the snapshot", async () => {
    // Unlike the "signature changed during the fetch" case above (where the
    // snapshot came back empty for the session), this covers the case where
    // the snapshot DOES have an entry for the session — but that entry was
    // computed before a concurrent live update, and must not clobber it.
    const store = createDirectoryStore({
      question: { ses_a: [{ ...buildQuestion(), id: "que_initial" }] },
    })
    pendingQuestionsResponse = [{ ...buildQuestion(), id: "que_initial" }]

    const promise = resyncBlockingRequestsForDirectory("/repo", store)
    store.setState({
      question: {
        ses_a: [
          { ...buildQuestion(), id: "que_initial" },
          { ...buildQuestion(), id: "que_sse_arrived" },
        ],
      },
    })
    await promise

    const ids = store
      .getState()
      .question["ses_a"]?.map((q) => q.id)
      .sort()
    expect(ids).toEqual(["que_initial", "que_sse_arrived"])
  })

  test("preserves an in-flight SSE-delivered permission even when the session still has other pending permissions in the snapshot", async () => {
    const store = createDirectoryStore({
      permission: { ses_a: [{ ...buildPermission(), id: "perm_initial" }] },
    })
    pendingPermissionsResponse = [{ ...buildPermission(), id: "perm_initial" }]

    const promise = resyncBlockingRequestsForDirectory("/repo", store)
    store.setState({
      permission: {
        ses_a: [
          { ...buildPermission(), id: "perm_initial" },
          { ...buildPermission(), id: "perm_sse_arrived" },
        ],
      },
    })
    await promise

    const ids = store
      .getState()
      .permission["ses_a"]?.map((p) => p.id)
      .sort()
    expect(ids).toEqual(["perm_initial", "perm_sse_arrived"])
  })

  test("clears stale entries when API returns no pending requests and signature unchanged", async () => {
    const store = createDirectoryStore({
      question: { ses_a: [{ ...buildQuestion(), id: "que_stale" }] },
    })
    pendingQuestionsResponse = []
    pendingPermissionsResponse = []

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_a"]).toEqual(undefined)
  })

  test("ignores questions for sessions the directory does not know about", async () => {
    const store = createDirectoryStore({})
    pendingQuestionsResponse = [{ ...buildQuestion(), sessionID: "ses_unknown" }]

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_unknown"]).toEqual(undefined)
  })

  test("returns early without fetching when no candidate sessions are known", async () => {
    const store = createDirectoryStore({ session: [] })
    await resyncBlockingRequestsForDirectory("/repo", store)
    expect(listPendingQuestionsCalls).toHaveLength(0)
    expect(listPendingPermissionsCalls).toHaveLength(0)
  })

  // Regression: prior to the fix, listPendingQuestions silently returned [] on
  // fetch failure, indistinguishable from a successful empty server response.
  // The resync then walked the candidate set and deleted any question that
  // wasn't in the (empty) result — wiping legitimate in-flight prompts on a
  // transient network blip. The client method now throws on failure and the
  // outer try/catch preserves existing state.
  test("preserves existing questions when listPendingQuestions throws (transient fetch failure)", async () => {
    const store = createDirectoryStore({
      question: { ses_a: [{ ...buildQuestion(), id: "que_in_flight" }] },
    })
    pendingQuestionsShouldThrow = true

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().question["ses_a"]).toHaveLength(1)
    expect(store.getState().question["ses_a"]?.[0]?.id).toBe("que_in_flight")
  })

  test("preserves existing permissions when listPendingPermissions throws (transient fetch failure)", async () => {
    const store = createDirectoryStore({
      permission: { ses_a: [{ ...buildPermission(), id: "perm_in_flight" }] },
    })
    pendingPermissionsShouldThrow = true

    await resyncBlockingRequestsForDirectory("/repo", store)

    expect(store.getState().permission["ses_a"]).toHaveLength(1)
    expect(store.getState().permission["ses_a"]?.[0]?.id).toBe("perm_in_flight")
  })

  test("permission fetch failure does not block question resync (and vice versa)", async () => {
    const store = createDirectoryStore({})
    pendingQuestionsResponse = [buildQuestion()]
    pendingPermissionsShouldThrow = true

    await resyncBlockingRequestsForDirectory("/repo", store)

    // Question block ran successfully despite permission block failing.
    expect(store.getState().question["ses_a"]).toHaveLength(1)
    expect(store.getState().question["ses_a"]?.[0]?.id).toBe("que_1")
    expect(listPendingPermissionsCalls).toHaveLength(1)
  })
})

describe("replay-gap snapshot recovery", () => {
  const buildChildStores = (directories: string[]) => {
    const stores = new Map(directories.map((directory) => [directory, createDirectoryStore({})]))
    return {
      children: stores,
      getChild: (directory: string) => stores.get(directory),
    }
  }

  test("takes a snapshot pass for every directory that has a store", async () => {
    const { recoverSessionSnapshotsAfterGap } = await import("../sync-context")
    const recovered: string[] = []
    const childStores = buildChildStores(["/repo", "/other"])

    recoverSessionSnapshotsAfterGap(
      childStores as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0],
      {} as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[1],
      async (directory) => {
        recovered.push(directory)
      },
    )

    expect(recovered).toEqual(["/repo", "/other"])
  })

  test("skips a directory whose pass is still running, and allows it again after", async () => {
    const { recoverSessionSnapshotsAfterGap } = await import("../sync-context")
    const childStores = buildChildStores(["/repo"])
    const started: string[] = []
    let release = () => {}
    const recover = async (directory: string) => {
      started.push(directory)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    const run = () =>
      recoverSessionSnapshotsAfterGap(
        childStores as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0],
        {} as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[1],
        recover,
      )

    run()
    run()
    expect(started).toEqual(["/repo"])

    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    run()
    expect(started).toEqual(["/repo", "/repo"])
  })
})
