import { normalizeVerificationEvidence, type VerificationEvidence } from "./verificationEvidence"

export interface VerificationEvidenceTarget {
  sessionId: string
  directory: string | null
  updatedAt: number
}

export interface VerificationEvidenceEntry {
  checks: VerificationEvidence | null
  /** Row revision of the latest successful read. A failed read does not advance it, so that revision is read again. */
  updatedAt: number
  fetchedAt: number
  /** The latest read for a newer revision failed: `checks` is an older result and must not be shown as current. */
  stale?: boolean
  /** The directory read; a session that moved to another directory is read again. */
  directory: string
}

export type FetchSessionRisk = (input: {
  sessionID: string
  directory: string
  /** Aborted when the read times out, so a stuck request does not keep running beside the next one. */
  signal: AbortSignal
}) => Promise<{ data?: unknown; error?: unknown }>

interface Demand {
  rows: readonly VerificationEvidenceTarget[]
  // Revision receipts live only for this mounted consumer. They prevent eviction churn
  // when a board has more rows than the bounded cache can hold.
  attempted: Map<string, number>
}

/** Receipts are per session and directory, so a session that moved is read again. */
const receiptKey = (row: VerificationEvidenceTarget) => `${row.sessionId}\n${row.directory ?? ""}`

const MAX_ENTRIES = 300

export interface VerificationEvidenceCacheOptions {
  /** A running session bumps its revision often; a session is read again at most this often. */
  minRefetchMs?: number
  /** A read that never settles is aborted after this long, so one stuck project cannot stop every row. */
  timeoutMs?: number
  /** Wait before reading a session again after a failed read. */
  failureBackoffMs?: number
  now?: () => number
}

/**
 * Bounded `GET /session/{id}/risk?envelopes=true` cache. Same cap as the remote
 * activity preview: two reads in flight, and no message pages are retained.
 * The stored value is the normalized count record only.
 */
export function createVerificationEvidenceCache(
  fetchRisk: FetchSessionRisk,
  options: VerificationEvidenceCacheOptions = {},
) {
  const { minRefetchMs = 10_000, timeoutMs = 20_000, failureBackoffMs = 30_000, now = Date.now } = options
  let entries: ReadonlyMap<string, VerificationEvidenceEntry> = new Map()
  const listeners = new Set<() => void>()
  const consumers = new Set<Demand>()
  const pending = new Map<string, { updatedAt: number; directory: string }>()
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function demanded(): Set<string> {
    const ids = new Set<string>()
    for (const consumer of consumers) for (const row of consumer.rows) ids.add(row.sessionId)
    return ids
  }

  function publish(sessionId: string, entry: VerificationEvidenceEntry) {
    const next = new Map(entries)
    next.delete(sessionId)
    next.set(sessionId, entry)
    if (next.size > MAX_ENTRIES) {
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
        if (!row.directory) continue
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
          if (inFlight.directory === row.directory) {
            consumer.attempted.set(receiptKey(row), Math.max(revision, inFlight.updatedAt))
          }
          continue
        }
        if (pending.size >= 2) return
        consumer.attempted.set(receiptKey(row), row.updatedAt)
        pending.set(row.sessionId, { updatedAt: row.updatedAt, directory: row.directory })
        void read(row)
      }
    }
  }

  async function read(row: VerificationEvidenceTarget) {
    const directory = row.directory!
    const previous = entries.get(row.sessionId)
    const sameDirectory = previous?.directory === directory
    let entry: VerificationEvidenceEntry
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // An aborted request rejects; the slot is released only after this read has settled.
      const result = await fetchRisk({ sessionID: row.sessionId, directory, signal: controller.signal })
      if (result.error) throw new Error("risk read failed")
      entry = { checks: normalizeVerificationEvidence(result.data), updatedAt: row.updatedAt, fetchedAt: now(), directory }
    } catch {
      // Errors may contain credentials; do not retain or log them. The older result stays, marked stale, and its
      // revision is not advanced, so the newer revision is read again after a backoff.
      entry = {
        checks: sameDirectory ? (previous?.checks ?? null) : null,
        updatedAt: sameDirectory ? (previous?.updatedAt ?? -Infinity) : -Infinity,
        fetchedAt: now(),
        directory,
        stale: true,
      }
      // The receipt stays and a deadline is set: a failing (or evicted) session is read at most once per backoff, never in a
      // tight loop. When the deadline passes, pump releases the receipt and reads the session again.
      const key = receiptKey(row)
      failedUntil.delete(key)
      failedUntil.set(key, now() + failureBackoffMs)
      while (failedUntil.size > MAX_FAILURE_DEADLINES) failedUntil.delete(failedUntil.keys().next().value!)
    } finally {
      clearTimeout(timer)
    }
    publish(row.sessionId, entry)
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
        update(rows: readonly VerificationEvidenceTarget[]) {
          consumer.rows = rows
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

/** The aggregate for this session and directory, or null when that read is not in the cache. */
export function verificationEvidenceFor(
  sessionId: string,
  directory: string | null,
  entries: ReadonlyMap<string, VerificationEvidenceEntry>,
): VerificationEvidence | null {
  const entry = entries.get(sessionId)
  if (!entry || entry.directory !== directory || !entry.checks) return null
  return entry.stale ? { ...entry.checks, stale: true } : entry.checks
}
