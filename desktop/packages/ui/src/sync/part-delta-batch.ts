import type { Event } from "@defai-digital/ax-code-sdk/v2/client"
import { applyDirectoryEvent } from "./event-reducer"
import { recordPartChanges } from "./part-changes"
import type { State } from "./types"

export function applyPartDeltaBatch(
  current: State,
  events: readonly Event[],
  onResult: (event: Event, result: ReturnType<typeof applyDirectoryEvent>) => void,
  onError: (event: Event, error: unknown) => void,
): State | undefined {
  const draft = { ...current, part: current.part.fork() }
  const changedMessageIds = new Set<string>()
  for (const event of events) {
    try {
      if (event.type !== "message.part.delta") throw new Error("Delta batch contains a non-delta event")
      const result = applyDirectoryEvent(draft, event)
      if (typeof result === "boolean" ? result : result.changed) {
        changedMessageIds.add(event.properties.messageID)
      }
      onResult(event, result)
    } catch (error) {
      onError(event, error)
    }
  }
  if (changedMessageIds.size === 0) return undefined
  recordPartChanges(current.part, draft.part, changedMessageIds)
  draft.part.seal()
  return draft
}
