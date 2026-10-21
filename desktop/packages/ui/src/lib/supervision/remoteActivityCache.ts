import {
  remoteActivityPreview,
  type FetchActivityPage,
  type RemoteActivityEntry,
  type RemoteActivityTarget,
} from "./remoteActivityPreview"

interface Demand {
  rows: readonly RemoteActivityTarget[]
  // Revision receipts live only for this mounted consumer. They prevent eviction churn
  // when a board has more visible rows than the bounded preview cache can hold.
  attempted: Map<string, number>
}

/** Receipts are per session and directory, so a session that moved is read again. */
const receiptKey = (row: RemoteActivityTarget) => `${row.sessionId}\n${row.directory ?? ""}`

const MAX_ENTRIES = 300

export interface RemoteActivityCacheOptions {
  /** A running session bumps its revision often; a session is read again at most this often. */
  minRefetchMs?: number
  /** A read that never settles frees its slot after this long, so one stuck project cannot stop every preview. */
  timeoutMs?: number
  /** Wait before reading a session again after a failed read. */
  failureBackoffMs?: number
  now?: () => number
}

/** Independent, non-persisted cache. Never retains message pages, SDK errors or sync stores. */
export function createRemoteActivityCache(fetchPage: FetchActivityPage, options: RemoteActivityCacheOptions = {}) {
  const { minRefetchMs = 10_000, timeoutMs = 20_000, failureBackoffMs = 30_000, now = Date.now } = options
  let entries: ReadonlyMap<string, RemoteActivityEntry> = new Map()
  const listeners = new Set<() => void>()
  const consumers = new Set<Demand>()
  const pending = new Map<string, { updatedAt: number; directory: string }>()
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function demanded(): Set<string> {
    const ids = new Set<string>()
    for (const consumer of consumers) for (const row of consumer.rows) ids.add(row.sessionId)
    return ids
  }

  function publish(sessionId: string, entry: RemoteActivityEntry) {
    const next = new Map(entries)
    next.delete(sessionId)
    next.set(sessionId, entry)
    if (next.size > MAX_ENTRIES) {
      // Rows on a mounted board keep their preview; entries nobody shows go first.
      const shown = demanded()
      for (const id of next.keys()) {
        if (next.size <= MAX_ENTRIES) break
        if (!shown.has(id)) next.delete(id)
      }
      while (next.size > MAX_ENTRIES) next.delete(next.keys().next().value!)
    }
    entries = next
    for (const listener of listeners) listener()
  }

  // Backoff deadlines per session and directory, kept apart from the bounded cache so an evicted failure cannot be
  // re-read before its deadline. Bounded too: the oldest deadlines go first.
  const failedUntil = new Map<string, number>()
  const MAX_FAILURE_DEADLINES = 1000

  function scheduleRetry(delay: number) {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      pump()
    }, delay)
  }

  function pump() {
    for (const consumer of consumers) {
      for (const row of consumer.rows) {
        if (row.activity || !row.directory) continue
        const deadline = failedUntil.get(receiptKey(row))
        if (deadline !== undefined) {
          const remaining = deadline - now()
          if (remaining > 0) {
            scheduleRetry(remaining)
            continue
          }
          failedUntil.delete(receiptKey(row))
          for (const other of consumers) other.attempted.delete(receiptKey(row))
        }
        const entry = entries.get(row.sessionId)
        const sameDirectory = entry?.directory === row.directory
        const revision = Math.max(
          sameDirectory ? (entry?.updatedAt ?? -Infinity) : -Infinity,
          consumer.attempted.get(receiptKey(row)) ?? -Infinity,
        )
        if (row.updatedAt <= revision) continue
        const interval = entry?.stale ? Math.max(minRefetchMs, failureBackoffMs) : minRefetchMs
        const wait = entry && sameDirectory ? entry.fetchedAt + interval - now() : 0
        if (wait > 0) {
          scheduleRetry(wait)
          continue
        }
        const inFlight = pending.get(row.sessionId)
        if (inFlight !== undefined) {
          // A read of the same directory covers this revision; a read of the directory the session left does not.
          if (inFlight.directory === row.directory) {
            consumer.attempted.set(receiptKey(row), Math.max(revision, inFlight.updatedAt))
          }
          continue
        }
        if (pending.size >= 2) return
        consumer.attempted.set(receiptKey(row), row.updatedAt)
        pending.set(row.sessionId, { updatedAt: row.updatedAt, directory: row.directory })
        void fetch(row)
      }
    }
  }

  async function fetch(row: RemoteActivityTarget) {
    // A failed read keeps the previous preview only when it came from the same directory.
    const previous = entries.get(row.sessionId)
    const sameDirectory = previous?.directory === row.directory
    let preview = sameDirectory ? (previous?.preview ?? null) : null
    let ok = false
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const controller = new AbortController()
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Cancel the request itself; the race still frees the slot for a fetch that ignores the signal.
          controller.abort()
          reject(new Error("timeout"))
        }, timeoutMs)
      })
      try {
        const result = await Promise.race([
          fetchPage({ sessionID: row.sessionId, directory: row.directory!, limit: 6, signal: controller.signal }),
          timeout,
        ])
        if (!result.error) {
          preview = remoteActivityPreview(result.data ?? [])
          ok = true
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Keep the previous safe preview. Errors may contain credentials; do not retain or log them.
    }
    if (ok) {
      publish(row.sessionId, { preview, updatedAt: row.updatedAt, fetchedAt: now(), directory: row.directory! })
    } else {
      // The older text stays, marked stale; its revision is not advanced, so the session is read again after a backoff.
      publish(row.sessionId, {
        preview,
        updatedAt: sameDirectory ? (previous?.updatedAt ?? -Infinity) : -Infinity,
        fetchedAt: now(),
        directory: row.directory!,
        stale: true,
      })
      // The receipt stays and a deadline is set: a failing (or evicted) session is read at most once per backoff, never in a
      // tight loop. When the deadline passes, pump releases the receipt and reads the session again.
      const key = receiptKey(row)
      failedUntil.delete(key)
      failedUntil.set(key, now() + failureBackoffMs)
      while (failedUntil.size > MAX_FAILURE_DEADLINES) failedUntil.delete(failedUntil.keys().next().value!)
    }
    pending.delete(row.sessionId)
    pump()
  }

  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    mount() {
      const consumer: Demand = { rows: [], attempted: new Map() }
      consumers.add(consumer)
      return {
        update(rows: readonly RemoteActivityTarget[]) {
          consumer.rows = rows
          // Receipts only matter for rows this board still shows.
          const ids = new Set(rows.map(receiptKey))
          for (const id of consumer.attempted.keys()) if (!ids.has(id)) consumer.attempted.delete(id)
          pump()
        },
        dispose() {
          consumers.delete(consumer)
          if (consumers.size === 0 && retryTimer !== null) {
            clearTimeout(retryTimer)
            retryTimer = null
          }

        },
      }
    },
  }
}
