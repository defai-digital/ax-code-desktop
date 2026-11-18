import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { readDirectoryPath } from "@/lib/pathValues"
import { hasPersistedFields } from "@/lib/persistedFields"
import { isPlainRecord } from "@/lib/record"
import type { GitHubPullRequestStatus, RuntimeAPIs } from "@/lib/api/types"
import { carryPullRequestBody, hasPullRequestStatusChanged, restoreCachedPullRequestStatus } from "@/lib/cachedPullRequestStatus"
import { readWithDeadline } from "@/lib/asyncTimeout"
import { pullRequestScopeKey, type PullRequestScope } from "@/lib/pullRequestScope"
import { mapWithConcurrency } from "@/lib/concurrency"
import { getSafeStorage } from "./utils/safeStorage"

const PR_REVALIDATE_TTL_MS = 90_000
const PR_REVALIDATE_INTERVAL_MS = 15_000
const PR_DISCOVERY_INTERVAL_MS = 5 * 60_000
const PR_BOOTSTRAP_RETRY_DELAYS_MS = [2_000, 5_000] as const
const PR_OPEN_BUSY_INTERVAL_MS = 60_000
const PR_OPEN_DEFAULT_INTERVAL_MS = 2 * 60_000
const PR_OPEN_STABLE_INTERVAL_MS = 5 * 60_000
const PR_STATUS_REFRESH_CONCURRENCY = 4
const PR_STATUS_TIMEOUT_MS = 20_000
const PR_PERSIST_TTL_MS = 12 * 60 * 60_000
const PR_STATUS_STORAGE_KEY = "openchamber.github-pr-status"

const isFreshTimestamp = (at: number, now: number, ttl: number): boolean =>
  Number.isFinite(at) && at > 0 && at <= now && now - at < ttl

const isTerminalPrState = (state: string | null | undefined): boolean => state === "closed" || state === "merged"
const isPendingChecks = (status: GitHubPullRequestStatus | null): boolean => {
  const checks = status?.checks
  if (!checks) {
    return false
  }
  return checks.state === "pending" || checks.pending > 0
}

// One entry per tracked (project, branch, remote) lives for the app session and is persisted, and
// every write re-serializes the whole map, so an unbounded map grows both memory and the persisted
// blob. Keep the most recently tracked entries only; a dropped entry is refetched on demand (the
// status is stale after PR_REVALIDATE_TTL_MS anyway), and an entry someone is watching is never
// dropped.
const MAX_PR_STATUS_ENTRIES = 50

const boundPrStatusEntries = (
  entries: Record<string, PrStatusEntry>,
  keepKey?: string,
): Record<string, PrStatusEntry> => {
  const keys = Object.keys(entries)
  if (keys.length <= MAX_PR_STATUS_ENTRIES) {
    return entries
  }

  const bounded = { ...entries }
  const excess = keys.length - MAX_PR_STATUS_ENTRIES
  // Object keys keep insertion order, so the leading keys are the least recently tracked.
  const victims = keys.filter((key) => key !== keepKey && (bounded[key].watchers ?? 0) === 0)
  for (const victim of victims.slice(0, excess)) {
    delete bounded[victim]
  }
  return bounded
}

const writeEntry = (
  entries: Record<string, PrStatusEntry>,
  key: string,
  entry: PrStatusEntry,
): Record<string, PrStatusEntry> => {
  const next = { ...entries }
  // Re-insert so a write moves the key to the end: object key order drives
  // eviction, and a refresh must count as a touch for the LRU to hold.
  delete next[key]
  next[key] = entry
  return boundPrStatusEntries(next, key)
}

export const getGitHubPrStatusKey = (directory: string, branch: string, remoteName?: string | null): string => {
  const remote = typeof remoteName === "string" ? remoteName.trim() : ""
  return remote ? `${directory}::${branch}::${remote}` : `${directory}::${branch}`
}

type PrStatusRefreshOptions = {
  force?: boolean
  onlyExistingPr?: boolean
  silent?: boolean
  markInitialResolved?: boolean
}

type PrTrackingTarget = {
  directory: string
  branch: string
  remoteName?: string | null
}

type PrRuntimeParams = {
  directory: string
  branch: string
  remoteName: string | null
  canShow: boolean
  github?: RuntimeAPIs["github"]
  githubAuthChecked: boolean
  githubConnected: boolean | null
}

