import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import type { SessionMessageRecord } from "@/types/sessionMessages"
import { Binary } from "./binary"
import { getPartChanges } from "./part-changes"
import { getVisibleMessagesBeforeRevert } from "./revert-order"
import type { State } from "./types"

const EMPTY_MESSAGES: Message[] = []
const EMPTY_PARTS: Part[] = []

export type SessionMessageRecordsSnapshot = {
  sessionID: string
  sourceMessages: Message[]
  sourceParts: State["part"]
  visibleMessages: Message[]
  revertMessageID?: string
  suspendPartUpdates: boolean
  role?: "user"
  list: SessionMessageRecord[]
  indexById: Map<string, number>
}

export function getSessionRevertMessageID(state: State, sessionID: string): string | undefined {
  return Binary.find(state.session, sessionID, (session) => session.id)?.revert?.messageID
}

export function buildSessionMessageRecordsSnapshot(
  state: State,
  sessionID: string,
  previous?: SessionMessageRecordsSnapshot,
  suspendPartUpdates = false,
  role?: "user",
): SessionMessageRecordsSnapshot {
  if (previous?.sessionID !== sessionID || previous.role !== role) previous = undefined
  const sourceMessages = state.message[sessionID] ?? EMPTY_MESSAGES
  const revertMessageID = getSessionRevertMessageID(state, sessionID)
  if (
    previous &&
    previous.sourceMessages === sourceMessages &&
    previous.revertMessageID === revertMessageID &&
    previous.suspendPartUpdates === suspendPartUpdates
  ) {
    if (suspendPartUpdates || previous.sourceParts === state.part) return previous
    const changed = getPartChanges(previous.sourceParts, state.part)
    let list = previous.list
    const update = (index: number) => {
      const record = previous.list[index]
      const parts = state.part[record.info.id] ?? EMPTY_PARTS
      if (parts === record.parts) return
      if (list === previous.list) list = list.slice()
      list[index] = { info: record.info, parts }
    }
    if (changed && previous.indexById.size === list.length) {
      for (const id of changed) {
        const index = previous.indexById.get(id)
        if (index !== undefined) update(index)
      }
    } else {
      // Full snapshots and skipped intermediate publications have no usable hint.
      for (let index = 0; index < list.length; index++) update(index)
    }
    return { ...previous, sourceParts: state.part, list }
  }
  let visibleMessages = revertMessageID
    ? getVisibleMessagesBeforeRevert(sourceMessages, revertMessageID)
    : sourceMessages
  if (role) visibleMessages = visibleMessages.filter((message) => message.role === role)
  const indexById = new Map<string, number>()
  const list = visibleMessages.map((message, index) => {
    indexById.set(message.id, index)
    const oldIndex = previous?.indexById.get(message.id)
    const old = oldIndex === undefined ? undefined : previous?.list[oldIndex]
    const parts = suspendPartUpdates && old ? old.parts : (state.part[message.id] ?? EMPTY_PARTS)
    return old?.info === message && old.parts === parts ? old : { info: message, parts }
  })
  const sameList =
    previous && previous.list.length === list.length && list.every((record, i) => record === previous.list[i])
  return {
    sessionID,
    sourceMessages,
    sourceParts: state.part,
    visibleMessages,
    revertMessageID,
    suspendPartUpdates,
    role,
    list: sameList && previous ? previous.list : list,
    indexById,
  }
}
