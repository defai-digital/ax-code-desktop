import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import type { OptimisticItem } from "./optimistic"
import { clearSessionPrefetch, clearDirectorySessionPrefetch } from "./session-prefetch-cache"

export const sessionLoadKey = (directory: string, sessionID: string) =>
  `${getProjectPathIdentityKey(directory) ?? directory}\n${sessionID}`

export type SyncMeta = {
  limit: number
  cursor: string | undefined
  complete: boolean
  loading: boolean
  fetched: boolean
  error?: boolean
}

export const optimisticByKey = new Map<string, Map<string, OptimisticItem>>()
export const syncSessionInflightByKey = new Map<string, Promise<void>>()
export const metaByKey = new Map<string, SyncMeta>()
const snapshotLoadsByKey = new Map<string, Set<object>>()
export const messageLoadsByKey = new Map<string, object>()

export function getPendingSessionLoadIds(directory: string): Set<string> {
  const prefix = sessionLoadKey(directory, "")
  const ids = new Set<string>()
  for (const map of [syncSessionInflightByKey, messageLoadsByKey, snapshotLoadsByKey]) {
    for (const key of map.keys()) if (key.startsWith(prefix)) ids.add(key.slice(prefix.length))
  }
  return ids
}

export function clearSessionLoadState(directory: string, ids: Iterable<string>) {
  const sessions = [...ids]
  for (const id of sessions) {
    const key = sessionLoadKey(directory, id)
    optimisticByKey.delete(key)
    metaByKey.delete(key)
    syncSessionInflightByKey.delete(key)
    messageLoadsByKey.delete(key)
    snapshotLoadsByKey.delete(key)
  }
  clearSessionPrefetch(directory, sessions)
}

export function clearDirectorySessionLoadState(directory: string) {
  const prefix = sessionLoadKey(directory, "")
  for (const map of [optimisticByKey, metaByKey, syncSessionInflightByKey, messageLoadsByKey, snapshotLoadsByKey]) {
    for (const key of map.keys()) if (key.startsWith(prefix)) map.delete(key)
  }
  clearDirectorySessionPrefetch(directory)
}

/** A unique lease protects a live read and becomes invalid when its directory/session is discarded. */
export function retainSessionLoad(directory: string, sessionID: string) {
  const key = sessionLoadKey(directory, sessionID)
  const claims = snapshotLoadsByKey.get(key) ?? new Set<object>()
  const claim = {}
  claims.add(claim)
  snapshotLoadsByKey.set(key, claims)
  return {
    isCurrent: () => snapshotLoadsByKey.get(key) === claims && claims.has(claim),
    release: () => {
      claims.delete(claim)
      if (claims.size === 0 && snapshotLoadsByKey.get(key) === claims) snapshotLoadsByKey.delete(key)
    },
  }
}
