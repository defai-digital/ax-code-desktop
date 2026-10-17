import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { Binary } from "./binary"
import { areMessagesEqual } from "./event-reducer"
import { compareIds, sortPartsById } from "./part-ordering"
export type OptimisticItem = {
  message: Message
  parts: Part[]
}
type MessagePage = {
  session: Message[]
  part: { id: string; part: Part[] }[]
  cursor?: string
  complete: boolean
}

const mergeParts = (parts: Part[] | undefined, want: Part[]) => {
  if (!parts) return sortPartsById(want)
  const next = [...parts]
  let changed = false
  for (const part of want) {
    const result = Binary.search(next, part.id, (item) => item.id)
    if (result.found) continue
    next.splice(result.index, 0, part)
    changed = true
  }
  if (!changed) return parts
  return next
}

export function mergeOptimisticPage(page: MessagePage, items: OptimisticItem[]) {
  if (items.length === 0) return { ...page, confirmed: [] as string[] }

  const session = [...page.session]
  const part = new Map(page.part.map((item) => [item.id, sortPartsById(item.part)]))
  const confirmed: string[] = []

  for (const item of items) {
    const result = Binary.search(session, item.message.id, (message) => message.id)
    const found = result.found
    if (!found) session.splice(result.index, 0, item.message)

    const current = part.get(item.message.id)
    // The server echoes the user message with its own server-minted part ids, so the
    // client-minted optimistic part ids never appear in a fetched page. Requiring them
    // kept every sent message in the shadow map forever and re-spliced its stale parts
    // into each later page load, rendering the prompt text twice. Server parts for the
    // message prove the echo landed; an empty entry means they are still on the way.
    if (found && current && current.length > 0) {
      confirmed.push(item.message.id)
      continue
    }

    part.set(item.message.id, mergeParts(current, item.parts))
  }

  return {
    cursor: page.cursor,
    complete: page.complete,
    session,
    part: [...part.entries()].sort((a, b) => compareIds(a[0], b[0])).map(([id, part]) => ({ id, part })),
    confirmed,
  }
}

/** Merge two sorted message arrays by id, deduplicating.
 *  Preserves references from `a` for items that already exist — avoids
 *  unnecessary React re-renders when prepending older history.
 *
 *  When `isEqual` is supplied, an incoming item whose id already exists but
 *  whose content differs REPLACES the existing one. This is required for
 *  authoritative snapshot reconciliation (reconnect / refetch): a message that
 *  changed server-side while disconnected (e.g. an assistant reply that
 *  completed — gained `time.completed`/finish/tokens) must overwrite the stale
 *  in-progress copy. Without a predicate the merge stays add-only. */
export function mergeMessages<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[],
  isEqual?: (existing: T, incoming: T) => boolean,
) {
  const existing = new Map(a.map((item) => [item.id, item] as const))
  let changed = false
  for (const item of b) {
    const prev = existing.get(item.id)
    if (!prev) {
      existing.set(item.id, item)
      changed = true
    } else if (isEqual && !isEqual(prev, item)) {
      existing.set(item.id, item)
      changed = true
    }
  }
  if (!changed) return a as T[]
  return [...existing.values()].sort((x, y) => compareIds(x.id, y.id))
}

/**
 * A stale page must not downgrade a completed message to in-progress: a
 * snapshot fetched before the completion event carries no `time.completed`,
 * and replacing the live copy re-opens the finished reply (and, through
 * `hasCompletedAssistantReply`, protects the session from cache eviction
 * forever). Only that direction is blocked — a completed incoming copy must
 * still replace a live in-progress one.
 */
export const keepCompletedMessageOnMerge = (existing: Message, incoming: Message): boolean => {
  const existingCompleted = (existing as { time?: { completed?: unknown } }).time?.completed
  if (typeof existingCompleted === "number" && Number.isFinite(existingCompleted)) {
    const incomingCompleted = (incoming as { time?: { completed?: unknown } }).time?.completed
    if (typeof incomingCompleted !== "number" || !Number.isFinite(incomingCompleted)) {
      return true
    }
  }
  return areMessagesEqual(existing, incoming)
}

/**
 * A fetched page of a child session merged into what its store already holds.
 *
 * The reads that feed it are bounded — 500 messages on the first one, 160 while the task runs, 80 while it is idle
 * — so assigning the page dropped every message before it, and the task record and the child session's own view
 * read that array. `mergeMessages` keeps the ids the page does not carry, and with `areMessagesEqual` a page copy
 * that changed (a reply that completed while the poll ran) still replaces the stale one.
 */
export const mergeChildSessionMessages = (
  existing: readonly Message[] | undefined,
  page: readonly Message[],
): Message[] => mergeMessages(existing ?? [], page, keepCompletedMessageOnMerge)
