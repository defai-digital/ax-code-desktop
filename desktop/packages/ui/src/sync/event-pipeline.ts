/**
 * Event Pipeline — transport connection, event coalescing, and batched flush.
 *
 * This module must not make state-dependent decisions about event validity.
 * For example, deciding whether a delta is already represented by a full part
 * snapshot belongs in the reducer, which has access to the current state.
 *
 * Plain closure API:
 *   const { cleanup } = createEventPipeline({ sdk, onEvent })
 *
 * No class, no start/stop lifecycle. One pipeline per mount.
 * Abort controller created once at init, cleaned up via returned cleanup fn.
 */

import type { Event, AxCodeClient, SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import { axCodeClient } from "@/lib/ax-code/client"
import { syncDebug } from "./debug"
import {
  getLocalSyncPerformanceRecorder,
  type PendingSyncMeasurement,
  type SyncPerformanceRecorder,
} from "./performance"
import { API_PATHS } from "@/lib/http"
import { createEventTransport } from "@/lib/event-stream/client"
import { isLoopbackHostname } from "@/lib/loopback"
import { markStreamConnected, markStreamDisconnected, useConnectionStore } from "@/lib/event-stream/connection-state"
import { isAbortError, type SdkSseDriver, type TransportError, type WsDriver } from "@/lib/event-stream/types"
import type { MessageStreamWsFrame } from "@/lib/event-stream/adapters/websocket"
import { SYNC_RETRY_NOW_EVENT as TRANSPORT_SYNC_RETRY_NOW_EVENT } from "@/lib/event-stream/visibility"
const MAX_QUEUED_EVENTS = 512
const MAX_EVENTS_PER_SLICE = 128
const FLUSH_BUDGET_MS = 8
const MAX_COALESCED_DELTA_CHARACTERS = 64 * 1024
const FLUSH_FRAME_MS = 33
const BACKPRESSURE_FLUSH_FRAME_MS = 200
const BACKPRESSURE_MODE_MS = 10_000
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000
const DEFAULT_WS_READY_TIMEOUT_MS = 2_000
const ACTIVE_TOOL_STATUSES = new Set(["pending", "running", "started"])
const FINAL_TOOL_STATUSES = new Set(["completed", "error", "aborted", "failed", "timeout", "cancelled"])
// Retry pacing, handed to the event transport verbatim. Visible+online tabs
// probe quickly so the user sees connection recovery in under a second of
// real outage; hidden/offline tabs back off further so a backgrounded browser
// tab on a flaky link doesn't burn battery probing a dead network every few
// seconds. The browser would throttle hidden-tab timers anyway, but this
// keeps the intent explicit and shrinks server load from idle tabs.
const RETRY_BACKOFF_BASE_MS = 250
const RETRY_BACKOFF_CAP_VISIBLE_MS = 5_000
const RETRY_BACKOFF_CAP_HIDDEN_OR_OFFLINE_MS = 60_000
const RETRY_BACKOFF_MAX_EXPONENT = 8
const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//

/**
 * Window event the UI dispatches to interrupt the reconnect backoff and force
 * an immediate reconnect attempt (e.g. a "retry now" action on the reconnect
 * banner). Handled exactly like `openchamber:system-resume`.
 */
export const SYNC_RETRY_NOW_EVENT = TRANSPORT_SYNC_RETRY_NOW_EVENT

/** Ask the active event pipeline to reconnect immediately. */
export function requestSyncRetryNow(): void {
  const view = globalThis.window
  if (typeof view === "undefined") return
  const dispatch = view.dispatchEvent
  const EventCtor = globalThis.Event
  if (typeof dispatch !== "function" || typeof EventCtor !== "function") return
  dispatch.call(view, new EventCtor(SYNC_RETRY_NOW_EVENT))
}

export type EventPipelineInput = {
  sdk: AxCodeClient
  onEvent: (directory: string, payload: Event) => void
  /** Commit consecutive text deltas together; snapshots and lifecycle events remain barriers. */
  onDeltaBatch?: (directory: string, events: readonly Event[]) => void
  routeDirectory?: (directory: string, payload: Event) => string
  /** Called after stream reconnects (visibility restore or heartbeat timeout). */
  onReconnect?: () => void
  /** Called when the stream disconnects (heartbeat timeout, network error, or transport failure). */
  onDisconnect?: (reason: string) => void
  /** Called when transport switches (e.g. WS timeout → SSE fallback) without actual disconnection. */
  onTransportSwitch?: () => void
  transport?: "auto" | "ws" | "sse"
  heartbeatTimeoutMs?: number
  reconnectDelayMs?: number
  wsReadyTimeoutMs?: number
  /** Optional local numeric diagnostics; defaults to the explicit browser opt-in. */
  performanceRecorder?: SyncPerformanceRecorder
}

type EventPipeline = {
  cleanup: () => void
  reconnect: (reason?: string) => void
}

const normalizeOpenChamberSessionStatus = (payload: Event): Event | null => {
  const record = payload as unknown as {
    id?: unknown
    type?: unknown
    properties?: {
      sessionID?: unknown
      sessionId?: unknown
      status?: unknown
      metadata?: {
        attempt?: unknown
        message?: unknown
        next?: unknown
      }
    }
  }

  if (record.type !== "openchamber:session-status") return null

  const sessionID =
    typeof record.properties?.sessionID === "string" && record.properties.sessionID.length > 0
      ? record.properties.sessionID
      : typeof record.properties?.sessionId === "string" && record.properties.sessionId.length > 0
        ? record.properties.sessionId
        : ""
  const rawStatus = typeof record.properties?.status === "string" ? record.properties.status : ""
  if (!sessionID || !rawStatus) return null

  let status: SessionStatus | null = null
  if (rawStatus === "idle" || rawStatus === "busy") {
    status = { type: rawStatus }
  } else if (rawStatus === "retry") {
    const metadata = record.properties?.metadata
    if (
      typeof metadata?.attempt === "number" &&
      typeof metadata.message === "string" &&
      typeof metadata.next === "number"
    ) {
      status = {
        type: "retry",
        attempt: metadata.attempt,
        message: metadata.message,
        next: metadata.next,
      }
    }
  }
  if (!status) return null

  return {
    id:
      typeof record.id === "string" && record.id.length > 0
        ? record.id
        : `openchamber-status-${sessionID}-${Date.now()}`,
    type: "session.status",
    properties: {
      sessionID,
      status,
    },
  } as Event
}

const normalizeEventType = (payload: Event): Event => {
  const normalizedOpenChamberStatus = normalizeOpenChamberSessionStatus(payload)
  if (normalizedOpenChamberStatus) {
    return normalizedOpenChamberStatus
  }

  const type = (payload as { type?: unknown }).type
  if (typeof type !== "string") {
    return payload
  }

  const match = /^(.*)\.(\d+)$/.exec(type)
  if (!match || !match[1]) {
    return payload
  }

  return {
    ...payload,
    type: match[1] as Event["type"],
  } as unknown as Event
}

function resolveEventDirectory(event: unknown, payload: Event): string {
  const directDirectory =
    typeof event === "object" && event !== null && typeof (event as { directory?: unknown }).directory === "string"
      ? (event as { directory: string }).directory
      : null

  if (directDirectory && directDirectory.length > 0) {
    return directDirectory
  }

  const properties =
    typeof payload.properties === "object" && payload.properties !== null
      ? (payload.properties as Record<string, unknown>)
      : null
  const propertyDirectory = typeof properties?.directory === "string" ? properties.directory : null

  return propertyDirectory && propertyDirectory.length > 0 ? propertyDirectory : "global"
}

function resolveEventPayload(payload: unknown): Event | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const record = payload as { type?: unknown; payload?: unknown }
  if (typeof record.type === "string") {
    return payload as Event
  }

  if (
    record.payload &&
    typeof record.payload === "object" &&
    typeof (record.payload as { type?: unknown }).type === "string"
  ) {
    return record.payload as Event
  }

  return null
}

