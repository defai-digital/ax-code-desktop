import { isFullySyntheticMessage } from "@/lib/messages/synthetic"
import { isEmptyTextPart } from "../../message/partUtils"
import { isStandaloneTool } from "../../message/parts/toolRenderUtils"
import type { ChatMessageEntry, TurnRecord } from "./types"

/** A queued user message alone does not retire the previous turn. */
export function getTurnsWithLaterAssistant(
  turns: readonly Pick<TurnRecord, "turnId" | "assistantMessages">[],
): Set<string> {
  const retired = new Set<string>()
  let hasLaterAssistant = false
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (!turn) continue
    if (hasLaterAssistant) retired.add(turn.turnId)
    hasLaterAssistant ||= turn.assistantMessages.length > 0
  }
  return retired
}

const conversationRole = (message: ChatMessageEntry): string => {
  const role = (message.info as { clientRole?: string | null }).clientRole ?? message.info.role
  return typeof role === "string" ? role : ""
}

export function getLiveFinalMessage(messages: readonly ChatMessageEntry[]): ChatMessageEntry | undefined {
  // Compaction, synthetic prompts, and shell records can trail the answer.
  // Skip them, then accept only that last user or assistant record — an
  // earlier stop is not the answer while a later step is still working.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    const role = conversationRole(message)
    if (role !== "user" && role !== "assistant") continue
    if (isFullySyntheticMessage(message.parts)) continue
    if (role !== "assistant") return undefined
    const finish = (message.info as { finish?: unknown }).finish
    if (finish !== "stop") return undefined
    const hasText = message.parts.some((part) => part.type === "text" && !isEmptyTextPart(part))
    return hasText ? message : undefined
  }
  return undefined
}

/** Subagent calls do not count: a turn that only ran tasks gets no fold, so their rows stay in view. */
export function hasLiveActivity(turn: TurnRecord, showReasoning: boolean): boolean {
  return turn.activityParts.some((activity) => {
    if (showReasoning && activity.kind === "reasoning") return true
    return activity.part.type === "tool" && !isStandaloneTool(activity.part.tool)
  })
}
