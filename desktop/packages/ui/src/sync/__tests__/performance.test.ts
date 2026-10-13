import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createSyncPerformanceRecorder,
  getLocalSyncPerformanceRecorder,
  SYNC_PERFORMANCE_FLAG,
  type SyncPerformanceSample,
} from "../performance"

const sample = (queueWaitMs: number, overrides: Partial<SyncPerformanceSample> = {}): SyncPerformanceSample => ({
  transport: "ws",
  receivedEvents: 3,
  dispatchedEvents: 2,
  coalescedEvents: 1,
  failedCallbacks: 0,
  backpressure: false,
  queueWaitMs,
  callbackMs: 2,
  ...overrides,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.axCodeSyncPerformance
})

describe("sync performance recorder", () => {
  it("bounds recent samples while retaining cumulative counts and separating transports", () => {
    const recorder = createSyncPerformanceRecorder({ capacity: 3 })
    for (const wait of [100, 1, 2, 3]) recorder.record(sample(wait))
    recorder.record(sample(7, { transport: "sse", backpressure: true, failedCallbacks: 1 }))
    recorder.record(sample(9, { transport: "mixed" }))
    const snapshot = recorder.snapshot()
    expect(snapshot.groups.ws).toMatchObject({
      batches: 4,
      receivedEvents: 12,
      dispatchedEvents: 8,
      coalescedEvents: 4,
      queueWaitMs: { samples: 3, p50: 2, p95: 3, max: 3 },
      receiveToCallbackEndMs: { samples: 3, p50: 4, p95: 5, max: 5 },
    })
    expect(snapshot.groups.sse).toMatchObject({ batches: 1, backpressureBatches: 1, failedCallbacks: 1 })
    expect(snapshot.groups.mixed.batches).toBe(1)
    expect(snapshot.groups.all).toMatchObject({ batches: 6, receivedEvents: 18, queueWaitMs: { samples: 3 } })
  })

  it("does not retain caller objects or content and returns independent snapshots", () => {
    const recorder = createSyncPerformanceRecorder()
    const input = { ...sample(5), directory: "/private/project", token: "secret", payload: { text: "private prompt" } }
    recorder.record(input)
    input.queueWaitMs = 999
    const snapshot = recorder.snapshot()
    snapshot.groups.ws.batches = 999
    snapshot.groups.ws.queueWaitMs.p95 = 999
    expect(recorder.snapshot().groups.ws).toMatchObject({ batches: 1, queueWaitMs: { p95: 5 } })
    const serialized = JSON.stringify(recorder.snapshot())
    for (const content of ["/private/project", "secret", "private prompt", "payload", "token"]) {
      expect(serialized).not.toContain(content)
    }
  })

  it("resets all counters and samples and ignores invalid clock durations", () => {
    const recorder = createSyncPerformanceRecorder()
    recorder.record(sample(5))
    recorder.reset()
    for (const value of [NaN, Infinity, -1]) {
      recorder.record(sample(value))
      recorder.record(sample(1, { callbackMs: value }))
    }
    expect(recorder.snapshot().groups.all).toMatchObject({
      batches: 0,
      queueWaitMs: { samples: 0, p50: null, p95: null, max: null },
    })
    recorder.record(sample(0, { callbackMs: 0 }))
    expect(recorder.snapshot().groups.all.receiveToCallbackEndMs.p95).toBe(0)
  })

  it("rejects invalid sample capacities", () => {
    for (const capacity of [0, -1, 0.5, 513, Infinity]) {
      expect(() => createSyncPerformanceRecorder({ capacity })).toThrow("capacity")
    }
  })

  it("only exposes local diagnostics after explicit opt-in and tolerates unavailable storage", () => {
    const getItem = vi.fn().mockReturnValue(null)
    vi.stubGlobal("localStorage", { getItem })
    expect(getLocalSyncPerformanceRecorder()).toBeUndefined()
    expect(window.axCodeSyncPerformance).toBeUndefined()
    getItem.mockImplementation(() => {
      throw new Error("Storage unavailable")
    })
    expect(getLocalSyncPerformanceRecorder()).toBeUndefined()
    getItem.mockReturnValue("1")
    const recorder = getLocalSyncPerformanceRecorder()!
    expect(getItem).toHaveBeenLastCalledWith(SYNC_PERFORMANCE_FLAG)
    recorder.reset()
    recorder.record(sample(5))
    expect(window.axCodeSyncPerformance!.snapshot().groups.all.batches).toBe(1)
    expect(Object.keys(window.axCodeSyncPerformance!)).toEqual(["snapshot", "reset"])
    expect(getLocalSyncPerformanceRecorder()).toBe(recorder)
    window.axCodeSyncPerformance!.reset()
    expect(recorder.snapshot().groups.all.batches).toBe(0)
  })
})
