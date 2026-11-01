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

interface SessionSizeCache {
  messages: State["message"][string] | undefined
  diff: State["session_diff"][string] | undefined
  todo: State["todo"][string] | undefined
  permission: State["permission"][string] | undefined
  question: State["question"][string] | undefined
  ownBytes: number
  parts: Map<string, { ref: unknown; bytes: number }>
}

interface SliceRefs {
  message: State["message"]
  part: State["part"]
  session_status: State["session_status"]
  session_diff: State["session_diff"]
  todo: State["todo"]
  permission: State["permission"]
  question: State["question"]
}

type RetentionDraft = SliceRefs

export class SessionRetention {
  private readonly accessed = new Map<string, number>()
  private readonly messages = new Map<string, State["message"][string]>()
  private readonly sizeCache = new Map<string, SessionSizeCache>()
  private sliceRefs: SliceRefs | undefined
  private cachedIds = new Set<string>()
  private cachedSizes = new Map<string, number>()
  private cachedTotalBytes = 0
  /** Input message arrays this sweep already trimmed. A repeat of the same refs must not read them again. */
  private readonly trimmedInputs = new Map<string, State["message"][string] | undefined>()
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
    const reused = this.sweepUnchanged(state, keep, now)
    if (reused) return reused
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
      this.sizeCache.delete(id)
    }
    for (const id of this.sizeCache.keys()) {
      if (!ids.has(id)) this.sizeCache.delete(id)
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
      if (protectedIds.has(id) || !messages || messages.length <= BACKGROUND_MESSAGE_LIMIT) {
        this.trimmedInputs.delete(id)
        continue
      }
      const removed = messages.slice(0, -BACKGROUND_MESSAGE_LIMIT)
      draft.message[id] = messages.slice(-BACKGROUND_MESSAGE_LIMIT)
      for (const message of removed) draft.part.delete(message.id)
      this.trimmedMessages += removed.length
      this.trimmedInputs.set(id, messages)
      invalidated.add(id)
    }

    const sizes = new Map<string, number>()
    let totalBytes = 0
    for (const id of ids) {
      const messagesRef = draft.message[id]
      const diffRef = draft.session_diff[id]
      const todoRef = draft.todo[id]
      const permissionRef = draft.permission[id]
      const questionRef = draft.question[id]
      const existing = this.sizeCache.get(id)
      const cache: SessionSizeCache = existing ?? {
        messages: undefined,
        diff: undefined,
        todo: undefined,
        permission: undefined,
        question: undefined,
        ownBytes: 0,
        parts: new Map(),
      }
      if (!existing) this.sizeCache.set(id, cache)
      let bytes: number
      if (
        existing &&
        cache.messages === messagesRef &&
        cache.diff === diffRef &&
        cache.todo === todoRef &&
        cache.permission === permissionRef &&
        cache.question === questionRef
      ) {
        bytes = cache.ownBytes
      } else {
        bytes = retainedPayloadSize([messagesRef, diffRef, todoRef, permissionRef, questionRef])
        cache.messages = messagesRef
        cache.diff = diffRef
        cache.todo = todoRef
        cache.permission = permissionRef
        cache.question = questionRef
        cache.ownBytes = bytes
      }
      const livePartIds = new Set<string>()
      for (const messageID of partsBySession.get(id) ?? []) {
        const partRef = draft.part.get(messageID)
        if (partRef === undefined) continue
        livePartIds.add(messageID)
        const cachedPart = cache.parts.get(messageID)
        if (cachedPart && cachedPart.ref === partRef) {
          bytes += cachedPart.bytes
        } else {
          const partBytes = retainedPayloadSize(partRef)
          cache.parts.set(messageID, { ref: partRef, bytes: partBytes })
          bytes += partBytes
        }
      }
      for (const messageID of cache.parts.keys()) {
        if (!livePartIds.has(messageID)) cache.parts.delete(messageID)
      }
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
      this.sizeCache.delete(id)
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
    this.cachedIds = ids
    this.cachedSizes = sizes
    this.cachedTotalBytes = totalBytes
    // An eviction patch is only reflected after the caller applies it. Keep the
    // fast path for sweeps that left this input intact.
    this.sliceRefs =
      evicted.length === 0
        ? {
            message: state.message,
            part: state.part,
            session_status: state.session_status,
            session_diff: state.session_diff,
            todo: state.todo,
            permission: state.permission,
            question: state.question,
          }
        : undefined
    return {
      patch: invalidated.size > 0 ? { ...draft, part: draft.part.seal() } : undefined,
      invalidated: [...invalidated],
      evicted,
    }
  }

  /**
   * Streaming arms a sweep every second for every loaded directory. When the
   * slice refs and the PartMap are the ones already priced, the owner walk and
   * the discarded draft are pure overhead. Touch, keep, and TTL still run.
   * A long session that lost protection still falls through so it can trim.
   */
  private sweepUnchanged(state: State, keep: ReadonlySet<string>, now: number) {
    const refs = this.sliceRefs
    if (
      !refs ||
      refs.message !== state.message ||
      refs.part !== state.part ||
      refs.session_status !== state.session_status ||
      refs.session_diff !== state.session_diff ||
      refs.todo !== state.todo ||
      refs.permission !== state.permission ||
      refs.question !== state.question
    ) {
      return undefined
    }
    const protectedIds = getProtectedSessionCacheIds(state)
    for (const id of keep) protectedIds.add(id)
    for (const id of this.cachedIds) {
      if (protectedIds.has(id)) continue
      const messages = state.message[id]
      if (messages && messages.length > BACKGROUND_MESSAGE_LIMIT && this.trimmedInputs.get(id) !== messages) {
        return undefined
      }
    }
    const ids = this.cachedIds
    for (const id of ids) {
      const live = state.message[id]
      if (this.trimmedInputs.get(id) === live) continue
      if (!this.accessed.has(id) || this.messages.get(id) !== live) this.touch(id, now)
      this.messages.set(id, live)
    }
    for (const id of keep) this.touch(id, now)
    for (const id of this.accessed.keys()) {
      if (ids.has(id) || keep.has(id)) continue
      this.accessed.delete(id)
      this.messages.delete(id)
      this.sizeCache.delete(id)
    }
    for (const id of this.sizeCache.keys()) {
      if (!ids.has(id)) this.sizeCache.delete(id)
    }
    const evicted: string[] = []
    let count = ids.size
    let totalBytes = this.cachedTotalBytes
    for (const [id, accessedAt] of this.accessed) {
      if (!ids.has(id) || protectedIds.has(id)) continue
      if (
        count <= SESSION_CACHE_LIMIT &&
        totalBytes <= DIRECTORY_CONTENT_MAX_BYTES &&
        now - accessedAt < DIR_IDLE_TTL_MS
      ) {
        continue
      }
      evicted.push(id)
      count -= 1
      totalBytes -= this.cachedSizes.get(id) ?? 0
      this.accessed.delete(id)
      this.messages.delete(id)
      this.sizeCache.delete(id)
    }
    const draft = evicted.length > 0 ? this.draftOf(state) : undefined
    if (draft) {
      dropSessionCaches(draft, evicted)
      this.evictedSessions += evicted.length
      this.sliceRefs = undefined
    }
    const published = draft ?? state
    let messages = 0
    for (const list of Object.values(published.message)) messages += list.length
    this.stats = {
      sessions: Object.keys(published.message).length,
      messages,
      partMessages: published.part.size,
      estimatedBytes: totalBytes,
      protectedSessions: [...protectedIds].filter((id) => ids.has(id)).length,
      evictedSessions: this.evictedSessions,
      trimmedMessages: this.trimmedMessages,
    }
    return {
      patch: draft ? { ...draft, part: draft.part.seal() } : undefined,
      invalidated: evicted,
      evicted,
    }
  }

  private draftOf(state: State): RetentionDraft {
    return {
      message: { ...state.message },
      part: state.part.fork(),
      session_status: { ...state.session_status },
      session_diff: { ...state.session_diff },
      todo: { ...state.todo },
      permission: { ...state.permission },
      question: { ...state.question },
    }
  }
}
