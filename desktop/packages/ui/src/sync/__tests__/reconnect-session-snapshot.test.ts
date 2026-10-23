import { beforeEach, describe, expect, test, vi } from "vitest"
import { create, type StoreApi } from "zustand"
import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2/client"

// The reconnect pass reads the SDK through the module-level client and the project-level status fetch.
const statusMock = vi.fn(async (): Promise<Record<string, { type: "busy" | "idle" }> | null> => ({}))
const sessionsById: Record<string, Session> = {}
const sessionGetMock = vi.fn(async ({ sessionID }: { sessionID: string }) => ({ data: sessionsById[sessionID] ?? null }))
const questionsMock = vi.fn(async () => [])
const permissionsMock = vi.fn(async () => [])
type SnapshotResponse = { data: Array<{ info: Message; parts?: Part[] }> }
const scopedMessagesMock = vi.fn<(input: { sessionID: string; limit: number }) => Promise<SnapshotResponse>>(
  async () => ({ data: [] }),
)

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/repo",
    setDirectory: () => undefined,
    getSessionStatusForDirectory: statusMock,
    listPendingQuestions: questionsMock,
    listPendingPermissions: permissionsMock,
    getScopedSdkClient: () => ({
      session: {
        get: sessionGetMock,
        messages: scopedMessagesMock,
      },
    }),
  },
}))

vi.doMock("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: () => ({ isSessionAutoAccepting: () => false }),
  },
}))

