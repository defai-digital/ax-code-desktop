import React from "react"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { GitHubAPI } from "@/lib/api/types"
import { carryPullRequestBody, hasPullRequestStatusChanged } from "@/lib/cachedPullRequestStatus"
import { pullRequestScopeKey, type PullRequestScope } from "@/lib/pullRequestScope"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import {
  createPullRequestCache,
  projectPullRequest,
  PULL_REQUEST_FRESH_MS,
  type MissionPullRequest,
  type PullRequestTarget,
} from "@/lib/supervision/pullRequestCache"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { getPrStatusScope, useGitHubPrStatusStore } from "@/stores/useGitHubPrStatusStore"
import { useGitAllBranches } from "@/stores/useGitStore"

type PrEntries = ReturnType<typeof useGitHubPrStatusStore.getState>["entries"]

/** The most recently refreshed known PR status for a branch, whichever remote it was read through. */
export function preferredEntry(entries: PrEntries, directory: string, branch: string) {
  const branchScope = pullRequestScopeKey({ directory, branch, remoteName: null })
  let preferred: { storeKey: string; entry: PrEntries[string]; scope: PullRequestScope } | undefined
  for (const [storeKey, entry] of Object.entries(entries)) {
    const scope = getPrStatusScope(entry)
    if (!entry.status?.pr || !scope || pullRequestScopeKey({ ...scope, remoteName: null }) !== branchScope) continue
    if (!preferred || entry.lastRefreshAt > preferred.entry.lastRefreshAt) preferred = { storeKey, entry, scope }
  }
  return preferred
}

function ownsTarget(entries: PrEntries, target: PullRequestTarget) {
  const preferred = preferredEntry(entries, target.directory, target.branch)
  return preferred?.storeKey === target.storeKey && pullRequestScopeKey(preferred.scope) === pullRequestScopeKey(target)
    ? preferred.entry
    : undefined
}

function makeCache(github?: GitHubAPI) {
  return createPullRequestCache(async (target, signal) => {
    const store = useGitHubPrStatusStore.getState()
    const entry = ownsTarget(store.entries, target)
    const api = github ?? entry?.params?.github
    if (!entry || !api) throw new Error("PR runtime unavailable")
    const status = await api.prStatus(target.directory, target.branch, target.remoteName ?? undefined, { signal })
    if (signal.aborted) throw new Error("aborted")
    const current = ownsTarget(useGitHubPrStatusStore.getState().entries, target)
    if (!current) throw new Error("PR scope changed")
    if (current.lastRefreshAt !== entry.lastRefreshAt || hasPullRequestStatusChanged(entry.status, current.status)) {
      return projectPullRequest(current.status)
    }
    // Keep a body the PR section already loaded for this PR.
    store.updateStatus(target.storeKey, (previous) => carryPullRequestBody(previous, status), Date.now())
    return projectPullRequest(status)
  })
}

const caches = new WeakMap<GitHubAPI, ReturnType<typeof makeCache>>()
const fallbackCache = makeCache()
function cacheFor(github?: GitHubAPI) {
  if (!github) return fallbackCache
  let cache = caches.get(github)
  if (!cache) {
    cache = makeCache(github)
    caches.set(github, cache)
  }
  return cache
}

/**
 * The pull request Desktop already knows for this branch. It starts no GitHub read: the Git view and Mission Control
 * own refreshing, and a projection they have not refreshed within the fresh window is marked stale.
 */
export function useKnownPullRequest(directory: string, branch: string | null | undefined): MissionPullRequest | null {
  const entries = useGitHubPrStatusStore((state) => state.entries)
  const [clock, setClock] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), PULL_REQUEST_FRESH_MS / 6)
    return () => clearInterval(timer)
  }, [])
  return React.useMemo(() => {
    const name = branch?.trim()
    if (!directory || !name) return null
    const known = preferredEntry(entries, directory, name)
    const pr = known ? projectPullRequest(known.entry.status) : null
    if (!known || !pr) return null
    const stale = Boolean(known.entry.error) || clock - known.entry.lastRefreshAt >= PULL_REQUEST_FRESH_MS
    return { ...pr, stale }
  }, [entries, directory, branch, clock])
}

/** Project known branches before filtering; demand only the rows rendered after filters and collapsed groups. */
export function useMissionControlPullRequests(rows: readonly SupervisionRow[]) {
  const github = React.useContext(RuntimeAPIContext)?.github
  const cache = cacheFor(github)
  const entries = useGitHubPrStatusStore((state) => state.entries)
  const branches = useGitAllBranches()
  const snapshot = React.useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot)
  // Re-project periodically so a snapshot ages into stale without an unrelated render.
  const [clock, setClock] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), PULL_REQUEST_FRESH_MS / 6)
    return () => clearInterval(timer)
  }, [])
  const consumer = React.useRef<ReturnType<typeof cache.mount> | null>(null)
  React.useEffect(() => {
    const mounted = cache.mount()
    consumer.current = mounted
    return () => {
      consumer.current = null
      mounted.dispose()
    }
  }, [cache])

  const targets = React.useMemo(() => {
    const result = new Map<string, PullRequestTarget>()
    const byDirectory = new Map(
      [...branches].map(([directory, branch]) => [getProjectPathIdentityKey(directory), branch]),
    )
    for (const row of rows) {
      const directory = row.directory
      const branch = byDirectory.get(getProjectPathIdentityKey(directory))?.trim()
      if (!directory || !branch) continue
      const known = preferredEntry(entries, directory, branch)
      if (!known) continue
      result.set(row.sessionId, {
        directory,
        branch,
        remoteName: known.scope.remoteName,
        storeKey: known.storeKey,
        pr: projectPullRequest(known.entry.status),
        fetchedAt: known.entry.lastRefreshAt,
        stale: Boolean(known.entry.error),
      })
    }
    return result
  }, [rows, branches, entries])
  const projected = React.useMemo(
    () =>
      rows.map((row) => {
        const target = targets.get(row.sessionId)
        if (!target) return row
        const cached = snapshot.get(pullRequestScopeKey(target))
        const entry = cached && cached.fetchedAt >= target.fetchedAt ? cached : target
        const pr = entry.pr
          ? { ...entry.pr, stale: ("stale" in entry && entry.stale === true) || clock - entry.fetchedAt >= PULL_REQUEST_FRESH_MS }
          : null
        return { ...row, pullRequest: pr }
      }),
    [rows, targets, snapshot, clock],
  )
  const setVisibleRows = React.useCallback(
    (visible: readonly SupervisionRow[]) => {
      consumer.current?.update(
        visible.flatMap((row) => {
          const target = targets.get(row.sessionId)
          return target ? [target] : []
        }),
      )
    },
    [targets],
  )
  return { rows: projected, setVisibleRows }
}
