import type { Part } from "@defai-digital/ax-code-sdk/v2"
import { filterSyntheticParts } from "@/lib/messages/synthetic"
import { normalizeParts } from "../../message/partUtils"
import type { ChatMessageEntry } from "./types"

const USER_SHELL_MARKER = "The following tool was executed by the user"

export const resolveMessageRole = (message: ChatMessageEntry): string | null => {
  const info = message.info as unknown as { clientRole?: string | null | undefined; role?: string | null | undefined }
  return (
    (typeof info.clientRole === "string" ? info.clientRole : null) ??
    (typeof info.role === "string" ? info.role : null) ??
    null
  )
}

const hasCompactionPart = (message: ChatMessageEntry): boolean => {
  return message.parts.some((part) => {
    const type = (part as { type?: unknown } | null | undefined)?.type
    return type === "compaction"
  })
}

const getPartText = (part: Part): string => {
  const text = (part as { text?: unknown }).text
  if (typeof text === "string") {
    return text
  }
  const content = (part as { content?: unknown }).content
  if (typeof content === "string") {
    return content
  }
  return ""
}

const normalizeCompactionCommandMessage = (message: ChatMessageEntry): ChatMessageEntry => {
  if (!hasCompactionPart(message)) {
    return message
  }

  let changedParts = false
  const nextParts = message.parts.map((part) => {
    const type = (part as { type?: unknown } | null | undefined)?.type
    if (type !== "compaction") {
      return part
    }
    changedParts = true
    return { type: "text", text: "/compact" } as Part
  })

  const info = message.info as unknown as { clientRole?: string | null | undefined }
  const needsClientRole = info.clientRole !== "user"

  if (!changedParts && !needsClientRole) {
    return message
  }

  return {
    ...message,
    info: needsClientRole
      ? ({
          ...(message.info as unknown as Record<string, unknown>),
          clientRole: "user",
        } as unknown as typeof message.info)
      : message.info,
    parts: changedParts ? nextParts : message.parts,
  }
}

const normalizeCompactionSummaryMessage = (
  message: ChatMessageEntry,
  compactionCommandIds: Set<string>,
): ChatMessageEntry => {
  const role = resolveMessageRole(message)
  if (role !== "system") {
    return message
  }

  const parentID = getMessageParentId(message)
  if (!parentID || !compactionCommandIds.has(parentID)) {
    return message
  }

  const info = message.info as unknown as { clientRole?: string | null | undefined }
  if (info.clientRole === "assistant") {
    return message
  }

  return {
    ...message,
    info: {
      ...(message.info as unknown as Record<string, unknown>),
      clientRole: "assistant",
    } as unknown as typeof message.info,
  }
}

const isUserSubtaskMessage = (message: ChatMessageEntry | undefined): boolean => {
  if (!message) return false
  if (resolveMessageRole(message) !== "user") return false
  return message.parts.some((part) => part?.type === "subtask")
}

const getMessageId = (message: ChatMessageEntry | undefined): string | null => {
  if (!message) return null
  const id = (message.info as unknown as { id?: unknown }).id
  return typeof id === "string" && id.trim().length > 0 ? id : null
}

const getMessageParentId = (message: ChatMessageEntry): string | null => {
  const parentID = (message.info as unknown as { parentID?: unknown }).parentID
  return typeof parentID === "string" && parentID.trim().length > 0 ? parentID : null
}

const isUserShellMarkerMessage = (message: ChatMessageEntry | undefined): boolean => {
  if (!message) return false
  if (resolveMessageRole(message) !== "user") return false

  return message.parts.some((part) => {
    if (part?.type !== "text") return false
    const text = (part as unknown as { text?: unknown }).text
    const synthetic = (part as unknown as { synthetic?: unknown }).synthetic
    return synthetic === true && typeof text === "string" && text.trim().startsWith(USER_SHELL_MARKER)
  })
}

type ShellBridgeDetails = {
  command?: string
  output?: string
  status?: string
}

const getShellBridgeAssistantDetails = (
  message: ChatMessageEntry,
  expectedParentId: string | null,
): { hide: boolean; details: ShellBridgeDetails | null } => {
  if (resolveMessageRole(message) !== "assistant") {
    return { hide: false, details: null }
  }

  if (expectedParentId && getMessageParentId(message) !== expectedParentId) {
    return { hide: false, details: null }
  }

  if (message.parts.length !== 1) {
    return { hide: false, details: null }
  }

  const part = message.parts[0] as unknown as {
    type?: unknown
    tool?: unknown
    state?: {
      status?: unknown
      input?: { command?: unknown }
      output?: unknown
      metadata?: { output?: unknown }
    }
  }

  if (part?.type !== "tool") {
    return { hide: false, details: null }
  }

  const toolName = typeof part.tool === "string" ? part.tool.toLowerCase() : ""
  if (toolName !== "bash") {
    return { hide: false, details: null }
  }

  const command = typeof part.state?.input?.command === "string" ? part.state.input.command : undefined
  const output =
    (typeof part.state?.output === "string" ? part.state.output : undefined) ??
    (typeof part.state?.metadata?.output === "string" ? part.state.metadata.output : undefined)
  const status = typeof part.state?.status === "string" ? part.state.status : undefined

  return {
    hide: true,
    details: {
      command,
      output,
      status,
    },
  }
}

