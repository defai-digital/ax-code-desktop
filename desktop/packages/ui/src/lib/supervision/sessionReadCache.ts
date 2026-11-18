import { withTimeout } from "@/lib/asyncTimeout"

export interface SessionReadTarget {
  sessionId: string
  directory: string | null
  updatedAt: number
}

export type SessionReadEntry<Value> = Value & {
  directory: string
  /** Revision of the last successful read, even if a newer attempt failed. */
  updatedAt: number
  fetchedAt: number
  succeededAt?: number
  stale?: boolean
}

export interface SessionReadOptions {
  minRefetchMs?: number
  timeoutMs?: number
  failureBackoffMs?: number
  now?: () => number
}

interface SessionReadInput {
  sessionID: string
  directory: string
  signal: AbortSignal
}

interface Demand<Target> {
  rows: readonly Target[]
  // Prevent an oversized board from rereading an evicted entry at the same revision.
  attempted: Map<string, number>
}

const MAX_ENTRIES = 300
const MAX_FAILURE_DEADLINES = 1000
const MAX_PENDING = 2

const receiptKey = (row: Pick<SessionReadTarget, "sessionId" | "directory">) =>
  JSON.stringify([row.sessionId, row.directory])

/** Owns scheduling and metadata, leaving API selection and payload projection to the caller. */
export function createSessionReadCache<Target extends SessionReadTarget, Data, Value extends object>(
  config: {
    request: (input: SessionReadInput) => Promise<{ data?: Data; error?: unknown }>
    project: (data: Data | undefined) => Value
    empty: Value
    eligible?: (row: Target) => boolean
  },
  options: SessionReadOptions,
) {
  const { minRefetchMs = 10_000, timeoutMs = 20_000, failureBackoffMs = 30_000, now = Date.now } = options
  let entries: ReadonlyMap<string, SessionReadEntry<Value>> = new Map()
  const listeners = new Set<() => void>()
  const consumers = new Set<Demand<Target>>()
  const pending = new Map<string, { updatedAt: number; directory: string }>()
  // Keep backoff independent of snapshot eviction.
  const failedUntil = new Map<string, number>()
  const forced = new Map<string, string>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAt = Infinity

  function publish(sessionId: string, entry: SessionReadEntry<Value>) {
    const next = new Map(entries)
    next.delete(sessionId)
    next.set(sessionId, entry)
    if (next.size > MAX_ENTRIES) {
      const shown = new Set<string>()
      for (const { rows } of consumers) {
        for (const row of rows) if (row.directory && isEligible(row)) shown.add(receiptKey(row))
      }
      for (const [id, candidate] of next) {
        if (next.size <= MAX_ENTRIES) break
        if (!shown.has(receiptKey({ sessionId: id, directory: candidate.directory }))) next.delete(id)
      }
      while (next.size > MAX_ENTRIES) next.delete(next.keys().next().value!)
    }
    entries = next
    for (const listener of listeners) listener()
  }

  function clearRetryTimer() {
    clearTimeout(retryTimer)
    retryTimer = undefined
    retryAt = Infinity
  }

  // Coalesce wake-ups without letting a later backoff delay an earlier refresh.
  function scheduleRetry(delay: number) {
    const deadline = now() + delay
    if (deadline >= retryAt) return
    clearRetryTimer()
    retryAt = deadline
    retryTimer = setTimeout(() => {
      clearRetryTimer()
      pump()
    }, delay)
  }

  function isEligible(row: Target) {
    return config.eligible?.(row) ?? true
  }

  function hasDemand(sessionId: string, directory: string) {
    for (const { rows } of consumers) {
      if (rows.some((row) => row.sessionId === sessionId && row.directory === directory && isEligible(row))) {
        return true
      }
    }
    return false
  }

  function pruneRetries() {
    for (const [id, directory] of forced) {
      if (!hasDemand(id, directory)) forced.delete(id)
    }
  }

  function pump() {
    for (const consumer of consumers) {
      for (const row of consumer.rows) {
        const { directory, sessionId, updatedAt } = row
        if (!directory || !isEligible(row)) continue
        const key = receiptKey(row)
        const isForced = forced.get(sessionId) === directory
        const deadline = failedUntil.get(key)
        if (!isForced && deadline !== undefined) {
          const remaining = deadline - now()
          if (remaining > 0) {
            scheduleRetry(remaining)
            continue
          }
          failedUntil.delete(key)
          for (const other of consumers) other.attempted.delete(key)
        }
        const candidate = entries.get(sessionId)
        const previous = candidate?.directory === directory ? candidate : undefined
        const revision = Math.max(previous?.updatedAt ?? -Infinity, consumer.attempted.get(key) ?? -Infinity)
        if (!isForced && updatedAt <= revision) continue
        const interval = previous?.stale ? Math.max(minRefetchMs, failureBackoffMs) : minRefetchMs
        const wait = previous && !isForced ? previous.fetchedAt + interval - now() : 0
        if (wait > 0) {
          scheduleRetry(wait)
          continue
        }
        const inFlight = pending.get(sessionId)
        if (inFlight) {
          if (inFlight.directory === directory) {
            consumer.attempted.set(key, Math.max(revision, inFlight.updatedAt))
          }
          continue
        }
        if (pending.size >= MAX_PENDING) return
        if (isForced) {
          forced.delete(sessionId)
          failedUntil.delete(key)
        }
        consumer.attempted.set(key, updatedAt)
        pending.set(sessionId, { updatedAt, directory })
        void read(sessionId, directory, updatedAt, key, previous)
      }
    }
  }

  async function request(input: SessionReadInput) {
    // An adapter can throw before returning a promise.
    return config.request(input)
  }

  async function read(
    sessionId: string,
    directory: string,
    updatedAt: number,
    key: string,
    previous: SessionReadEntry<Value> | undefined,
  ) {
    let entry: SessionReadEntry<Value>
    const controller = new AbortController()
    try {
      const result = await withTimeout(
        request({ sessionID: sessionId, directory, signal: controller.signal }),
        timeoutMs,
        () => {
          controller.abort()
          throw new Error("Session read timed out")
        },
      )
      if (result.error) throw new Error("Session read failed")
      const value = config.project(result.data)
      const fetchedAt = now()
      entry = { ...value, directory, updatedAt, fetchedAt, succeededAt: fetchedAt }
    } catch {
      // Do not retain errors or raw responses. Keep the last good value for the same scope.
      const fetchedAt = now()
      entry = {
        ...(previous ?? config.empty),
        directory,
        updatedAt: previous?.updatedAt ?? -Infinity,
        fetchedAt,
        stale: true,
      }
      failedUntil.delete(key)
      failedUntil.set(key, fetchedAt + failureBackoffMs)
      while (failedUntil.size > MAX_FAILURE_DEADLINES) failedUntil.delete(failedUntil.keys().next().value!)
    }
    pending.delete(sessionId)
    try {
      const cached = entries.get(sessionId)
      // Keep an existing result when the row returned to its directory before this read settled.
      if (
        !cached ||
        cached.directory === directory ||
        hasDemand(sessionId, directory) ||
        !hasDemand(sessionId, cached.directory)
      ) {
        publish(sessionId, entry)
      }
    } finally {
      pump()
    }
  }

  return {
    getSnapshot: () => entries,
    retry(sessionId: string) {
      const entry = entries.get(sessionId)
      if (!entry?.stale || pending.has(sessionId) || !hasDemand(sessionId, entry.directory)) return
      forced.set(sessionId, entry.directory)
      pump()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    mount() {
      const consumer: Demand<Target> = { rows: [], attempted: new Map() }
      consumers.add(consumer)
      return {
        update(rows: readonly Target[]) {
          if (!consumers.has(consumer)) return
          consumer.rows = rows
          const keys = new Set(rows.map(receiptKey))
          for (const key of consumer.attempted.keys()) if (!keys.has(key)) consumer.attempted.delete(key)
          pruneRetries()
          pump()
        },
        dispose() {
          consumers.delete(consumer)
          pruneRetries()
          if (consumers.size === 0) clearRetryTimer()
        },
      }
    },
  }
}
