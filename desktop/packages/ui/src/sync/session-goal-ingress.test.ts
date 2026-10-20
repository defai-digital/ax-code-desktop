import { beforeEach, describe, expect, test } from "vitest"
import type { AxCodeClient, Event } from "@defai-digital/ax-code-sdk/v2/client"

import { normalizeSessionGoal } from "@/lib/supervision/goal"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { ChildStoreManager } from "./child-store"
import { createEventPipeline } from "./event-pipeline"
import { createEventRoutingIndex, resolveDirectoryFromRoutingIndex, setIndexedSessionDirectory } from "./event-routing"
import { handleEvent } from "./sync-context-impl"
import {
  decideSessionGoalEvent,
  ingestSessionGoalEvent,
  noteSessionGoalRecovery,
  sessionGoalRecoveryEpoch,
  subscribeSessionGoalRecovery,
} from "./session-goal-ingress"

const rawGoal = (overrides: Record<string, unknown> = {}) => ({
  sessionID: "ses_1",
  objective: "Ship the goal",
  status: "active",
  tokensUsed: 3,
  timeUsedSeconds: 4,
  time: { created: 10, updated: 20 },
  ...overrides,
})

const event = (properties: unknown, type = "session.goal"): Event => ({ type, properties }) as Event

const state = () => useSessionGoalStore.getState()

beforeEach(() => state().clear())

describe("decideSessionGoalEvent", () => {
  test("applies a normalized goal under properties.sessionID", () => {
    const decision = decideSessionGoalEvent(event({ sessionID: " ses_1 ", goal: rawGoal() }))
    expect(decision).toMatchObject({ kind: "apply", sessionId: "ses_1" })
    if (decision.kind !== "apply") return
    expect(decision.goal?.objective).toBe("Ship the goal")
    expect(decision.goal?.status).toBe("active")
  })

  test("a null goal clears", () => {
    expect(decideSessionGoalEvent(event({ sessionID: "ses_1", goal: null }))).toEqual({
      kind: "apply",
      sessionId: "ses_1",
      goal: null,
    })
  })

  test("a malformed goal is no goal", () => {
    const decision = decideSessionGoalEvent(event({ sessionID: "ses_1", goal: { sessionID: "ses_1" } }))
    expect(decision).toEqual({ kind: "apply", sessionId: "ses_1", goal: null })
  })

  test("ignores a goal whose session id disagrees", () => {
    expect(decideSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ sessionID: "ses_other" }) }))).toEqual({
      kind: "ignore",
    })
  })

  test("ignores a missing session id and any other event type", () => {
    expect(decideSessionGoalEvent(event({ goal: rawGoal() }))).toEqual({ kind: "ignore" })
    expect(decideSessionGoalEvent(event({ sessionID: "ses_1" }, "session.idle"))).toEqual({ kind: "ignore" })
    expect(decideSessionGoalEvent({ type: "session.goal" })).toEqual({ kind: "ignore" })
  })
})

describe("ingestSessionGoalEvent", () => {
  test("stores a session.goal event through the goal store", () => {
    expect(ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ status: "blocked" }) }))).toBe(true)
    expect(state().goals.ses_1?.status).toBe("blocked")
    expect(state().known.ses_1).toBe(true)
  })

  test("a null goal clears the entry and keeps the session known", () => {
    ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal() }))
    expect(ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: null }))).toBe(true)
    expect(state().goals.ses_1).toBeUndefined()
    expect(state().known.ses_1).toBe(true)
  })

  test("an older revision does not overwrite the stored goal", () => {
    ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ status: "blocked", time: { created: 10, updated: 50 } }) }))
    ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ status: "active", time: { created: 10, updated: 20 } }) }))
    expect(state().goals.ses_1?.status).toBe("blocked")
  })

  test("a disagreeing goal does not change the store", () => {
    ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal() }))
    expect(ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ sessionID: "ses_other", status: "paused" }) }))).toBe(
      false,
    )
    expect(state().goals.ses_1?.status).toBe("active")
    expect(state().goals.ses_other).toBeUndefined()
  })

  test("normalizes through the same helper the route read uses", () => {
    ingestSessionGoalEvent(event({ sessionID: "ses_1", goal: rawGoal({ objective: `  ${"x".repeat(600)}  ` }) }))
    expect(state().goals.ses_1).toEqual(normalizeSessionGoal(rawGoal({ objective: `  ${"x".repeat(600)}  ` })))
  })
})

