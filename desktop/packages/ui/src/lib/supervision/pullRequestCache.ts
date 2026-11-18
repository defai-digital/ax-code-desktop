import type { GitHubPullRequestStatus } from "@/lib/api/types"
import { readWithDeadline } from "@/lib/asyncTimeout"
import { pullRequestScopeKey, type PullRequestScope } from "@/lib/pullRequestScope"

export interface MissionPullRequest {
  number: number
  state: "open" | "draft" | "merged" | "closed"
  checks?: "passed" | "failed" | "pending"
  stale?: boolean
}

/** Only structured PR/check fields are projected; no titles, bodies, URLs or errors are retained. */
export function projectPullRequest(status: GitHubPullRequestStatus | null): MissionPullRequest | null {
  const pr = status?.pr
  if (!status?.connected || !pr || !Number.isSafeInteger(pr.number) || pr.number <= 0) return null
  if (pr.state !== "open" && pr.state !== "merged" && pr.state !== "closed") return null
  const checks = status.checks
  return {
    number: pr.number,
    state: pr.state === "open" && pr.draft ? "draft" : pr.state,
    ...(checks && checks.total > 0 && ["success", "failure", "pending"].includes(checks.state)
      ? {
          checks:
            checks.state === "success"
              ? ("passed" as const)
              : checks.state === "failure"
                ? ("failed" as const)
                : ("pending" as const),
        }
      : {}),
  }
}

export interface PullRequestTarget extends PullRequestScope {
  storeKey: string
  pr: MissionPullRequest | null
  fetchedAt: number
  stale?: boolean
}
export interface PullRequestEntry {
  pr: MissionPullRequest | null
  fetchedAt: number
  stale?: boolean
}
interface Demand {
  rows: readonly PullRequestTarget[]
  attempted: Map<string, number>
}

/** A pull request projection older than this is stale; shared by the cache and the board. */
export const PULL_REQUEST_FRESH_MS = 90_000

export function createPullRequestCache(
  fetchStatus: (target: PullRequestTarget, signal: AbortSignal) => Promise<MissionPullRequest | null>,
  options: { minRefetchMs?: number; failureBackoffMs?: number; timeoutMs?: number; now?: () => number } = {},
) {
  const { minRefetchMs = PULL_REQUEST_FRESH_MS, failureBackoffMs = 30_000, timeoutMs = 20_000, now = Date.now } = options
  let entries: ReadonlyMap<string, PullRequestEntry> = new Map()
  const listeners = new Set<() => void>()
  const consumers = new Set<Demand>()
  const pending = new Set<string>()
  const failedUntil = new Map<string, number>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAt = Infinity

  function publish(key: string, value: PullRequestEntry) {
    const next = new Map(entries)
    next.delete(key)
    next.set(key, value)
    while (next.size > 300) next.delete(next.keys().next().value!)
    entries = next
    for (const notify of listeners) notify()
  }
  function schedule(deadline: number) {
    if (deadline >= retryAt) return
    clearTimeout(retryTimer)
    retryAt = deadline
    retryTimer = setTimeout(
      () => {
        retryTimer = undefined
        retryAt = Infinity
        pump()
      },
      Math.max(1, deadline - now()),
    )
  }
  function pump() {
    for (const consumer of consumers)
      for (const row of consumer.rows) {
        if (!row.directory || !row.branch) continue
        const key = pullRequestScopeKey(row)
        const entry = entries.get(key)
        const deadline = Math.max(
          failedUntil.get(key) ?? -Infinity,
          consumer.attempted.get(key) ?? -Infinity,
          row.fetchedAt + minRefetchMs,
          entry && !entry.stale ? entry.fetchedAt + minRefetchMs : -Infinity,
        )
        if (deadline > now()) {
          schedule(deadline)
          continue
        }
        if (pending.has(key)) continue
        if (pending.size >= 2) return
        // Receipts survive cache eviction, preventing churn with more than 300 visible branches.
        consumer.attempted.set(key, now() + minRefetchMs)
        pending.add(key)
        void fetch(row, key)
      }
  }
  async function fetch(row: PullRequestTarget, key: string) {
    const previous = entries.get(key) ?? { pr: row.pr, fetchedAt: row.fetchedAt }
    let result: PullRequestEntry
    try {
      const pr = await readWithDeadline((signal) => fetchStatus(row, signal), timeoutMs)
      result = { pr, fetchedAt: now() }
      failedUntil.delete(key)
    } catch {
      // Never retain or log SDK errors: they can contain credentials.
      result = { ...previous, stale: true }
      failedUntil.delete(key)
      failedUntil.set(key, now() + failureBackoffMs)
      while (failedUntil.size > 1000) failedUntil.delete(failedUntil.keys().next().value!)
    }
    const nextAt = now() + (result.stale ? failureBackoffMs : minRefetchMs)
    for (const consumer of consumers)
      if (consumer.rows.some((target) => pullRequestScopeKey(target) === key)) {
        consumer.attempted.set(key, nextAt)
      }
    pending.delete(key)
    try {
      publish(key, result)
    } finally {
      pump()
    }
  }
  return {
    getSnapshot: () => entries,
    subscribe(notify: () => void) {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    mount() {
      const consumer: Demand = { rows: [], attempted: new Map() }
      consumers.add(consumer)
      return {
        update(rows: readonly PullRequestTarget[]) {
          if (!consumers.has(consumer)) return
          consumer.rows = rows
          const keys = new Set(rows.map((row) => pullRequestScopeKey(row)))
          for (const key of consumer.attempted.keys()) if (!keys.has(key)) consumer.attempted.delete(key)
          pump()
        },
        dispose() {
          consumers.delete(consumer)
          if (!consumers.size) {
            clearTimeout(retryTimer)
            retryTimer = undefined
            retryAt = Infinity
          }
        },
      }
    },
  }
}
