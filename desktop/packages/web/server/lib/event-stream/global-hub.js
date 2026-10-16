import { isUpstreamSubscriptionControl } from "./protocol.js"
import { createUpstreamSseReader } from "./upstream-reader.js"

// Raised from 512 → 2048 to improve recovery after brief disconnects during
// long-running agent sessions where many events accumulate quickly.
export const MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT = 2048

export function createGlobalMessageStreamHub({
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  fetchImpl = fetch,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
  replayLimit = MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT,
}) {
  const eventSubscribers = new Set()
  const statusSubscribers = new Set()
  const replay = []

  let controller = null
  let reader = null
  let connected = false
  let everConnected = false
  let buildUrlFailed = false
  // A stopped reader still delivers its final onDisconnect/onEvent callbacks.
  // Without a generation guard a stop() followed by an immediate start() let the
  // old reader's teardown mark the fresh connection as disconnected.
  let connectionGeneration = 0

  const notifySubscriber = (kind, subscriber, payload) => {
    try {
      const result = subscriber(payload)
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          console.warn(`Global message stream ${kind} subscriber failed:`, error)
        })
      }
    } catch (error) {
      console.warn(`Global message stream ${kind} subscriber failed:`, error)
    }
  }

  const notifyStatus = (status) => {
    for (const subscriber of Array.from(statusSubscribers)) {
      notifySubscriber("status", subscriber, status)
    }
  }

  const normalizeEvent = ({ envelope, payload }) => {
    const directory =
      typeof envelope?.directory === "string" && envelope.directory.length > 0 ? envelope.directory : "global"
    const eventId = typeof envelope?.eventId === "string" && envelope.eventId.length > 0 ? envelope.eventId : undefined
    return {
      envelope,
      payload,
      directory,
      eventId,
    }
  }

  // Replay and fan-out share one path so a synthetic event is recoverable exactly
  // like an upstream one.
  const publish = (normalized) => {
    replay.push(normalized)
    if (replay.length > replayLimit) {
      replay.splice(0, replay.length - replayLimit)
    }

    for (const subscriber of Array.from(eventSubscribers)) {
      notifySubscriber("event", subscriber, normalized)
    }
  }

  const start = () => {
    if (reader) {
      return
    }

    connectionGeneration += 1
    const generation = connectionGeneration
    const isCurrentConnection = () => generation === connectionGeneration

    controller = new AbortController()
    reader = createUpstreamSseReader({
      signal: controller.signal,
      stallTimeoutMs: upstreamStallTimeoutMs,
      reconnectDelayMs: upstreamReconnectDelayMs,
      fetchImpl,
      buildUrl: () => {
        buildUrlFailed = false
        try {
          return new URL(buildAxCodeUrl("/global/event", ""))
        } catch {
          buildUrlFailed = true
          throw new Error("AX Code service unavailable")
        }
      },
      getHeaders: getAxCodeAuthHeaders,
      isReadyEvent: ({ payload }) => payload?.type === "server.connected",
      onConnect() {
        if (!isCurrentConnection()) {
          return
        }
        connected = true
        const wasReady = everConnected
        everConnected = true
        notifyStatus({ type: "connect", wasReady })
      },
      onDisconnect({ reason }) {
        if (!isCurrentConnection()) {
          return
        }
        connected = false
        notifyStatus({ type: "disconnect", reason })
      },
      onEvent(event) {
        if (!isCurrentConnection()) {
          return
        }
        const normalized = normalizeEvent(event)
        if (isUpstreamSubscriptionControl(normalized.payload)) {
          return
        }
        // Preserve unidentified domain events too. Their position cannot be
        // acknowledged independently, so replay across them requires a snapshot.
        publish(normalized)
      },
      onOversize({ eventId, bytes }) {
        if (!isCurrentConnection()) {
          return
        }
        console.warn(`Global message stream skipped an upstream event of ${bytes} bytes; requesting a resync`)
        // The skipped event is gone, so every client needs an authoritative
        // snapshot. It carries no event id: replay then also reports a gap to a
        // client that reconnects later, instead of silently omitting the event.
        publish({
          envelope: null,
          payload: {
            type: "server.resync_required",
            properties: { reason: "event_too_large", cursor: eventId ?? undefined },
          },
          directory: "global",
          eventId: undefined,
        })
      },
      onError(error) {
        if (!isCurrentConnection() || controller?.signal.aborted) {
          return
        }

        notifyStatus({
          type: everConnected ? "error" : "initial-error",
          error,
          buildUrlFailed,
        })
      },
    })

    void reader.start()
  }

  const stop = () => {
    // Invalidate this connection before tearing it down so its late callbacks
    // cannot touch state that a following start() now owns.
    connectionGeneration += 1
    const wasConnected = connected
    connected = false
    reader?.stop()
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    reader = null
    controller = null
    everConnected = false
    buildUrlFailed = false
    if (wasConnected) {
      // The reader's own onDisconnect no longer reports this (it is stale now),
      // so the deliberate stop announces it instead.
      notifyStatus({ type: "disconnect", reason: "stopped" })
    }
    // Keep the bounded replay buffer across full teardown so the last browser
    // client can reconnect with Last-Event-ID and recover events it already saw
    // advertised by the previous upstream connection.
  }

  return {
    start,
    stop,
    isConnected() {
      return connected
    },
    hasConnected() {
      return everConnected
    },
    subscribeEvent(subscriber) {
      eventSubscribers.add(subscriber)
      return () => {
        eventSubscribers.delete(subscriber)
      }
    },
    subscribeStatus(subscriber) {
      statusSubscribers.add(subscriber)
      return () => {
        statusSubscribers.delete(subscriber)
      }
    },
    replayAfter(eventId) {
      const cursor = replay.findLast((entry) => entry.eventId)?.eventId
      if (!eventId) {
        return { entries: [], resyncRequired: false, cursor }
      }

      const index = replay.findIndex((entry) => entry.eventId === eventId)
      if (index !== -1) {
        const entries = replay.slice(index + 1)
        return { entries, resyncRequired: entries.some((entry) => !entry.eventId), cursor }
      }
      // Anchor not in the buffer: it was evicted from the front because more
      // than replayLimit events accumulated while the client was disconnected,
      // or this proxy restarted and lost its in-memory journal. Replay the
      // retained tail for responsiveness, but explicitly require an
      // authoritative snapshot so the missing prefix is never silent.
      return { entries: replay.slice(), resyncRequired: true, cursor: cursor ?? eventId }
    },
  }
}