type PrStatusEntry = {
  status: GitHubPullRequestStatus | null
  isLoading: boolean
  error: string | null
  isInitialStatusResolved: boolean
  lastRefreshAt: number
  lastDiscoveryPollAt: number
  watchers: number
  params: PrRuntimeParams | null
  identity: PullRequestScope | null
  resolvedRemoteName: string | null
}

type PersistedPrStatusEntry = Pick<
  PrStatusEntry,
  "status" | "isInitialStatusResolved" | "lastRefreshAt" | "lastDiscoveryPollAt" | "identity" | "resolvedRemoteName"
>

type GitHubPrStatusStore = {
  entries: Record<string, PrStatusEntry>
  activeRequestCount: number
  totalRequestCount: number
  ensureEntry: (key: string) => void
  setParams: (key: string, params: PrRuntimeParams) => void
  startWatching: (key: string) => void
  stopWatching: (key: string) => void
  refresh: (key: string, options?: PrStatusRefreshOptions) => Promise<void>
  refreshTargets: (targets: PrTrackingTarget[], options?: PrStatusRefreshOptions) => Promise<void>
  updateStatus: (
    key: string,
    updater: (prev: GitHubPullRequestStatus | null) => GitHubPullRequestStatus | null,
    refreshedAt?: number,
  ) => void
}

const timers = new Map<string, number>()
const bootstrapTimers = new Map<string, number[]>()
const inFlightBySignature = new Set<string>()
const lastRefreshBySignature = new Map<string, number>()

// The revalidate TTL is only checked on read; purge on write so the map holds the
// signatures refreshed inside the TTL instead of every signature ever refreshed.
export const pruneExpiredPrRefreshTimestamps = (timestamps: Map<string, number>, now: number): void => {
  for (const [signature, at] of timestamps) {
    if (!isFreshTimestamp(at, now, PR_REVALIDATE_TTL_MS)) {
      timestamps.delete(signature)
    }
  }
}
const createEntry = (): PrStatusEntry => ({
  status: null,
  isLoading: false,
  error: null,
  isInitialStatusResolved: false,
  lastRefreshAt: 0,
  lastDiscoveryPollAt: 0,
  watchers: 0,
  params: null,
  identity: null,
  resolvedRemoteName: null,
})

export const getPrStatusScope = (entry: PrStatusEntry | null | undefined): PullRequestScope | null => {
  if (entry?.params?.directory && entry.params.branch) {
    return {
      directory: entry.params.directory,
      branch: entry.params.branch,
      remoteName: entry.params.remoteName ?? entry.resolvedRemoteName ?? entry.identity?.remoteName ?? null,
    }
  }
  if (!entry?.identity?.directory || !entry.identity.branch) {
    return null
  }
  return entry.identity
}

const getSignatureFromEntry = (entry: PrStatusEntry | null | undefined): string | null => {
  const identity = getPrStatusScope(entry)
  if (!identity?.directory || !identity.branch) {
    return null
  }
  return pullRequestScopeKey(identity)
}

const getKeysBySignature = (entries: Record<string, PrStatusEntry>, signature: string): string[] => {
  return Object.entries(entries)
    .filter(([, entry]) => getSignatureFromEntry(entry) === signature)
    .map(([key]) => key)
}

const mergeParams = (entry: PrStatusEntry, next: PrRuntimeParams): PrStatusEntry => {
  const previous = getPrStatusScope(entry)
  const { directory, branch } = next
  const previousBranch = previous && pullRequestScopeKey({ ...previous, remoteName: null })
  const sameBranch = previousBranch === pullRequestScopeKey({ directory, branch, remoteName: null })
  const remoteName = next.remoteName?.trim() || (sameBranch ? previous?.remoteName : null) || null
  const identity = { directory, branch, remoteName }
  const changedScope = previous && pullRequestScopeKey(previous) !== pullRequestScopeKey(identity)
  return {
    ...(changedScope ? createEntry() : entry),
    watchers: entry.watchers,
    params: { ...entry.params, ...next, remoteName },
    identity,
  }
}

