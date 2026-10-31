import type { AxCodeClient, SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import type { StoreApi } from "zustand"
import { normalizeProjectPath } from "@/lib/projectResolution"
import type { ChildStoreManager, DirectoryStore } from "./child-store"
import { EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS, inferExternalSessionActivity } from "./external-session-activity"
import { refetchSessionMessagesIfChanged } from "./session-message-refresh"
import { serverSessionStatusStamp } from "./session-status-events"

const POLL_INTERVAL_MS = 3000
const synthesizedStatuses = new WeakMap<SessionStatus, number>()

// An equal SSE status may keep the object reference. The event stamp still transfers ownership.
export function isExternalSessionStatus(sessionId: string, status: SessionStatus | undefined): boolean {
  return !!status && synthesizedStatuses.get(status) === serverSessionStatusStamp(sessionId)
}

interface ExternalSessionPollerInput {
  childStores: ChildStoreManager
  getClient: (directory: string) => AxCodeClient
  getOpenSessionId: () => string | null
  getOpenSessionDirectory: () => string | null
  refreshSessionList: (directory: string, store: StoreApi<DirectoryStore>, signal: AbortSignal) => Promise<void>
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">
}

export function createExternalSessionPoller(input: ExternalSessionPollerInput) {
  const owned = new Map<StoreApi<DirectoryStore>, Map<string, SessionStatus>>()
  // The time.updated value the last completed evaluation of a session saw, and
  // whether that evaluation applied the page to the store (only the open session
  // applies; a background evaluation just infers activity). Session.touch bumps
  // time.updated once per prompt, so an unchanged value after an idle evaluation
  // means no new external turn started.
  interface Watermark {
    updated: number
    applied: boolean
  }
  const watermarks = new Map<StoreApi<DirectoryStore>, Map<string, Watermark>>()
  const forgetWatermark = (store: StoreApi<DirectoryStore>, sessionId: string) => {
    watermarks.get(store)?.delete(sessionId)
  }
  let disposed = false
  let running = false
  let rerunWhenVisible = false
  let controller: AbortController | undefined

  const ownsStatus = (store: StoreApi<DirectoryStore>, sessionId: string) => {
    const status = store.getState().session_status[sessionId]
    return owned.get(store)?.get(sessionId) === status && isExternalSessionStatus(sessionId, status)
  }
  const runtimeIsActive = (store: StoreApi<DirectoryStore>, sessionId: string) => {
    const status = store.getState().session_status[sessionId]
    return (status?.type === "busy" || status?.type === "retry") && !ownsStatus(store, sessionId)
  }
  const clearOwnedStatus = (store: StoreApi<DirectoryStore>, sessionId: string) => {
    if (ownsStatus(store, sessionId)) {
      const statuses = { ...store.getState().session_status }
      delete statuses[sessionId]
      store.setState({ session_status: statuses })
    }
    owned.get(store)?.delete(sessionId)
  }

  const tick = async () => {
    if (disposed || running || input.document.visibilityState !== "visible") return
    running = true
    controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])
    const canApply = () => !disposed && !signal.aborted && input.document.visibilityState === "visible"
    // Drop tracking for stores that left the manager so their synthesized
    // statuses are released instead of leaking with the orphaned store.
    const liveStores = new Set(input.childStores.children.values())
    for (const store of new Set([...owned.keys(), ...watermarks.keys()])) {
      if (liveStores.has(store)) continue
      for (const sessionId of [...(owned.get(store)?.keys() ?? [])]) clearOwnedStatus(store, sessionId)
      owned.delete(store)
      watermarks.delete(store)
    }
    try {
      await Promise.all(
        Array.from(input.childStores.children, async ([directory, store]) => {
          if (!canApply()) return
          try {
            await input.refreshSessionList(directory, store, signal)
          } catch {
            if (canApply()) console.warn("[external-session-poller] session list refresh failed")
          }
          if (!canApply()) return
          const sessions = store.getState().session
          const sessionById = new Map(sessions.map((session) => [session.id, session]))
          const sessionIds = new Set(sessionById.keys())
          for (const sessionId of owned.get(store)?.keys() ?? []) {
            if (!sessionIds.has(sessionId)) clearOwnedStatus(store, sessionId)
          }
          for (const sessionId of watermarks.get(store)?.keys() ?? []) {
            if (!sessionIds.has(sessionId)) watermarks.get(store)?.delete(sessionId)
          }
          const openSessionId = input.getOpenSessionId()
          // The selected session can be absent from the first list page, but it
          // only belongs to the directory that owns it. Polling it through every
          // other child store sends message requests to a directory the runtime
          // rejects with 409 ("belongs to a different project directory").
          const openSessionDirectory = normalizeProjectPath(input.getOpenSessionDirectory())
          const openSessionBelongsHere =
            !!openSessionId && !!openSessionDirectory && normalizeProjectPath(directory) === openSessionDirectory
          const candidates = new Set([...(openSessionBelongsHere ? [openSessionId] : []), ...sessionIds])
          await Promise.all(
            Array.from(candidates, async (sessionId) => {
              if (!canApply()) return
              const session = sessionById.get(sessionId)
              if (!session && !store.getState().message[sessionId]) return
              if (runtimeIsActive(store, sessionId)) {
                owned.get(store)?.delete(sessionId)
                // The runtime's own turn changes the transcript without a touch: read once after it ends.
                forgetWatermark(store, sessionId)
                return
              }
              const updated = session?.time.updated
              const fresh = typeof updated === "number" && Date.now() - updated <= EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS
              if (!fresh) clearOwnedStatus(store, sessionId)
              if (!fresh && sessionId !== openSessionId) return
              // An unchanged time.updated after a completed evaluation means
              // no new turn started, unless this poller owns a busy status:
              // then the transcript still changes without a touch. The open
              // session is skipped only when that evaluation applied the page,
              // so a session evaluated in the background pays one catch-up read
              // when it is opened. A candidate with no list record (updated
              // undefined) is read every tick.
              const watermark = typeof updated === "number" ? watermarks.get(store)?.get(sessionId) : undefined
              if (
                watermark !== undefined &&
                watermark.updated === updated &&
                !ownsStatus(store, sessionId) &&
                (sessionId !== openSessionId || watermark.applied)
              )
                return
              const stamp = serverSessionStatusStamp(sessionId)
              const beforeStatus = store.getState().session_status[sessionId]
              let applied = false
              try {
                const records = await refetchSessionMessagesIfChanged({
                  sdk: input.getClient(directory),
                  store,
                  sessionId,
                  directory,
                  signal,
                  limit: sessionId === openSessionId ? undefined : 10,
                  shouldApply: () => {
                    const apply =
                      canApply() && sessionId === input.getOpenSessionId() && !runtimeIsActive(store, sessionId)
                    if (apply) applied = true
                    return apply
                  },
                })
                // A status update during the read wins, including deduped
                // runtime events. The evaluation it aborted may have carried new
                // parts, so forget the watermark and read again on the next
                // tick that is allowed to.
                if (
                  !canApply() ||
                  runtimeIsActive(store, sessionId) ||
                  serverSessionStatusStamp(sessionId) !== stamp ||
                  store.getState().session_status[sessionId] !== beforeStatus
                ) {
                  forgetWatermark(store, sessionId)
                  return
                }
                // The row can be touched during the read (a new prompt): evaluate
                // against the current row, and never stamp a number the page may
                // predate.
                const currentUpdated = store.getState().session.find((item) => item.id === sessionId)?.time.updated
                if (currentUpdated !== updated) {
                  forgetWatermark(store, sessionId)
                } else if (typeof updated === "number") {
                  let bySession = watermarks.get(store)
                  if (!bySession) watermarks.set(store, (bySession = new Map()))
                  bySession.set(sessionId, { updated, applied })
                }
                const newest = [...records].sort(
                  (left, right) =>
                    right.info.time.created - left.info.time.created || right.info.id.localeCompare(left.info.id),
                )[0]
                const activity = inferExternalSessionActivity({
                  updated: currentUpdated,
                  now: Date.now(),
                  messages: records.map((record) => record.info),
                  parts: newest?.parts ?? [],
                  newest: newest?.info,
                })
                if (activity === "idle") {
                  clearOwnedStatus(store, sessionId)
                } else {
                  const current = store.getState().session_status[sessionId]
                  const lastActivityAt = currentUpdated
                  if (
                    ownsStatus(store, sessionId) &&
                    current?.type === "busy" &&
                    current.lastActivityAt === lastActivityAt
                  )
                    return
                  const status: SessionStatus = { type: "busy", lastActivityAt }
                  synthesizedStatuses.set(status, stamp)
                  let statuses = owned.get(store)
                  if (!statuses) owned.set(store, (statuses = new Map()))
                  statuses.set(sessionId, status)
                  store.setState({ session_status: { ...store.getState().session_status, [sessionId]: status } })
                }
              } catch {
                if (canApply()) console.warn("[external-session-poller] session message refresh failed")
              }
            }),
          )
        }),
      )
    } finally {
      running = false
      if (rerunWhenVisible) {
        rerunWhenVisible = false
        if (!disposed && input.document.visibilityState === "visible") void tick()
      }
    }
  }

  const onVisibilityChange = () => {
    if (input.document.visibilityState === "visible") {
      if (running) rerunWhenVisible = true
      else void tick()
    } else controller?.abort()
  }
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  input.document.addEventListener("visibilitychange", onVisibilityChange)
  void tick()

  return {
    tick,
    dispose: () => {
      disposed = true
      controller?.abort()
      clearInterval(timer)
      input.document.removeEventListener("visibilitychange", onVisibilityChange)
      for (const [store, statuses] of owned) {
        for (const sessionId of statuses.keys()) clearOwnedStatus(store, sessionId)
      }
      owned.clear()
      watermarks.clear()
    },
  }
}
