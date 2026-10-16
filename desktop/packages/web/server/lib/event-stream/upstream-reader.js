import { parseSseEventEnvelope } from "./protocol.js"

export const DEFAULT_UPSTREAM_STALL_TIMEOUT_MS = 20_000
export const UPSTREAM_STALL_TIMEOUT_CONCURRENT_MS = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS * 3
export const DEFAULT_UPSTREAM_RECONNECT_DELAY_MS = 250
// An upstream that keeps sending data without ever completing an event block
// resets the stall timer on every chunk, so the decode buffer needs its own
// ceiling: without one a single hostile or broken stream grows an unbounded
// string per subscriber until the process runs out of memory.
export const DEFAULT_UPSTREAM_MAX_BUFFER_BYTES = 1024 * 1024
// A single event larger than the buffer ceiling is skipped, not fatal: tearing the
// connection down makes the runtime replay the same event after `Last-Event-ID`,
// which wedges the stream in a reconnect loop behind it. Skipping is bounded by
// this size (the SDK's own per-event cap); a block beyond it is treated as a
// broken stream and the connection is dropped, as before.
export const DEFAULT_UPSTREAM_MAX_EVENT_BYTES = 16 * 1024 * 1024
// While skipping, the tail is kept to spot an event separator ("\n\n", or
// "\r\n\r\n" normalized) that straddles two chunks, and to read an `id:` line
// that trails the block.
const OVERSIZE_TAIL_CHARS = 4096
const OVERSIZE_ID_SCAN_CHARS = 4096

// A writer may lead a block with its `id:` line, which makes it readable from
// the head of an event whose body is too large to keep.
function readLeadingEventId(buffer) {
  const lines = buffer.slice(0, OVERSIZE_ID_SCAN_CHARS).split("\n")
  if (buffer.length > OVERSIZE_ID_SCAN_CHARS) lines.pop()
  for (const line of lines) {
    if (line.startsWith("id:")) return line.slice(3).trim() || null
  }
  return null
}

// The runtime's own frames carry `id:` after the data, so only the tail of a
// block that is too large to keep can see it. A repeated `id` field overwrites
// the earlier ones, so the last line wins.
function readTrailingEventId(text) {
  const pattern = /(?:^|\n)id:[ \t]?([^\n]*)/g
  let eventId = null
  let match
  while ((match = pattern.exec(text))) eventId = match[1].trim()
  return eventId || null
}

function resolveTimeoutMs(value, fallback) {
  const resolved = typeof value === "function" ? value() : value
  return Number.isFinite(resolved) ? resolved : fallback
}

function waitForReconnectDelay(ms, signal) {
  if (signal?.aborted) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }
    const timeout = setTimeout(finish, Math.max(0, ms))
    // Reconnect delays must not prevent the server process from
    // exiting during graceful shutdown.
    if (typeof timeout.unref === "function") timeout.unref()
    const onAbort = () => {
      clearTimeout(timeout)
      finish()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return {}
  }

  return { ...headers }
}

async function cancelResponseBody(response) {
  if (response?.body && typeof response.body.cancel === "function") {
    await response.body.cancel().catch(() => {})
  }
}

