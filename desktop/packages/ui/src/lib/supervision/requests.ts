import type { PendingRequestEntry } from "@/sync/sync-context"

/** A question can be answered inline when it is one single-choice prompt with options. */
export function isInlineAnswerableQuestion(entry: PendingRequestEntry): boolean {
  if (entry.kind !== "question") return false
  const questions = entry.request.questions ?? []
  return questions.length === 1 && !questions[0].multiple && (questions[0].options?.length ?? 0) > 0
}

/** Requests for one root session and its subagents, permissions first, oldest first inside each kind. */
export function requestsForSessionTree(
  entries: readonly PendingRequestEntry[],
  sessionIds: ReadonlySet<string>,
): PendingRequestEntry[] {
  return entries.filter((entry) => sessionIds.has(entry.sessionId))
}