const getFetchableParams = (entry: PrStatusEntry | null | undefined): PrRuntimeParams | null => {
  if (!entry?.params?.canShow || !entry.params.github?.prStatus) {
    return null
  }
  return {
    ...entry.params,
    remoteName: entry.params.remoteName ?? entry.resolvedRemoteName ?? entry.identity?.remoteName ?? null,
  }
}

const pickFetchParamsForSignature = (
  entries: Record<string, PrStatusEntry>,
  signature: string,
  preferredKey: string,
): PrRuntimeParams | null => {
  const keys = getKeysBySignature(entries, signature)
  const candidates = keys
    .map((key) => getFetchableParams(entries[key]))
    .filter((params): params is PrRuntimeParams => Boolean(params))

  if (candidates.length === 0) {
    return null
  }

  const preferred = getFetchableParams(entries[preferredKey])
  if (preferred && getSignatureFromEntry(entries[preferredKey]) === signature) {
    return preferred
  }

  const withResolvedRemote = keys
    .map((key) => entries[key])
    .find((entry) => Boolean(entry?.resolvedRemoteName && getFetchableParams(entry)))
  if (withResolvedRemote) {
    return getFetchableParams(withResolvedRemote)
  }

  const withRemote = candidates.find((params) => Boolean(params.remoteName))
  if (withRemote) {
    return withRemote
  }

  return candidates[0] ?? null
}

const toPersistedEntry = (entry: PrStatusEntry): PersistedPrStatusEntry => ({
  status: entry.status,
  isInitialStatusResolved: entry.isInitialStatusResolved,
  lastRefreshAt: entry.lastRefreshAt,
  lastDiscoveryPollAt: entry.lastDiscoveryPollAt,
  identity: getPrStatusScope(entry),
  resolvedRemoteName: entry.resolvedRemoteName ?? entry.status?.resolvedRemoteName ?? null,
})

const hydrateEntry = (value: unknown): PrStatusEntry => {
  if (!isPlainRecord(value)) return createEntry()
  const status = restoreCachedPullRequestStatus(value.status)
  const invalidStatus = value.status != null && status === null
  const timestamp = (raw: unknown) =>
    !invalidStatus && typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= Date.now() ? raw : 0
  const rawIdentity = value.identity
  let identity: PullRequestScope | null = null
  if (
    isPlainRecord(rawIdentity) && typeof rawIdentity.directory === "string"
    && typeof rawIdentity.branch === "string"
    && (rawIdentity.remoteName == null || typeof rawIdentity.remoteName === "string")
  ) {
    identity = {
      directory: rawIdentity.directory,
      branch: rawIdentity.branch,
      remoteName: typeof rawIdentity.remoteName === "string" ? rawIdentity.remoteName : null,
    }
  }
  return {
    ...createEntry(),
    status,
    isInitialStatusResolved: !invalidStatus && value.isInitialStatusResolved === true,
    lastRefreshAt: timestamp(value.lastRefreshAt),
    lastDiscoveryPollAt: timestamp(value.lastDiscoveryPollAt),
    identity,
    resolvedRemoteName: typeof value.resolvedRemoteName === "string"
      ? value.resolvedRemoteName : (status?.resolvedRemoteName ?? null),
  }
}