vi.doMock("@/stores/useConfigStore", () => ({
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
import { ChildStoreManager, type DirectoryStore } from "../child-store"
import { createEventRoutingIndex, removeIndexedDirectory } from "../event-routing"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { PartMap } from "../part-map"
import { clearSessionPrefetch, getSessionPrefetch, shouldSkipSessionPrefetch } from "../session-prefetch-cache"
import type { Event } from "@defai-digital/ax-code-sdk/v2/client"

const { INITIAL_STATE } = await import("../types")
const { recoverSessionSnapshotsAfterGap, materializeSessionFromServer, triggerDirectorySnapshotRecovery } = await import("../sync-context")

beforeEach(() => {
  statusMock.mockReset().mockResolvedValue({})
  sessionGetMock.mockClear()
  questionsMock.mockClear()
  permissionsMock.mockClear()
  for (const id of Object.keys(sessionsById)) delete sessionsById[id]
  scopedMessagesMock.mockReset().mockResolvedValue({ data: [] })
})

const makeSession = (id: string, overrides: Partial<Session> = {}): Session =>
  ({
    id,
    slug: id,
    projectID: "proj_1",
    directory: "/repo",
    title: id,
    version: "1",
    time: { created: 1, updated: 1 },
    ...overrides,
  }) as Session

function createDirectoryStore(initial: Partial<State>): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    ...initial,
    session: initial.session ?? [],
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

const settle = async () => {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("reconnect session snapshot", () => {
  test("does not put an archived parent back in the live list", async () => {
    // The reconnect candidates include the parent of every listed session, and an archived session is not
    // part of this list — the `session.updated` reducer removes it. The answer was inserted anyway, so
    // the sidebar's active list showed the archived session again until the next event.
    const child = makeSession("ses_child", { parentID: "ses_parent" })
    sessionsById.ses_parent = makeSession("ses_parent", {
      time: { created: 1, updated: 2, archived: 3 },
    })
    sessionsById.ses_child = child

    const store = createDirectoryStore({ session: [child] })
    const childStores = {
      children: new Map([["/repo", store]]),
      getChild: (directory: string) => (directory === "/repo" ? store : undefined),
    }

    recoverSessionSnapshotsAfterGap(
      childStores as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0],
      {} as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[1],
    )
    await settle()

    expect(store.getState().session.map((session) => session.id)).toEqual(["ses_child"])
  })
})

describe("session snapshot materialization", () => {
  test("retries a warmup 5xx answer instead of materializing a phantom empty snapshot", async () => {
    // The SDK resolves `{ error }` on 5xx instead of throwing. Without inspecting it, retry()
    // never retried, the empty page returned early, and the cooldown skipped the next attempt.
    const message = {
      id: "msg_materialized",
      sessionID: "ses_materialize",
      role: "assistant",
      time: { created: 1 },
    } as unknown as Message
    // The reconnect test above may have issued its own snapshot reads in the background.
    scopedMessagesMock.mockClear()
    scopedMessagesMock
      .mockResolvedValueOnce({ error: { message: "warmup" }, response: { status: 503 } } as never)
      .mockResolvedValueOnce({
        data: [{ info: message, parts: [] }],
        response: { headers: { get: () => null } },
      } as never)
    const store = createDirectoryStore({ session: [makeSession("ses_materialize")] })

    await materializeSessionFromServer("/repo", "ses_materialize", store, () => true)

    expect(scopedMessagesMock).toHaveBeenCalledTimes(2)
    expect(store.getState().message["ses_materialize"]?.map((entry) => entry.id)).toEqual(["msg_materialized"])
  })
})


test.each([false, true])("coalesces triggers into one trailing pass after failure=%s", async (fail) => {
  const store = createDirectoryStore({})
  const routingIndex = {} as Parameters<typeof triggerDirectorySnapshotRecovery>[2]
  let finish!: () => void
  const pending = new Promise<void>((resolve, reject) => {
    finish = () => fail ? reject(new Error("offline")) : resolve()
  })
  const recover = vi.fn().mockImplementationOnce(() => pending).mockResolvedValue(undefined)
  triggerDirectorySnapshotRecovery("/dirty", store, routingIndex, recover)
  triggerDirectorySnapshotRecovery("/dirty", store, routingIndex, recover)
  triggerDirectorySnapshotRecovery("/dirty", store, routingIndex, recover)
  expect(recover).toHaveBeenCalledTimes(1)
  finish()
  await settle()
  expect(recover).toHaveBeenCalledTimes(2)
  expect(recover.mock.calls[1]).toEqual(["/dirty", store, routingIndex])
  triggerDirectorySnapshotRecovery("/dirty", store, routingIndex, recover)
  await settle()
  expect(recover).toHaveBeenCalledTimes(3)
})

test("a replacement directory store does not share an old store's recovery claim", async () => {
  const oldStore = createDirectoryStore({})
  const newStore = createDirectoryStore({})
  let finish!: () => void
  const recover = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    .mockResolvedValue(undefined)
  const index = {} as Parameters<typeof triggerDirectorySnapshotRecovery>[2]
  triggerDirectorySnapshotRecovery("/replacement", oldStore, index, recover)
  triggerDirectorySnapshotRecovery("/replacement", newStore, index, recover)
  try {
    expect(recover).toHaveBeenCalledTimes(2)
  } finally {
    finish()
    await settle()
  }
})


test("reconnect discovers server-active sessions with no local candidates", async () => {
  const store = createDirectoryStore({ session: [], session_status: {}, message: {} })
  sessionsById.ses_discovered = makeSession("ses_discovered")
  statusMock.mockClear()
  statusMock.mockResolvedValueOnce({ ses_discovered: { type: "busy" } })
  const index = createEventRoutingIndex()
  const children = { children: new Map([["/discovery", store]]), getChild: () => store }
  recoverSessionSnapshotsAfterGap(children as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0], index)
  await settle()
  expect(statusMock).toHaveBeenCalledWith("/discovery")
  expect(store.getState().session_status.ses_discovered).toEqual({ type: "busy" })
  expect(store.getState().session.map((entry) => entry.id)).toEqual(["ses_discovered"])
  expect(scopedMessagesMock).toHaveBeenCalledWith({ sessionID: "ses_discovered", limit: 30 })
})

test("a failed reconnect status read preserves local status", async () => {
  const store = createDirectoryStore({ session_status: { ses_unavailable: { type: "busy" } } })
  statusMock.mockResolvedValueOnce(null)
  const children = { children: new Map([["/unavailable", store]]), getChild: () => store }
  recoverSessionSnapshotsAfterGap(children as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0], createEventRoutingIndex())
  await settle()
  expect(store.getState().session_status.ses_unavailable).toEqual({ type: "busy" })
})


const liveEvent = (store: StoreApi<DirectoryStore>, event: Event) => store.setState((current) => {
  const draft = prepareEventDraft(current, event)
  applyDirectoryEvent(draft, event)
  return { message: draft.message, part: draft.part.seal() }
})

test.each(["materialization", "reconnect"] as const)(
  "%s repairs a streaming session in one pass and keeps prefetch complete",
  async (path) => {
    const ids = path === "reconnect" ? ["ses_stream_a", "ses_stream_b"] : ["ses_stream_a"]
    const info = (sessionID: string) => ({ id: `msg_${sessionID}`, sessionID, role: "assistant", time: { created: 1 } }) as Message
    const text = (sessionID: string) => ({ id: `prt_${sessionID}`, messageID: info(sessionID).id,
      sessionID, type: "text", text: "live",
    }) as Part
    const gap = (sessionID: string) => ({ ...text(sessionID), id: `prt_gap_${sessionID}`, text: "gap recovered" }) as Part
    for (const id of ids) sessionsById[id] = makeSession(id)
    clearSessionPrefetch("/repo", ids)
    const store = createDirectoryStore({
      session: ids.map((id) => sessionsById[id]),
      session_status: Object.fromEntries(ids.map((id) => [id, { type: "busy" }])),
      message: Object.fromEntries(ids.map((id) => [id, [info(id)]])),
      part: PartMap.from(Object.fromEntries(ids.map((id) => [info(id).id, [text(id)]]))),
    })
    type Answer = { data: Array<{ info: Message; parts: Part[] }> }
    const answers = new Map<string, (value: Answer) => void>()
    // Only the first request per candidate waits; an erroneous trailing pass is counted and bounded.
    scopedMessagesMock.mockImplementation(({ sessionID }: { sessionID: string }) => {
      if (answers.has(sessionID)) return Promise.resolve({ data: [] })
      return new Promise<Answer>((resolve) => { answers.set(sessionID, resolve) })
    })
    const children = { children: new Map([["/repo", store]]), getChild: () => store }
    let pending: Promise<void> | undefined
    if (path === "materialization") {
      pending = materializeSessionFromServer("/repo", ids[0], store, () => true)
    } else {
      recoverSessionSnapshotsAfterGap(children as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0], createEventRoutingIndex())
    }
    await settle()
    const tool = (sessionID: string) => ({ id: `prt_tool_${sessionID}`, messageID: info(sessionID).id,
      sessionID, type: "tool", state: { status: "completed", input: {}, output: "done", time: { start: 1, end: 2 } },
    }) as Part
    for (const id of ids) liveEvent(store, { type: "message.part.updated", properties: { part: tool(id) } } as Event)
    for (let turn = 0; turn < 3; turn += 1) {
      for (const id of ids) liveEvent(store, { type: "message.part.delta", properties: {
        sessionID: id, messageID: info(id).id, partID: text(id).id, field: "text", delta: " delta",
      } } as Event)
      await settle()
    }
    for (const id of ids) answers.get(id)!({ data: [{ info: info(id), parts: [text(id), gap(id)] }] })
    await pending
    await settle()
    expect(scopedMessagesMock).toHaveBeenCalledTimes(ids.length)
    expect(sessionGetMock).toHaveBeenCalledTimes(path === "reconnect" ? ids.length : 0)
    expect(statusMock).toHaveBeenCalledTimes(path === "reconnect" ? 1 : 0)
    expect(questionsMock).toHaveBeenCalledTimes(path === "reconnect" ? 1 : 0)
    expect(permissionsMock).toHaveBeenCalledTimes(path === "reconnect" ? 1 : 0)
    for (const id of ids) {
      expect(store.getState().part.get(info(id).id)).toEqual([
        gap(id), { ...text(id), text: "live delta delta delta" }, tool(id),
      ])
      const meta = getSessionPrefetch("/repo", id)
      expect(meta).toMatchObject({ complete: true, limit: 1, cursor: undefined })
      expect(shouldSkipSessionPrefetch({ hasMessages: true, info: meta, pageSize: 30 })).toBe(true)
    }
  },
)

