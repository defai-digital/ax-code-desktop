export const TERMINAL_OUTPUT_REPLAY_MAX_BYTES = 64 * 1024

const trimTerminalOutputChunkToMaxBytes = (data, maxBytes) => {
  if (typeof data !== "string" || data.length === 0) {
    return ""
  }

  const bytes = Buffer.byteLength(data, "utf8")
  if (bytes <= maxBytes) {
    return data
  }

  const kept = []
  let trimmedBytes = 0
  const characters = Array.from(data)
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index]
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (trimmedBytes + characterBytes > maxBytes) {
      break
    }
    kept.push(character)
    trimmedBytes += characterBytes
  }

  return kept.reverse().join("")
}

// Evicted entries stay in `chunks` until one of these thresholds compacts the
// array. A `shift()` per evicted chunk moved every retained pointer on every
// append, which is quadratic for a stream of tiny chunks (65k one-byte echoes
// at the 64 KiB cap). The byte threshold keeps evicted large chunks from
// lingering past one cap's worth of memory.
const COMPACT_AFTER_EVICTED_CHUNKS = 1024

export const createTerminalOutputReplayBuffer = () => ({
  chunks: [],
  // Index of the oldest retained chunk; entries before it are evicted.
  head: 0,
  evictedBytes: 0,
  totalBytes: 0,
  nextId: 1,
})

const retainedChunks = (bufferState) => {
  const head = bufferState.head > 0 ? bufferState.head : 0
  return head > 0 ? bufferState.chunks.slice(head) : bufferState.chunks
}

export const appendTerminalOutputReplayChunk = (bufferState, data, maxBytes = TERMINAL_OUTPUT_REPLAY_MAX_BYTES) => {
  if (!bufferState || typeof bufferState !== "object") {
    return null
  }

  const normalizedData = trimTerminalOutputChunkToMaxBytes(data, maxBytes)
  if (!normalizedData) {
    return null
  }

  const bytes = Buffer.byteLength(normalizedData, "utf8")
  const chunk = {
    id: bufferState.nextId,
    data: normalizedData,
    bytes,
  }

  bufferState.nextId += 1
  bufferState.chunks.push(chunk)
  bufferState.totalBytes += bytes

  let head = bufferState.head > 0 ? bufferState.head : 0
  let evictedBytes = bufferState.evictedBytes > 0 ? bufferState.evictedBytes : 0
  while (bufferState.totalBytes > maxBytes && bufferState.chunks.length - head > 1) {
    const removedBytes = bufferState.chunks[head]?.bytes ?? 0
    bufferState.totalBytes -= removedBytes
    evictedBytes += removedBytes
    head += 1
  }
  if (head >= COMPACT_AFTER_EVICTED_CHUNKS || evictedBytes >= maxBytes) {
    bufferState.chunks.splice(0, head)
    head = 0
    evictedBytes = 0
  }
  bufferState.head = head
  bufferState.evictedBytes = evictedBytes

  return chunk
}

export const listTerminalOutputReplayChunksSince = (bufferState, lastSeenId = 0) => {
  if (!bufferState || typeof bufferState !== "object" || !Array.isArray(bufferState.chunks)) {
    return []
  }

  return retainedChunks(bufferState).filter((chunk) => chunk.id > lastSeenId)
}

// Concatenate the retained replay, oldest chunk first. Callers that attach the
// text to a prompt still apply their own line and byte cap.
export const readTerminalOutputReplayText = (bufferState) =>
  listTerminalOutputReplayChunksSince(bufferState, 0)
    .map((chunk) => (typeof chunk?.data === "string" ? chunk.data : ""))
    .join("")

export const getLatestTerminalOutputReplayChunkId = (bufferState) => {
  if (
    !bufferState ||
    typeof bufferState !== "object" ||
    !Array.isArray(bufferState.chunks) ||
    bufferState.chunks.length === 0
  ) {
    return 0
  }

  return bufferState.chunks[bufferState.chunks.length - 1]?.id ?? 0
}
