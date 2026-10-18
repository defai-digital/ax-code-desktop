// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Event, Message, Part, Session, SessionStatus, Todo } from "@defai-digital/ax-code-sdk/v2/client"
import {
  applyHeadlessProjectionEvent,
  createHeadlessProjectionState,
} from "@defai-digital/ax-code-sdk/headless/projection"
import type { EventTransportHooks } from "@/lib/event-stream/types"
import { createEventPipeline, type EventPipelineInput } from "../event-pipeline"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"

const transport = vi.hoisted(() => ({ hooks: undefined as EventTransportHooks | undefined }))
vi.mock("@/lib/event-stream/client", () => ({
  createEventTransport: (_config: unknown, hooks: EventTransportHooks) => {
    transport.hooks = hooks
    return { close() {}, reconnect() {} }
  },
}))

type TraceEvent = Extract<Event, { type: "message.part.updated" | "message.part.removed" | "message.part.delta" }>
const part = (text: string): Part => ({ id: "p", messageID: "m", sessionID: "s", type: "text", text })
const snapshot = (text: string): TraceEvent => ({ type: "message.part.updated", properties: { part: part(text) } })
const delta = (text: string, offset?: number): TraceEvent => ({
  type: "message.part.delta",
  properties: { sessionID: "s", messageID: "m", partID: "p", field: "text", delta: text, offset },
})
const message = { id: "m", sessionID: "s", role: "assistant", time: { created: 1 } } as Message

afterEach(() => vi.restoreAllMocks())

function replay(events: TraceEvent[]) {
  const delivered: Event[] = []
  let state: State = { ...INITIAL_STATE, message: { s: [message] }, part: PartMap.from({ m: [part("")] }) }
  const reference = createHeadlessProjectionState<Session, Todo, unknown, SessionStatus, Message, Part>()
  applyHeadlessProjectionEvent(reference, { type: "message.updated", properties: { info: message } })
  applyHeadlessProjectionEvent(reference, snapshot(""))
  const pipeline = createEventPipeline({
    sdk: {} as EventPipelineInput["sdk"],
    onEvent: (_directory, event) => {
      delivered.push(event)
      const next = prepareEventDraft(state, event)
      applyDirectoryEvent(next, event)
      next.part.seal()
      state = next
    },
  })
  try {
    for (const event of events) {
      applyHeadlessProjectionEvent(reference, event)
      transport.hooks!.onFrame({ directory: "/project", payload: event }, { transport: "sse" })
    }
  } finally {
    pipeline.cleanup()
  }
  return { actual: state.part.get("m"), expected: reference.part.m, delivered }
}

describe("coalescing preserves published SDK text semantics", () => {
  test("a removal separates snapshots for the same part", () => {
    const result = replay([
      snapshot("before"),
      { type: "message.part.removed", properties: { sessionID: "s", messageID: "m", partID: "p" } },
      snapshot("after"),
    ])
    expect(result.actual).toEqual(result.expected)
  })

  test.each([
    [delta("a"), delta("b", 1)],
    [delta("a", 0), delta("b")],
    [delta("a", 0), delta("b", 1), delta("ab", 0)],
    [delta("a".repeat(64 * 1024), 0), delta("b", 64 * 1024)],
  ])("does not invent offsets across legacy, contiguous, or replayed deltas", (...events) => {
    const result = replay(events)
    expect(result.actual?.map((p) => (p as { text: string }).text)).toEqual(
      result.expected?.map((p) => (p as { text: string }).text),
    )
  })

  test("leaves invalid numeric offsets separate for reducer reconciliation", () => {
    const events = [delta("a", -1), delta("b", 0)]
    expect(replay(events).delivered).toEqual(events)
  })
})
