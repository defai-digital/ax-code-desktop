import { createUpstreamSseReader } from "../event-stream/upstream-reader.js"

export const createAxCodeWatcherRuntime = (deps) => {
  const {
    waitForAxCodePort,
    buildAxCodeUrl,
    getAxCodeAuthHeaders,
    onPayload,
    fetchImpl = fetch,
    upstreamStallTimeoutMs,
    upstreamReconnectDelayMs = 1000,
    globalEventHub = null,
  } = deps

  let abortController = null
  let reader = null
  let unsubscribeEvent = null
  let unsubscribeStatus = null

  const unwrapGlobalEventPayload = (eventData) => {
    if (!eventData || typeof eventData !== "object") {
      return null
    }

    if (eventData.payload && typeof eventData.payload === "object") {
      return eventData.payload
    }

    return eventData
  }

  const start = async () => {
    if (abortController) {
      return
    }

    // Claimed before the port wait so stop() can cancel a start that is still waiting
    // for the runtime: stop() used to return early with no controller, and this start
    // then subscribed and started the shared hub after the caller had stopped it.
    const controller = new AbortController()
    abortController = controller
    const signal = controller.signal

    try {
      await waitForAxCodePort()
    } catch (error) {
      // The claim exists so stop() can cancel a start that is still waiting for the
      // runtime. A failed wait must release it: the guard above reads the claim as
      // "a start is in flight", so a rejected start left it set and every later
      // start() returned immediately - a silent stream for the rest of the process.
      if (abortController === controller) {
        abortController = null
      }
      throw error
    }

    if (signal.aborted || abortController !== controller) {
      return
    }

    if (globalEventHub) {
      unsubscribeEvent = globalEventHub.subscribeEvent((event) => {
        const payload = unwrapGlobalEventPayload(event.payload)
        if (!payload || typeof payload !== "object") {
          return
        }
        onPayload(payload)
      })
      unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
        if (signal.aborted) {
          return
        }
        if (status.type === "connect") {
          console.log("[PushWatcher] connected")
          return
        }
        if (status.type === "error" || status.type === "initial-error") {
          console.warn(
            "[PushWatcher] disconnected",
            status.error?.error?.message ?? status.error?.message ?? status.error,
          )
        }
      })
      globalEventHub.start()
      return
    }

    reader = createUpstreamSseReader({
      signal,
      buildUrl: () => buildAxCodeUrl("/global/event", ""),
      getHeaders: getAxCodeAuthHeaders,
      fetchImpl,
      stallTimeoutMs: upstreamStallTimeoutMs,
      reconnectDelayMs: upstreamReconnectDelayMs,
      isReadyEvent: ({ payload }) => payload?.type === "server.connected",
      onConnect() {
        console.log("[PushWatcher] connected")
      },
      onEvent(event) {
        const payload = unwrapGlobalEventPayload(event.payload)
        if (!payload || typeof payload !== "object") {
          return
        }
        onPayload(payload)
      },
      onOversize({ bytes }) {
        console.warn(`[PushWatcher] skipped an upstream event of ${bytes} bytes`)
      },
      onError(error) {
        if (signal.aborted) {
          return
        }
        console.warn("[PushWatcher] disconnected", error?.error?.message ?? error?.message ?? error)
      },
    })

    void reader.start()
  }

  const stop = () => {
    if (!abortController) {
      return
    }
    try {
      abortController.abort()
      reader?.stop()
      unsubscribeEvent?.()
      unsubscribeStatus?.()
    } catch {}
    reader = null
    unsubscribeEvent = null
    unsubscribeStatus = null
    abortController = null
  }

  return {
    start,
    stop,
  }
}
