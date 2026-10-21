import { MINI_CHAT_PRESENCE_CHANNEL } from "@/apps/miniChatPresence"
import { useUIStore } from "@/stores/useUIStore"
import { openSessionWindow } from "./openSessionWindow"
import { markSlotPopped } from "./sessionGrid"

/**
 * Pop a grid slot into the existing session window.
 *
 * The slot is marked first so this window unmounts the embedded chat and its browser-page control
 * before the other window can become the page owner (WX-15: one owner for the session's browser page).
 * A failed open puts the slot back. Returning posts to the mini-chat, which closes itself and announces
 * `viewed: false`; only that announcement remounts the page here.
 */
export async function popOutGridSlot(sessionId: string, directory: string, failureMessage: string): Promise<boolean> {
  const ui = useUIStore.getState()
  const marked = markSlotPopped(ui.sessionGrid.slots, sessionId, directory, true)
  if (marked === ui.sessionGrid.slots) return false
  ui.setSessionGrid({ ...ui.sessionGrid, slots: marked })
  const opened = await openSessionWindow({ sessionId, directory }, failureMessage)
  if (!opened) {
    const fresh = useUIStore.getState()
    fresh.setSessionGrid({
      ...fresh.sessionGrid,
      slots: markSlotPopped(fresh.sessionGrid.slots, sessionId, directory, false),
    })
  }
  return opened
}

/** Ask the session window to close. Returns false when no channel can carry the request. */
export function requestMiniChatReturn(sessionId: string, directory: string): boolean {
  if (typeof BroadcastChannel === "undefined") return false
  try {
    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL)
    channel.postMessage({ type: "mini-chat-return-to-grid", sessionId, directory })
    channel.close()
    return true
  } catch {
    return false
  }
}

/**
 * Return a popped slot to the grid. With a channel, the iframe stays unmounted until the window
 * reports that it is no longer viewing the session. Without one, nothing else can own the page.
 */
export function returnGridSlot(sessionId: string, directory: string): void {
  if (requestMiniChatReturn(sessionId, directory)) return
  const ui = useUIStore.getState()
  ui.setSessionGrid({
    ...ui.sessionGrid,
    slots: markSlotPopped(ui.sessionGrid.slots, sessionId, directory, false),
  })
}
