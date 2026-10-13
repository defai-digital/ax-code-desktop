/** Renderer-safe decoder. Cursor acknowledgement belongs to the consumer after applying the entire batch. */
export function decodeNativeBatch(line) {
  if (typeof line !== "string" || line.length > 4 * 1024 * 1024) throw new Error("Invalid native batch")
  const batch = JSON.parse(line)
  if (
    batch?.schema !== 1 ||
    !Array.isArray(batch.frames) ||
    batch.frames.length > 512 ||
    typeof batch.cursor !== "string" ||
    batch.cursor.length > 512
  )
    throw new Error("Invalid native batch")
  for (const frame of batch.frames) {
    if (frame?.type === "ready" && frame.scope === "global") continue
    if (
      frame?.type !== "event" ||
      !frame.payload ||
      typeof frame.payload !== "object" ||
      typeof frame.directory !== "string" ||
      (frame.eventId !== undefined && typeof frame.eventId !== "string")
    )
      throw new Error("Invalid native frame")
  }
  return batch
}
