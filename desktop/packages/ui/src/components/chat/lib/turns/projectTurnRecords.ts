import { projectTurnActivity } from "./projectTurnActivity"
import { projectTurnIndexes } from "./projectTurnIndexes"
import { projectTurnDiffStats, projectTurnSummary } from "./projectTurnSummary"
import type { ChatMessageEntry, TurnMessageRecord, TurnProjectionResult, TurnRecord, TurnStreamState } from "./types"

const resolveMessageRole = (message: ChatMessageEntry): string => {
  const role = (message.info as { clientRole?: string | null; role?: string | null }).clientRole ?? message.info.role
  return typeof role === "string" ? role : ""
}

const getMessageParentId = (message: ChatMessageEntry): string | undefined => {
  const parentId = (message.info as { parentID?: unknown }).parentID
  if (typeof parentId !== "string" || parentId.trim().length === 0) {
    return undefined
  }
  return parentId
}

const getMessageCreatedAt = (message: ChatMessageEntry): number | undefined => {
  const created = (message.info as { time?: { created?: unknown } }).time?.created
  return typeof created === "number" ? created : undefined
}

const getMessageCompletedAt = (message: ChatMessageEntry): number | undefined => {
  const completed = (message.info as { time?: { completed?: unknown } }).time?.completed
  return typeof completed === "number" ? completed : undefined
}

const getUserSummaryBody = (message: ChatMessageEntry): string | undefined => {
  const summaryBody = (message.info as { summary?: { body?: unknown } | null | undefined })?.summary?.body
  if (typeof summaryBody !== "string") {
    return undefined
  }

  const trimmed = summaryBody.trim()
  return trimmed.length > 0 ? summaryBody : undefined
}

const createTurnMessageRecord = (message: ChatMessageEntry, order: number): TurnMessageRecord => {
  const role = resolveMessageRole(message)
  return {
    messageId: message.info.id,
    role,
    parentMessageId: getMessageParentId(message),
    message,
    order,
  }
}

const buildTurnStreamState = (
  userMessage: ChatMessageEntry,
  assistantMessages: ChatMessageEntry[],
): TurnStreamState => {
  const startedAt = getMessageCreatedAt(userMessage)
  let completedAt: number | undefined
  let isStreaming = false

  assistantMessages.forEach((message) => {
    const completed = getMessageCompletedAt(message)
    if (typeof completed === "number") {
      completedAt = Math.max(completedAt ?? 0, completed)
    } else {
      isStreaming = true
    }
  })

  const durationMs =
    typeof startedAt === "number" && typeof completedAt === "number" && completedAt >= startedAt
      ? completedAt - startedAt
      : undefined

  return {
    isStreaming,
    isRetrying: assistantMessages.length > 1,
    startedAt,
    completedAt,
    durationMs,
  }
}

interface ProjectTurnRecordsOptions {
  previousProjection?: TurnProjectionResult | null
  showTextJustificationActivity: boolean
}

const DEFAULT_OPTIONS: ProjectTurnRecordsOptions = {
  previousProjection: null,
  showTextJustificationActivity: false,
}

const areSameMessageRefs = (left: ChatMessageEntry[], right: ChatMessageEntry[]): boolean => {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

const canReusePreviousTurn = (previous: TurnRecord, next: TurnRecord): boolean => {
  return (
    previous.userMessage === next.userMessage &&
    previous.headerMessageId === next.headerMessageId &&
    areSameMessageRefs(previous.assistantMessages, next.assistantMessages) &&
    previous.messages.length === next.messages.length &&
    previous.messages.every((message, index) => message.order === next.messages[index].order)
  )
}

const stabilizeTurnRecords = (turns: TurnRecord[], previousProjection?: TurnProjectionResult | null): TurnRecord[] => {
  if (!previousProjection || previousProjection.turns.length === 0 || turns.length === 0) {
    return turns
  }

  let canReuseTurnArray = previousProjection.turns.length === turns.length
  let reusedAnyTurn = false

  const nextTurns = turns.map((turn, index) => {
    const previousTurn = previousProjection.indexes.turnById.get(turn.turnId)
    if (previousTurn && canReusePreviousTurn(previousTurn, turn)) {
      reusedAnyTurn = true
      if (previousProjection.turns[index] !== previousTurn) {
        canReuseTurnArray = false
      }
      return previousTurn
    }

    canReuseTurnArray = false
    return turn
  })

  if (canReuseTurnArray && reusedAnyTurn) {
    return previousProjection.turns
  }

  return reusedAnyTurn ? nextTurns : turns
}

const deriveTurn = (turn: TurnRecord, showTextJustificationActivity: boolean): TurnRecord => {
  turn.summary = projectTurnSummary(turn.assistantMessages)
  turn.summaryText = turn.summary.text ?? getUserSummaryBody(turn.userMessage)
  turn.diffStats = projectTurnDiffStats(turn.userMessage)
  const activity = projectTurnActivity({
    turnId: turn.turnId,
    assistantMessages: turn.assistantMessages,
    summarySourceMessageId: turn.summary.sourceMessageId,
    summarySourcePartId: turn.summary.sourcePartId,
    showTextJustificationActivity,
  })
  turn.activityParts = activity.activityParts
  turn.activitySegments = activity.activitySegments
  turn.hasTools = activity.hasTools
  turn.hasReasoning = activity.hasReasoning
  turn.stream = buildTurnStreamState(turn.userMessage, turn.assistantMessages)
  turn.startedAt = turn.stream.startedAt
  turn.completedAt = turn.stream.completedAt
  turn.durationMs = turn.stream.durationMs
  return turn
}

type ProjectionSource = {
  messages: ChatMessageEntry[]
  uniqueIds: boolean
  turnPosition: Map<string, number>
}
const sourceByProjection = new WeakMap<TurnProjectionResult, ProjectionSource>()

// Immutable content updates cannot change grouping or index metadata. Check
// source identity and topology before allocating any replacement turn shells.
// Inserts, removals, reorders, reparenting and duplicate IDs use the full path.
const projectContentChanges = (
  messages: ChatMessageEntry[],
  previous: TurnProjectionResult,
): TurnProjectionResult | null => {
  const source = sourceByProjection.get(previous)
  if (!source?.uniqueIds || source.messages.length !== messages.length) return null
  const changedTurns = new Set<string>()
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    const old = source.messages[index]
    if (message === old) continue
    if (
      message.info.id !== old.info.id ||
      resolveMessageRole(message) !== resolveMessageRole(old) ||
      getMessageParentId(message) !== getMessageParentId(old)
    )
      return null
    const turnId = previous.indexes.messageToTurnId.get(message.info.id)
    if (turnId) changedTurns.add(turnId)
  }
  if (changedTurns.size === 0) {
    sourceByProjection.set(previous, { ...source, messages })
    return previous
  }
  const turns = previous.turns.slice()
  const turnById = new Map(previous.indexes.turnById)
  for (const turnId of changedTurns) {
    const old = turnById.get(turnId)!
    const records = old.messages.map((record) =>
      record.message === messages[record.order] ? record : { ...record, message: messages[record.order] },
    )
    const turn = deriveTurn(
      {
        ...old,
        messages: records,
        userMessage: records[0].message,
        assistantMessages: records.slice(1).map((record) => record.message),
      },
      previous.showTextJustificationActivity ?? false,
    )
    turns[source.turnPosition.get(turnId)!] = turn
    turnById.set(turnId, turn)
  }
  const result = { ...previous, turns, indexes: { ...previous.indexes, turnById } }
  sourceByProjection.set(result, { ...source, messages })
  return result
}

