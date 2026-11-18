/** Window event consumed by the transport to interrupt retry backoff or a stalled connection. */
export const SYNC_RETRY_NOW_EVENT = "openchamber:sync-retry-now"

/** Ask active event transports to reconnect immediately without depending on sync state. */
export function requestSyncRetryNow(): void {
  const view = globalThis.window
  if (typeof view === "undefined") return
  const dispatch = view.dispatchEvent
  const EventCtor = globalThis.Event
  if (typeof dispatch !== "function" || typeof EventCtor !== "function") return
  dispatch.call(view, new EventCtor(SYNC_RETRY_NOW_EVENT))
}
