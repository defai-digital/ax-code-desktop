import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EventTransportHooks } from "@/lib/event-stream/types"
import type { EventPipelineInput } from "../event-pipeline"
import { createEventPipeline } from "../event-pipeline"
import { createSyncPerformanceRecorder } from "../performance"

const transport = vi.hoisted(() => ({ hooks: undefined as EventTransportHooks | undefined }))
vi.mock("@/lib/event-stream/client", () => ({
  createEventTransport: (_config: unknown, hooks: EventTransportHooks) => {
    transport.hooks = hooks
    return { close: vi.fn(), reconnect: vi.fn() }
  },
}))

const sdk = {} as EventPipelineInput["sdk"]
const cleanups: Array<() => void> = []
const delta = (text: string, messageID = "msg_example") => ({
  type: "message.part.delta",
  properties: { sessionID: "ses_example", messageID, partID: "prt_example", field: "text", delta: text },
})
function deliver(payload: unknown, kind: "ws" | "sse" = "ws", directory = "/private/project") {
  transport.hooks!.onFrame(kind === "ws" ? { type: "event", payload, directory } : { payload, directory }, {
    transport: kind,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  vi.stubGlobal("localStorage", { getItem: () => null })
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("event pipeline performance measurements", () => {
  it("measures oldest receipt, coalescing and callback cost without changing delta delivery", () => {
    let time = 0
    const recorder = createSyncPerformanceRecorder({ now: () => time })
    const onEvent = vi.fn<EventPipelineInput["onEvent"]>(() => {
      time += 4
    })
    const pipeline = createEventPipeline({ sdk, onEvent, performanceRecorder: recorder })
    cleanups.push(pipeline.cleanup)
    deliver(delta("hello"))
    time = 5
    deliver(delta(" world"))
    time = 33
    vi.runOnlyPendingTimers()
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0]).toEqual(["/private/project", delta("hello world")])
    expect(recorder.snapshot().groups.ws).toMatchObject({
      batches: 1,
      receivedEvents: 2,
      dispatchedEvents: 1,
      coalescedEvents: 1,
      queueWaitMs: { p95: 33 },
      callbackMs: { p95: 4 },
      receiveToCallbackEndMs: { p95: 37 },
    })
    expect(JSON.stringify(recorder.snapshot())).not.toContain("hello")
  })

  it("records failures and counts events in a batched callback while retaining later delivery", () => {
    let time = 0
    const recorder = createSyncPerformanceRecorder({ now: () => time })
    const onEvent = vi.fn<EventPipelineInput["onEvent"]>(() => {
      time += 2
      throw new Error("Expected callback failure")
    })
    const onDeltaBatch = vi.fn<NonNullable<EventPipelineInput["onDeltaBatch"]>>(() => {
      time += 3
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const pipeline = createEventPipeline({ sdk, onEvent, onDeltaBatch, performanceRecorder: recorder })
    cleanups.push(pipeline.cleanup)
    deliver({ type: "session.status", properties: { sessionID: "ses_example", status: { type: "busy" } } })
    deliver(delta("a", "msg_a"))
    deliver(delta("b", "msg_b"))
    time = 20
    vi.runOnlyPendingTimers()
    expect(onDeltaBatch).toHaveBeenCalledTimes(1)
    expect(onDeltaBatch.mock.calls[0][1]).toEqual([delta("a", "msg_a"), delta("b", "msg_b")])
    expect(recorder.snapshot().groups.all).toMatchObject({
      batches: 1,
      receivedEvents: 3,
      dispatchedEvents: 3,
      failedCallbacks: 1,
      callbackMs: { p95: 5 },
    })
  })

  it("separates directory queues and attributes batches spanning a transport switch", () => {
    let time = 0
    const recorder = createSyncPerformanceRecorder({ now: () => time })
    const pipeline = createEventPipeline({ sdk, onEvent: () => {}, performanceRecorder: recorder })
    cleanups.push(pipeline.cleanup)
    deliver(delta("a"), "ws", "/a")
    time = 10
    deliver(delta("b"), "sse", "/a")
    deliver(delta("c"), "sse", "/b")
    time = 30
    pipeline.cleanup()
    expect(recorder.snapshot().groups.mixed).toMatchObject({ batches: 1, receivedEvents: 2, queueWaitMs: { p95: 30 } })
    expect(recorder.snapshot().groups.sse).toMatchObject({ batches: 1, receivedEvents: 1, queueWaitMs: { p95: 20 } })
    pipeline.cleanup()
    expect(recorder.snapshot().groups.all.batches).toBe(2)
  })

  it("marks backpressure batches and starts fresh measurements after reconnect flushing", () => {
    let time = 0
    const recorder = createSyncPerformanceRecorder({ now: () => time })
    const pipeline = createEventPipeline({ sdk, onEvent: () => {}, performanceRecorder: recorder })
    cleanups.push(pipeline.cleanup)
    transport.hooks!.onFrame({ type: "backpressure" }, { transport: "ws" })
    deliver(delta("a"))
    time = 10
    transport.hooks!.onConnected({ first: false, transport: "ws" })
    expect(recorder.snapshot().groups.ws).toMatchObject({
      batches: 1,
      backpressureBatches: 1,
      queueWaitMs: { p95: 10 },
    })
    deliver(delta("b"))
    time = 210
    vi.advanceTimersByTime(200)
    expect(recorder.snapshot().groups.ws).toMatchObject({
      batches: 2,
      receivedEvents: 2,
      coalescedEvents: 0,
      queueWaitMs: { max: 200 },
    })
  })

  it("does not read the performance clock when diagnostics are disabled", () => {
    const now = vi.spyOn(performance, "now")
    const onEvent = vi.fn()
    const pipeline = createEventPipeline({ sdk, onEvent })
    cleanups.push(pipeline.cleanup)
    deliver(delta("a"))
    vi.runOnlyPendingTimers()
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(now).not.toHaveBeenCalled()
  })
})
