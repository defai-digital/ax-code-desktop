import { retainedPayloadSize } from "@/lib/retainedPayloadSize"
import { dropSessionCaches, getProtectedSessionCacheIds } from "./session-cache"
import { SESSION_CACHE_LIMIT, DIR_IDLE_TTL_MS, type State } from "./types"

export const SESSION_RETENTION_SWEEP_MS = 1000
export const BACKGROUND_MESSAGE_LIMIT = 150
export const DIRECTORY_CONTENT_MAX_BYTES = 20 * 1024 * 1024

export type RetentionStats = {
  sessions: number
  messages: number
  partMessages: number
  estimatedBytes: number
  protectedSessions: number
  evictedSessions: number
  trimmedMessages: number
}

export class SessionRetention {
  private readonly accessed = new Map<string, number>()
  private readonly messages = new Map<string, State["message"][string]>()
  private evictedSessions = 0
  private trimmedMessages = 0
  stats: RetentionStats = {
    sessions: 0,
    messages: 0,
    partMessages: 0,
    estimatedBytes: 0,
    protectedSessions: 0,
    evictedSessions: 0,
    trimmedMessages: 0,
  }

  touch(id: string, now = Date.now()) {
    this.accessed.delete(id)
    this.accessed.set(id, now)
  }

  sweep(state: State, keep: ReadonlySet<string>, now = Date.now()) {
    const protectedIds = getProtectedSessionCacheIds(state)
    for (const id of keep) protectedIds.add(id)
    const messageOwners = new Map<string, string>()
    for (const [id, messages] of Object.entries(state.message)) {
      for (const message of messages) messageOwners.set(message.id, id)
    }
    const partsBySession = new Map<string, string[]>()
    const ids = new Set(Object.keys(state.message))
    for (const [messageID, parts] of state.part) {
      const sessionID =
        parts.find((part) => "sessionID" in part && part.sessionID)?.sessionID ?? messageOwners.get(messageID)
      if (!sessionID) continue
      ids.add(sessionID)
      const keys = partsBySession.get(sessionID) ?? []
      keys.push(messageID)
      partsBySession.set(sessionID, keys)
    }
    // Side slices also need a lifecycle when a session never received a message.
    for (const slice of [state.session_status, state.session_diff, state.todo, state.permission, state.question]) {
      for (const id of Object.keys(slice)) ids.add(id)
    }
    for (const id of ids) {
      if (!this.accessed.has(id) || this.messages.get(id) !== state.message[id]) this.touch(id, now)
      this.messages.set(id, state.message[id])
    }
    for (const id of keep) this.touch(id, now)
    for (const id of this.accessed.keys()) {
      if (ids.has(id) || keep.has(id)) continue
      this.accessed.delete(id)
      this.messages.delete(id)
    }

    const draft = {
      message: { ...state.message },
      part: state.part.fork(),
      session_status: { ...state.session_status },
      session_diff: { ...state.session_diff },
      todo: { ...state.todo },
      permission: { ...state.permission },
      question: { ...state.question },
    }
    const invalidated = new Set<string>()
    for (const id of ids) {
      const messages = draft.message[id]
      if (protectedIds.has(id) || !messages || messages.length <= BACKGROUND_MESSAGE_LIMIT) continue
      const removed = messages.slice(0, -BACKGROUND_MESSAGE_LIMIT)
      draft.message[id] = messages.slice(-BACKGROUND_MESSAGE_LIMIT)
      for (const message of removed) draft.part.delete(message.id)
      this.trimmedMessages += removed.length
      invalidated.add(id)
    }

    const sizes = new Map<string, number>()
    let totalBytes = 0
    for (const id of ids) {
      let bytes = retainedPayloadSize([
        draft.message[id],
        draft.session_diff[id],
        draft.todo[id],
        draft.permission[id],
        draft.question[id],
      ])
      for (const messageID of partsBySession.get(id) ?? []) bytes += retainedPayloadSize(draft.part.get(messageID))
      sizes.set(id, bytes)
      totalBytes += bytes
    }
    const evicted: string[] = []
    let count = ids.size
    for (const [id, accessedAt] of this.accessed) {
      if (!ids.has(id) || protectedIds.has(id)) continue
      if (
        count <= SESSION_CACHE_LIMIT &&
        totalBytes <= DIRECTORY_CONTENT_MAX_BYTES &&
        now - accessedAt < DIR_IDLE_TTL_MS
      )
        continue
      evicted.push(id)
      invalidated.add(id)
      count -= 1
      totalBytes -= sizes.get(id) ?? 0
      this.accessed.delete(id)
      this.messages.delete(id)
    }
    dropSessionCaches(draft, evicted)
    this.evictedSessions += evicted.length
    for (const id of invalidated) {
      if (draft.message[id]) this.messages.set(id, draft.message[id])
    }
    this.stats = {
      sessions: Object.keys(draft.message).length,
      messages: Object.values(draft.message).reduce((sum, messages) => sum + messages.length, 0),
      partMessages: draft.part.size,
      estimatedBytes: totalBytes,
      protectedSessions: [...protectedIds].filter((id) => ids.has(id)).length,
      evictedSessions: this.evictedSessions,
      trimmedMessages: this.trimmedMessages,
    }
    return {
      patch: invalidated.size > 0 ? { ...draft, part: draft.part.seal() } : undefined,
      invalidated: [...invalidated],
      evicted,
    }
  }
}
