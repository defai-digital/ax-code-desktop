import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { mergeMessages, keepCompletedMessageOnMerge } from "./optimistic"
import { shouldPreserveExistingPart } from "./event-reducer"
import { compareIds, sortPartsById } from "./part-ordering"
import type { PartMap } from "./part-map"

const STREAMING_PART_FIELDS = ["text", "output"] as const

type MaterializedMessageRecord = {
  info: Message
  parts: Part[]
}

type MaterializedState = {
  message: Record<string, Message[]>
  part: PartMap
}

type MaterializeSessionSnapshotsOptions = {
  skipPartTypes?: ReadonlySet<string>
  mode?: "merge" | "prepend"
  before?: MaterializedState
}

type MaterializeSessionSnapshotsResult = {
  message: Record<string, Message[]>
  part: PartMap
  messages: Message[]
  messagesChanged: boolean
  partsChanged: boolean
}

type SessionMaterializationStatus = {
  hasMessages: boolean
  renderable: boolean
  missingPartMessageIDs: string[]
}

function partSnapshotKey(part: Part): string {
  return JSON.stringify(part)
}

function haveEquivalentPartSnapshots(left: Part[] | undefined, right: Part[]): boolean {
  if (!left) return right.length === 0
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (!leftPart || !rightPart) return false
    if (leftPart.id !== rightPart.id) return false
    if (partSnapshotKey(leftPart) !== partSnapshotKey(rightPart)) return false
  }

  return true
}

function getPartEndTime(part: Part): number | undefined {
  const stateEnd = (part as { state?: { time?: { end?: unknown } } }).state?.time?.end
  if (typeof stateEnd === "number") {
    return stateEnd
  }

  const timeEnd = (part as { time?: { end?: unknown } }).time?.end
  return typeof timeEnd === "number" ? timeEnd : undefined
}

function getPartStartTime(part: Part): number | undefined {
  const stateStart = (part as { state?: { time?: { start?: unknown } } }).state?.time?.start
  if (typeof stateStart === "number") {
    return stateStart
  }

  const timeStart = (part as { time?: { start?: unknown } }).time?.start
  return typeof timeStart === "number" ? timeStart : undefined
}

function getValidPartEndTime(part: Part): number | undefined {
  const endTime = getPartEndTime(part)
  if (typeof endTime !== "number") return undefined

  const startTime = getPartStartTime(part)
  if (typeof startTime === "number" && endTime < startTime) return undefined

  return endTime
}

