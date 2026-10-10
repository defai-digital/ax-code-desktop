import { describe, expect, test, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { Event, Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { applyPartDeltaBatch } from "../part-delta-batch"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { subscribeSessionMessageRecords } from "../session-message-subscription"
import { recordPartChanges } from "../part-changes"
import { INITIAL_STATE, type State } from "../types"

const delta = (messageID: string, text: string): Event =>
  ({ type: "message.part.delta", properties: { messageID, partID: messageID, field: "text", delta: text } }) as Event
const initial = (): State => ({
  ...INITIAL_STATE,
  message: { active: [{ id: "a" } as Message], background: [{ id: "b" } as Message] },
  part: {
    a: [{ id: "a", type: "text", text: "start" } as Part],
    b: [{ id: "b", type: "text", text: "" } as Part],
  },
})

describe("batched streaming updates", () => {
  test("matches sequential reduction, preserves the old snapshot, and notifies once", () => {
    const before = initial()
    Object.freeze(before.part.a[0])
    Object.freeze(before.part.a)
    Object.freeze(before.part)
    const events = [delta("a", " one"), delta("b", "background"), delta("a", " two")]
    let sequential = before
    for (const event of events) {
      const next = prepareEventDraft(sequential, event)
      applyDirectoryEvent(next, event)
      sequential = next
    }
    const store = createStore<State>(() => before)
    const notify = vi.fn()
    const unsubscribe = subscribeSessionMessageRecords(store, "active", notify)
    const result = applyPartDeltaBatch(before, events, vi.fn(), vi.fn())
    expect(result).toEqual(sequential)
    store.setState(result!)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(before.part.a[0]).toMatchObject({ text: "start" })
    expect(result!.message).toBe(before.message)
    unsubscribe()
  })

  test("retains missing-part recovery and isolates a malformed delta", () => {
    const onResult = vi.fn()
    const onError = vi.fn()
    const malformed = { type: "message.part.delta", properties: null } as unknown as Event
    const next = applyPartDeltaBatch(initial(), [delta("missing", "x"), malformed, delta("a", "ok")], onResult, onError)
    expect(onResult.mock.calls[0][1]).toMatchObject({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "missing" },
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(next!.part.a[0]).toMatchObject({ text: "startok" })
    expect(applyPartDeltaBatch(initial(), [delta("missing", "x")], vi.fn(), vi.fn())).toBeUndefined()
  })

  test("preserves overlap deduplication across a full snapshot barrier", () => {
    const streamed = applyPartDeltaBatch(initial(), [delta("a", " one"), delta("a", " two")], vi.fn(), vi.fn())!
    const snapshot = {
      type: "message.part.updated",
      properties: { part: { id: "a", messageID: "a", sessionID: "active", type: "text", text: "start one two" } },
    } as Event
    const updated = prepareEventDraft(streamed, snapshot)
    applyDirectoryEvent(updated, snapshot)
    const after = applyPartDeltaBatch(updated, [delta("a", " two"), delta("a", " three")], vi.fn(), vi.fn())!
    expect(after.part.a[0]).toMatchObject({ text: "start one two three" })
    expect(streamed.part.a[0]).toMatchObject({ text: "start one two" })
  })

  test("skips reading active message parts for status updates and hinted background deltas", () => {
    const state = initial()
    const reads = vi.fn()
    state.part = new Proxy(state.part, {
      get: (target, key: string) => {
        reads()
        return target[key]
      },
    })
    const store = createStore<State>(() => state)
    const notify = vi.fn()
    const unsubscribe = subscribeSessionMessageRecords(store, "active", notify)
    store.setState({ session_status: { background: { type: "busy" } } })
    const nextPart = { a: state.part.a, b: [] }
    reads.mockClear()
    recordPartChanges(state.part, nextPart, new Set(["b"]))
    store.setState({ part: nextPart })
    expect(reads).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    unsubscribe()
  })

  test("falls back for unhinted snapshots and hints from a different predecessor", () => {
    const store = createStore<State>(() => initial())
    const notify = vi.fn()
    const unsubscribe = subscribeSessionMessageRecords(store, "active", notify)
    const part = { ...store.getState().part, a: [] }
    recordPartChanges({}, part, new Set(["b"]))
    store.setState({ part })
    expect(notify).toHaveBeenCalledTimes(1)
    store.setState({ message: { ...store.getState().message, active: [{ id: "c" } as Message] } })
    expect(notify).toHaveBeenCalledTimes(2)
    const next = { ...store.getState().part, c: [] }
    recordPartChanges(part, next, new Set(["c"]))
    store.setState({ part: next })
    expect(notify).toHaveBeenCalledTimes(3)
    unsubscribe()
    store.setState({ part: {} })
    expect(notify).toHaveBeenCalledTimes(3)
  })

  test("suspended subscriptions still accept message list changes", () => {
    const store = createStore<State>(() => initial())
    const notify = vi.fn()
    const unsubscribe = subscribeSessionMessageRecords(store, "active", notify, true)
    store.setState({ part: {} })
    expect(notify).not.toHaveBeenCalled()
    store.setState({ message: {} })
    expect(notify).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
