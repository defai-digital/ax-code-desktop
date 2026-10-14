import { isUpstreamSubscriptionControl, sendMessageStreamWsEvent, sendMessageStreamWsFrame } from "./protocol.js"
import { shouldTriggerUpstreamHealthCheck } from "./upstream-health.js"
import { createUpstreamSseReader } from "./upstream-reader.js"
import { createWsLivenessTracker } from "./ws-liveness.js"

export function acceptDirectoryMessageStreamWsConnection({
  socket,
  requestedLastEventId,
  requestedDirectory,
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  processForwardedEventPayload,
  wsClients,
  triggerHealthCheck,
  heartbeatIntervalMs,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
  fetchImpl,
}) {
  const controller = new AbortController()
  let upstreamConnected = false
  let streamReady = false
  // The client protocol requires the ready frame to precede any event frame;
  // events that arrive from the upstream before it are held here (bounded) and
  // flushed once ready has been sent.
  const pendingEvents = []
  const MAX_PENDING_EVENTS = 200
  let reader = null
  let closed = false

  const cleanup = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
    reader?.stop()
    wsClients.delete(socket)
  }

  const cleanupAfterClose = () => {
    if (closed) {
      return
    }
    closed = true
    livenessTracker.stop()
    pendingEvents.length = 0
    clearInterval(heartbeatInterval)
    upstreamConnected = false
    cleanup()
  }

  const closeAndCleanup = (code = 1011, reason = "Message stream client unavailable") => {
    cleanupAfterClose()
    try {
      if (socket.readyState === 1 || socket.readyState === 0) {
        socket.close(code, reason)
      }
    } catch {}
  }

  // Pinging is not enough on its own: without pong supervision a peer that
  // vanished silently kept its interval, upstream subscription and client-set
  // entry until the OS TCP timeout fired.
  const livenessTracker = createWsLivenessTracker(socket, {
    intervalMs: heartbeatIntervalMs,
    onDead: () => {
      try {
        socket.terminate()
      } catch {}
    },
  })

  const heartbeatInterval = setInterval(() => {
    if (!upstreamConnected) {
      return
    }

    const sent = sendMessageStreamWsEvent(
      socket,
      { type: "openchamber:heartbeat", timestamp: Date.now() },
      {
        directory: requestedDirectory || "global",
      },
    )
    if (!sent) {
      closeAndCleanup()
    }
  }, heartbeatIntervalMs)
  if (typeof heartbeatInterval.unref === "function") heartbeatInterval.unref()

  socket.on("close", () => {
    cleanupAfterClose()
  })

  socket.on("error", (error) => {
    // The `ws` library emits "error" before "close" for recoverable
    // transport errors, but an unhandled "error" event crashes the Node
    // process. Log and rely on the "close" handler for interval cleanup.
    console.warn("[directory-ws-bridge] socket error:", error?.message ?? error)
  })

  const run = async () => {
    const sendEvent = ({ envelope, payload }) => {
      const directory = requestedDirectory || envelope?.directory || "global"

      const sent = sendMessageStreamWsEvent(socket, payload, {
        directory,
        eventId: typeof envelope?.eventId === "string" && envelope.eventId.length > 0 ? envelope.eventId : undefined,
      })
      if (!sent) {
        closeAndCleanup()
        return
      }

      // A throwing handler used to escape into the reader, which reported a
      // stream error, reconnected, and lost this event (its id had already been
      // recorded as delivered). One bad payload must not cost the connection.
      try {
        processForwardedEventPayload(payload, (syntheticPayload) => {
          const syntheticSent = sendMessageStreamWsEvent(socket, syntheticPayload, { directory: "global" })
          if (!syntheticSent) {
            closeAndCleanup()
          }
        })
      } catch (error) {
        console.warn("[directory-ws-bridge] forwarded-event handler failed:", error?.message ?? error)
      }
    }

    const forwardEvent = (event) => {
      if (isUpstreamSubscriptionControl(event?.payload)) {
        return
      }
      if (!streamReady) {
        pendingEvents.push(event)
        if (pendingEvents.length > MAX_PENDING_EVENTS) {
          pendingEvents.shift()
        }
        return
      }
      sendEvent(event)
    }

    try {
      let buildUrlFailed = false
      const closeWithInitialError = ({ message, closeReason = message, triggerHealthCheckFor = null }) => {
        sendMessageStreamWsFrame(socket, { type: "error", message })
        socket.close(1011, closeReason)
        if (
          triggerHealthCheckFor === true ||
          (triggerHealthCheckFor && shouldTriggerUpstreamHealthCheck(triggerHealthCheckFor))
        ) {
          triggerHealthCheck?.()
        }
        reader?.stop()
        cleanup()
      }

      reader = createUpstreamSseReader({
        initialLastEventId: requestedLastEventId,
        signal: controller.signal,
        stallTimeoutMs: upstreamStallTimeoutMs,
        reconnectDelayMs: upstreamReconnectDelayMs,
        fetchImpl,
        buildUrl: () => {
          buildUrlFailed = false
          let targetUrl
          try {
            targetUrl = new URL(buildAxCodeUrl("/event", ""))
          } catch {
            buildUrlFailed = true
            throw new Error("AX Code service unavailable")
          }

          if (requestedDirectory) {
            targetUrl.searchParams.set("directory", requestedDirectory)
          }

          return targetUrl
        },
        getHeaders: getAxCodeAuthHeaders,
        isReadyEvent: ({ payload }) => payload?.type === "server.connected",
        onConnect() {
          if (!streamReady) {
            const readySent = sendMessageStreamWsFrame(socket, {
              type: "ready",
              scope: "directory",
            })
            if (!readySent) {
              closeAndCleanup()
              return
            }
            streamReady = true
            wsClients.add(socket)
            for (const event of pendingEvents.splice(0, pendingEvents.length)) {
              sendEvent(event)
              if (closed) {
                return
              }
            }
          }

          upstreamConnected = true
        },
        onDisconnect() {
          upstreamConnected = false
        },
        onEvent: forwardEvent,
        onError(error) {
          if (controller.signal.aborted) {
            return
          }

          if (!streamReady) {
            if (error?.type === "upstream_unavailable") {
              closeWithInitialError({
                message: `AX Code event stream unavailable (${error.status})`,
                closeReason: "AX Code event stream unavailable",
                triggerHealthCheckFor: error.response,
              })
              return
            }

            closeWithInitialError({
              message: buildUrlFailed ? "AX Code service unavailable" : "Failed to connect to AX Code event stream",
              closeReason: buildUrlFailed ? "AX Code service unavailable" : "Failed to connect to AX Code event stream",
              triggerHealthCheckFor: !buildUrlFailed,
            })
            return
          }

          if (error?.type === "stream_error") {
            console.warn("Message stream WS proxy error:", error.error)
          }
        },
      })

      await reader.start()
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn("Message stream WS proxy error:", error)
        sendMessageStreamWsFrame(socket, { type: "error", message: "Message stream proxy error" })
        socket.close(1011, "Message stream proxy error")
      }
    } finally {
      cleanup()
      try {
        if (socket.readyState === 1 || socket.readyState === 0) {
          socket.close()
        }
      } catch {}
    }
  }

  void run()
}