export const projectTurnRecords = (
  messages: ChatMessageEntry[],
  options?: Partial<ProjectTurnRecordsOptions>,
): TurnProjectionResult => {
  const effectiveOptions: ProjectTurnRecordsOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  const previousProjection =
    effectiveOptions.previousProjection?.showTextJustificationActivity ===
    effectiveOptions.showTextJustificationActivity
      ? effectiveOptions.previousProjection
      : null
  if (previousProjection) {
    const incremental = projectContentChanges(messages, previousProjection)
    if (incremental) return incremental
  }

  const turns: TurnRecord[] = []
  const turnByUserId = new Map<string, TurnRecord>()
  const groupedMessageIds = new Set<string>()

  messages.forEach((message, index) => {
    const role = resolveMessageRole(message)
    if (role !== "user") {
      return
    }

    const turnId = message.info.id
    const turn: TurnRecord = {
      turnId,
      userMessageId: message.info.id,
      userMessage: message,
      headerMessageId: undefined,
      messages: [createTurnMessageRecord(message, index)],
      assistantMessageIds: [],
      assistantMessages: [],
      activityParts: [],
      activitySegments: [],
      summary: {},
      summaryText: undefined,
      hasTools: false,
      hasReasoning: false,
      diffStats: undefined,
      stream: {
        isStreaming: false,
        isRetrying: false,
      },
    }
    turns.push(turn)
    turnByUserId.set(turn.userMessageId, turn)
    groupedMessageIds.add(message.info.id)
  })

  messages.forEach((message, index) => {
    const role = resolveMessageRole(message)
    if (role !== "assistant") {
      return
    }

    const parentId = getMessageParentId(message)
    const targetTurn = parentId ? turnByUserId.get(parentId) : undefined
    if (!targetTurn) {
      return
    }

    targetTurn.assistantMessages.push(message)
    targetTurn.assistantMessageIds.push(message.info.id)
    targetTurn.messages.push(createTurnMessageRecord(message, index))
    if (!targetTurn.headerMessageId) {
      targetTurn.headerMessageId = message.info.id
    }
    groupedMessageIds.add(message.info.id)
  })

  turns.forEach((turn, index) => {
    const previousTurn = previousProjection?.indexes.turnById.get(turn.turnId)
    if (previousTurn && canReusePreviousTurn(previousTurn, turn)) {
      turns[index] = previousTurn
      return
    }
    deriveTurn(turn, effectiveOptions.showTextJustificationActivity)
  })

  const stableTurns = stabilizeTurnRecords(turns, previousProjection)
  const projection = projectTurnIndexes(stableTurns)
  const ungroupedMessageIds = new Set<string>()
  messages.forEach((message) => {
    if (resolveMessageRole(message) === "assistant") {
      return
    }
    if (!groupedMessageIds.has(message.info.id)) {
      ungroupedMessageIds.add(message.info.id)
    }
  })

  const result = {
    ...projection,
    showTextJustificationActivity: effectiveOptions.showTextJustificationActivity,
    ungroupedMessageIds,
  }
  sourceByProjection.set(result, {
    messages,
    uniqueIds: new Set(messages.map((message) => message.info.id)).size === messages.length,
    turnPosition: new Map(stableTurns.map((turn, index) => [turn.turnId, index])),
  })
  return result
}
