import { describe, expect, it } from "vitest"

import { createSseResponse } from "./test-helpers.js"
import { createUpstreamSseReader } from "./upstream-reader.js"

function createTrackedSignal() {
  const listeners = new Set()
  return {
    signal: {
      aborted: false,
      addEventListener(type, listener) {
        if (type === "abort") {
          listeners.add(listener)
        }
      },
      removeEventListener(type, listener) {
        if (type === "abort") {
          listeners.delete(listener)
        }
      },
    },
    getListenerCount() {
      return listeners.size
    },
  }
}

describe("createUpstreamSseReader buffer ceiling", () => {
  it("drops a stream that never completes an event block instead of buffering forever", async () => {
    const errors = []
    const disconnects = []
    let attempts = 0
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      maxBufferBytes: 512,
      maxEventBytes: 1024,
      fetchImpl: async (_url, options) => {
        attempts += 1
        if (attempts === 1) {
          // Data without a single event separator: the stall timer keeps being
          // reset, so
          // only a buffer ceiling can stop this from growing without bound.
          return createSseResponse({
            signal: options.signal,
            blocks: ["dat" + "a".repeat(2000)],
          })
        }
        return createSseResponse({ blocks: ['data: {"type":"server.connected"}\n\n'] })
      },
      onEvent() {
        reader.stop()
      },
      onDisconnect(payload) {
        disconnects.push(payload)
      },
      onError(payload) {
        errors.push(payload)
      },
    })

    await reader.start()

    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe("stream_error")
    expect(errors[0].error.message).toContain("without a complete event")
    expect(disconnects.length).toBeGreaterThan(0)
    expect(attempts).toBe(2)
  })
})

