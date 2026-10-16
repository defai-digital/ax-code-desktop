import { describe, expect, it, vi } from "vitest"

import { createGlobalMessageStreamHub } from "./global-hub.js"
import { createSseResponse } from "./test-helpers.js"

async function waitForAssertion(assertion) {
  const deadline = Date.now() + 1000
  let lastError

  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  throw lastError
}

describe("createGlobalMessageStreamHub", () => {
  it.each([false, true])(
    "requires resync across unidentified domain events, excluding controls (control=%s)",
    async (control) => {
      const received = []
      const hub = createGlobalMessageStreamHub({
        buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
        getAxCodeAuthHeaders: () => ({}),
        upstreamReconnectDelayMs: 100,
        fetchImpl: async () =>
          createSseResponse({
            blocks: [
              'id: evt-a\ndata: {"type":"session.updated","properties":{}}\n\n',
              `data: {"type":"${control ? "server.heartbeat" : "future.event"}","properties":{}}\n\n`,
              'id: evt-b\ndata: {"type":"session.updated","properties":{}}\n\n',
            ],
          }),
      })
      hub.subscribeEvent((event) => received.push(event))
      try {
        hub.start()
        await waitForAssertion(() => expect(received.at(-1)?.eventId).toBe("evt-b"))
        const replay = hub.replayAfter("evt-a")
        expect(replay.resyncRequired).toBe(!control)
        expect(replay.entries.map((entry) => entry.payload.type)).toEqual(
          control ? ["session.updated"] : ["future.event", "session.updated"],
        )
        expect(replay.cursor).toBe("evt-b")
        expect(hub.replayAfter("evt-b").resyncRequired).toBe(false)
      } finally {
        hub.stop()
      }
    },
  )

  it("skips an event over the buffer ceiling and tells clients to resync instead of looping", async () => {
    const received = []
    const requested = []
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const huge = `id: evt-2\ndata: {"type":"message.part.updated","properties":{"text":"${"y".repeat(1_200_000)}"}}\n\n`
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async (_url, init) => {
        requested.push(init.headers["Last-Event-ID"])
        return createSseResponse({
          signal: init.signal,
          holdOpen: true,
          blocks: [
            'data: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
            ...huge.match(/[^]{1,65536}/g),
            'id: evt-3\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        })
      },
    })
    hub.subscribeEvent((event) => received.push(event))
    try {
      hub.start()
      await waitForAssertion(() => expect(received.at(-1)?.eventId).toBe("evt-3"))

      expect(received.map((event) => event.payload.type)).toEqual([
        "session.updated",
        "server.resync_required",
        "session.updated",
      ])
      expect(received[1]).toMatchObject({
        directory: "global",
        eventId: undefined,
        payload: { properties: { reason: "event_too_large", cursor: "evt-2" } },
      })
      // One connection: the oversized event did not trigger a reconnect.
      expect(requested).toEqual([undefined])
      // A client that reconnects later is told about the gap too.
      const replay = hub.replayAfter("evt-1")
      expect(replay.resyncRequired).toBe(true)
      expect(replay.entries.map((entry) => entry.payload.type)).toEqual(["server.resync_required", "session.updated"])
    } finally {
      hub.stop()
      warn.mockRestore()
    }
  })

  it("keeps the last identified cursor when the replay tail has no id", async () => {
    const received = []
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () =>
        createSseResponse({
          blocks: [
            'id: evt-a\ndata: {"type":"session.updated","properties":{}}\n\n',
            'data: {"type":"future.event","properties":{}}\n\n',
          ],
        }),
    })
    hub.subscribeEvent((event) => received.push(event))
    try {
      hub.start()
      await waitForAssertion(() => expect(received).toHaveLength(2))
      expect(hub.replayAfter("evt-a")).toMatchObject({
        resyncRequired: true,
        cursor: "evt-a",
        entries: [{ payload: { type: "future.event" } }],
      })
    } finally {
      hub.stop()
    }
  })

  it("keeps a restarted connection connected when the previous reader tears down late", async () => {
    // stop() followed by an immediate start(): the old reader's final
    // onDisconnect used to run after the new connection was ready and clobber
    // connected back to false, so the hub reported a dead stream while events
    // were still flowing.
    let attempt = 0
    let releaseFirst = () => {}

    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      // Long enough that the restarted connection cannot stall inside this test:
      // the only status it should see after the restart is a stale teardown
      // (which the generation guard suppresses).
      upstreamStallTimeoutMs: 5_000,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        attempt += 1
        if (attempt === 1) {
          const first = createSseResponse({
            signal: options.signal,
            blocks: ['id: ready-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
          })
          // Keep the first reader open: its teardown is released by the test
          // after the restarted connection is already ready.
          const originalReader = first.body.getReader()
          return {
            ...first,
            body: {
              getReader: () => ({
                read: async () => {
                  const chunk = await originalReader.read()
                  if (chunk.done) {
                    return new Promise((resolve) => {
                      releaseFirst = () => resolve({ value: undefined, done: true })
                    })
                  }
                  return chunk
                },
                cancel: async () => {},
              }),
            },
          }
        }
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'id: ready-2\ndata: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        })
      },
    })

    try {
      hub.start()
      await waitForAssertion(() => expect(hub.isConnected()).toBe(true))

      hub.stop()
      const statuses = []
      hub.subscribeStatus((status) => statuses.push(status))

      hub.start()
      await waitForAssertion(() => expect(hub.isConnected()).toBe(true))
      statuses.length = 0

      // The previous reader finishes its teardown now.
      releaseFirst()
      await new Promise((resolve) => setTimeout(resolve, 20))

      // A stale teardown must not flip the restarted connection to
      // disconnected, nor announce it to subscribers.
      expect(hub.isConnected()).toBe(true)
      expect(statuses).toEqual([])
    } finally {
      hub.stop()
    }
  })

  it("continues fanout when an event subscriber throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const received = []
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () =>
        createSseResponse({
          blocks: [
            'id: ready-1\ndata: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        }),
    })

    hub.subscribeEvent(() => {
      throw new Error("subscriber failed")
    })
    hub.subscribeEvent((event) => {
      if (event.payload?.type === "session.updated") received.push(event.eventId)
    })

    try {
      hub.start()
      await waitForAssertion(() => {
        expect(received).toEqual(["evt-1"])
      })
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      hub.stop()
      warnSpy.mockRestore()
    }
  })

  it("continues status fanout when a status subscriber throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const received = []
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () =>
        createSseResponse({
          blocks: ['id: ready-2\ndata: {"type":"server.connected","properties":{}}\n\n'],
        }),
    })

    hub.subscribeStatus(() => {
      throw new Error("status subscriber failed")
    })
    hub.subscribeStatus((status) => {
      received.push(status.type)
    })

    try {
      hub.start()
      await waitForAssertion(() => {
        expect(received).toContain("connect")
      })
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      hub.stop()
      warnSpy.mockRestore()
    }
  })

  it("requires authoritative resync when the Last-Event-ID anchor has been evicted", async () => {
    const received = []
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      replayLimit: 2,
      fetchImpl: async () =>
        createSseResponse({
          blocks: [
            'id: ready-3\ndata: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
            'id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n',
            'id: evt-3\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        }),
    })

    hub.subscribeEvent((event) => {
      if (event.payload?.type === "session.updated") received.push(event.eventId)
    })

    try {
      hub.start()
      await waitForAssertion(() => {
        expect(received).toEqual(["evt-1", "evt-2", "evt-3"])
      })

      // evt-1 was evicted (replayLimit=2). A reconnect with Last-Event-ID=evt-1
      // must still recover the buffered events instead of getting nothing.
      expect(hub.replayAfter("evt-1")).toMatchObject({
        entries: [{ eventId: "evt-2" }, { eventId: "evt-3" }],
        resyncRequired: true,
        cursor: "evt-3",
      })
      // A still-buffered anchor returns only events after it.
      expect(hub.replayAfter("evt-2")).toMatchObject({
        entries: [{ eventId: "evt-3" }],
        resyncRequired: false,
        cursor: "evt-3",
      })
      // No anchor → no replay (the client does a full bootstrap instead).
      expect(hub.replayAfter("")).toMatchObject({ entries: [], resyncRequired: false })
      // Upstream subscription acks are not client-visible history.
      expect(hub.replayAfter("ready-3")).toMatchObject({
        resyncRequired: true,
        cursor: "evt-3",
      })
      expect(hub.replayAfter("ready-3").entries.map((entry) => entry.eventId)).toEqual(["evt-2", "evt-3"])
    } finally {
      hub.stop()
    }
  })

  it("does not fan out upstream subscription acks to still-connected clients", async () => {
    const received = []
    let attempt = 0
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamStallTimeoutMs: 20,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        attempt += 1
        if (attempt === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'id: ready-1\ndata: {"type":"server.connected","properties":{}}\n\n',
              'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
            ],
          })
        }
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'id: ready-2\ndata: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        })
      },
    })

    hub.subscribeEvent((event) => {
      received.push(event.payload?.type)
    })

    try {
      hub.start()
      await waitForAssertion(() => {
        expect(received).toEqual(["session.updated"])
      })
      await waitForAssertion(() => {
        expect(received).toEqual(["session.updated", "session.updated"])
      })
      expect(received.filter((type) => type === "server.connected")).toEqual([])
      expect(hub.replayAfter("evt-1")).toMatchObject({
        entries: [{ eventId: "evt-2" }],
        resyncRequired: false,
      })
    } finally {
      hub.stop()
    }
  })

  it("continues fanout when an async event subscriber rejects", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const received = []
    const hub = createGlobalMessageStreamHub({
      buildAxCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getAxCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () =>
        createSseResponse({
          blocks: [
            'id: ready-4\ndata: {"type":"server.connected","properties":{}}\n\n',
            'id: evt-1\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        }),
    })

    hub.subscribeEvent(async () => {
      throw new Error("async subscriber failed")
    })
    hub.subscribeEvent((event) => {
      if (event.payload?.type === "session.updated") received.push(event.eventId)
    })

    try {
      hub.start()
      await waitForAssertion(() => {
        expect(received).toEqual(["evt-1"])
      })
      await waitForAssertion(() => {
        expect(warnSpy).toHaveBeenCalled()
      })
    } finally {
      hub.stop()
      warnSpy.mockRestore()
    }
  })
})
