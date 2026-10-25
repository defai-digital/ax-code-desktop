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
          const sessionIds = new Set(sessions.map((session) => session.id))
          for (const sessionId of owned.get(store)?.keys() ?? []) {
            if (!sessionIds.has(sessionId)) clearOwnedStatus(store, sessionId)
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
              const session = sessions.find((item) => item.id === sessionId)
              if (!session && !store.getState().message[sessionId]) return
              if (runtimeIsActive(store, sessionId)) {
                owned.get(store)?.delete(sessionId)
                return
              }
              const updated = session?.time.updated
              const fresh = typeof updated === "number" && Date.now() - updated <= EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS
              if (!fresh) clearOwnedStatus(store, sessionId)
              if (!fresh && sessionId !== openSessionId) return
              const stamp = serverSessionStatusStamp(sessionId)
              const beforeStatus = store.getState().session_status[sessionId]
              try {
                const records = await refetchSessionMessagesIfChanged({
                  sdk: input.getClient(directory),
                  store,
                  sessionId,
                  directory,
                  signal,
                  limit: sessionId === openSessionId ? undefined : 10,
                  shouldApply: () =>
                    canApply() && sessionId === input.getOpenSessionId() && !runtimeIsActive(store, sessionId),
                })
                if (!canApply() || runtimeIsActive(store, sessionId)) return
                // A status update during the read wins, including deduped runtime events.
                if (
                  serverSessionStatusStamp(sessionId) !== stamp ||
                  store.getState().session_status[sessionId] !== beforeStatus
                )
                  return
                const newest = [...records].sort(
                  (left, right) =>
                    right.info.time.created - left.info.time.created || right.info.id.localeCompare(left.info.id),
                )[0]
                const activity = inferExternalSessionActivity({
                  updated: store.getState().session.find((item) => item.id === sessionId)?.time.updated,
                  now: Date.now(),
                  messages: records.map((record) => record.info),
                  parts: newest?.parts ?? [],
                })
                if (activity === "idle") {
                  clearOwnedStatus(store, sessionId)
                } else {
                  const current = store.getState().session_status[sessionId]
                  const lastActivityAt = store.getState().session.find((item) => item.id === sessionId)?.time.updated
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
    },
  }
}