describe("createUpstreamSseReader oversized events", () => {
  const evt = (id, text = "x") => `id: ${id}\ndata: {"type":"session.updated","properties":{"text":"${text}"}}\n\n`

  async function collect({ blocks, holdOpen = false, ...options }) {
    const events = []
    const oversize = []
    const errors = []
    const headers = []
    let attempts = 0
    let reader
    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      maxBufferBytes: 512,
      maxEventBytes: 64 * 1024,
      ...options,
      fetchImpl: async (_url, init) => {
        attempts += 1
        headers.push(init.headers["Last-Event-ID"])
        if (attempts > 1) {
          reader.stop()
          return createSseResponse({ blocks: [] })
        }
        return createSseResponse({ blocks, signal: init.signal, holdOpen })
      },
      onEvent(event) {
        events.push(event.eventId)
        if (options.stopAfter && events.length >= options.stopAfter) reader.stop()
      },
      onOversize: (info) => oversize.push(info),
      onError: (error) => errors.push(error),
    })
    await reader.start()
    return { events, oversize, errors, headers, attempts, reader }
  }

  it("skips an oversized event on the same connection and keeps reading", async () => {
    const big = evt("2", "y".repeat(5000))
    // Deliver the oversized event in small chunks so it grows across several reads.
    const chunks = [evt("1"), ...big.match(/[^]{1,700}/g), evt("3")]
    const result = await collect({ blocks: chunks, stopAfter: 2 })

    expect(result.events).toEqual(["1", "3"])
    expect(result.attempts).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.oversize).toHaveLength(1)
    expect(result.oversize[0].eventId).toBe("2")
    expect(result.oversize[0].bytes).toBeGreaterThan(512)
    expect(result.reader.getLastEventId()).toBe("3")
  })

  it("finds the separator when it straddles two chunks while skipping", async () => {
    const big = evt("2", "y".repeat(2000))
    const blocks = [big.slice(0, -1), "\n", evt("3")]
    const result = await collect({ blocks, stopAfter: 1 })

    expect(result.events).toEqual(["3"])
    expect(result.oversize.map((info) => info.eventId)).toEqual(["2"])
    expect(result.attempts).toBe(1)
  })

  it("finds a CRLF separator split between chunks while skipping", async () => {
    const big = evt("2", "y".repeat(2000)).replace(/\n/g, "\r\n")
    const blocks = [big.slice(0, -3), "\n\r", "\n", evt("3")]
    const result = await collect({ blocks, stopAfter: 1 })

    expect(result.events).toEqual(["3"])
    expect(result.oversize).toHaveLength(1)
  })

  it("does not treat many complete events in one chunk as oversized", async () => {
    const batch = Array.from({ length: 20 }, (_, i) => evt(String(i + 1), "z".repeat(100))).join("")
    expect(batch.length).toBeGreaterThan(512)
    const result = await collect({ blocks: [batch], stopAfter: 20 })

    expect(result.events).toHaveLength(20)
    expect(result.oversize).toEqual([])
  })

  it("resumes after the skipped event instead of looping when the stream is dropped", async () => {
    // Larger than maxEventBytes: the connection is dropped, but the cursor already
    // moved past the event, so the retry must not ask for it again.
    const big = evt("2", "y".repeat(5000))
    const result = await collect({
      blocks: [evt("1"), ...big.match(/[^]{1,700}/g)],
      maxBufferBytes: 512,
      maxEventBytes: 2048,
    })

    expect(result.events).toEqual(["1"])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error.message).toContain("without a complete event")
    expect(result.oversize.map((info) => info.eventId)).toEqual(["2"])
    expect(result.headers).toEqual([undefined, "2"])
  })

  it("reports a resync when the stream ends in the middle of a skipped event", async () => {
    const big = evt("2", "y".repeat(2000))
    const result = await collect({ blocks: [evt("1"), big.slice(0, 1500)] })

    expect(result.events).toEqual(["1"])
    expect(result.oversize.map((info) => info.eventId)).toEqual(["2"])
    expect(result.headers).toEqual([undefined, "2"])
  })

  it("reports a resync when the connection dies in the middle of a skipped event", async () => {
    // The stall timer ends the attempt while the event is still being skipped.
    // The cursor has already moved past that event, so the gap has to be
    // announced like it is when the stream ends on its own.
    const big = evt("2", "y".repeat(2000))
    const result = await collect({ blocks: [evt("1"), big.slice(0, 1500)], holdOpen: true, stallTimeoutMs: 50 })

    expect(result.events).toEqual(["1"])
    expect(result.oversize.map((info) => info.eventId)).toEqual(["2"])
    expect(result.headers).toEqual([undefined, "2"])
  })

  it("advances the cursor past an oversized event whose id trails the block", async () => {
    // The runtime writes frames with Hono's SSE writer, which puts `id:` after
    // the data: an event too large to keep only shows its id in the retained
    // tail, and without reading it there every reconnect asks for it again.
    const runtimeEvt = (id, text) => `data: {"type":"session.updated","properties":{"text":"${text}"}}\nid: ${id}\n\n`
    const big = runtimeEvt("EPOCH:2", "y".repeat(5000))
    const result = await collect({ blocks: [runtimeEvt("EPOCH:1", "a"), ...big.match(/[^]{1,700}/g)] })

    expect(result.events).toEqual(["EPOCH:1"])
    expect(result.oversize.map((info) => info.eventId)).toEqual(["EPOCH:2"])
    expect(result.headers).toEqual([undefined, "EPOCH:2"])
  })

  it("reports an oversized event with no readable id as unidentified", async () => {
    const big = `data: {"type":"session.updated","properties":{"text":"${"y".repeat(2000)}"}}\n\n`
    const result = await collect({ blocks: [evt("1"), ...big.match(/[^]{1,700}/g), evt("3")], stopAfter: 2 })

    expect(result.events).toEqual(["1", "3"])
    expect(result.oversize).toEqual([expect.objectContaining({ eventId: null })])
  })
})

