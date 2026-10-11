import { buildSessionMessageRecordsSnapshot, type SessionMessageRecordsSnapshot } from "./session-message-records"
import type { State } from "./types"

export function createUserMessageHistorySelector() {
  let previous: SessionMessageRecordsSnapshot | undefined
  let history: string[] = []
  return (state: State, sessionID: string): string[] => {
    const next = buildSessionMessageRecordsSnapshot(state, sessionID, previous, false, "user")
    const changed = next.list !== previous?.list
    previous = next
    if (!changed) return history
    const result: string[] = []
    for (let index = next.list.length - 1; index >= 0; index--) {
      for (const part of next.list[index].parts) {
        if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
          result.push(part.text)
          break
        }
      }
    }
    // Metadata changes and empty user messages must not render the input again.
    if (result.length !== history.length || result.some((text, i) => text !== history[i])) history = result
    return history
  }
}
