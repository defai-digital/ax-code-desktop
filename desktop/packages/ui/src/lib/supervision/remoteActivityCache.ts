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
  now?: () => number
}

/** Independent, non-persisted cache. Never retains message pages, SDK errors or sync stores. */
export function createRemoteActivityCache(fetchPage: FetchActivityPage, options: RemoteActivityCacheOptions = {}) {
  const { minRefetchMs = 10_000, timeoutMs = 20_000, now = Date.now } = options
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
        const entry = entries.get(row.sessionId)
        const sameDirectory = entry?.directory === row.directory
        const revision = Math.max(
          sameDirectory ? (entry?.updatedAt ?? -Infinity) : -Infinity,
          consumer.attempted.get(receiptKey(row)) ?? -Infinity,
        )
        if (row.updatedAt <= revision) continue
        const wait = entry && sameDirectory ? entry.fetchedAt + minRefetchMs - now() : 0
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
    let preview = previous?.directory === row.directory ? previous.preview : null
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs)
      })
      try {
        const result = await Promise.race([
          fetchPage({ sessionID: row.sessionId, directory: row.directory!, limit: 6 }),
          timeout,
        ])
        if (!result.error) preview = remoteActivityPreview(result.data ?? [])
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Keep the previous safe preview. Errors may contain credentials; do not retain or log them.
    }
    publish(row.sessionId, { preview, updatedAt: row.updatedAt, fetchedAt: now(), directory: row.directory! })
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
