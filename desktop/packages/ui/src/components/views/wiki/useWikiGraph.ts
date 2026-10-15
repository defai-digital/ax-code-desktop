import React from "react"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import {
  loadWikiMaintenance,
  loadWikiVisualization,
  requestWikiRefresh,
  WIKI_MAINTENANCE_POLL_MS,
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

/**
 * Loads the wiki graph for one directory and follows maintenance revisions.
 * Generation is never started here — only requestRefresh(), from a button, does that.
 */
export function useWikiGraph(directory: string) {
  const [snapshot, setSnapshot] = React.useState<DirectoryLoad | null>(null)
  const [maintenanceState, setMaintenanceState] = React.useState<DirectoryMaintenance | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const revisionRef = React.useRef<number | null>(null)
  const vizGeneration = React.useRef(0)

  const load = snapshot?.directory === directory ? snapshot.load : null
  const maintenance = maintenanceState?.directory === directory ? maintenanceState.status : null

  const publishVisualization = React.useCallback(
    (generation: number, next: WikiLoadState, silent: boolean) => {
      if (generation !== vizGeneration.current) return
      setSnapshot((current) => {
        const previous = current?.directory === directory ? current.load : null
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
        return { directory, load: mergeWikiLoad(previous, next, silent) }
      })
    },
    [directory],
  )

  const readVisualization = React.useCallback(
    async (silent: boolean) => {
      const generation = ++vizGeneration.current
      const next = await loadWikiVisualization(directory)
      publishVisualization(generation, next, silent)
    },
    [directory, publishVisualization],
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
      try {
        const status = await loadWikiMaintenance(directory)
        if (stopped) return
        if (status) {
          setMaintenanceState({ directory, status })
          // The opening read can finish before the first sample. Treat that sample as a
          // change from "unknown" so a revision that moved during the read is not missed.
          if (status.revision !== revisionRef.current) {
            revisionRef.current = status.revision
            await readVisualization(true)
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
  }, [directory, readVisualization])

  const requestRefresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const status = await requestWikiRefresh(directory)
      if (status) {
        setMaintenanceState({ directory, status })
        revisionRef.current = status.revision
      }
      await readVisualization(true)
      return status !== null
    } finally {
      setRefreshing(false)
    }
  }, [directory, readVisualization])

  return { load, maintenance, refreshing, requestRefresh }
}
