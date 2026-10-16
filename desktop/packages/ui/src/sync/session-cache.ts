import type {
  Message,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  Todo,
} from "@defai-digital/ax-code-sdk/v2/client"
import type { PartMap } from "./part-map"
import type { FileDiff } from "./types"

type SessionCache = {
  session_status: Record<string, SessionStatus | undefined>
  session_diff: Record<string, FileDiff[] | undefined>
  todo: Record<string, Todo[] | undefined>
  message: Record<string, Message[] | undefined>
  part: PartMap
  permission: Record<string, PermissionRequest[] | undefined>
  question: Record<string, QuestionRequest[] | undefined>
}

export function getProtectedSessionCacheIds(store: SessionCache): Set<string> {
  const protectedIds = new Set<string>()

  for (const [sessionID, status] of Object.entries(store.session_status ?? {})) {
    if (status && status.type !== "idle") {
      protectedIds.add(sessionID)
    }
  }

  for (const [sessionID, permissions] of Object.entries(store.permission ?? {})) {
    if ((permissions?.length ?? 0) > 0) {
      protectedIds.add(sessionID)
    }
  }

  for (const [sessionID, questions] of Object.entries(store.question ?? {})) {
    if ((questions?.length ?? 0) > 0) {
      protectedIds.add(sessionID)
    }
  }

  for (const [sessionID, messages] of Object.entries(store.message ?? {})) {
    const lastMessage = messages?.[messages.length - 1]
    if (
      lastMessage?.role === "assistant" &&
      typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== "number"
    ) {
      protectedIds.add(sessionID)
    }
  }

  return protectedIds
}

export function dropSessionCaches(store: SessionCache, sessionIDs: Iterable<string>) {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean))
  if (stale.size === 0) return

  const staleMessageIDs = new Set<string>()
  for (const sessionID of stale) {
    for (const message of store.message?.[sessionID] ?? []) {
      if (message?.id) staleMessageIDs.add(message.id)
    }
  }

  // `store.part` is a draft (forked by the caller); a published map throws on delete.
  for (const messageID of staleMessageIDs) {
    store.part?.delete(messageID)
  }

  const stalePartKeys: string[] = []
  for (const [key, parts] of store.part?.entries() ?? []) {
    if (!parts?.some((part) => stale.has((part as { sessionID?: string })?.sessionID ?? ""))) continue
    stalePartKeys.push(key)
  }
  for (const key of stalePartKeys) store.part.delete(key)

  for (const sessionID of stale) {
    delete store.message[sessionID]
    delete store.todo[sessionID]
    delete store.session_diff[sessionID]
    delete store.session_status[sessionID]
    delete store.permission[sessionID]
    delete store.question[sessionID]
  }
}

export function pickSessionCacheEvictions(input: {
  seen: Set<string>
  keep: string
  limit: number
  preserve?: Iterable<string>
}) {
  const stale: string[] = []
  const keep = new Set([input.keep, ...Array.from(input.preserve ?? [])])
  if (input.seen.has(input.keep)) input.seen.delete(input.keep)
  input.seen.add(input.keep)
  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) break
    if (keep.has(id)) continue
    stale.push(id)
  }
  for (const id of stale) {
    input.seen.delete(id)
  }
  return stale
}

/**
 * The seen sessions of a directory that may have their caches dropped, minus the ones that must keep
 * them: a session that is working, or that is waiting on an approval or a question, is blocked on a
 * dialog that lives in those caches, and the reconnect and poll candidates are derived from the same
 * slices — so dropping them leaves the dialog gone and the session showing nothing until the user
 * opens it again. The per-session eviction path already protects these ids; the directory-level path
 * that fires when the seen-directory LRU is over its limit did not.
 */
export const pickEvictableSeenSessionIds = (seen: Iterable<string>, preserve: ReadonlySet<string>): string[] =>
  [...seen].filter((sessionId) => !preserve.has(sessionId))
