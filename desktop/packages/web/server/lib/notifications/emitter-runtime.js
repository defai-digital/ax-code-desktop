export const createNotificationEmitterRuntime = (dependencies) => {
  const {
    process,
    getDesktopNotifyEnabled,
    desktopNotifyPrefix,
    getUiNotificationClients,
    getBroadcastGlobalUiEvent,
    // Optional: in-process desktop shells (Electron main) inject a callback so
    // notifications are delivered as a direct function call instead of a stdout
    // stringly-typed IPC.
    onDesktopNotification: initialOnDesktopNotification,
  } = dependencies

  // Late-bindable: main() in server/index.js may call setOnDesktopNotification
  // after runtime construction so the in-process shell can subscribe without
  // restructuring the module-level wiring.
  let onDesktopNotification = typeof initialOnDesktopNotification === "function" ? initialOnDesktopNotification : null

  const setOnDesktopNotification = (cb) => {
    onDesktopNotification = typeof cb === "function" ? cb : null
  }

  // A frozen client (asleep laptop, throttled tab, dead tunnel that never sent an
  // RST) buffers every notification forever; the SSE stream has no other
  // backpressure. End a stream whose pending buffer exceeds the cap — the route's
  // close handler removes the client.
  const SSE_MAX_BUFFERED_BYTES = 4 * 1024 * 1024

  const writeSseEvent = (res, payload) => {
    const buffered = typeof res?.writableLength === "number" ? res.writableLength : 0
    if (buffered > SSE_MAX_BUFFERED_BYTES) {
      try {
        res.end()
      } catch {
        // ignore
      }
      return false
    }

    res.write(`data: ${JSON.stringify(payload)}\n\n`)
    return true
  }

  const emitDesktopNotification = (payload) => {
    const desktopNotifyEnabled = getDesktopNotifyEnabled()
    if (!desktopNotifyEnabled) {
      return
    }

    if (!payload || typeof payload !== "object") {
      return
    }

    if (onDesktopNotification) {
      try {
        onDesktopNotification(payload)
      } catch {
        // ignore host-side throw
      }
      return
    }

    try {
      // stdout IPC: Tauri shell spawns this process as a sidecar and parses
      // its stdout for the one-line `${prefix}{json}` protocol.
      process.stdout.write(`${desktopNotifyPrefix}${JSON.stringify(payload)}\n`)
    } catch {
      // ignore
    }
  }

  const broadcastUiNotification = (payload) => {
    const desktopNotifyEnabled = getDesktopNotifyEnabled()
    if (!payload || typeof payload !== "object") {
      return
    }

    const syntheticPayload = {
      type: "openchamber:notification",
      properties: {
        ...payload,
        // Tell the UI whether the sidecar stdout notification channel is active.
        // When true, the desktop UI should skip this SSE notification to avoid duplicates.
        // When false (e.g. tauri dev), the UI must handle this SSE notification itself.
        desktopStdoutActive: desktopNotifyEnabled,
      },
    }

    const broadcastGlobalUiEvent = typeof getBroadcastGlobalUiEvent === "function" ? getBroadcastGlobalUiEvent() : null
    if (broadcastGlobalUiEvent) {
      broadcastGlobalUiEvent(syntheticPayload)
      return
    }

    const clients = getUiNotificationClients()
    if (clients.size === 0) {
      return
    }

    for (const res of clients) {
      try {
        writeSseEvent(res, syntheticPayload)
      } catch {
        // ignore
      }
    }
  }

  return {
    writeSseEvent,
    emitDesktopNotification,
    broadcastUiNotification,
    setOnDesktopNotification,
  }
}