describe("session goal recovery signal", () => {
  test("notifies subscribers once per resync", () => {
    const seen: number[] = []
    const stop = subscribeSessionGoalRecovery(() => seen.push(sessionGoalRecoveryEpoch()))
    const before = sessionGoalRecoveryEpoch()
    noteSessionGoalRecovery()
    noteSessionGoalRecovery()
    stop()
    noteSessionGoalRecovery()
    expect(seen).toEqual([before + 1, before + 2])
    expect(sessionGoalRecoveryEpoch()).toBe(before + 3)
  })
})

describe("session.goal is ingested before a directory gate", () => {
  test("a global frame with no directory store stores the goal once", () => {
    handleEvent(
      "global",
      event({ sessionID: "ses_1", goal: rawGoal({ status: "blocked" }) }),
      new ChildStoreManager(),
      createEventRoutingIndex(),
    )
    expect(state().goals.ses_1?.status).toBe("blocked")
    expect(state().eventSeq.ses_1).toBe(1)
  })

  test("a directory whose child store is not loaded stores the goal once", () => {
    handleEvent(
      "/missing",
      event({ sessionID: "ses_1", goal: rawGoal({ status: "paused" }) }),
      new ChildStoreManager(),
      createEventRoutingIndex(),
    )
    expect(state().goals.ses_1?.status).toBe("paused")
    expect(state().eventSeq.ses_1).toBe(1)
  })

  test("a loaded directory store stores the goal once", () => {
    const manager = new ChildStoreManager()
    manager.ensureChild("/repo", { bootstrap: false })
    handleEvent(
      "/repo",
      event({ sessionID: "ses_1", goal: rawGoal() }),
      manager,
      createEventRoutingIndex(),
    )
    expect(state().goals.ses_1?.status).toBe("active")
    expect(state().eventSeq.ses_1).toBe(1)
  })

  test("another event type does not write a goal", () => {
    handleEvent(
      "global",
      event({ sessionID: "ses_1" }, "session.idle"),
      new ChildStoreManager(),
      createEventRoutingIndex(),
    )
    expect(state().goals.ses_1).toBeUndefined()
    expect(state().known.ses_1).toBeUndefined()
    expect(state().eventSeq.ses_1).toBeUndefined()
  })
})

describe("session.goal reaches the directory tap", () => {

  test("the pipeline delivers every session.goal to the indexed directory and does not coalesce them", async () => {
    let resolveStreamFinished!: () => void
    const streamFinished = new Promise<void>((resolve) => {
      resolveStreamFinished = resolve
    })
    const received: { directory: string; type: string; objective: string | null }[] = []
    let resolveDelivered!: () => void
    const deliveredAll = new Promise<void>((resolve) => {
      resolveDelivered = resolve
    })
    const manager = new ChildStoreManager()
    manager.ensureChild("/repo", { bootstrap: false })
    const index = createEventRoutingIndex()
    setIndexedSessionDirectory(index, "ses_1", "/repo")
    const payloads = [
      event({ sessionID: "ses_1", goal: null }),
      event({ sessionID: "ses_1", goal: rawGoal({ objective: "second" }) }),
    ]
    const pipeline = createEventPipeline({
      sdk: {
        global: {
          event: async ({ signal }: { signal: AbortSignal }) => ({
            stream: (async function* () {
              for (const payload of payloads) yield { directory: "global", payload }
              resolveStreamFinished()
              await new Promise<void>((resolve) => {
                if (signal.aborted) {
                  resolve()
                  return
                }
                signal.addEventListener("abort", () => resolve(), { once: true })
              })
            })(),
          }),
        },
      } as unknown as AxCodeClient,
      routeDirectory: (directory, payload) => resolveDirectoryFromRoutingIndex(index, directory, payload, manager),
      onEvent: (directory, payload) => {
        const properties = payload.properties as { goal?: { objective?: string } | null }
        received.push({
          directory,
          type: payload.type,
          objective: properties.goal?.objective ?? null,
        })
        if (received.length === payloads.length) resolveDelivered()
      },
      transport: "sse",
      heartbeatTimeoutMs: 1_000,
    })

    try {
      await streamFinished
      await Promise.race([
        deliveredAll,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("session.goal was not delivered")), 500)
        }),
      ])
    } finally {
      pipeline.cleanup()
    }

    expect(received).toEqual([
      { directory: "/repo", type: "session.goal", objective: null },
      { directory: "/repo", type: "session.goal", objective: "second" },
    ])
  })
})
