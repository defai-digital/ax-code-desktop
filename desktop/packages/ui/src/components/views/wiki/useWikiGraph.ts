import React from "react"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import {
  loadWikiMaintenance,
  loadWikiVisualization,
  requestWikiRefresh,
  WIKI_MAINTENANCE_POLL_MS,
  type WikiRefreshOutcome,
} from "@/lib/wiki/api"
import { mergeWikiLoad, type WikiLoadState } from "@/lib/wiki/snapshot"

interface DirectoryLoad {
  directory: string
  load: WikiLoadState
}

interface DirectoryMaintenance {
  directory: string
  status: WikiMaintenanceStatus
}

// A failed silent reload keeps the previous graph. Retrying its revision on the next samples
// recovers from a transient error; the bound keeps a persistent one from refetching the
// whole graph on every poll.
const MAX_RELOAD_ATTEMPTS = 3

interface ReloadFailures {
  revision: number | null
  count: number
}

/** Record a reload's outcome; forget the revision while it may still be retried. */
function settleRevisionReload(
  revisionRef: React.RefObject<number | null>,
  failures: React.RefObject<ReloadFailures>,
  revision: number,
  loaded: boolean,
) {
  if (loaded) {
    failures.current = { revision: null, count: 0 }
    return
  }
  const count = failures.current.revision === revision ? failures.current.count + 1 : 1
  failures.current = { revision, count }
  if (count < MAX_RELOAD_ATTEMPTS && revisionRef.current === revision) revisionRef.current = null
}

/**
 * Loads the wiki graph for one directory and follows maintenance revisions.
 * Generation is never started here — only requestRefresh(), from a button, does that.
 */
export function useWikiGraph(directory: string) {
  const [snapshot, setSnapshot] = React.useState<DirectoryLoad | null>(null)
  const [maintenanceState, setMaintenanceState] = React.useState<DirectoryMaintenance | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const revisionRef = React.useRef<number | null>(null)
  const reloadFailures = React.useRef<ReloadFailures>({ revision: null, count: 0 })
  // Bumps when a refresh starts and when it publishes. A poll records the value it
  // began with and drops the sample if a refresh moved it.
  const maintenanceWrite = React.useRef(0)
  const vizGeneration = React.useRef(0)
  // Each async continuation carries the project it started for. The panel is keyed by
  // directory, but the hook is not: a late response for the previous project must not
  // move this project's revision or replace what it shows.
  const scope = React.useMemo(() => ({ directory }), [directory])
  const activeScope = React.useRef(scope)
  activeScope.current = scope

  const load = snapshot?.directory === directory ? snapshot.load : null
  const maintenance = maintenanceState?.directory === directory ? maintenanceState.status : null

  const publishVisualization = React.useCallback(
    (generation: number, next: WikiLoadState, silent: boolean) => {
      if (generation !== vizGeneration.current || activeScope.current !== scope) return
      setSnapshot((current) => {
        const previous = current?.directory === scope.directory ? current.load : null
        // Same recorded snapshot: keep the object so a confirming refetch does not
        // relayout the graph or reset the camera.
        if (
          silent &&
          previous?.status === "graph" &&
          next.status === "graph" &&
          previous.graph.snapshot === next.graph.snapshot
        ) {
          return current
        }
        return { directory: scope.directory, load: mergeWikiLoad(previous, next, silent) }
      })
    },
    [scope],
  )

  // Resolves false when the read failed, so a caller can leave its revision unconsumed.
  const readVisualization = React.useCallback(
    async (silent: boolean): Promise<boolean> => {
      const generation = ++vizGeneration.current
      const next = await loadWikiVisualization(scope.directory)
      publishVisualization(generation, next, silent)
      return next.status !== "error"
    },
    [scope, publishVisualization],
  )

  React.useEffect(() => {
    void readVisualization(false)
    return () => {
      vizGeneration.current += 1
    }
  }, [readVisualization])

  React.useEffect(() => {
    let stopped = false
    let timer = 0
    // One poll chain at a time: a visibility change while a sample is in flight must not start a second one.
    let inFlight = false
    revisionRef.current = null
    reloadFailures.current = { revision: null, count: 0 }

    const schedule = () => {
      window.clearTimeout(timer)
      if (stopped || document.hidden) return
      timer = window.setTimeout(() => {
        void tick()
      }, WIKI_MAINTENANCE_POLL_MS)
    }

    const tick = async () => {
      if (stopped || document.hidden || inFlight) return
      inFlight = true
      const write = maintenanceWrite.current
      try {
        const result = await loadWikiMaintenance(scope.directory)
        if (stopped) return
        // A refresh that started or published while this sample was in flight owns the
        // banner and the revision. A failed sample keeps the last known status.
        if (write === maintenanceWrite.current && result.status !== "failed") {
          setMaintenanceState({ directory: scope.directory, status: result.maintenance })
          // The opening read can finish before the first sample. Treat that sample as a
          // change from "unknown" so a revision that moved during the read is not missed.
          if (result.maintenance.revision !== revisionRef.current) {
            const revision = result.maintenance.revision
            revisionRef.current = revision
            const loaded = await readVisualization(true)
            // A previous project's read can settle after the next poll chain resets the refs.
            if (!stopped && activeScope.current === scope && write === maintenanceWrite.current) {
              settleRevisionReload(revisionRef, reloadFailures, revision, loaded)
            }
          }
        }
      } finally {
        inFlight = false
      }
      schedule()
    }

    const onVisibility = () => {
      if (stopped) return
      window.clearTimeout(timer)
      if (!document.hidden) void tick()
    }

    document.addEventListener("visibilitychange", onVisibility)
    schedule()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [scope, readVisualization])

  const requestRefresh = React.useCallback(async (): Promise<WikiRefreshOutcome> => {
    setRefreshing(true)
    maintenanceWrite.current += 1
    try {
      const outcome = await requestWikiRefresh(scope.directory)
      if (activeScope.current !== scope) return { status: "failed" }
      if (outcome.status !== "failed") {
        maintenanceWrite.current += 1
        setMaintenanceState({ directory: scope.directory, status: outcome.maintenance })
        // A disabled refresh queued no work, so its revision is not this project's revision.
        if (outcome.status === "started") revisionRef.current = outcome.maintenance.revision
      }
      const loaded = await readVisualization(true)
      if (outcome.status === "started" && activeScope.current === scope) {
        settleRevisionReload(revisionRef, reloadFailures, outcome.maintenance.revision, loaded)
      }
      return outcome
    } finally {
      setRefreshing(false)
    }
  }, [scope, readVisualization])

  return { load, maintenance, refreshing, requestRefresh }
}
