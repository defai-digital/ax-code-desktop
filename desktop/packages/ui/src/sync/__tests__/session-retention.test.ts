import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Event, Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { ChildStoreManager, type DirectoryStore } from "../child-store"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { BACKGROUND_MESSAGE_LIMIT, DIRECTORY_CONTENT_MAX_BYTES, SESSION_RETENTION_SWEEP_MS } from "../session-retention"
import { SESSION_CACHE_LIMIT, DIR_IDLE_TTL_MS } from "../types"
import { PartMap } from "../part-map"
import { getSessionPrefetch, setSessionPrefetch } from "../session-prefetch-cache"
import { messageLoadsByKey, metaByKey, optimisticByKey, retainSessionLoad } from "../session-load-cache"
import type { StoreApi } from "zustand"

const DIRECTORY = "/workspace/retention"
const message = (sessionID: string, index = 0): Message =>
  ({
    id: `msg_${sessionID}_${String(index).padStart(6, "0")}`,
    sessionID,
    role: "assistant",
    time: { created: index, completed: index + 1 },
  }) as Message
const part = (info: Message, text = "hello"): Part => ({
  id: `prt_${info.id}`,
  messageID: info.id,
  sessionID: info.sessionID,
  type: "text",
  text,
})
function apply(store: StoreApi<DirectoryStore>, event: Event) {
  const draft = prepareEventDraft(store.getState(), event)
  applyDirectoryEvent(draft, event)
  store.setState({ ...draft, part: draft.part.seal() })
}
function completed(store: StoreApi<DirectoryStore>, sessionID: string, text = "hello") {
  const info = message(sessionID)
  apply(store, { type: "message.updated", properties: { info } } as Event)
  apply(store, { type: "message.part.updated", properties: { part: part(info, text) } } as Event)
  apply(store, { type: "session.status", properties: { sessionID, status: { type: "idle" } } } as Event)
}

