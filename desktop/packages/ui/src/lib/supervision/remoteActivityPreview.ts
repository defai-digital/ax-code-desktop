import { activityPreview, type ActivityMessage, type ActivityPart, type ActivityPreview } from "./activityPreview"

export interface ActivityMessageRecord {
  info: ActivityMessage
  parts?: readonly (ActivityPart & { id?: string })[]
}

const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/** Message pages contain no session todos. Live todo precedence is handled by the row merge. */
export function remoteActivityPreview(page: readonly ActivityMessageRecord[]): ActivityPreview | null {
  // Match the chronological ID order used by sync materialization without materializing a store.
  const records = [...page].sort((left, right) => compareIds(left.info.id ?? "", right.info.id ?? ""))
  return activityPreview({
    messages: records.map((record) => record.info),
    parts: new Map(
      records.flatMap((record) =>
        record.info.id
          ? [
              [
                record.info.id,
                [...(record.parts ?? [])].sort((left, right) => compareIds(left.id ?? "", right.id ?? "")),
              ] as const,
            ]
          : [],
      ),
    ),
  })
}

export interface RemoteActivityEntry {
  preview: ActivityPreview | null
  /** Row revision of the latest successful read; a failed read does not advance it, so that revision is read again. */
  updatedAt: number
  /** The latest read failed: `preview` is older text and is shown as possibly outdated. */
  stale?: boolean
  fetchedAt: number
  /** The directory read; a session that moved to another directory is read again. */
  directory: string
}

export interface RemoteActivityTarget {
  sessionId: string
  directory: string | null
  updatedAt: number
  activity?: ActivityPreview | null
}

export type FetchActivityPage = (input: {
  sessionID: string
  directory: string
  limit: number
  /** Aborted when the read times out, so the request itself stops instead of running beside the next one. */
  signal?: AbortSignal
}) => Promise<{ data?: readonly ActivityMessageRecord[]; error?: unknown }>
