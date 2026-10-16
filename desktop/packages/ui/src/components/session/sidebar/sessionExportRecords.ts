import type { StoreApi } from "zustand"
import type { State } from "@/sync/types"
import type { SessionMessageRecord } from "@/types/sessionMessages"
import { buildSessionMessageRecordsSnapshot } from "@/sync/session-message-records"

/** The part of a `useSync()` handle that reading a whole conversation needs. */
export type SessionRecordsSync = {
  ensureSessionRenderable: (sessionId: string) => Promise<void>
  hasMore: (sessionId: string) => boolean
  loadMore: (sessionId: string) => Promise<void>
}

type SessionRecordsStore = StoreApi<State>

/**
 * Every message record of a session, in order.
 *
 * `ensureSessionRenderable` loads one page (150 by default) and leaves a cursor for the rest, so
 * reading the snapshot right after it exported a long session short — silently, with the UI reporting
 * success. The remaining pages are drained here rather than at each export site.
 *
 * The loop stops as soon as a page adds no record, so a server that hands back the same cursor cannot
 * spin it.
 */
export async function loadAllSessionRecords({
  sessionId,
  store,
  sync,
}: {
  sessionId: string
  store: SessionRecordsStore
  sync: SessionRecordsSync
}): Promise<SessionMessageRecord[]> {
  await sync.ensureSessionRenderable(sessionId)

  while (sync.hasMore(sessionId)) {
    const before = buildSessionMessageRecordsSnapshot(store.getState(), sessionId).list.length
    await sync.loadMore(sessionId)
    const after = buildSessionMessageRecordsSnapshot(store.getState(), sessionId).list.length
    if (after <= before) {
      break
    }
  }

  return buildSessionMessageRecordsSnapshot(store.getState(), sessionId).list
}