describe("directory content retention", () => {
  let manager: ChildStoreManager
  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ChildStoreManager()
  })
  afterEach(() => {
    manager.disposeAll()
    vi.useRealTimers()
  })

  test("bounds completed background sessions written only by live events", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    for (let i = 0; i < 200; i++) completed(store, `ses_${i}`)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(Object.keys(store.getState().message)).toHaveLength(SESSION_CACHE_LIMIT)
    expect(store.getState().part.size).toBe(SESSION_CACHE_LIMIT)
    expect(Object.keys(store.getState().session_status)).toHaveLength(SESSION_CACHE_LIMIT)
    expect(manager.getRetentionStats().evictedSessions).toBe(160)
  })

  test("snapshot writes obey the same policy without a hook or event handler", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    store.setState({
      message: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`ses_${i}`, [message(`ses_${i}`)]])),
    })
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(Object.keys(store.getState().message)).toHaveLength(SESSION_CACHE_LIMIT)
  })

  test("trims old background history and invalidates pagination and prefetch together", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    const messages = Array.from({ length: 1000 }, (_, i) => message("ses_long", i))
    store.setState({
      message: { ses_long: messages },
      part: PartMap.from(messages.map((info) => [info.id, [part(info)]])),
    })
    setSessionPrefetch({ directory: DIRECTORY, sessionID: "ses_long", limit: 1000, complete: true })
    metaByKey.set(`${DIRECTORY}\nses_long`, {
      limit: 1000,
      cursor: undefined,
      complete: true,
      fetched: true,
      loading: false,
    })
    const invalidated = vi.fn()
    manager.configure({ onContentInvalidated: invalidated })
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_long).toEqual(messages.slice(-BACKGROUND_MESSAGE_LIMIT))
    expect(store.getState().part.size).toBe(BACKGROUND_MESSAGE_LIMIT)
    expect(getSessionPrefetch(DIRECTORY, "ses_long")).toBeUndefined()
    expect(metaByKey.has(`${DIRECTORY}\nses_long`)).toBe(false)
    expect(invalidated).toHaveBeenCalledWith(DIRECTORY, ["ses_long"])
  })

  test("preserves viewed, running, incomplete, pending approval/question and loading sessions", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    manager.configure({ getViewedSessions: () => new Set(["ses_viewed"]) })
    for (const id of ["viewed", "busy", "incomplete", "permission", "question", "loading"])
      completed(store, `ses_${id}`)
    const previous = store.getState()
    store.setState({
      session_status: { ...previous.session_status, ses_busy: { type: "busy" } },
      message: {
        ...previous.message,
        ses_incomplete: [{ ...message("ses_incomplete"), time: { created: 1 } } as Message],
      },
      permission: { ses_permission: [{ id: "permission", sessionID: "ses_permission" } as never] },
      question: { ses_question: [{ id: "question", sessionID: "ses_question" } as never] },
    })
    messageLoadsByKey.set(`${DIRECTORY}\nses_loading`, {})
    for (let i = 0; i < 100; i++) completed(store, `ses_other_${i}`)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    for (const id of ["viewed", "busy", "incomplete", "permission", "question", "loading"]) {
      expect(store.getState().message[`ses_${id}`]).toHaveLength(1)
    }
    expect(Object.keys(store.getState().message)).toHaveLength(SESSION_CACHE_LIMIT)
  })

  test("preserves explicitly paged visible history then trims it after leaving", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    let viewed = true
    manager.configure({ getViewedSessions: () => new Set(viewed ? ["ses_long"] : []) })
    const messages = Array.from({ length: 1000 }, (_, i) => message("ses_long", i))
    store.setState({ message: { ses_long: messages } })
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_long).toHaveLength(1000)
    viewed = false
    manager.sweepRetention()
    expect(store.getState().message.ses_long).toHaveLength(BACKGROUND_MESSAGE_LIMIT)
  })

  test("enforces payload bytes and clears orphaned parts, without dropping protected payloads", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    const text = "x".repeat(DIRECTORY_CONTENT_MAX_BYTES / 2)
    completed(store, "ses_large", text)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_large).toBeUndefined()
    expect(store.getState().part.size).toBe(0)
    manager.configure({ getViewedSessions: () => new Set(["ses_visible"]) })
    completed(store, "ses_visible", text)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_visible).toHaveLength(1)
    expect(manager.getRetentionStats().estimatedBytes).toBeGreaterThan(DIRECTORY_CONTENT_MAX_BYTES)
  })

  test("counts optimistic parts without a sessionID toward the content budget", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    const info = message("ses_optimistic_part")
    store.setState({
      message: { ses_optimistic_part: [info] },
      part: PartMap.from([
        [
          info.id,
          [
            {
              id: "prt_optimistic",
              type: "text",
              text: "x".repeat(DIRECTORY_CONTENT_MAX_BYTES / 2),
            } as Part,
          ],
        ],
      ]),
    })
    manager.sweepRetention()
    expect(store.getState().message.ses_optimistic_part).toBeUndefined()
    expect(store.getState().part.size).toBe(0)
  })

  test("idle content expires without more events and release of protection is respected", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    completed(store, "ses_idle")
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    vi.advanceTimersByTime(DIR_IDLE_TTL_MS)
    manager.sweepRetention()
    expect(store.getState().message.ses_idle).toBeUndefined()
    expect(store.getState().part.size).toBe(0)
  })

  test("settled optimistic shadows do not permanently pin completed sessions", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    completed(store, "ses_optimistic")
    optimisticByKey.set(
      `${DIRECTORY}\nses_optimistic`,
      new Map([["old", { message: message("ses_optimistic"), parts: [] }]]),
    )
    for (let i = 0; i < 100; i++) completed(store, `ses_${i}`)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_optimistic).toBeUndefined()
    expect(optimisticByKey.has(`${DIRECTORY}\nses_optimistic`)).toBe(false)
  })

  test("a read lease protects content only until it settles", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    completed(store, "ses_read")
    const lease = retainSessionLoad(DIRECTORY, "ses_read")
    for (let i = 0; i < 100; i++) completed(store, `ses_${i}`)
    vi.advanceTimersByTime(SESSION_RETENTION_SWEEP_MS)
    expect(store.getState().message.ses_read).toHaveLength(1)
    lease.release()
    manager.sweepRetention(Date.now() + DIR_IDLE_TTL_MS)
    expect(store.getState().message.ses_read).toBeUndefined()
  })

  test("disposing a directory invalidates load claims and releases its pending sweep", () => {
    const store = manager.ensureChild(DIRECTORY, { bootstrap: false })
    completed(store, "ses_pending")
    messageLoadsByKey.set(`${DIRECTORY}\nses_pending`, {})
    expect(manager.disposeDirectory(DIRECTORY)).toBe(false)
    manager.disposeAll()
    expect(messageLoadsByKey.has(`${DIRECTORY}\nses_pending`)).toBe(false)
    manager.disposeAll()
    expect(vi.getTimerCount()).toBe(0)
    completed(store, "ses_detached")
    expect(vi.getTimerCount()).toBe(0)
  })
})
