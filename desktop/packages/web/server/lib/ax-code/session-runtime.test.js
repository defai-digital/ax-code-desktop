import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionRuntime } from "./session-runtime.js"

describe("session runtime restart", () => {
  it("re-arms cleanup and clears stale activity after an in-process restart", async () => {
    vi.useFakeTimers()
    try {
      const runtime = createSessionRuntime({
        writeSseEvent() {},
        getNotificationClients: () => new Set(),
        broadcastEvent() {},
      })

      // A session left busy, then the server shuts down and starts again.
      runtime.processAxCodeSsePayload({
        type: "session.status",
        properties: { sessionID: "session-1", status: { type: "busy" } },
      })
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("busy")

      runtime.dispose()
      runtime.resume()

      // dispose() used to be permanent: the hourly cleanup interval was never
      // re-created and the stale busy entry survived the restart.
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("idle")

      runtime.markSessionViewed("session-stale", "client")
      await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)
      expect(runtime.getSessionAttentionState("session-stale")).toBeNull()

      runtime.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("session runtime activity cleanup", () => {
  it("does not forget a session that is still busy when the age-based cleanup runs", async () => {
    // `updatedAt` only moves when the phase changes, so a session that stays busy for a
    // day was evicted by the hourly cleanup: it vanished from the activity snapshot and
    // the busy count main uses to spare a wedged session dropped to zero.
    vi.useFakeTimers()
    try {
      const runtime = createSessionRuntime({
        writeSseEvent() {},
        getNotificationClients: () => new Set(),
        broadcastEvent() {},
      })

      runtime.processAxCodeSsePayload({
        type: "session.status",
        properties: { sessionID: "session-busy", status: { type: "busy" } },
      })
      runtime.processAxCodeSsePayload({
        type: "session.status",
        properties: { sessionID: "session-idle", status: { type: "idle" } },
      })
      // The cooldown entry settles into idle, which is what the cleanup is for.
      await vi.advanceTimersByTimeAsync(3_000)
      expect(runtime.getSessionActivitySnapshot()["session-idle"].type).toBe("idle")

      await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)

      const snapshot = runtime.getSessionActivitySnapshot()
      expect(snapshot["session-busy"]?.type).toBe("busy")
      expect(snapshot["session-idle"]).toBeUndefined()

      runtime.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("session runtime tracking caps", () => {
  const runtimes = []

  afterEach(() => {
    for (const runtime of runtimes) {
      runtime.dispose()
    }
    runtimes.length = 0
  })

  it("does not keep one attention entry per unknown session id forever", () => {
    // The hourly age-based cleanup leaves a window in which a client posting
    // /view for random session ids could grow these maps one entry per id.
    const runtime = createSessionRuntime({
      writeSseEvent() {},
      getNotificationClients: () => new Set(),
      broadcastEvent() {},
    })
    runtimes.push(runtime)

    for (let index = 0; index < 2100; index += 1) {
      runtime.markSessionViewed(`ses-${index}`, "client")
    }

    expect(runtime.getSessionAttentionSnapshot()["ses-2099"]).toBeTruthy()
    expect(runtime.getSessionAttentionSnapshot()["ses-0"]).toBeFalsy()
  })
})

describe("session runtime", () => {
  const runtimes = []

  afterEach(() => {
    for (const runtime of runtimes) {
      runtime.dispose()
    }
    runtimes.length = 0
  })

  it("invokes onActivityChange on every phase transition, including cooldown expiry", async () => {
    vi.useFakeTimers()
    try {
      const changes = []
      const runtime = createSessionRuntime({
        writeSseEvent() {},
        getNotificationClients: () => new Set(),
        broadcastEvent() {},
        onActivityChange: () => changes.push(Date.now()),
      })
      runtimes.push(runtime)

      const busy = {
        type: "session.status",
        properties: { sessionID: "session-1", status: { type: "busy" } },
      }
      const idle = {
        type: "session.status",
        properties: { sessionID: "session-1", status: { type: "idle" } },
      }

      runtime.processAxCodeSsePayload(busy)
      expect(changes).toHaveLength(1) // idle -> busy
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("busy")

      runtime.processAxCodeSsePayload(idle)
      expect(changes).toHaveLength(2) // busy -> cooldown
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("cooldown")

      await vi.advanceTimersByTimeAsync(2_000)
      expect(changes).toHaveLength(3) // cooldown timer -> idle
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("idle")

      // A repeated busy status with no phase change does not fire again.
      runtime.processAxCodeSsePayload(busy)
      const afterBusy = changes.length
      runtime.processAxCodeSsePayload(busy)
      expect(changes.length).toBe(afterBusy)

      // resume() resets every phase at once. The readers of this count only re-read it
      // when told, so the reset has to report as well or main keeps the pre-restart count.
      runtime.resume()
      expect(changes.length).toBe(afterBusy + 1)
      expect(runtime.getSessionActivitySnapshot()["session-1"].type).toBe("idle")
    } finally {
      vi.useRealTimers()
    }
  })

  it("broadcasts attention clears through the shared broadcaster", () => {
    const events = []
    const runtime = createSessionRuntime({
      writeSseEvent() {
        throw new Error("SSE fallback should not be used when broadcastEvent is provided")
      },
      getNotificationClients: () => new Set(),
      broadcastEvent: (payload) => {
        events.push(payload)
      },
    })
    runtimes.push(runtime)

    runtime.processAxCodeSsePayload({
      type: "session.status",
      properties: {
        sessionID: "session-1",
        status: {
          type: "busy",
        },
      },
    })
    runtime.markUserMessageSent("session-1")
    runtime.processAxCodeSsePayload({
      type: "session.status",
      properties: {
        sessionID: "session-1",
        status: {
          type: "idle",
        },
      },
    })
    runtime.markSessionViewed("session-1", "client-1")

    expect(events).toContainEqual({
      type: "openchamber:session-status",
      properties: expect.objectContaining({
        sessionID: "session-1",
        status: "idle",
        needsAttention: true,
      }),
    })
    expect(events.at(-1)).toEqual({
      type: "openchamber:session-status",
      properties: {
        sessionID: "session-1",
        status: "idle",
        timestamp: expect.any(Number),
        metadata: {},
        needsAttention: false,
      },
    })
  })

  it("trims legacy session.status info.type payload fields", () => {
    const events = []
    const runtime = createSessionRuntime({
      writeSseEvent() {
        throw new Error("SSE fallback should not be used when broadcastEvent is provided")
      },
      getNotificationClients: () => new Set(),
      broadcastEvent: (payload) => {
        events.push(payload)
      },
    })
    runtimes.push(runtime)

    runtime.processAxCodeSsePayload({
      type: "session.status",
      properties: {
        sessionID: " legacy-session-1 ",
        info: {
          type: " busy ",
        },
      },
    })

    expect(events).toContainEqual({
      type: "openchamber:session-status",
      properties: expect.objectContaining({
        sessionID: "legacy-session-1",
        status: "busy",
      }),
    })
  })

  it("broadcasts idle activity when cooldown expires", () => {
    vi.useFakeTimers()
    const events = []
    const runtime = createSessionRuntime({
      writeSseEvent() {
        throw new Error("SSE fallback should not be used when broadcastEvent is provided")
      },
      getNotificationClients: () => new Set(),
      broadcastEvent: (payload) => {
        events.push(payload)
      },
    })

    try {
      runtime.processAxCodeSsePayload({
        type: "session.status",
        properties: {
          sessionID: "session-activity-1",
          status: {
            type: "busy",
          },
        },
      })
      runtime.processAxCodeSsePayload({
        type: "session.status",
        properties: {
          sessionID: "session-activity-1",
          status: {
            type: "idle",
          },
        },
      })

      const activityPhases = () =>
        events.filter((event) => event.type === "openchamber:session-activity").map((event) => event.properties.phase)

      expect(activityPhases()).toEqual(["busy", "cooldown"])

      vi.advanceTimersByTime(1999)
      expect(activityPhases()).toEqual(["busy", "cooldown"])

      vi.advanceTimersByTime(1)

      expect(activityPhases()).toEqual(["busy", "cooldown", "idle"])
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })
})