export const useGitHubPrStatusStore = create<GitHubPrStatusStore>()(
  persist(
    (set, get) => ({
      entries: {},
      activeRequestCount: 0,
      totalRequestCount: 0,

      ensureEntry: (key) => {
        set((state) => {
          if (state.entries[key]) {
            return state
          }
          return {
            entries: writeEntry(state.entries, key, createEntry()),
          }
        })
      },

      setParams: (key, params) => {
        set((state) => {
          const current = state.entries[key] ?? createEntry()
          return {
            entries: writeEntry(state.entries, key, mergeParams(current, params)),
          }
        })
      },

      startWatching: (key) => {
        set((state) => {
          const current = state.entries[key] ?? createEntry()
          return {
            entries: writeEntry(state.entries, key, {
              ...current,
              watchers: current.watchers + 1,
            }),
          }
        })

        if (timers.has(key)) {
          return
        }

        const runBootstrapRefresh = (delayMs: number) => {
          const timerId = window.setTimeout(() => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") {
              return
            }
            const entry = get().entries[key]
            if (!entry || entry.watchers <= 0) {
              return
            }
            if (entry.status?.pr) {
              return
            }
            void get().refresh(key, { force: true, silent: true, markInitialResolved: true })
          }, delayMs)
          const existing = bootstrapTimers.get(key) ?? []
          existing.push(timerId)
          bootstrapTimers.set(key, existing)
        }

        void get().refresh(key, { force: true, silent: true, markInitialResolved: true })
        PR_BOOTSTRAP_RETRY_DELAYS_MS.forEach((delay) => runBootstrapRefresh(delay))

        const timerId = window.setInterval(() => {
          if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            return
          }

          const entry = get().entries[key]
          if (!entry || entry.watchers <= 0) {
            return
          }

          const hasPr = Boolean(entry.status?.pr)
          if (!hasPr) {
            const now = Date.now()
            if (isFreshTimestamp(entry.lastDiscoveryPollAt, now, PR_DISCOVERY_INTERVAL_MS)) {
              return
            }
            set((state) => {
              const current = state.entries[key]
              if (!current) {
                return state
              }
              return {
                entries: writeEntry(state.entries, key, {
                  ...current,
                  lastDiscoveryPollAt: now,
                }),
              }
            })
            void get().refresh(key, { force: true, silent: true, markInitialResolved: true })
            return
          }

          if (isTerminalPrState(entry.status?.pr?.state)) {
            return
          }

          const nextInterval = isPendingChecks(entry.status)
            ? PR_OPEN_BUSY_INTERVAL_MS
            : entry.status?.checks && entry.status.checks.state !== "pending"
              ? PR_OPEN_STABLE_INTERVAL_MS
              : PR_OPEN_DEFAULT_INTERVAL_MS
          if (isFreshTimestamp(entry.lastRefreshAt, Date.now(), nextInterval)) {
            return
          }

          void get().refresh(key, { force: true, onlyExistingPr: true, silent: true, markInitialResolved: true })
        }, PR_REVALIDATE_INTERVAL_MS)

        timers.set(key, timerId)
      },

      stopWatching: (key) => {
        set((state) => {
          const current = state.entries[key]
          if (!current) {
            return state
          }

          const watchers = Math.max(0, current.watchers - 1)
          return {
            entries: writeEntry(state.entries, key, {
              ...current,
              watchers,
            }),
          }
        })

        const entry = get().entries[key]
        if (entry && entry.watchers > 0) {
          return
        }

        const timerId = timers.get(key)
        if (typeof timerId === "number") {
          window.clearInterval(timerId)
        }
        timers.delete(key)

        const pendingBootstrapTimers = bootstrapTimers.get(key)
        if (pendingBootstrapTimers && pendingBootstrapTimers.length > 0) {
          pendingBootstrapTimers.forEach((id) => {
            window.clearTimeout(id)
          })
        }
        bootstrapTimers.delete(key)
      },

      refresh: async (key, options) => {
        const state = get()
        const entry = state.entries[key]
        const signature = getSignatureFromEntry(entry)

        if (!entry || !signature) {
          return
        }
        const signatureKeys = getKeysBySignature(state.entries, signature)
        const hasExistingPr = signatureKeys.some((signatureKey) => Boolean(state.entries[signatureKey]?.status?.pr))
        if (options?.onlyExistingPr && !hasExistingPr) {
          return
        }
        const lastRefreshAt = lastRefreshBySignature.get(signature) ?? 0
        if (!options?.force && isFreshTimestamp(lastRefreshAt, Date.now(), PR_REVALIDATE_TTL_MS)) {
          return
        }
        if (inFlightBySignature.has(signature)) {
          return
        }

        const params = pickFetchParamsForSignature(state.entries, signature, key)
        if (!params) {
          return
        }

        inFlightBySignature.add(signature)
        const publishScoped = (update: (current: PrStatusEntry, entryKey: string) => PrStatusEntry) => {
          set((state) => {
            let entries: GitHubPrStatusStore["entries"] | undefined
            for (const entryKey of signatureKeys) {
              const current = state.entries[entryKey]
              if (!current || getSignatureFromEntry(current) !== signature) continue
              const next = update(current, entryKey)
              if (next === current) continue
              entries ??= { ...state.entries }
              delete entries[entryKey]
              entries[entryKey] = next
            }
            return entries ? { entries } : state
          })
        }
        const markSuccess = (refreshTime: number) => {
          pruneExpiredPrRefreshTimestamps(lastRefreshBySignature, refreshTime)
          lastRefreshBySignature.set(signature, refreshTime)
        }
        const settle = (current: PrStatusEntry): PrStatusEntry => ({
          ...current,
          isLoading: options?.silent ? current.isLoading : false,
          isInitialStatusResolved: options?.markInitialResolved === false ? current.isInitialStatusResolved : true,
        })

        if (params.githubAuthChecked && params.githubConnected === false) {
          const now = Date.now()
          publishScoped((current) => ({ ...settle(current), status: { connected: false }, error: null, lastRefreshAt: now }))
          markSuccess(now)
          inFlightBySignature.delete(signature)
          return
        }

        const api = params.github
        if (!api) {
          inFlightBySignature.delete(signature)
          return
        }
        const before = get().entries
        const hasNewerStatus = (current: PrStatusEntry, entryKey: string) =>
          current.lastRefreshAt !== before[entryKey]?.lastRefreshAt ||
          hasPullRequestStatusChanged(before[entryKey]?.status, current.status)
        publishScoped((current) => ({ ...current, isLoading: options?.silent ? current.isLoading : true, error: null }))
        set((state) => ({
          activeRequestCount: state.activeRequestCount + 1,
          totalRequestCount: state.totalRequestCount + 1,
        }))
        try {
          const next = await readWithDeadline(
            (signal) => api.prStatus(params.directory, params.branch, params.remoteName ?? undefined, {
              force: options?.force,
              signal,
            }),
            PR_STATUS_TIMEOUT_MS,
          )
          const now = Date.now()
          let refreshed = false
          publishScoped((current, entryKey) => {
            if (hasNewerStatus(current, entryKey)) return settle(current)
            refreshed = true
            const status = carryPullRequestBody(current.status, next)
            const resolvedRemoteName = status.resolvedRemoteName ?? current.resolvedRemoteName ?? params.remoteName ?? null
            return {
              ...settle(current),
              status,
              error: null,
              lastRefreshAt: now,
              resolvedRemoteName,
              identity: {
                directory: params.directory,
                branch: params.branch,
                remoteName: params.remoteName ?? resolvedRemoteName,
              },
            }
          })
          if (refreshed) markSuccess(now)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          publishScoped((current, entryKey) => hasNewerStatus(current, entryKey)
            ? settle(current)
            : { ...settle(current), error: message || "Failed to load PR status" })
        } finally {
          inFlightBySignature.delete(signature)
          set((state) => ({ activeRequestCount: Math.max(0, state.activeRequestCount - 1) }))
        }
      },

      refreshTargets: async (targets, options) => {
        const keys = Array.from(
          new Set(
            targets
              .map((target) => {
                const directory = readDirectoryPath(target.directory) ?? ""
                const branch = target.branch.trim()
                if (!directory || !branch) {
                  return null
                }
                return getGitHubPrStatusKey(directory, branch, target.remoteName ?? null)
              })
              .filter((key): key is string => Boolean(key)),
          ),
        )

        await mapWithConcurrency(keys, PR_STATUS_REFRESH_CONCURRENCY, (key) => get().refresh(key, options))
      },

      updateStatus: (key, updater, refreshedAt) => {
        set((state) => {
          const current = state.entries[key] ?? createEntry()
          return {
            entries: writeEntry(state.entries, key, {
              ...current,
              status: updater(current.status),
              ...(refreshedAt !== undefined ? { lastRefreshAt: refreshedAt, error: null } : {}),
            }),
          }
        })
      },
    }),
    {
      name: PR_STATUS_STORAGE_KEY,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({
        entries: Object.fromEntries(
          Object.entries(state.entries)
            .filter(([, entry]) => {
              const identity = getPrStatusScope(entry)
              if (!identity?.directory || !identity.branch) {
                return false
              }
              const freshness = Math.max(entry.lastRefreshAt, entry.lastDiscoveryPollAt)
              return freshness === 0 || isFreshTimestamp(freshness, Date.now(), PR_PERSIST_TTL_MS)
            })
            .map(([key, entry]) => [key, toPersistedEntry(entry)]),
        ),
      }),
      merge: (persistedState, currentState) => {
        if (!hasPersistedFields(persistedState, ["entries"])) return currentState
        const persistedEntries = isPlainRecord(persistedState.entries) ? persistedState.entries : {}
        const current = currentState as GitHubPrStatusStore
        return {
          ...current,
          entries: boundPrStatusEntries(
            Object.fromEntries(Object.entries(persistedEntries).map(([key, entry]) => [key, hydrateEntry(entry)])),
          ),
        }
      },
    },
  ),
)
type PrVisualSummary = {
  number: number
  visualState: string
  prState: string
  draft: boolean
  title: string | null
  url: string | null
  base: string | null
  head: string | null
  checks: { state: string; total: number; success: number; failure: number; pending: number } | null
  canMerge: boolean | null
  mergeableState: string | null
  repo: { owner: string; repo: string } | null
}