function getStringField(part: Part, field: "text" | "output"): string | undefined {
  const value = (part as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

function hasLiveStreamingField(part: Part): boolean {
  if (getValidPartEndTime(part) !== undefined) return false
  return STREAMING_PART_FIELDS.some((field) => {
    const value = getStringField(part, field)
    return typeof value === "string" && value.length > 0
  })
}

const UNSETTLED_TOOL_STATUSES = new Set(["pending", "running", "started"])

const getCompletedAt = (info: MaterializedMessageRecord["info"]): number | undefined => {
  const completed = (info as { time?: { completed?: unknown } }).time?.completed
  return typeof completed === "number" && Number.isFinite(completed) ? completed : undefined
}

/**
 * Mark tool parts a completed message left running as aborted.
 *
 * The runtime persists a tool part as `pending`/`running` while it works, and an interrupted or
 * killed turn never rewrites it. The assistant message it belongs to is complete, so no further
 * event will settle it: every later load restored the card in its active state, with a running
 * timer, holding the message open.
 */
function finalizeUnsettledToolParts(parts: Part[], completedAt: number | undefined): Part[] {
  if (completedAt === undefined) return parts

  let changed = false
  const finalized = parts.map((part) => {
    if ((part as { type?: unknown }).type !== "tool") return part
    const state = (part as { state?: Record<string, unknown> }).state
    const status = typeof state?.status === "string" ? state.status : undefined
    if (!status || !UNSETTLED_TOOL_STATUSES.has(status)) return part

    changed = true
    const time = (state?.time as { start?: unknown } | undefined) ?? undefined
    const start = typeof time?.start === "number" ? time.start : completedAt
    return {
      ...part,
      state: { ...state, status: "aborted", time: { start, end: completedAt } },
    } as unknown as Part
  })

  return changed ? finalized : parts
}

// The reducer marks a part whose snapshot text extends the live text, so the next delta may drop the
// overlap it re-sends. That mark describes the *next* delta, so it must survive a merge that replaces
// the part object — dropping it lets a re-sent overlap append twice.
function carryDedupeMarker(existing: Part | undefined, part: Part): Part {
  const fields = (existing as { __dedupeNextDeltaFields?: string[] } | undefined)?.__dedupeNextDeltaFields
  if (!Array.isArray(fields) || fields.length === 0) return part
  return { ...part, __dedupeNextDeltaFields: fields } as unknown as Part
}

function mergeMaterializedPart(existing: Part | undefined, next: Part): Part {
  if (!existing) return carryDedupeMarker(existing, next)
  // The reducer's "final tool beats a non-final update" rule applies here too:
  // an older HTTP snapshot fetched before the completion event must not
  // downgrade a settled tool part back to running — no further part event is
  // sent for it, so the card would keep a live timer until the next snapshot.
  if (shouldPreserveExistingPart(existing, next)) return existing
  if (getValidPartEndTime(next) !== undefined) return carryDedupeMarker(existing, next)

  let merged: Part = next
  for (const field of STREAMING_PART_FIELDS) {
    const existingValue = getStringField(existing, field)
    if (!existingValue) continue

    const nextValue = getStringField(next, field)
    if (typeof nextValue === "string" && nextValue.length >= existingValue.length) continue
    if (typeof nextValue === "string" && nextValue.length > 0 && !existingValue.startsWith(nextValue)) continue

    if (merged === next) merged = { ...next }
    const mergedRecord = merged as Record<string, unknown>
    mergedRecord[field] = existingValue
  }

  return carryDedupeMarker(existing, merged)
}

function mergeMaterializedParts(
  existing: Part[] | undefined,
  nextParts: Part[],
  skipPartTypes: ReadonlySet<string>,
  preserveLiveStreamingParts: boolean,
): Part[] {
  if (!existing || existing.length === 0) return nextParts
  if (!preserveLiveStreamingParts) return nextParts

  const existingByID = new Map(existing.map((part) => [part.id, part]))
  let mergedParts = nextParts
  let changed = false

  for (let index = 0; index < nextParts.length; index += 1) {
    const nextPart = nextParts[index]
    const mergedPart = mergeMaterializedPart(existingByID.get(nextPart.id), nextPart)
    if (mergedPart === nextPart) continue
    if (!changed) mergedParts = [...nextParts]
    mergedParts[index] = mergedPart
    changed = true
  }

  const snapshotIDs = new Set(nextParts.map((part) => part.id))
  const missingLiveParts = existing.filter(
    (part) => !!part?.id && !snapshotIDs.has(part.id) && !skipPartTypes.has(part.type) && hasLiveStreamingField(part),
  )
  if (missingLiveParts.length === 0) return mergedParts

  return [...mergedParts, ...missingLiveParts].sort((a, b) => compareIds(a.id, b.id))
}

export function materializeSessionSnapshots(
  state: MaterializedState,
  sessionID: string,
  records: MaterializedMessageRecord[],
  options: MaterializeSessionSnapshotsOptions = {},
): MaterializeSessionSnapshotsResult {
  const skipPartTypes = options.skipPartTypes ?? new Set<string>()
  const beforeMessages = options.before
    ? new Map((options.before.message[sessionID] ?? []).map((message) => [message.id, message]))
    : undefined
  const currentByID = new Map((state.message[sessionID] ?? []).map((message) => [message.id, message]))
  const snapshots = records
    .filter((record) => {
      if (!record?.info?.id) return false
      const id = record.info.id
      // A message removed by a live event while this snapshot was in flight must stay removed.
      if (beforeMessages?.has(id) && !currentByID.has(id)) return false
      return true
    })
    .sort((left, right) => compareIds(left.info.id, right.info.id))
  const nextMessages = snapshots.map((record) => record.info)
  const currentMessages = state.message[sessionID] ?? []
  const messages = mergeMessages(currentMessages, nextMessages, keepCompletedMessageOnMerge)
  const messagesChanged = messages !== currentMessages

  let partsChanged = false
  const nextPartState = state.part.fork()
  const isPrepend = options.mode === "prepend"

  for (const record of snapshots) {
    const messageID = record.info.id
    if (isPrepend && nextPartState.has(messageID)) continue

    const isAssistant = record.info.role === "assistant"
    // A tool part the runtime persisted while it was running, in a message that is already
    // complete, has nobody left to settle it: every later load restored it as live, so its card
    // kept a running timer and held the message open until the view was thrown away.
    const completedAt = isAssistant ? getCompletedAt(record.info) : undefined
    const existing = nextPartState.get(messageID)
    const beforeParts = options.before?.part.get(messageID)
    const beforePartIDs = options.before ? new Set((beforeParts ?? []).map((part) => part.id)) : undefined
    const currentPartIDs = new Set((existing ?? []).map((part) => part.id))
    // Membership changes during the request belong to live events. Other parts keep the normal
    // snapshot/streaming merge rules, so deltas never prevent a gap-lost part from being repaired.
    const snapshotParts = sortPartsById(record.parts ?? [], skipPartTypes).filter(
      (part) => !beforePartIDs?.has(part.id) || currentPartIDs.has(part.id),
    )
    const snapshotPartIDs = new Set(snapshotParts.map((part) => part.id))
    const liveAddedParts = beforePartIDs
      ? (existing ?? []).filter(
        (part) => !beforePartIDs.has(part.id) && !snapshotPartIDs.has(part.id) && !skipPartTypes.has(part.type),
      )
      : []
    const mergedParts = mergeMaterializedParts(
      existing,
      sortPartsById([...snapshotParts, ...liveAddedParts], skipPartTypes),
      skipPartTypes,
      isAssistant,
    )
    const nextParts = finalizeUnsettledToolParts(mergedParts, completedAt)
    // For non-assistant messages an empty snapshot keeps the old "absent"
    // representation; only assistant messages need the explicit [] marker
    // (getSessionMaterializationStatus checks only assistant messages).
    const equivalent = existing
      ? haveEquivalentPartSnapshots(existing, nextParts)
      : nextParts.length === 0 && !isAssistant
    if (equivalent) continue

    if (nextParts.length === 0 && !isAssistant) {
      nextPartState.delete(messageID)
    } else {
      // Store fetched-empty as an explicit [] (not absence): an assistant message the
      // server returned with zero parts (e.g. aborted before any output) is
      // authoritatively empty and must count as renderable, or the ensure-renderable
      // callers retry the sync forever.
      nextPartState.set(messageID, nextParts)
    }
    partsChanged = true
  }

  return {
    message: messagesChanged ? { ...state.message, [sessionID]: messages } : state.message,
    part: partsChanged ? nextPartState.seal() : state.part,
    messages,
    messagesChanged,
    partsChanged,
  }
}

export function getSessionMaterializationStatus(
  state: MaterializedState,
  sessionID: string,
): SessionMaterializationStatus {
  const messages = state.message[sessionID]
  if (!messages) {
    return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  }

  const missingPartMessageIDs: string[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    // `undefined` = parts never fetched (not renderable yet). An explicit [] is a
    // fetched-empty snapshot (e.g. aborted assistant turn) and counts as renderable —
    // otherwise sessions containing such a message can never reach renderable state
    // and ensure-renderable callers loop forever.
    const parts = state.part.get(message.id)
    if (!parts) {
      missingPartMessageIDs.push(message.id)
    }
  }

  return {
    hasMessages: true,
    renderable: missingPartMessageIDs.length === 0,
    missingPartMessageIDs,
  }
}
