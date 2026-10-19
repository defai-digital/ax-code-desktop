import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { EventTransportHooks } from "@/lib/event-stream/types"
import { createEventPipeline, type EventPipelineInput } from "../event-pipeline"

const transport = vi.hoisted(() => ({ hooks: undefined as EventTransportHooks | undefined }))
vi.mock("@/lib/event-stream/client", () => ({
  createEventTransport: (_config: unknown, hooks: EventTransportHooks) => {
    transport.hooks = hooks
    return { close() {}, reconnect() {} }
  },
}))
const cleanups: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup()
    } catch {
      // already closed by the test
    }
  }
  vi.useRealTimers()
})

function deliverPayload(payload: unknown) {
  transport.hooks!.onFrame({ directory: "/project", payload }, { transport: "sse" })
}
function deliverReplied(id: string) {
  deliverPayload({ type: "permission.replied", properties: { sessionID: "s", requestID: id, reply: "once" } })
}
function fixture(onEvent: EventPipelineInput["onEvent"]) {
  const pipeline = createEventPipeline({ sdk: {} as EventPipelineInput["sdk"], onEvent })
  cleanups.push(pipeline.cleanup)
  return pipeline
}

// Decode a delivered event into a stable label that encodes its sequence.
function labelOf(event: { type: string; properties: Record<string, unknown> }): string {
  const p = event.properties as Record<string, unknown>
  if (event.type === "message.part.updated") {
    const part = p.part as { id: string; text: string }
    return `updated:${part.id}:${part.text}`
  }
  if (event.type === "message.part.removed") return `removed:${String(p.partID)}`
  if (event.type === "permission.asked") return `permission:${String(p.id)}`
  if (event.type === "question.asked") return `question:${String(p.id)}`
  if (event.type === "session.idle") return `idle:${String(p.sessionID)}`
  if (event.type === "permission.replied") return `replied:${String(p.requestID)}`
  if (event.type === "server.connected") return "connected"
  return event.type
}
type AnyEvent = { type: string; properties: Record<string, unknown> }

function buildBurst(): { payloads: unknown[]; expected: string[] } {
  const payloads: unknown[] = []
  const expected: string[] = []
  for (let seq = 0; seq < 1200; seq++) {
    if (seq === 600) {
      payloads.push({ type: "message.part.removed", properties: { sessionID: "s", messageID: "m1", partID: "p-100" } })
      expected.push("removed:p-100")
    } else if (seq === 601) {
      payloads.push({
        type: "message.part.updated",
        properties: { part: { id: "p-100", messageID: "m1", sessionID: "s", type: "text", text: "seq-601" } },
      })
      expected.push("updated:p-100:seq-601")
    } else if (seq === 900) {
      payloads.push({ type: "permission.asked", properties: { id: "perm-900", sessionID: "s" } })
      expected.push("permission:perm-900")
    } else if (seq === 901) {
      payloads.push({ type: "question.asked", properties: { id: "q-901", sessionID: "s" } })
      expected.push("question:q-901")
    } else if (seq === 1000) {
      payloads.push({ type: "session.idle", properties: { sessionID: "s" } })
      expected.push("idle:s")
    } else {
      payloads.push({
        type: "message.part.updated",
        properties: { part: { id: `p-${seq}`, messageID: "m1", sessionID: "s", type: "text", text: `seq-${seq}` } },
      })
      expected.push(`updated:p-${seq}:seq-${seq}`)
    }
  }
  return { payloads, expected }
}

test("1200-event synchronous burst: lossless, ordered, one slice per enqueue, pending bounded", () => {
  const delivered: string[] = []
  const lifecycle: string[] = []
  fixture((_, event) => {
    const e = event as unknown as AnyEvent
    const label = labelOf(e)
    delivered.push(label)
    if (label.startsWith("permission:") || label.startsWith("question:") || label.startsWith("idle:")) {
      lifecycle.push(label)
    }
  })
  const { payloads, expected } = buildBurst()
  let maxPerCall = 0
  let maxPending = 0
  for (let i = 0; i < payloads.length; i++) {
    const before = delivered.length
    deliverPayload(payloads[i])
    const perCall = delivered.length - before
    if (perCall > maxPerCall) maxPerCall = perCall
    // No coalescing for distinct parts / lifecycle events, so pending is exact.
    const pending = i + 1 - delivered.length
    if (pending > maxPending) maxPending = pending
    expect(perCall).toBeLessThanOrEqual(128)
    expect(pending).toBeLessThanOrEqual(513)
  }
  expect(maxPerCall).toBeLessThanOrEqual(128)
  expect(maxPerCall).toBeGreaterThan(0)
  expect(maxPending).toBeLessThanOrEqual(513)
  // Cooperative: burst did not synchronously drain everything.
  expect(delivered.length).toBeLessThan(1200)
  // A cut-short slice leaves a scheduled follow-up.
  expect(vi.getTimerCount()).toBeGreaterThan(0)

  vi.runAllTimers()
  expect(delivered).toEqual(expected)
  // Removal barrier: removed after original p-100 update, before recreate.
  const original = delivered.indexOf("updated:p-100:seq-100")
  const removed = delivered.indexOf("removed:p-100")
  const recreated = delivered.indexOf("updated:p-100:seq-601")
  expect(original).toBeGreaterThanOrEqual(0)
  expect(removed).toBeGreaterThan(original)
  expect(recreated).toBeGreaterThan(removed)
  // Lifecycle events keep relative order.
  expect(lifecycle).toEqual(["permission:perm-900", "question:q-901", "idle:s"])
  expect(vi.getTimerCount()).toBe(0)
})