const derivePrVisualState = (status: GitHubPullRequestStatus | null): string | null => {
  const pr = status?.pr
  if (!pr) return null
  if (pr.state === "merged") return "merged"
  if (pr.state === "closed") return "closed"
  if (pr.draft) return "draft"
  const checksFailed = status?.checks?.state === "failure"
  const ms = typeof pr.mergeableState === "string" ? pr.mergeableState : ""
  const notMergeable = pr.mergeable === false || ms === "blocked" || ms === "dirty"
  if (checksFailed || notMergeable) return "blocked"
  return "open"
}

const deriveSummary = (entry: PrStatusEntry): PrVisualSummary | null => {
  const vs = derivePrVisualState(entry.status ?? null)
  const pr = entry.status?.pr
  if (!vs || !pr?.number) return null
  return {
    number: pr.number,
    visualState: vs,
    prState: pr.state,
    draft: Boolean(pr.draft),
    title: typeof pr.title === "string" && pr.title.trim().length > 0 ? pr.title : null,
    url: typeof pr.url === "string" && pr.url.trim().length > 0 ? pr.url : null,
    base: typeof pr.base === "string" && pr.base.trim().length > 0 ? pr.base : null,
    head: typeof pr.head === "string" && pr.head.trim().length > 0 ? pr.head : null,
    checks: entry.status?.checks
      ? {
          state: entry.status.checks.state,
          total: entry.status.checks.total,
          success: entry.status.checks.success,
          failure: entry.status.checks.failure,
          pending: entry.status.checks.pending,
        }
      : null,
    canMerge: typeof entry.status?.canMerge === "boolean" ? entry.status.canMerge : null,
    mergeableState: typeof pr.mergeableState === "string" ? pr.mergeableState : null,
    repo: entry.status?.repo ? { owner: entry.status.repo.owner, repo: entry.status.repo.repo } : null,
  }
}

