import type { StoreApi } from "zustand"
import { getSessionRevertMessageID } from "./session-message-records"
import { getPartChanges } from "./part-changes"
import type { State } from "./types"

export function subscribeSessionMessageRecords(
  store: Pick<StoreApi<State>, "getState" | "subscribe">,
  sessionID: string,
  notify: () => void,
  suspendPartUpdates = false,
  role?: "user",
): () => void {
  let previous = store.getState()
  const getMessageIds = (state: State) =>
    new Set(
      (state.message[sessionID] ?? []).filter((message) => !role || message.role === role).map((message) => message.id),
    )
  let messageIds = getMessageIds(previous)
  return store.subscribe((state) => {
    const before = previous
    previous = state
    const messages = state.message[sessionID]
    if (messages !== before.message[sessionID]) {
      messageIds = getMessageIds(state)
      notify()
      return
    }
    if (
      state.session !== before.session &&
      getSessionRevertMessageID(state, sessionID) !== getSessionRevertMessageID(before, sessionID)
    ) {
      notify()
      return
    }
    if (suspendPartUpdates || state.part === before.part) return
    const changed = getPartChanges(before.part, state.part)
    if (changed) {
      for (const messageID of changed) {
        if (messageIds.has(messageID)) {
          notify()
          return
        }
      }
      return
    }
    // Bootstrap, materialization, removal, and other snapshot writers may not
    // carry hints. Compare references to preserve their existing semantics.
    for (const messageID of messageIds) {
      if (state.part.get(messageID) !== before.part.get(messageID)) {
        notify()
        return
      }
    }
  })
}