test.each(["snapshot", "blocking requests"] as const)(
  "disposing a directory during slow %s cannot repopulate its routing index",
  async (stage) => {
    const id = "ses_disposed"
    sessionsById[id] = makeSession(id)
    const store = createDirectoryStore({ session: [sessionsById[id]], session_status: { [id]: { type: "busy" } } })
    const children = new ChildStoreManager()
    children.children.set("/repo", store)
    const index = createEventRoutingIndex()
    const info = { id: "msg_disposed", sessionID: id, role: "assistant", time: { created: 1 } } as Message
    let finish!: () => void
    const slow = new Promise<void>((resolve) => { finish = resolve })
    if (stage === "snapshot") {
      scopedMessagesMock.mockImplementationOnce(async () => {
        await slow
        return { data: [{ info, parts: [] }] }
      })
    } else {
      scopedMessagesMock.mockResolvedValueOnce({ data: [{ info, parts: [] }] })
      questionsMock.mockImplementationOnce(async () => { await slow; return [] })
    }
    recoverSessionSnapshotsAfterGap(children, index)
    await settle()
    expect(scopedMessagesMock).toHaveBeenCalledTimes(1)
    expect(children.disposeDirectory("/repo")).toBe(true)
    // The provider's disposal hook removes any mappings written before disposal.
    removeIndexedDirectory(index, "/repo")
    finish()
    await settle()
    expect(index.sessionDirectoryById.has(id)).toBe(false)
    expect(index.sessionMessageIdsById.has(id)).toBe(false)
    expect(index.messageSessionById.has(info.id)).toBe(false)
  },
)

test("a superseded materialization request neither writes nor starts a trailing fetch", async () => {
  const store = createDirectoryStore({})
  scopedMessagesMock.mockResolvedValueOnce({ data: [{
    info: { id: "msg_stale", sessionID: "ses_stale", role: "assistant" } as Message, parts: [],
  }] })
  const before = store.getState()
  await materializeSessionFromServer("/repo", "ses_stale", store, () => false)
  expect(store.getState()).toBe(before)
  expect(scopedMessagesMock).toHaveBeenCalledTimes(1)
})

test("reconnect keeps the live idle after a status ABA during its read", async () => {
  const id = "ses_reconnect_aba"
  sessionsById[id] = makeSession(id)
  const store = createDirectoryStore({ session: [sessionsById[id]], session_status: { [id]: { type: "idle" } } })
  statusMock.mockImplementationOnce(async () => {
    const draft = { ...store.getState(), session_status: { ...store.getState().session_status } }
    applyDirectoryEvent(draft, { type: "session.status", properties: { sessionID: id, status: { type: "busy" } } } as Event)
    applyDirectoryEvent(draft, { type: "session.idle", properties: { sessionID: id } } as Event)
    store.setState({ session_status: draft.session_status })
    return { [id]: { type: "busy" } }
  })
  const children = { children: new Map([["/repo", store]]), getChild: () => store }
  recoverSessionSnapshotsAfterGap(children as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0], createEventRoutingIndex())
  await settle()
  expect(store.getState().session_status[id]).toEqual({ type: "idle" })
})
