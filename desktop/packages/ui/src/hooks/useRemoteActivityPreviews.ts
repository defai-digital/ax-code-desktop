import React from "react"
import { axCodeClient } from "@/lib/ax-code/client"
import { createRemoteActivityCache } from "@/lib/supervision/remoteActivityCache"
import type { SupervisionRow } from "@/lib/supervision/rows"

const remoteActivityCache = createRemoteActivityCache((input) =>
  axCodeClient
    .getScopedSdkClient(input.directory)
    .session.messages(
      { sessionID: input.sessionID, directory: input.directory, limit: input.limit },
      { signal: input.signal },
    ),
)

/** Read a stale preview again now, for the row's Retry action. */
export function retryRemoteActivityPreview(sessionId: string, cache = remoteActivityCache) {
  cache.retry(sessionId)
}

/** Mount only on the board and pass its rendered roots, after filters and collapsed groups. */
export function useRemoteActivityPreviews(
  rows: readonly SupervisionRow[],
  cache = remoteActivityCache,
): ReadonlyMap<string, SupervisionRow> {
  const entries = React.useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot)
  const consumer = React.useRef<ReturnType<typeof cache.mount> | null>(null)
  React.useEffect(() => {
    const mounted = cache.mount()
    consumer.current = mounted
    return () => {
      consumer.current = null
      mounted.dispose()
    }
  }, [cache])
  React.useEffect(() => {
    consumer.current?.update(rows)
  }, [cache, rows])

  return React.useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const entry = entries.get(row.sessionId)
          const kept = entry?.directory === row.directory ? entry.preview : null
          const preview = kept && entry?.stale ? { ...kept, stale: true, lastSuccessAt: entry.succeededAt } : kept
          return [row.sessionId, row.activity || !preview ? row : { ...row, activity: preview }]
        }),
      ),
    [entries, rows],
  )
}
