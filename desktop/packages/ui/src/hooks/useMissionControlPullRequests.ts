import React from "react"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { GitHubAPI, GitHubPullRequestStatus } from "@/lib/api/types"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import {
  createPullRequestCache,
  projectPullRequest,
  PULL_REQUEST_FRESH_MS,
  pullRequestKey,
  type PullRequestTarget,
} from "@/lib/supervision/pullRequestCache"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useGitHubPrStatusStore } from "@/stores/useGitHubPrStatusStore"
import { useGitAllBranches } from "@/stores/useGitStore"

function makeCache(github?: GitHubAPI) {
  return createPullRequestCache(async (target, signal) => {
    const store = useGitHubPrStatusStore.getState()
    const entry = store.entries[target.storeKey]
    const api = github ?? entry?.params?.github
    if (!entry || !api) throw new Error("PR runtime unavailable")
    const remote = entry.resolvedRemoteName ?? entry.identity?.remoteName ?? entry.params?.remoteName ?? undefined
    // Use the existing runtime endpoint and its server cache; do not force a discovery or bypass its TTL.
    const startedAt = Date.now()
    const status = await api.prStatus(target.directory, target.branch, remote, { signal })
    if (signal.aborted) throw new Error("aborted")
    // Share the successful read with PullRequestSection, without persisting any new credential material.
    const current = useGitHubPrStatusStore.getState().entries[target.storeKey]
    const identity = current?.params ?? current?.identity
    if (
      identity &&
      pullRequestKey(identity.directory, identity.branch) === pullRequestKey(target.directory, target.branch)
    ) {
      if (current.lastRefreshAt > startedAt) return projectPullRequest(current.status)
      // Keep a body PullRequestSection already loaded when this board read omits it.
      store.updateStatus(target.storeKey, (previous) => withCarriedBody(previous, status), Date.now())
    }
    return projectPullRequest(status)
  })
}
function withCarriedBody(
  previous: GitHubPullRequestStatus | null | undefined,
  next: GitHubPullRequestStatus,
): GitHubPullRequestStatus {
  const prevPr = previous?.pr
  const nextPr = next.pr
  if (!nextPr || !prevPr || nextPr.number !== prevPr.number || nextPr.body?.trim()) return next
  if (typeof prevPr.body !== "string" || !prevPr.body.trim()) return next
  return { ...next, pr: { ...nextPr, body: prevPr.body } }
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
      // Prefer the most recently refreshed remote if several remotes know the same branch.
      const known = Object.entries(entries)
        .filter(([, entry]) => {
          const identity = entry.params ?? entry.identity
          return (
            identity &&
            getProjectPathIdentityKey(identity.directory) === getProjectPathIdentityKey(directory) &&
            identity.branch?.trim() === branch &&
            Boolean(entry.status?.pr)
          )
        })
        .sort((a, b) => b[1].lastRefreshAt - a[1].lastRefreshAt)[0]
      if (!known) continue
      result.set(row.sessionId, {
        directory,
        branch,
        storeKey: known[0],
        pr: projectPullRequest(known[1].status),
        fetchedAt: known[1].lastRefreshAt,
        stale: Boolean(known[1].error),
      })
    }
    return result
  }, [rows, branches, entries])
  const projected = React.useMemo(
    () =>
      rows.map((row) => {
        const target = targets.get(row.sessionId)
        if (!target) return row
        const cached = snapshot.get(pullRequestKey(target.directory, target.branch))
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
