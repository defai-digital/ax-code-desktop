import { describe, expect, it } from "vitest"

import {
  TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
  appendTerminalOutputReplayChunk,
  createTerminalOutputReplayBuffer,
  getLatestTerminalOutputReplayChunkId,
  listTerminalOutputReplayChunksSince,
  readTerminalOutputReplayText,
} from "./output-replay-buffer.js"

describe("terminal output replay buffer", () => {
  it("starts empty", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    expect(bufferState).toEqual({ chunks: [], head: 0, evictedBytes: 0, totalBytes: 0, nextId: 1 })
    expect(getLatestTerminalOutputReplayChunkId(bufferState)).toBe(0)
  })

  it("appends chunks with incrementing ids", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const first = appendTerminalOutputReplayChunk(bufferState, "prompt> ")
    const second = appendTerminalOutputReplayChunk(bufferState, "ls\r\n")

    expect(first).toEqual({ id: 1, data: "prompt> ", bytes: 8 })
    expect(second).toEqual({ id: 2, data: "ls\r\n", bytes: 4 })
    expect(getLatestTerminalOutputReplayChunkId(bufferState)).toBe(2)
  })

  it("reads the retained replay as one string", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    appendTerminalOutputReplayChunk(bufferState, "prompt> ")
    appendTerminalOutputReplayChunk(bufferState, "ls\r\n")

    expect(readTerminalOutputReplayText(bufferState)).toBe("prompt> ls\r\n")
    expect(readTerminalOutputReplayText(null)).toBe("")
  })

  it("lists chunks after a replay cursor", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    appendTerminalOutputReplayChunk(bufferState, "prompt> ")
    appendTerminalOutputReplayChunk(bufferState, "ls\r\n")
    appendTerminalOutputReplayChunk(bufferState, "file.txt\r\n")

    expect(listTerminalOutputReplayChunksSince(bufferState, 1).map((chunk) => chunk.data)).toEqual([
      "ls\r\n",
      "file.txt\r\n",
    ])
  })

  it("trims old chunks beyond max bytes", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    appendTerminalOutputReplayChunk(bufferState, "1234", 8)
    appendTerminalOutputReplayChunk(bufferState, "5678", 8)
    appendTerminalOutputReplayChunk(bufferState, "90", 8)

    expect(listTerminalOutputReplayChunksSince(bufferState, 0).map((chunk) => chunk.data)).toEqual(["5678", "90"])
    expect(readTerminalOutputReplayText(bufferState)).toBe("567890")
    expect(bufferState.totalBytes).toBe(6)
  })

  it("keeps order, cursor and cap across many tiny chunks", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const total = 5000
    for (let index = 0; index < total; index += 1) {
      appendTerminalOutputReplayChunk(bufferState, String(index % 10), 64)
    }

    const expected = Array.from({ length: 64 }, (_, offset) => String((total - 64 + offset) % 10)).join("")
    expect(readTerminalOutputReplayText(bufferState)).toBe(expected)
    expect(bufferState.totalBytes).toBe(64)
    expect(getLatestTerminalOutputReplayChunkId(bufferState)).toBe(total)
    expect(listTerminalOutputReplayChunksSince(bufferState, total - 3).map((chunk) => chunk.id)).toEqual([
      total - 2,
      total - 1,
      total,
    ])
    expect(listTerminalOutputReplayChunksSince(bufferState, 0)).toHaveLength(64)
  })

  it("releases evicted chunks once they amount to one cap of bytes", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const big = "x".repeat(40)
    appendTerminalOutputReplayChunk(bufferState, big, 64)
    appendTerminalOutputReplayChunk(bufferState, big, 64)
    expect(listTerminalOutputReplayChunksSince(bufferState, 0)).toHaveLength(1)
    expect(bufferState.chunks).toHaveLength(2)

    appendTerminalOutputReplayChunk(bufferState, big, 64)
    expect(listTerminalOutputReplayChunksSince(bufferState, 0).map((chunk) => chunk.id)).toEqual([3])
    expect(bufferState.chunks).toHaveLength(1)
    expect(bufferState.head).toBe(0)
  })

  it("retains the newest chunks after a long stream of one-byte chunks", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    // 150k appends at the default cap retain about 65k chunks (1.7 s with a shift per
    // eviction, 20 ms with the head index on the 2026-10-31 host).
    for (let index = 0; index < 150_000; index += 1) {
      appendTerminalOutputReplayChunk(bufferState, "y")
    }
    expect(bufferState.totalBytes).toBe(TERMINAL_OUTPUT_REPLAY_MAX_BYTES)
    expect(listTerminalOutputReplayChunksSince(bufferState, 149_998).map((chunk) => chunk.id)).toEqual([
      149_999,
      150_000,
    ])
  })

  it("trims oversized single chunks to the configured max bytes", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const chunk = appendTerminalOutputReplayChunk(bufferState, "abcdefghij", 4)

    expect(chunk?.data).toBe("ghij")
    expect(chunk?.bytes).toBe(4)
    expect(bufferState.totalBytes).toBe(4)
  })

  it("does not split multibyte characters when trimming oversized chunks", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const chunk = appendTerminalOutputReplayChunk(bufferState, "🙂x", 2)

    expect(chunk?.data).toBe("x")
    expect(chunk?.bytes).toBe(1)
    expect(bufferState.totalBytes).toBe(1)
  })

  it("uses the default max bytes when not provided", () => {
    const bufferState = createTerminalOutputReplayBuffer()
    const chunk = appendTerminalOutputReplayChunk(bufferState, "ok")

    expect(chunk?.bytes).toBe(2)
    expect(TERMINAL_OUTPUT_REPLAY_MAX_BYTES).toBe(64 * 1024)
  })
})