describe("createUpstreamSseReader", () => {
  it("emits parsed events and tracks the latest event id", async () => {
    const events = []
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      fetchImpl: async (_url, options) =>
        createSseResponse({
          signal: options.signal,
          blocks: ['id: evt-1\r\ndata: {"type":"server.connected","properties":{"directory":"/tmp/project"}}\r\n\r\n'],
        }),
      onEvent(event) {
        events.push(event)
        reader.stop()
      },
    })

    await reader.start()

    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe("evt-1")
    expect(events[0].directory).toBe("/tmp/project")
    expect(events[0].payload).toEqual({
      type: "server.connected",
      properties: {
        directory: "/tmp/project",
      },
    })
    expect(reader.getLastEventId()).toBe("evt-1")
  })

  it("parses CRLF events split across read chunks", async () => {
    const eventIds = []
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      fetchImpl: async (_url, options) =>
        createSseResponse({
          signal: options.signal,
          blocks: [
            'id: evt-1\r\ndata: {"type":"server.connected","properties":{}}\r\n\r',
            '\nid: evt-2\r\ndata: {"type":"session.updated","properties":{}}\r\n\r\n',
          ],
        }),
      onEvent(event) {
        eventIds.push(event.eventId)
        if (event.eventId === "evt-2") reader.stop()
      },
    })

    await reader.start()

    expect(eventIds).toEqual(["evt-1", "evt-2"])
  })

  it("does not acknowledge a lazy upstream until server.connected follows replay", async () => {
    const order = []
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      isReadyEvent: ({ payload }) => payload?.type === "server.connected",
      fetchImpl: async (_url, options) =>
        createSseResponse({
          signal: options.signal,
          blocks: [
            'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
            'id: evt-2\ndata: {"type":"server.connected","properties":{}}\n\n',
          ],
        }),
      onConnect() {
        order.push("connect")
      },
      onEvent(event) {
        order.push(`event:${event.payload.type}`)
        if (event.payload.type === "server.connected") reader.stop()
      },
    })

    await reader.start()

    expect(order).toEqual(["event:session.updated", "connect", "event:server.connected"])
  })

  it("reconnects a stalled stream with Last-Event-ID", async () => {
    const fetchLastEventIds = []
    const events = []
    let attempt = 0
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      stallTimeoutMs: 10,
      reconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        fetchLastEventIds.push(options.headers["Last-Event-ID"] ?? null)
        attempt += 1

        if (attempt === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: ['id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
          })
        }

        return createSseResponse({
          signal: options.signal,
          blocks: ['id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n'],
        })
      },
      onEvent(event) {
        events.push(event.eventId)
        if (event.eventId === "evt-2") {
          reader.stop()
        }
      },
    })

    await reader.start()

    expect(events).toEqual(["evt-1", "evt-2"])
    expect(fetchLastEventIds.slice(0, 2)).toEqual([null, "evt-1"])
    expect(reader.getLastEventId()).toBe("evt-2")
  })

  it("resolves the stall timeout for each upstream read window", async () => {
    const events = []
    let attempt = 0
    let currentTimeout = 10
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      stallTimeoutMs: () => currentTimeout,
      reconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        attempt += 1

        if (attempt === 1) {
          currentTimeout = 60
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: ['id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
          })
        }

        return createSseResponse({
          signal: options.signal,
          blocks: ['id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n'],
        })
      },
      onEvent(event) {
        events.push(event.eventId)
        if (event.eventId === "evt-2") {
          reader.stop()
        }
      },
    })

    await reader.start()

    expect(events).toEqual(["evt-1", "evt-2"])
    expect(attempt).toBe(2)
  })

  it("reports unavailable upstream responses and continues reconnecting until stopped", async () => {
    const errors = []
    let attempt = 0
    let unavailableBodyCanceled = false
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        attempt += 1
        if (attempt === 1) {
          return {
            ok: false,
            status: 503,
            body: {
              cancel: async () => {
                unavailableBodyCanceled = true
              },
            },
          }
        }

        return createSseResponse({
          signal: options.signal,
          blocks: ['id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
        })
      },
      onError(error) {
        errors.push(error)
      },
      onEvent() {
        reader.stop()
      },
    })

    await reader.start()

    expect(errors).toEqual([
      expect.objectContaining({
        type: "upstream_unavailable",
        status: 503,
      }),
    ])
    expect(unavailableBodyCanceled).toBe(true)
    expect(attempt).toBe(2)
  })

  it("removes abort listeners after stop", async () => {
    const tracked = createTrackedSignal()
    let attempt = 0
    let reader

    reader = createUpstreamSseReader({
      buildUrl: () => "http://127.0.0.1:4096/global/event",
      reconnectDelayMs: 1,
      signal: tracked.signal,
      fetchImpl: async (_url, options) => {
        attempt += 1
        if (attempt === 1) {
          return {
            ok: false,
            status: 503,
            body: {
              cancel: async () => {},
            },
          }
        }

        return createSseResponse({
          signal: options.signal,
          blocks: ['id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
        })
      },
      onEvent() {
        reader.stop()
      },
    })

    await reader.start()

    expect(attempt).toBe(2)
    expect(tracked.getListenerCount()).toBe(0)
  })
})
