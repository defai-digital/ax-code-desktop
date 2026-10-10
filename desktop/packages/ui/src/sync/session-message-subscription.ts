import type { StoreApi } from "zustand"
import { getPartChanges } from "./part-changes"
import type { State } from "./types"

export function subscribeSessionMessageRecords(
  store: Pick<StoreApi<State>, "getState" | "subscribe">,
  sessionID: string,
  notify: () => void,
  suspendPartUpdates = false,
): () => void {
  let previous = store.getState()
  let messageIds = new Set((previous.message[sessionID] ?? []).map((message) => message.id))
  return store.subscribe((state) => {
    const before = previous
    previous = state
    const messages = state.message[sessionID]
    if (messages !== before.message[sessionID]) {
      messageIds = new Set((messages ?? []).map((message) => message.id))
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
      if (state.part[messageID] !== before.part[messageID]) {
        notify()
        return
      }
    }
  })
}