const summarySignature = (s: PrVisualSummary): string =>
  `${s.number}:${s.visualState}:${s.prState}:${s.draft}:${s.title ?? ""}:${s.url ?? ""}:${s.base ?? ""}:${s.head ?? ""}:${s.canMerge ?? ""}:${s.mergeableState ?? ""}:${s.checks?.state ?? ""}:${s.checks?.total ?? ""}:${s.checks?.success ?? ""}:${s.checks?.failure ?? ""}:${s.checks?.pending ?? ""}:${s.repo?.owner ?? ""}:${s.repo?.repo ?? ""}`

let prKeyedCacheSigs = new Map<string, string>()
let prKeyedCacheResult: Map<string, PrVisualSummary> = new Map()

export const usePrVisualSummaryByKeys = (keys: string[]) => {
  return useGitHubPrStatusStore((state) => {
    // Derive summaries for requested keys only
    const nextSigs = new Map<string, string>()
    const nextSummaries = new Map<string, PrVisualSummary>()

    for (const key of keys) {
      const entry = state.entries[key]
      if (!entry) continue
      const summary = deriveSummary(entry)
      if (!summary) continue
      const sig = summarySignature(summary)
      nextSigs.set(key, sig)
      nextSummaries.set(key, summary)
    }

    // Compare with cached signatures
    if (nextSigs.size === prKeyedCacheSigs.size) {
      let same = true
      for (const [k, sig] of nextSigs) {
        if (prKeyedCacheSigs.get(k) !== sig) {
          same = false
          break
        }
      }
      if (same) return prKeyedCacheResult
    }

    prKeyedCacheSigs = nextSigs
    prKeyedCacheResult = nextSummaries
    return nextSummaries
  })
}
