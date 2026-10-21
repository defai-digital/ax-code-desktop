import { create } from "zustand"
import { MINI_CHAT_PRESENCE_CHANNEL } from "@/apps/miniChatPresence"
import { invokeDesktop } from "@/lib/desktop"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import { useUIStore } from "@/stores/useUIStore"
import { canOpenSessionWindow, openSessionWindow } from "./openSessionWindow"
import { markSlotPopped } from "./sessionGrid"

type Target = { sessionId: string; directory: string }
const keyFor = (target: Target) => JSON.stringify([target.sessionId, getProjectPathIdentityKey(target.directory)])
/** Window ownership outlives slots and the grid component. Pending opens also reserve the session. */
export const useGridWindowOwners = create<{ owners: Set<string> }>(() => ({ owners: new Set() }))
const pending = new Set<string>()
let revision = 0
let stopTracking: (() => void) | undefined

export function gridWindowOwns(target: Target, owners = useGridWindowOwners.getState().owners): boolean {
  return owners.has(keyFor(target))
}

/** Only the native inventory can release a session; presence/visibility and message delivery cannot. */
export async function reconcileGridWindows(): Promise<void> {
  if (!canOpenSessionWindow()) return
  const version = ++revision
  try {
    const windows = await invokeDesktop<Target[]>("desktop_list_session_mini_chat_windows")
    if (!Array.isArray(windows) || version !== revision) return
    const owners = new Set([...windows.map(keyFor), ...pending])
    useGridWindowOwners.setState({ owners })
    const ui = useUIStore.getState()
    let slots = ui.sessionGrid.slots
    for (const slot of slots) {
      if (slot) slots = markSlotPopped(slots, slot.sessionId, slot.directory, gridWindowOwns(slot, owners))
    }
    if (slots !== ui.sessionGrid.slots) ui.setSessionGrid({ ...ui.sessionGrid, slots })
  } catch {
    // An unavailable inventory is not evidence that the owner released the session.
  }
}

/** Renderer-lifetime listener: switching tabs must not lose native close notifications. */
export function trackGridWindows(): () => void {
  if (!stopTracking) {
    const reconcile = () => { void reconcileGridWindows() }
    window.addEventListener("openchamber:session-windows-changed", reconcile)
    window.addEventListener("focus", reconcile)
    stopTracking = () => {
      window.removeEventListener("openchamber:session-windows-changed", reconcile)
      window.removeEventListener("focus", reconcile)
      stopTracking = undefined
      revision++
    }
  }
  return stopTracking
}

export async function popOutGridSlot(sessionId: string, directory: string, failureMessage: string): Promise<boolean> {
  trackGridWindows()
  const target = { sessionId, directory }
  if (gridWindowOwns(target)) return false
  const ui = useUIStore.getState()
  const marked = markSlotPopped(ui.sessionGrid.slots, sessionId, directory, true)
  if (marked === ui.sessionGrid.slots) return false
  const key = keyFor(target)
  revision++
  pending.add(key)
  useGridWindowOwners.setState({ owners: new Set([...useGridWindowOwners.getState().owners, key]) })
  ui.setSessionGrid({ ...ui.sessionGrid, slots: marked })
  try {
    return await openSessionWindow(target, failureMessage)
  } finally {
    pending.delete(key)
    // Failed opens may have created a window before transport failed. Reconcile either outcome.
    await reconcileGridWindows()
  }
}

export function requestMiniChatReturn(sessionId: string, directory: string): boolean {
  if (typeof BroadcastChannel === "undefined") return false
  try {
    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL)
    try {
      channel.postMessage({ type: "mini-chat-return-to-grid", sessionId, directory })
    } finally {
      channel.close()
    }
    return true
  } catch {
    return false
  }
}

export function returnGridSlot(sessionId: string, directory: string): void {
  requestMiniChatReturn(sessionId, directory)
  void reconcileGridWindows()
}
