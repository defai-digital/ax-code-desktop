import { parseSseEventEnvelope } from "../../../desktop/packages/web/server/lib/event-stream/protocol.js"

/** Architectural control: direct SSE -> bounded IPC batches without changing the language. */
export async function* createJsEventStream({ endpoint, authorization, signal }) {
  const response = await fetch(endpoint, {
    headers: { Accept: "text/event-stream", Authorization: authorization },
    redirect: "error",
    signal,
  })
  if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body)
    throw new Error("JS fixture upstream failed")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = "",
    frames = [],
    bytes = 0,
    cursor = "",
    connected = false,
    deadline = 0
  let read = reader.read()
  const batch = () => {
    const output = { batch: { schema: 1, frames, cursor }, byteLength: bytes + 1024 }
    frames = []
    bytes = 0
    return output
  }
  try {
    while (!signal?.aborted) {
      let result
      if (frames.length) {
        let timer
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), Math.max(0, deadline - performance.now()))
        })
        result = await Promise.race([read, timeout])
        clearTimeout(timer)
        if (result === null) {
          yield batch()
          continue
        }
      } else result = await read
      if (result.done) buffer += decoder.decode()
      else buffer += decoder.decode(result.value, { stream: true })
      buffer = buffer.replace(/\r\n/g, "\n")
      let end = buffer.indexOf("\n\n")
      while (end !== -1 || (result.done && buffer.trim())) {
        const block = end === -1 ? buffer.trim() : buffer.slice(0, end)
        buffer = end === -1 ? "" : buffer.slice(end + 2)
        if (Buffer.byteLength(block) > 1024 * 1024) throw new Error("JS fixture frame limit")
        const envelope = parseSseEventEnvelope(block)
        if (envelope?.payload) {
          if (frames.length === 512) yield batch()
          const priorCursor = cursor
          cursor = envelope.eventId || cursor
          let frame
          if (envelope.payload.type === "server.connected") {
            if (!connected) frame = { type: "ready", scope: "global" }
            connected = true
          } else if (envelope.payload.type !== "server.heartbeat") {
            frame = {
              type: "event",
              payload: envelope.payload,
              directory: envelope.directory || "global",
              ...(envelope.eventId ? { eventId: envelope.eventId } : {}),
            }
          }
          if (frame) {
            const size = Buffer.byteLength(JSON.stringify(frame)) + 1
            if (size + 1024 > 4 * 1024 * 1024) throw new Error("JS fixture batch limit")
            if (bytes + size + 1024 > 4 * 1024 * 1024) {
              const nextCursor = cursor
              cursor = priorCursor
              yield batch()
              cursor = nextCursor
            }
            if (!frames.length) deadline = performance.now() + 2
            frames.push(frame)
            bytes += size
          }
        }
        end = buffer.indexOf("\n\n")
      }
      if (Buffer.byteLength(buffer) > 1024 * 1024) throw new Error("JS fixture frame limit")
      if (result.done) {
        if (frames.length) yield batch()
        return
      }
      read = reader.read()
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