function hardCapScenario(floodCount: number) {
  const delivered: string[] = []
  let flooded = false
  const pipeline = fixture((_, event) => {
    const e = event as unknown as AnyEvent
    const label = labelOf(e)
    delivered.push(label)
    if (label === "replied:0" && !flooded) {
      flooded = true
      for (let f = 0; f < floodCount; f++) deliverReplied(`f-${f}`)
    }
  })
  for (let i = 0; i < 512; i++) deliverReplied(String(i))
  expect(delivered.length).toBe(0)
  const before = delivered.length
  deliverReplied("512")
  const duringTrigger = delivered.length - before
  return { pipeline, delivered, duringTrigger }
}

test("hard cap: just below 2048 stays cooperative, at 2048 last-resort drain is synchronous", () => {
  // Pending at first dispatch = 511 in buffer. 1537 floods -> 2047 before
  // last push, never reaching the check at >= 2048, so only one slice runs.
  const below = hardCapScenario(1537)
  expect(below.duringTrigger).toBe(128)
  expect(below.delivered.length).toBe(128)
  below.pipeline.cleanup()
  const expectedBelow = [
    ...Array.from({ length: 512 }, (_, i) => `replied:${i}`),
    ...Array.from({ length: 1537 }, (_, i) => `replied:f-${i}`),
    "replied:512",
  ]
  expect(below.delivered).toEqual(expectedBelow)

  // 1538th flood enqueue is attempted while pending == 2048, so it sets the
  // last-resort drain; the whole backlog then drains in the same callback.
  const at = hardCapScenario(1538)
  expect(at.duringTrigger).toBe(512 + 1538)
  expect(at.delivered.length).toBe(512 + 1538)
  at.pipeline.cleanup()
  const expectedAt = [
    ...Array.from({ length: 512 }, (_, i) => `replied:${i}`),
    ...Array.from({ length: 1538 }, (_, i) => `replied:f-${i}`),
    "replied:512",
  ]
  expect(at.delivered).toEqual(expectedAt)
  expect(vi.getTimerCount()).toBe(0)
})

test("re-entrant enqueue while flushing is not lost", () => {
  const delivered: string[] = []
  let injected = false
  const pipeline = fixture((_, event) => {
    const e = event as unknown as AnyEvent
    delivered.push(labelOf(e))
    if (labelOf(e) === "replied:0" && !injected) {
      injected = true
      deliverReplied("injected")
    }
  })
  deliverReplied("0")
  deliverReplied("1")
  vi.runAllTimers()
  expect(delivered).toEqual(["replied:0", "replied:1", "replied:injected"])
  pipeline.cleanup()
  expect(vi.getTimerCount()).toBe(0)
})

test("cleanup delivers everything synchronously in order", () => {
  const delivered: string[] = []
  const pipeline = fixture((_, event) => delivered.push(labelOf(event as unknown as AnyEvent)))
  for (let i = 0; i < 300; i++) deliverReplied(String(i))
  expect(delivered.length).toBe(0)
  pipeline.cleanup()
  expect(delivered).toEqual(Array.from({ length: 300 }, (_, i) => `replied:${i}`))
  expect(vi.getTimerCount()).toBe(0)
})

test("reconnect-style flushAll via server.connected delivers everything synchronously in order", () => {
  const delivered: string[] = []
  const pipeline = fixture((_, event) => delivered.push(labelOf(event as unknown as AnyEvent)))
  for (let i = 0; i < 300; i++) deliverReplied(String(i))
  expect(delivered.length).toBe(0)
  deliverPayload({ type: "server.connected", properties: {} })
  // flushAll runs synchronously inside the server.connected frame handling.
  expect(delivered).toEqual([...Array.from({ length: 300 }, (_, i) => `replied:${i}`), "connected"])
  pipeline.cleanup()
  expect(vi.getTimerCount()).toBe(0)
})

test("a pre-removal update still waiting in the queue is never merged past its removal under a slow handler", () => {
  const delivered: string[] = []
  fixture((_, event) => {
    delivered.push(labelOf(event as unknown as AnyEvent))
    // Each callback costs 1 ms of fake time, so the 8 ms slice budget ends a slice after 8 events and the backlog persists.
    vi.setSystemTime(Date.now() + 1)
  })
  const part = (id: string, text: string) => ({
    type: "message.part.updated",
    properties: { part: { id, messageID: "m1", sessionID: "s", type: "text", text } },
  })
  const expected: string[] = []
  for (let seq = 0; seq < 600; seq++) {
    if (seq === 520) {
      deliverPayload(part("p-x", "old"))
      expected.push("updated:p-x:old")
    } else if (seq === 530) {
      // The original update was queued after the first rotation, so it is still in the coalescing queue (not the buffer):
      // without the removal barrier the recreate would merge into its slot and move ahead of the removal.
      expect(delivered).not.toContain("updated:p-x:old")
      deliverPayload({ type: "message.part.removed", properties: { sessionID: "s", messageID: "m1", partID: "p-x" } })
      expected.push("removed:p-x")
    } else if (seq === 531) {
      deliverPayload(part("p-x", "new"))
      expected.push("updated:p-x:new")
    } else {
      deliverPayload(part(`p-${seq}`, `seq-${seq}`))
      expected.push(`updated:p-${seq}:seq-${seq}`)
    }
  }
  vi.runAllTimers()
  expect(delivered).toEqual(expected)
})