function resolveAbsoluteUrl(candidate: string): string {
  const normalized = typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : API_PATHS.base
  if (ABSOLUTE_URL_PATTERN.test(normalized)) {
    return normalized
  }

  if (typeof window === "undefined") {
    return normalized
  }

  const baseReference = window.location?.href || window.location?.origin
  if (!baseReference) {
    return normalized
  }

  return new URL(normalized, baseReference).toString()
}

function toWebSocketUrl(candidate: string): string {
  const url = new URL(resolveAbsoluteUrl(candidate))
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

function buildGlobalEventWsUrl(lastEventId?: string): string {
  let baseUrl: string = API_PATHS.base
  try {
    const client = axCodeClient as { getBaseUrl?: () => string }
    if (typeof client.getBaseUrl === "function") {
      baseUrl = client.getBaseUrl()
    }
  } catch {
    baseUrl = API_PATHS.base
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  const httpUrl = new URL("global/event/ws", resolveAbsoluteUrl(normalizedBase))
  if (lastEventId && lastEventId.length > 0) {
    httpUrl.searchParams.set("lastEventId", lastEventId)
  }
  return toWebSocketUrl(httpUrl.toString())
}

// The event stream targets the desktop's own loopback server in the desktop shell; the
// browser's offline event says nothing about that server's reachability and used to park a
// healthy stream on the long backoff cap until `online` fired.
function eventStreamTargetsLoopback(): boolean {
  try {
    const client = axCodeClient as { getBaseUrl?: () => string }
    const base = typeof client.getBaseUrl === "function" ? client.getBaseUrl() : API_PATHS.base
    return isLoopbackHostname(new URL(resolveAbsoluteUrl(base)).hostname)
  } catch {
    return false
  }
}

type DirectoryQueue = {
  queue: Event[]
  buffer: Event[]
  coalesced: Map<string, number>
  deltaKeys: Map<string, Set<string>>
  timer: ReturnType<typeof setTimeout> | undefined
  last: number
  measurement?: PendingSyncMeasurement
  cursor: number
  flushing: boolean
  drainAll: boolean
  activeMeasurement?: PendingSyncMeasurement & {
    queueWaitMs: number
    callbackMs: number
    failedCallbacks: number
    lastCallbackAt: number
  }
}

type CoalescedPart = {
  type?: unknown
  state?: {
    status?: unknown
    time?: {
      start?: unknown
      end?: unknown
    }
  }
  time?: {
    start?: unknown
    end?: unknown
  }
}

function getUpdatedPart(payload: Event): CoalescedPart | undefined {
  if (payload.type !== "message.part.updated") return undefined
  const part = (payload.properties as { part?: unknown }).part
  return typeof part === "object" && part !== null ? (part as CoalescedPart) : undefined
}

function getToolStatus(part: CoalescedPart): string | undefined {
  if (part.type !== "tool") return undefined
  const status = part.state?.status
  return typeof status === "string" ? status : undefined
}

function getPartEndTime(part: CoalescedPart): number | undefined {
  const stateEnd = part.state?.time?.end
  if (typeof stateEnd === "number") return stateEnd

  const timeEnd = part.time?.end
  return typeof timeEnd === "number" ? timeEnd : undefined
}

function getPartStartTime(part: CoalescedPart): number | undefined {
  const stateStart = part.state?.time?.start
  if (typeof stateStart === "number") return stateStart

  const timeStart = part.time?.start
  return typeof timeStart === "number" ? timeStart : undefined
}

function getValidPartEndTime(part: CoalescedPart | undefined): number | undefined {
  if (!part) return undefined

  const endTime = getPartEndTime(part)
  if (typeof endTime !== "number") return undefined

  const startTime = getPartStartTime(part)
  if (typeof startTime === "number" && endTime < startTime) return undefined

  return endTime
}

function isFinalToolPart(part: CoalescedPart | undefined): boolean {
  if (!part || part.type !== "tool") return false

  const status = getToolStatus(part)
  if (status && ACTIVE_TOOL_STATUSES.has(status)) return false
  if (status && FINAL_TOOL_STATUSES.has(status)) return true

  return typeof getValidPartEndTime(part) === "number"
}

function shouldPreservePreviousPartUpdate(
  previousPart: CoalescedPart | undefined,
  nextPart: CoalescedPart | undefined,
) {
  if (!previousPart || !nextPart || previousPart.type !== "tool" || nextPart.type !== "tool") {
    return false
  }

  if (isFinalToolPart(previousPart) && !isFinalToolPart(nextPart)) {
    return true
  }

  const previousEnd = getValidPartEndTime(previousPart)
  const nextEnd = getValidPartEndTime(nextPart)
  if (typeof previousEnd !== "number") {
    return false
  }
  if (typeof nextEnd !== "number") {
    return true
  }
  return previousEnd > nextEnd
}

export function coalesceQueuedEvent(previous: Event, next: Event): Event {
  if (previous.type !== "message.part.updated" || next.type !== "message.part.updated") {
    return next
  }

  const previousPart = getUpdatedPart(previous)
  const nextPart = getUpdatedPart(next)
  if (shouldPreservePreviousPartUpdate(previousPart, nextPart)) {
    return previous
  }

  return next
}

export function createEventPipeline(input: EventPipelineInput): EventPipeline {
  const performanceRecorder = input.performanceRecorder ?? getLocalSyncPerformanceRecorder()
  const {
    sdk,
    onEvent,
    onDeltaBatch,
    onReconnect,
    onDisconnect,
    onTransportSwitch,
    routeDirectory,
    transport = "auto",
    heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
    wsReadyTimeoutMs = DEFAULT_WS_READY_TIMEOUT_MS,
  } = input
  let disconnected = false
  let closed = false
  let backpressureUntil = 0

  // One entry per connected workspace directory. Cardinality is bounded by
  // the number of workspace roots open in the desktop (typically 1-3).
  // Entries are not evicted during a pipeline lifetime because the pipeline
  // itself is per-mount; the entire Map is GC'd when cleanup() is called.
  const directories = new Map<string, DirectoryQueue>()

  const getOrCreateDir = (directory: string): DirectoryQueue => {
    let d = directories.get(directory)
    if (d) return d
    d = {
      queue: [],
      buffer: [],
      coalesced: new Map(),
      deltaKeys: new Map(),
      timer: undefined,
      last: 0,
      cursor: 0,
      flushing: false,
      drainAll: false,
    }
    directories.set(directory, d)
    return d
  }

  const key = (payload: Event): string | undefined => {
    if (payload.type === "session.status") {
      const props = payload.properties as { sessionID: string }
      return `session.status:${props.sessionID}`
    }
    if (payload.type === "lsp.updated") {
      return "lsp.updated"
    }
    if (payload.type === "message.part.delta") {
      const props = payload.properties as { messageID: string; partID: string; field: string }
      return `message.part.delta:${props.messageID}:${props.partID}:${props.field}`
    }
    if (payload.type === "message.part.updated") {
      const props = payload.properties as { part?: { id?: string; messageID?: string } }
      const partID = props.part?.id
      const messageID = props.part?.messageID
      if (typeof partID === "string" && typeof messageID === "string") {
        return `message.part.updated:${messageID}:${partID}`
      }
    }
    return undefined
  }

  const updatedPartKeyForDelta = (payload: Event): string | undefined => {
    if (payload.type !== "message.part.delta") return undefined
    const props = payload.properties as { messageID?: string; partID?: string }
    if (typeof props.messageID !== "string" || typeof props.partID !== "string") return undefined
    return `message.part.updated:${props.messageID}:${props.partID}`
  }

  const flushDir = (directory: string, drainAll = false) => {
    const d = directories.get(directory)
    if (!d) return
    d.drainAll ||= drainAll
    // A callback may enqueue more events or request cleanup. New events belong
    // to the pending queue; they must never mutate the batch being dispatched.
    if (d.flushing) return
    if (d.timer) clearTimeout(d.timer)
    d.timer = undefined
    d.flushing = true
    const sliceStartedAt = Date.now()
    let processed = 0
    try {
      while (d.cursor < d.buffer.length || d.queue.length > 0) {
        if (d.cursor === d.buffer.length) {
          const empty = d.buffer
          empty.length = 0
          d.buffer = d.queue
          d.queue = empty
          d.cursor = 0
          d.coalesced.clear()
          d.deltaKeys.clear()
          d.last = Date.now()
          if (d.measurement && performanceRecorder) {
            d.activeMeasurement = {
              ...d.measurement,
              queueWaitMs: performanceRecorder.now() - d.measurement.receivedAt,
              callbackMs: 0,
              failedCallbacks: 0,
              lastCallbackAt: performanceRecorder.now(),
            }
          }
          d.measurement = undefined
          syncDebug.pipeline.flush(d.buffer.length)
        }
        const start = d.cursor++
        const payload = d.buffer[start]
        const measurement = d.activeMeasurement
        const callbackStartedAt = measurement ? performanceRecorder!.now() : 0
        if (measurement) measurement.queueWaitMs += Math.max(0, callbackStartedAt - measurement.lastCallbackAt)
        try {
          if (onDeltaBatch && payload.type === "message.part.delta") {
            const batchLimit = d.drainAll ? MAX_EVENTS_PER_SLICE : MAX_EVENTS_PER_SLICE - processed
            while (
              d.cursor < d.buffer.length &&
              d.cursor - start < batchLimit &&
              d.buffer[d.cursor].type === "message.part.delta"
            )
              d.cursor++
            onDeltaBatch(directory, d.buffer.slice(start, d.cursor))
          } else {
            onEvent(directory, payload)
          }
        } catch (error) {
          if (measurement) measurement.failedCallbacks++
          console.error("[event-pipeline] event handler threw during flush", error)
        } finally {
          if (measurement) {
            measurement.lastCallbackAt = performanceRecorder!.now()
            measurement.callbackMs += measurement.lastCallbackAt - callbackStartedAt
          }
        }
        processed += d.cursor - start
        if (d.cursor === d.buffer.length) {
          if (measurement && performanceRecorder) {
            performanceRecorder.record({
              transport: measurement.transport,
              receivedEvents: measurement.receivedEvents,
              dispatchedEvents: d.buffer.length,
              coalescedEvents: measurement.coalescedEvents,
              failedCallbacks: measurement.failedCallbacks,
              backpressure: measurement.backpressure,
              queueWaitMs: measurement.queueWaitMs,
              callbackMs: measurement.callbackMs,
            })
          }
          d.activeMeasurement = undefined
          d.buffer.length = 0
          d.cursor = 0
        }
        if (!d.drainAll && (processed >= MAX_EVENTS_PER_SLICE || Date.now() - sliceStartedAt >= FLUSH_BUDGET_MS)) break
      }
    } finally {
      d.flushing = false
      d.drainAll = false
      if (d.cursor < d.buffer.length || d.queue.length > 0) {
        // A task boundary lets input and paint run between slices. Do not wait
        // another coalescing interval for work already waiting in the queue.
        d.timer = setTimeout(() => flushDir(directory), 0)
      }
    }
  }

  const flushAll = () => {
    for (const directory of directories.keys()) {
      try {
        flushDir(directory, true)
      } catch (error) {
        // One directory's failure must not prevent others from flushing.
        console.error("[event-pipeline] flushDir failed for directory", directory, error)
      }
    }
  }

  const scheduleDir = (directory: string) => {
    const d = getOrCreateDir(directory)
    if (d.timer || d.flushing) return
    const elapsed = Date.now() - d.last
    const flushFrameMs = Date.now() < backpressureUntil ? BACKPRESSURE_FLUSH_FRAME_MS : FLUSH_FRAME_MS
    d.timer = setTimeout(() => flushDir(directory), Math.max(0, flushFrameMs - elapsed))
  }

  let streamErrorLogged = false
  const notifyDisconnected = (reason: string) => {
    if (disconnected) {
      return
    }
    disconnected = true
    // Single writer of the canonical connection phase (S4.7): the pipeline
    // owns the transport, so it is the only module allowed to mark the
    // stream disconnected.
    markStreamDisconnected(reason)
    onDisconnect?.(reason)
  }

  const markConnected = () => {
    disconnected = false
    // Single writer of the canonical connection phase (S4.7): mark the
    // stream connected before consumers react, so UI gating on the
    // connection store never lags the pipeline's own recovery work.
    markStreamConnected()
    // Fire onReconnect on every successful connect — including the very
    // first one. Consumer state (the connection store) starts at
    // "connecting" and needs to be flipped positively; without this the
    // send button throws "Connection lost" until something else (HTTP
    // health check) happens to race a connect through.
    onReconnect?.()
  }

  const enqueueEvent = (directory: string, payload: Event, eventTransport: "ws" | "sse") => {
    if (closed) return
    const receivedAt = performanceRecorder?.now()
    const normalizedPayload = normalizeEventType(payload)
    const routedDirectory =
      normalizedPayload.type === "server.resync_required"
        ? "global"
        : routeDirectory?.(directory, normalizedPayload) || directory

    const d = getOrCreateDir(routedDirectory)
    // Lossless pressure relief: bound the number of retained events even when
    // a buffered SSE replay drains before browser timers can run. Unlike normal
    // scheduled slices, a high-water drain must finish before accepting more.
    if (d.queue.length + d.buffer.length - d.cursor >= MAX_QUEUED_EVENTS) {
      flushDir(routedDirectory, true)
      // A dispatched callback can close the pipeline during pressure relief.
      // Do not accept the in-flight frame or schedule work after that cleanup.
      if (closed) return
    }
    // Deletion/archive is a barrier even when the same identifier is recreated
    // in this frame. Replacing a pre-removal slot would move the new state ahead
    // of the removal. Clearing these small indexes preserves every queued event.
    if (
      normalizedPayload.type === "message.part.removed" ||
      normalizedPayload.type === "message.removed" ||
      normalizedPayload.type === "session.deleted" ||
      (normalizedPayload.type === "session.updated" && normalizedPayload.properties?.info?.time?.archived)
    ) {
      d.coalesced.clear()
      d.deltaKeys.clear()
    }
    if (normalizedPayload.type === "session.idle" || normalizedPayload.type === "session.error") {
      d.coalesced.delete(`session.status:${normalizedPayload.properties.sessionID}`)
    }
    if (receivedAt !== undefined) {
      if (!d.measurement) {
        d.measurement = {
          receivedAt,
          receivedEvents: 0,
          coalescedEvents: 0,
          transport: eventTransport,
          backpressure: false,
        }
      }
      d.measurement.receivedEvents++
      if (d.measurement.transport !== eventTransport) d.measurement.transport = "mixed"
      d.measurement.backpressure ||= Date.now() < backpressureUntil
    }
    const updatedKeyInterruptedByDelta = updatedPartKeyForDelta(normalizedPayload)
    if (updatedKeyInterruptedByDelta) {
      d.coalesced.delete(updatedKeyInterruptedByDelta)
    }
    const k = key(normalizedPayload)
    if (k && normalizedPayload.type === "message.part.updated") {
      // Only visit delta fields for this part. Scanning all coalesce keys on
      // every snapshot made a buffered replay of N distinct parts quadratic.
      for (const deltaKey of d.deltaKeys.get(k) ?? []) d.coalesced.delete(deltaKey)
      d.deltaKeys.delete(k)
    }
    if (k && updatedKeyInterruptedByDelta) {
      let keys = d.deltaKeys.get(updatedKeyInterruptedByDelta)
      if (!keys) d.deltaKeys.set(updatedKeyInterruptedByDelta, (keys = new Set()))
      keys.add(k)
    }
    if (k) {
      const i = d.coalesced.get(k)
      if (i !== undefined) {
        if (normalizedPayload.type === "message.part.delta") {
          const prev = d.queue[i] as unknown as { properties: { delta: string; offset?: number } }
          const inc = normalizedPayload.properties as { delta: string; offset?: number }
          // The concatenated text continues from the first delta's offset. Keeping
          // the incoming (later) offset instead named the text before the second
          // delta only, and the reducer's offset reconciliation would then cut the
          // front of the merged text. Two deltas that do not actually continue one
          // another (replay after a refetch) must not be merged at all: each needs
          // its own offset so the reducer can reconcile it.
          const contiguous =
            (prev.properties.offset === undefined && inc.offset === undefined) ||
            (typeof prev.properties.offset === "number" &&
              typeof inc.offset === "number" &&
              Number.isInteger(prev.properties.offset) &&
              Number.isInteger(inc.offset) &&
              prev.properties.offset >= 0 &&
              inc.offset >= 0 &&
              inc.offset === prev.properties.offset + prev.properties.delta.length)
          if (!contiguous || prev.properties.delta.length + inc.delta.length > MAX_COALESCED_DELTA_CHARACTERS) {
            d.coalesced.set(k, d.queue.length)
            d.queue.push(normalizedPayload)
            scheduleDir(routedDirectory)
            return
          }
          d.queue[i] = {
            ...normalizedPayload,
            properties: {
              ...(normalizedPayload.properties as object),
              delta: prev.properties.delta + inc.delta,
              offset: prev.properties.offset ?? inc.offset,
            },
          } as unknown as Event
        } else {
          d.queue[i] = coalesceQueuedEvent(d.queue[i], normalizedPayload)
        }
        if (d.measurement) d.measurement.coalescedEvents++
        syncDebug.pipeline.coalesced(normalizedPayload.type, k)
        return
      }
      d.coalesced.set(k, d.queue.length)
    }

    d.queue.push(normalizedPayload)
    scheduleDir(routedDirectory)
  }

  const wsDriver: WsDriver = {
    kind: "ws",
    url: (cursor) => buildGlobalEventWsUrl(cursor),
  }

  const sseDriver: SdkSseDriver = {
    kind: "sse-sdk",
    open: async (opts) => {
      // The SDK's SSE client is lazy: the fetch happens inside the generator
      // and, with sseMaxRetryAttempts: 0, an HTTP/network failure is reported
      // through onSseError and the generator then ends CLEANLY. Capture that
      // error; if the stream ends without delivering a single frame, rethrow
      // it so the transport classifies the failure (permanent 4xx → long
      // backoff cap + disconnect notification) instead of treating a dead
      // stream as a clean completion and hot-looping on the base delay. A
      // stream that delivered frames before ending stays a clean completion —
      // a mid-stream server close is a normal reconnect case.
      let sseFailure: unknown
      let hasSseFailure = false
      const result = await sdk.global.event({
        signal: opts.signal,
        sseMaxRetryAttempts: 0,
        ...(opts.headers ? { headers: opts.headers } : {}),
        onSseEvent: (event: { id?: unknown }) => {
          opts.onSseEvent({ id: typeof event.id === "string" && event.id.length > 0 ? event.id : undefined })
        },
        onSseError: (error: unknown) => {
          if (isAbortError(error)) return
          if (!hasSseFailure) {
            hasSseFailure = true
            sseFailure = error
          }
          if (streamErrorLogged) return
          streamErrorLogged = true
          console.error("[event-pipeline] SSE stream error", error)
        },
      })
      const upstream = result.stream
      return {
        stream: (async function* () {
          let delivered = false
          for await (const event of upstream) {
            delivered = true
            yield event
          }
          if (!delivered && hasSseFailure) {
            throw sseFailure
          }
        })(),
      }
    },
  }

  // Map the transport's error taxonomy back onto the reason strings the
  // pipeline has always reported to onDisconnect consumers.
  const reasonFromTransportError = (error: TransportError): string => {
    switch (error.code) {
      case "ws_closed":
        return `ws_closed:code=${error.closeCode ?? "?"}`
      case "ws_closed_before_ready":
        return "ws_closed_before_ready"
      case "ws_error_frame":
        return `ws_error_frame:${error.message || "unknown"}`
      case "ws_ready_timeout":
        // Legacy display string in WS-only mode (no fallback): the untagged
        // error message under the generic `<transport>_error:` prefix.
        return `${error.transport}_error:${error.message.slice(0, 80)}`
      case "heartbeat_timeout":
      case "system_resume":
      case "offline":
        return `${error.transport}_${error.code}`
      case "manual_retry":
        return `${error.transport}_${error.message || "manual"}`
      default:
        return error.message.length > 0
          ? `${error.transport}_error:${error.message.slice(0, 80)}`
          : `${error.transport}_error:unknown`
    }
  }

  const transportHandle = createEventTransport(
    {
      drivers: transport === "sse" ? { primary: sseDriver } : { primary: wsDriver, fallback: sseDriver },
      transport,
      heartbeatTimeoutMs,
      backoff: {
        baseMs: RETRY_BACKOFF_BASE_MS,
        capVisibleMs: RETRY_BACKOFF_CAP_VISIBLE_MS,
        capHiddenMs: RETRY_BACKOFF_CAP_HIDDEN_OR_OFFLINE_MS,
        maxExponent: RETRY_BACKOFF_MAX_EXPONENT,
      },
      wsReadyTimeoutMs,
      offlineInterrupt: !eventStreamTargetsLoopback(),
    },
    {
      onFrame: (frame, meta) => {
        streamErrorLogged = false
        if (meta.transport === "ws") {
          const wsFrame = frame as MessageStreamWsFrame
          if (wsFrame.type === "backpressure") {
            backpressureUntil = Date.now() + BACKPRESSURE_MODE_MS
            return
          }
          if (wsFrame.type !== "event") {
            return
          }
          const payload = resolveEventPayload(wsFrame.payload)
          if (!payload) {
            return
          }
          const directory = resolveEventDirectory({ directory: wsFrame.directory, payload }, payload)
          enqueueEvent(directory, payload, "ws")
          return
        }

        const payload = resolveEventPayload((frame as { payload?: Event }).payload ?? frame)
        if (!payload) {
          return
        }
        const directory = resolveEventDirectory(frame, payload)
        enqueueEvent(directory, payload, "sse")

        if (payload.type === "server.connected") {
          // The SDK returns a lazy async generator before it performs fetch.
          // This frame is the server's actual subscription acknowledgement.
          // Flush any replayed events first, then let reconnect recovery
          // fetch authoritative snapshots without racing ahead of the
          // subscription.
          flushAll()
          markConnected()
        }
      },
      onConnected: (info) => {
        // WS: the ready frame is the subscription acknowledgement. (The SSE
        // acknowledgement is the server.connected frame, handled in onFrame.)
        if (info.transport !== "ws") {
          return
        }
        flushAll()
        markConnected()
      },
      onDisconnected: (error) => {
        notifyDisconnected(reasonFromTransportError(error))
      },
      onTransportSwitch: () => {
        // A transport switch (WS → SSE fallback) is not a disconnection: a healthy
        // fallback takes over and the UI must not flash "reconnecting". Clearing the
        // latch is what makes that safe — it is the latch, not the switch, that was
        // swallowing the outcome: a fallback that also failed left the phase at
        // "connected" for the whole outage, and a boot against a dead server claimed
        // a connection it never had. Only claim connected once one actually happened
        // (the store's hasEverConnected) — otherwise the phase stays "connecting"
        // until the fallback acknowledges.
        disconnected = false
        if (useConnectionStore.getState().hasEverConnected) {
          markStreamConnected()
        }
        onTransportSwitch?.()
      },
    },
  )

  const reconnect = (reason = "manual") => {
    transportHandle.reconnect(reason)
  }

  const cleanup = () => {
    closed = true
    transportHandle.close()
    flushAll()
  }

  return { cleanup, reconnect }
}
