import { describe, expect, it } from "vitest"

import { createNotificationEmitterRuntime } from "./emitter-runtime.js"

const createRuntime = (overrides = {}) =>
  createNotificationEmitterRuntime({
    process: { stdout: { write: () => {} } },
    getDesktopNotifyEnabled: () => false,
    desktopNotifyPrefix: "@@",
    getUiNotificationClients: () => new Set(),
    getBroadcastGlobalUiEvent: () => null,
    ...overrides,
  })

const createResponse = (writableLength = 0) => ({
  writableLength,
  written: [],
  ended: false,
  write(chunk) {
    this.written.push(chunk)
  },
  end() {
    this.ended = true
  },
})

describe("notification emitter", () => {
  it("writes one SSE frame per notification", () => {
    const runtime = createRuntime()
    const res = createResponse()

    expect(runtime.writeSseEvent(res, { type: "x" })).toBe(true)

    expect(res.written).toEqual([`data: ${JSON.stringify({ type: "x" })}\n\n`])
    expect(res.ended).toBe(false)
  })

  it("ends a stream whose pending buffer exceeds the cap instead of buffering forever", () => {
    // A frozen client never drains; without this the notification fan-out grew the
    // response buffer until the process ran out of memory.
    const runtime = createRuntime()
    const res = createResponse(5 * 1024 * 1024)

    expect(runtime.writeSseEvent(res, { type: "x" })).toBe(false)

    expect(res.written).toEqual([])
    expect(res.ended).toBe(true)
  })

  it("keeps writing while the pending buffer is under the cap", () => {
    const runtime = createRuntime()
    const res = createResponse(1024)

    expect(runtime.writeSseEvent(res, { type: "x" })).toBe(true)
    expect(res.ended).toBe(false)
  })
})
