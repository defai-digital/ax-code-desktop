import { getMessagePartText } from "@/lib/messagePartFields"
import type { ChatMessageEntry, TurnDiffStats, TurnSummaryRecord } from "./types"

interface SummaryDiff {
  additions?: number | null
  deletions?: number | null
}

interface UserSummaryPayload {
  body?: string | null
  diffs?: SummaryDiff[] | null
}

export const projectTurnSummary = (assistantMessages: ChatMessageEntry[]): TurnSummaryRecord => {
  for (let messageIndex = assistantMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const assistantMessage = assistantMessages[messageIndex]
    if (!assistantMessage) continue

    const finish = (assistantMessage.info as { finish?: string | null }).finish
    if (finish !== "stop") continue

    for (let partIndex = assistantMessage.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = assistantMessage.parts[partIndex]
      if (!part || part.type !== "text") continue

      const text = getMessagePartText(part)
      if (!text) continue

      return {
        text,
        sourceMessageId: assistantMessage.info.id,
        sourcePartId: part.id ?? `${assistantMessage.info.id}-part-${partIndex}-text`,
      }
    }
  }

  for (let messageIndex = assistantMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const assistantMessage = assistantMessages[messageIndex]
    if (!assistantMessage) continue

    for (let partIndex = assistantMessage.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = assistantMessage.parts[partIndex]
      if (!part || part.type !== "text") continue

      const text = getMessagePartText(part)
      if (!text) continue

      return {
        text,
        sourceMessageId: assistantMessage.info.id,
        sourcePartId: part.id ?? `${assistantMessage.info.id}-part-${partIndex}-text`,
      }
    }
  }

  return {}
}

export const projectTurnDiffStats = (userMessage: ChatMessageEntry): TurnDiffStats | undefined => {
  const summary = (userMessage.info as { summary?: UserSummaryPayload | null }).summary
  const diffs = summary?.diffs
  if (!Array.isArray(diffs) || diffs.length === 0) {
    return undefined
  }

  let additions = 0
  let deletions = 0
  let files = 0

  diffs.forEach((diff) => {
    if (!diff) return

    const diffAdditions = typeof diff.additions === "number" ? diff.additions : 0
    const diffDeletions = typeof diff.deletions === "number" ? diff.deletions : 0

    if (diffAdditions !== 0 || diffDeletions !== 0) {
      files += 1
    }

    additions += diffAdditions
    deletions += diffDeletions
  })

  if (files === 0) {
    return undefined
  }

  return {
    additions,
    deletions,
    files,
  }
}