export function createUpstreamSseReader({
  buildUrl,
  getHeaders = () => ({}),
  fetchImpl = fetch,
  parseBlock = parseSseEventEnvelope,
  initialLastEventId = "",
  signal,
  stallTimeoutMs = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
  reconnectDelayMs = DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  maxBufferBytes = DEFAULT_UPSTREAM_MAX_BUFFER_BYTES,
  maxEventBytes = DEFAULT_UPSTREAM_MAX_EVENT_BYTES,
  onEvent,
  onOversize,
  onConnect,
  onDisconnect,
  onError,
  isReadyEvent,
}) {
  let running = null
  let stopped = false
  let activeController = null
  let lastEventId = typeof initialLastEventId === "string" ? initialLastEventId : ""
  let stopListenerAttached = false

  function detachStopListener() {
    if (!stopListenerAttached) return
    signal?.removeEventListener("abort", stop)
    stopListenerAttached = false
  }

  function attachStopListener() {
    if (!signal || signal.aborted || stopListenerAttached) return
    signal.addEventListener("abort", stop, { once: true })
    stopListenerAttached = true
  }

  function stop() {
    stopped = true
    detachStopListener()
    if (activeController && !activeController.signal.aborted) {
      activeController.abort()
    }
  }

  const start = () => {
    if (running) {
      return running
    }

    attachStopListener()
    stopped = false
    running = (async () => {
      while (!stopped && !signal?.aborted) {
        const controller = new AbortController()
        activeController = controller
        const abortActive = () => controller.abort()
        signal?.addEventListener("abort", abortActive, { once: true })

        let abortReason = null
        let attemptConnected = false
        let reader = null
        let stallTimer = null
        // Set while an event larger than maxBufferBytes is being skipped. It is
        // declared here so the error path below can settle it as well.
        let oversize = null
        const settleOversize = (eventId) => {
          if (!oversize) return
          const skipped = oversize
          oversize = null
          onOversize?.({ eventId: eventId ?? skipped.eventId, bytes: skipped.bytes })
        }
        const clearStallTimer = () => {
          if (stallTimer) {
            clearTimeout(stallTimer)
            stallTimer = null
          }
        }
        const resetStallTimer = () => {
          clearStallTimer()
          const currentStallTimeoutMs = resolveTimeoutMs(stallTimeoutMs, DEFAULT_UPSTREAM_STALL_TIMEOUT_MS)
          if (currentStallTimeoutMs <= 0) {
            return
          }

          stallTimer = setTimeout(() => {
            abortReason = "upstream_stalled"
            controller.abort()
          }, currentStallTimeoutMs)
          // Stall timers must not prevent the Node.js server process from
          // exiting during graceful shutdown.
          if (typeof stallTimer.unref === "function") stallTimer.unref()
        }

        try {
          const url = buildUrl()
          const headers = {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...normalizeHeaders(getHeaders()),
          }
          if (lastEventId) {
            headers["Last-Event-ID"] = lastEventId
          }

          const response = await fetchImpl(url.toString(), {
            headers,
            signal: controller.signal,
          })

          if (!response?.ok || !response.body) {
            onError?.({
              type: "upstream_unavailable",
              status: response?.status ?? 0,
              response,
            })
            await cancelResponseBody(response)
            await waitForReconnectDelay(reconnectDelayMs, signal)
            continue
          }

          if (typeof isReadyEvent !== "function") {
            attemptConnected = true
            onConnect?.({ response, lastEventId })
          }

          const decoder = new TextDecoder()
          reader = response.body.getReader()
          let buffer = ""

          resetStallTimer()

          while (!stopped && !signal?.aborted) {
            const { value, done } = await reader.read()
            if (done) {
              break
            }

            resetStallTimer()
            buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n")
            if (oversize) {
              oversize.bytes += value.byteLength
              const end = buffer.indexOf("\n\n")
              if (end === -1) {
                if (oversize.bytes > Math.max(maxEventBytes, maxBufferBytes)) {
                  settleOversize()
                  throw new Error(`upstream event exceeded ${maxEventBytes} bytes without a complete event`)
                }
                buffer = buffer.slice(-OVERSIZE_TAIL_CHARS)
                continue
              }
              // The skipped block's own `id:` was kept in the tail; advancing to
              // it is what stops a reconnect from asking for the same event.
              const skippedId = readTrailingEventId(buffer.slice(0, end))
              if (skippedId) lastEventId = skippedId
              buffer = buffer.slice(end + 2)
              settleOversize(skippedId)
            }

            let separatorIndex = buffer.indexOf("\n\n")
            while (separatorIndex !== -1 && !stopped && !signal?.aborted) {
              const block = buffer.slice(0, separatorIndex)
              buffer = buffer.slice(separatorIndex + 2)
              const envelope = parseBlock(block)
              if (envelope?.payload) {
                if (typeof envelope.eventId === "string" && envelope.eventId.length > 0) {
                  lastEventId = envelope.eventId
                }
                const event = {
                  block,
                  envelope,
                  payload: envelope.payload,
                  eventId: envelope.eventId,
                  directory: envelope.directory,
                }
                if (!attemptConnected && isReadyEvent?.(event)) {
                  attemptConnected = true
                  onConnect?.({ response, lastEventId })
                }
                onEvent?.(event)
              }
              separatorIndex = buffer.indexOf("\n\n")
            }

            // Only the incomplete tail counts toward the ceiling: a chunk may carry
            // many complete events. A tail that is still growing past it is one
            // event too large to hold (or a peer that never ends a block).
            if (buffer.length > maxBufferBytes && !stopped && !signal?.aborted) {
              oversize = { eventId: readLeadingEventId(buffer), bytes: buffer.length }
              // A writer that leads with `id:` can be advanced past right away;
              // one that trails it is advanced when the tail settles below.
              if (oversize.eventId) lastEventId = oversize.eventId
              if (oversize.bytes > Math.max(maxEventBytes, maxBufferBytes)) {
                settleOversize()
                throw new Error(`upstream event exceeded ${maxEventBytes} bytes without a complete event`)
              }
              buffer = buffer.slice(-OVERSIZE_TAIL_CHARS)
            }
          }

          if (oversize) {
            // The stream ended mid-skip: the event is lost, so consumers must resync.
            if (!stopped && !signal?.aborted) settleOversize()
            oversize = null
            buffer = ""
          }

          if (!stopped && !signal?.aborted && buffer.trim().length > 0) {
            const block = buffer.trim()
            const envelope = parseBlock(block)
            if (envelope?.payload) {
              if (typeof envelope.eventId === "string" && envelope.eventId.length > 0) {
                lastEventId = envelope.eventId
              }
              const event = {
                block,
                envelope,
                payload: envelope.payload,
                eventId: envelope.eventId,
                directory: envelope.directory,
              }
              if (!attemptConnected && isReadyEvent?.(event)) {
                onConnect?.({ response, lastEventId })
              }
              onEvent?.(event)
            }
          }
        } catch (error) {
          // A skip abandoned by a read error or the stall timer has already
          // moved `Last-Event-ID` past an event nobody received, so consumers
          // have to resync just as they do when a skip ends cleanly.
          if (oversize && !stopped && !signal?.aborted) settleOversize()
          if (!stopped && !signal?.aborted && abortReason !== "upstream_stalled") {
            onError?.({
              type: "stream_error",
              error,
            })
          }
        } finally {
          clearStallTimer()
          if (reader && typeof reader.cancel === "function") {
            await reader.cancel().catch(() => {})
          }
          reader = null
          signal?.removeEventListener("abort", abortActive)
          if (activeController === controller) {
            activeController = null
          }
          onDisconnect?.({ reason: abortReason ?? (stopped || signal?.aborted ? "stopped" : "closed") })
        }

        if (!stopped && !signal?.aborted) {
          await waitForReconnectDelay(reconnectDelayMs, signal)
        }
      }
    })().finally(() => {
      detachStopListener()
      running = null
    })

    return running
  }

  return {
    start,
    stop,
    getLastEventId() {
      return lastEventId
    },
  }
}