const readTaskSessionId = (toolPart: Part): string | null => {
  const partRecord = toolPart as unknown as {
    state?: {
      metadata?: {
        sessionId?: unknown
        sessionID?: unknown
      }
      output?: unknown
    }
  }
  const metadata = partRecord.state?.metadata
  const fromMetadata =
    (typeof metadata?.sessionID === "string" && metadata.sessionID.trim().length > 0
      ? metadata.sessionID.trim()
      : null) ??
    (typeof metadata?.sessionId === "string" && metadata.sessionId.trim().length > 0 ? metadata.sessionId.trim() : null)
  if (fromMetadata) return fromMetadata

  const output = partRecord.state?.output
  if (typeof output === "string") {
    const match = output.match(/task_id\s*:\s*([^\s<"']+)/i)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

const isSyntheticSubtaskBridgeAssistant = (
  message: ChatMessageEntry,
): { hide: boolean; taskSessionId: string | null } => {
  if (resolveMessageRole(message) !== "assistant") {
    return { hide: false, taskSessionId: null }
  }

  if (message.parts.length !== 1) {
    return { hide: false, taskSessionId: null }
  }

  const onlyPart = message.parts[0] as unknown as
    | {
        type?: unknown
        tool?: unknown
      }
    | null
    | undefined

  if (onlyPart?.type !== "tool") {
    return { hide: false, taskSessionId: null }
  }

  const toolName = typeof onlyPart.tool === "string" ? onlyPart.tool.toLowerCase() : ""
  if (toolName !== "task") {
    return { hide: false, taskSessionId: null }
  }

  return {
    hide: true,
    taskSessionId: readTaskSessionId(message.parts[0]),
  }
}

const withSubtaskSessionId = (message: ChatMessageEntry, taskSessionId: string | null): ChatMessageEntry => {
  if (!taskSessionId) return message
  const nextParts = message.parts.map((part) => {
    if (part?.type !== "subtask") return part
    const existing = (part as unknown as { taskSessionID?: unknown }).taskSessionID
    if (typeof existing === "string" && existing.trim().length > 0) return part
    return {
      ...part,
      taskSessionID: taskSessionId,
    } as Part
  })

  return {
    ...message,
    parts: nextParts,
  }
}

const withShellBridgeDetails = (message: ChatMessageEntry, details: ShellBridgeDetails | null): ChatMessageEntry => {
  const command = typeof details?.command === "string" ? details.command.trim() : ""
  const output = typeof details?.output === "string" ? details.output : ""
  const status = typeof details?.status === "string" ? details.status.trim() : ""

  const nextParts: Part[] = []
  let injected = false

  for (const part of message.parts) {
    if (!injected && part?.type === "text") {
      const text = (part as unknown as { text?: unknown }).text
      const synthetic = (part as unknown as { synthetic?: unknown }).synthetic
      if (synthetic === true && typeof text === "string" && text.trim().startsWith(USER_SHELL_MARKER)) {
        nextParts.push({
          type: "text",
          text: "/shell",
          shellAction: {
            ...(command ? { command } : {}),
            ...(output ? { output } : {}),
            ...(status ? { status } : {}),
          },
        } as unknown as Part)
        injected = true
        continue
      }
    }
    nextParts.push(part)
  }

  if (!injected) {
    nextParts.push({
      type: "text",
      text: "/shell",
      shellAction: {
        ...(command ? { command } : {}),
        ...(output ? { output } : {}),
        ...(status ? { status } : {}),
      },
    } as unknown as Part)
  }

  return {
    ...message,
    parts: nextParts,
  }
}

const normalizeMessageParts = (message: ChatMessageEntry): ChatMessageEntry => {
  const parts = normalizeParts(message.parts)
  if (parts.length === message.parts.length) {
    return message
  }
  return {
    ...message,
    parts,
  }
}

const normalizedMessageBySource = new WeakMap<ChatMessageEntry, ChatMessageEntry>()
const compactionCommandBySource = new WeakMap<ChatMessageEntry, boolean>()

const isCompactionCommandForDisplay = (message: ChatMessageEntry): boolean => {
  const cached = compactionCommandBySource.get(message)
  if (cached !== undefined) return cached
  const result =
    hasCompactionPart(message) ||
    message.parts.some((part) => part.type === "text" && getPartText(part).trim() === "/compact")
  compactionCommandBySource.set(message, result)
  return result
}

const getNormalizedMessageForDisplay = (message: ChatMessageEntry): ChatMessageEntry => {
  const cached = normalizedMessageBySource.get(message)
  if (cached) {
    return cached
  }

  const normalizedPartMessage = normalizeMessageParts(message)
  const normalizedCompactionMessage = normalizeCompactionCommandMessage(normalizedPartMessage)
  const filteredParts = filterSyntheticParts(normalizedCompactionMessage.parts)
  const normalized =
    filteredParts === normalizedCompactionMessage.parts
      ? normalizedCompactionMessage
      : {
          ...normalizedCompactionMessage,
          parts: filteredParts,
        }

  normalizedMessageBySource.set(message, normalized)
  return normalized
}

// Full projection remains the fallback for structural and bridge changes.
export const projectDisplayMessages = (messages: ChatMessageEntry[]): ChatMessageEntry[] => {
  const seenIdsFromTail = new Set<string>()
  const dedupedMessages: ChatMessageEntry[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const messageId = message.info?.id
    if (typeof messageId === "string") {
      if (seenIdsFromTail.has(messageId)) {
        continue
      }
      seenIdsFromTail.add(messageId)
    }
    dedupedMessages.push(getNormalizedMessageForDisplay(message))
  }
  dedupedMessages.reverse()

  const output: ChatMessageEntry[] = []
  const compactionCommandIds = new Set<string>()
  for (let index = 0; index < dedupedMessages.length; index += 1) {
    const current = dedupedMessages[index]
    const currentWithRole = normalizeCompactionSummaryMessage(current, compactionCommandIds)
    if (isCompactionCommandForDisplay(current)) {
      compactionCommandIds.add(current.info.id)
    }
    const previous = output.length > 0 ? output[output.length - 1] : undefined

    if (isUserSubtaskMessage(previous)) {
      const bridge = isSyntheticSubtaskBridgeAssistant(currentWithRole)
      if (bridge.hide) {
        output[output.length - 1] = withSubtaskSessionId(previous as ChatMessageEntry, bridge.taskSessionId)
        continue
      }
    }

    if (isUserShellMarkerMessage(previous)) {
      const bridge = getShellBridgeAssistantDetails(currentWithRole, getMessageId(previous))
      if (bridge.hide) {
        output[output.length - 1] = withShellBridgeDetails(previous as ChatMessageEntry, bridge.details)
        continue
      }
    }

    output.push(currentWithRole)
  }

  return output
}

/** One mounted list retains one source/result pair, not a transcript-wide cache. */
export const createDisplayMessageProjector = () => {
  let previous: { messages: ChatMessageEntry[]; output: ChatMessageEntry[]; uniqueIds: boolean } | null = null
  return (messages: ChatMessageEntry[]): ChatMessageEntry[] => {
    const cached = previous
    if (cached?.uniqueIds && messages.length > 0 && messages.length === cached.messages.length) {
      let samePrefix = true
      for (let index = 0; index < messages.length - 1; index++) {
        if (messages[index] !== cached.messages[index]) {
          samePrefix = false
          break
        }
      }
      if (samePrefix) {
        const oldTail = cached.messages[cached.messages.length - 1]
        const tail = messages[messages.length - 1]
        if (tail === oldTail) return cached.output
        const normalized = getNormalizedMessageForDisplay(tail)
        const preceding = cached.output[cached.output.length - 2]
        // A bridge can rewrite its preceding user message; a compaction summary
        // can change role based on earlier commands. Those use the full path.
        if (
          tail.info.id === oldTail.info.id &&
          getMessageParentId(tail) === getMessageParentId(oldTail) &&
          resolveMessageRole(normalized) === "assistant" &&
          resolveMessageRole(oldTail) === "assistant" &&
          cached.output[cached.output.length - 1] === getNormalizedMessageForDisplay(oldTail) &&
          !isUserSubtaskMessage(preceding) &&
          !isUserShellMarkerMessage(preceding)
        ) {
          const output = cached.output.slice()
          output[output.length - 1] = normalized
          previous = { ...cached, messages, output }
          return output
        }
      }
    }
    const output = projectDisplayMessages(messages)
    previous = {
      messages,
      output,
      uniqueIds: new Set(messages.map((message) => message.info.id)).size === messages.length,
    }
    return output
  }
}
