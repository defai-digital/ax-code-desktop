import type { ActivityPreview } from "./activityPreview"
import {
  remoteActivityPreview,
  type ActivityMessageRecord,
  type FetchActivityPage,
  type RemoteActivityTarget,
} from "./remoteActivityPreview"
import { createSessionReadCache, type SessionReadOptions } from "./sessionReadCache"

/** Independent, non-persisted cache. Never retains message pages, SDK errors or sync stores. */
export function createRemoteActivityCache(fetchPage: FetchActivityPage, options: SessionReadOptions = {}) {
  return createSessionReadCache<
    RemoteActivityTarget,
    readonly ActivityMessageRecord[],
    { preview: ActivityPreview | null }
  >(
    {
      request: (input) => fetchPage({ ...input, limit: 6 }),
      project: (data) => ({ preview: remoteActivityPreview(data ?? []) }),
      empty: { preview: null },
      eligible: (row) => !row.activity,
    },
    options,
  )
}
