/** Bounded, content-free measurements of renderer queueing and synchronous dispatch. */
export const SYNC_PERFORMANCE_FLAG = "ax-code:sync:performance"
const DEFAULT_SAMPLE_CAPACITY = 512

export type SyncPerformanceTransport = "ws" | "sse" | "mixed"

export type PendingSyncMeasurement = {
  receivedAt: number
  receivedEvents: number
  coalescedEvents: number
  transport: SyncPerformanceTransport
  backpressure: boolean
}

export type SyncPerformanceSample = {
  transport: SyncPerformanceTransport
  receivedEvents: number
  dispatchedEvents: number
  coalescedEvents: number
  failedCallbacks: number
  backpressure: boolean
  queueWaitMs: number
  callbackMs: number
}

type Distribution = { samples: number; p50: number | null; p95: number | null; max: number | null }
type Totals = {
  batches: number
  receivedEvents: number
  dispatchedEvents: number
  coalescedEvents: number
  failedCallbacks: number
  backpressureBatches: number
}
type Group = { totals: Totals; samples: Array<Pick<SyncPerformanceSample, "queueWaitMs" | "callbackMs">>; next: number }

const createGroup = (): Group => ({
  totals: {
    batches: 0,
    receivedEvents: 0,
    dispatchedEvents: 0,
    coalescedEvents: 0,
    failedCallbacks: 0,
    backpressureBatches: 0,
  },
  samples: [],
  next: 0,
})

function distribution(values: number[]): Distribution {
  if (values.length === 0) return { samples: 0, p50: null, p95: null, max: null }
  values.sort((a, b) => a - b)
  return {
    samples: values.length,
    p50: values[Math.ceil(values.length * 0.5) - 1],
    p95: values[Math.ceil(values.length * 0.95) - 1],
    max: values[values.length - 1],
  }
}

export function createSyncPerformanceRecorder(options: { capacity?: number; now?: () => number } = {}) {
  const capacity = options.capacity ?? DEFAULT_SAMPLE_CAPACITY
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > DEFAULT_SAMPLE_CAPACITY) {
    throw new Error(`Sync performance capacity must be an integer between 1 and ${DEFAULT_SAMPLE_CAPACITY}`)
  }
  const now = options.now ?? (() => performance.now())
  let groups = { all: createGroup(), ws: createGroup(), sse: createGroup(), mixed: createGroup() }

  return {
    now,
    record(sample: SyncPerformanceSample) {
      // Do not let invalid clock samples poison every percentile in a diagnostic snapshot.
      if (![sample.queueWaitMs, sample.callbackMs].every((value) => Number.isFinite(value) && value >= 0)) return
      for (const group of [groups.all, groups[sample.transport]]) {
        group.totals.batches++
        group.totals.receivedEvents += sample.receivedEvents
        group.totals.dispatchedEvents += sample.dispatchedEvents
        group.totals.coalescedEvents += sample.coalescedEvents
        group.totals.failedCallbacks += sample.failedCallbacks
        if (sample.backpressure) group.totals.backpressureBatches++
        // Copy numeric fields only: never retain an event, directory, ID, or caller-owned object.
        group.samples[group.next] = { queueWaitMs: sample.queueWaitMs, callbackMs: sample.callbackMs }
        group.next = (group.next + 1) % capacity
      }
    },
    snapshot() {
      const summarize = (group: Group) => ({
        ...group.totals,
        queueWaitMs: distribution(group.samples.map((sample) => sample.queueWaitMs)),
        callbackMs: distribution(group.samples.map((sample) => sample.callbackMs)),
        receiveToCallbackEndMs: distribution(group.samples.map((sample) => sample.queueWaitMs + sample.callbackMs)),
      })
      return {
        schema: "ax-code-desktop.sync-performance.v1" as const,
        scope: "renderer-receive-to-synchronous-callback-end" as const,
        sampleUnit: "directory-flush-batch" as const,
        sampleCapacityPerGroup: capacity,
        groups: {
          all: summarize(groups.all),
          ws: summarize(groups.ws),
          sse: summarize(groups.sse),
          mixed: summarize(groups.mixed),
        },
      }
    },
    reset() {
      groups = { all: createGroup(), ws: createGroup(), sse: createGroup(), mixed: createGroup() }
    },
  }
}

export type SyncPerformanceRecorder = ReturnType<typeof createSyncPerformanceRecorder>

declare global {
  interface Window {
    axCodeSyncPerformance?: Pick<SyncPerformanceRecorder, "snapshot" | "reset">
  }
}

let localRecorder: SyncPerformanceRecorder | undefined

/** Opt in before mounting the pipeline. No clocks, samples, logging, or exports when disabled. */
export function getLocalSyncPerformanceRecorder(): SyncPerformanceRecorder | undefined {
  try {
    if (typeof window === "undefined" || localStorage.getItem(SYNC_PERFORMANCE_FLAG) !== "1") return undefined
  } catch {
    return undefined
  }
  localRecorder ??= createSyncPerformanceRecorder()
  window.axCodeSyncPerformance = Object.freeze({ snapshot: localRecorder.snapshot, reset: localRecorder.reset })
  return localRecorder
}
