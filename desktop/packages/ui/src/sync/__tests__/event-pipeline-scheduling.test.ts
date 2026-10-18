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
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
})
const deliver = (id: number) =>
  transport.hooks!.onFrame(
    {
      directory: "/project",
      payload: { type: "permission.replied", properties: { sessionID: "s", requestID: String(id), reply: "once" } },
    },
    { transport: "sse" },
  )
const fixture = (onEvent: EventPipelineInput["onEvent"]) => {
  const pipeline = createEventPipeline({ sdk: {} as EventPipelineInput["sdk"], onEvent })
  cleanups.push(pipeline.cleanup)
  return pipeline
}

test("yields a large batch and cleanup drains remaining lifecycle events in order", () => {
  const ids: string[] = []
  const pipeline = fixture((_, event) => ids.push((event.properties as { requestID: string }).requestID))
  for (let i = 0; i < 300; i++) deliver(i)
  vi.advanceTimersByTime(0)
  expect(ids.length).toBeGreaterThan(0)
  expect(ids.length).toBeLessThan(300)
  pipeline.cleanup()
  expect(ids).toEqual(Array.from({ length: 300 }, (_, i) => String(i)))
  expect(vi.getTimerCount()).toBe(0)
})

test("drains at the high water mark without dropping approvals from a synchronous replay", () => {
  const ids: string[] = []
  const pipeline = fixture((_, event) => ids.push((event.properties as { requestID: string }).requestID))
  for (let i = 0; i < 2000; i++) deliver(i)
  expect(ids.length).toBeGreaterThan(1000)
  pipeline.cleanup()
  expect(ids).toEqual(Array.from({ length: 2000 }, (_, i) => String(i)))
})

test("yields when callbacks consume the time budget before the count limit", () => {
  const ids: string[] = []
  const pipeline = fixture((_, event) => {
    ids.push((event.properties as { requestID: string }).requestID)
    vi.setSystemTime(Date.now() + 4)
  })
  for (let i = 0; i < 20; i++) deliver(i)
  vi.advanceTimersToNextTimer()
  expect(ids).toEqual(["0", "1"])
  pipeline.cleanup()
  expect(ids).toHaveLength(20)
})

test("reentrant delivery and cleanup cannot overwrite the active dispatch buffer", () => {
  const ids: string[] = []
  const pipeline = fixture((_, event) => {
    const id = (event.properties as { requestID: string }).requestID
    ids.push(id)
    if (id === "0") {
      deliver(2)
      pipeline.cleanup()
    }
  })
  deliver(0)
  deliver(1)
  vi.advanceTimersByTime(0)
  expect(ids).toEqual(["0", "1", "2"])
  expect(vi.getTimerCount()).toBe(0)
})

test("cleanup during a pressure drain cannot reopen the closed queue", () => {
  const ids: string[] = []
  const pipeline = fixture((_, event) => {
    const id = (event.properties as { requestID: string }).requestID
    ids.push(id)
    if (id === "0") pipeline.cleanup()
  })
  for (let i = 0; i < 513; i++) deliver(i)
  expect(ids).toEqual(Array.from({ length: 512 }, (_, i) => String(i)))
  expect(vi.getTimerCount()).toBe(0)
})

test("a complete drain keeps batching deltas after the first slice", () => {
  const batches: number[] = []
  const fallback = vi.fn()
  const pipeline = createEventPipeline({
    sdk: {} as EventPipelineInput["sdk"],
    onEvent: fallback,
    onDeltaBatch: (_, events) => batches.push(events.length),
  })
  cleanups.push(pipeline.cleanup)
  for (let i = 0; i < 300; i++) {
    transport.hooks!.onFrame(
      {
        directory: "/project",
        payload: {
          type: "message.part.delta",
          properties: {
            sessionID: "s",
            messageID: "m",
            partID: String(i),
            field: "text",
            delta: "x",
          },
        },
      },
      { transport: "sse" },
    )
  }
  pipeline.cleanup()
  expect(batches).toEqual([128, 128, 44])
  expect(fallback).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
