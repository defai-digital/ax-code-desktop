import { describe, expect, test } from "vitest"
import type { Event, SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import { shouldRollbackOptimisticStatus } from "../session-actions"
import { noteServerSessionStatus, serverSessionStatusStamp } from "../session-status-events"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"
import { runProperty, type Rng } from "../../test/prng"

/**
 * Model 5: session-actions optimistic-send status rollback.
 *
 * Stamps are obtained from the REAL reducer path (session.status events fed
 * through prepareEventDraft/applyDirectoryEvent, which is what calls
 * noteServerSessionStatus), never invented locally. Invariants: the shared
 * stamp counter never reuses a value across sessions, even after bounded-map
 * eviction; the rollback restores the pre-send status only when nothing
 * newer arrived.
 */

type FlightEvent =
  | { kind: "serverBusyDeduped" }
  | { kind: "serverBusyWritten" }
  | { kind: "serverIdle" }
  | { kind: "newerSendStarts" }

function generateFlight(rng: Rng): { previous: SessionStatus | undefined; events: FlightEvent[] } {
  const previous: SessionStatus | undefined = rng.chance(0.4)
    ? { type: "idle" }
    : rng.chance(0.5)
      ? { type: "busy" }
      : undefined
  const events: FlightEvent[] = []
  for (let i = 0, n = rng.int(5); i < n; i += 1) {
    events.push({
      kind: rng.pick(["serverBusyDeduped", "serverBusyWritten", "serverIdle", "newerSendStarts"] as const),
    })
  }
  return { previous, events }
}

function freshState(): State {
  return {
    ...INITIAL_STATE,
    path: { ...INITIAL_STATE.path },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    lsp: [],
    limit: 100,
    message: {},
    part: PartMap.EMPTY.fork(),
  }
}

let caseCounter = 0

describe("session-actions status rollback model", () => {
  test("shared stamp counter: interleaved notes across sessions never reuse a stamp", () => {
    runProperty({
      name: "serverSessionStatusStamp shared counter",
      cases: 60,
      seed: 1001,
      generate: (rng) => Array.from({ length: 1 + rng.int(8) }, () => rng.int(3)),
      check: (sessionIndexes) => {
        caseCounter += 1
        const prefix = `sa_shared_${caseCounter}_`
        const seen: number[] = []
        for (const index of sessionIndexes) {
          const id = `${prefix}${index}`
          noteServerSessionStatus(id)
          const stamp = serverSessionStatusStamp(id)
          // A per-session counter would repeat 1,2,... across sessions and
          // fail this global strict increase.
          if (seen.length > 0 && stamp <= (seen[seen.length - 1] ?? 0)) {
            throw new Error(
              `stamp ${stamp} not greater than previous ${seen[seen.length - 1]} (shared counter violated)`,
            )
          }
          seen.push(stamp)
        }
      },
    })
  })

  test("eviction of an in-flight session's stamp entry cannot resurrect its old stamp", () => {
    caseCounter += 1
    const target = `sa_evict_${caseCounter}`
    noteServerSessionStatus(target)
    const before = serverSessionStatusStamp(target)
    expect(before).toBeGreaterThan(0)
    // Push the bounded (2000-entry) stamp map past capacity with other
    // sessions so the target's entry is evicted, as a long session list can.
    for (let i = 0; i < 2100; i += 1) noteServerSessionStatus(`sa_evict_${caseCounter}_filler_${i}`)
    expect(serverSessionStatusStamp(target)).toBe(0)
    noteServerSessionStatus(target)
    const after = serverSessionStatusStamp(target)
    // Per-session counters restart at 1 after eviction and could collide
    // with the stamp an in-flight send captured; the shared counter cannot.
    expect(after).toBeGreaterThan(before)
    expect(after).not.toBe(before)
  })

  test("rollback never clears a server busy that arrived during the flight", () => {
    runProperty({
      name: "optimistic send rollback guard",
      cases: 200,
      seed: 1101,
      generate: generateFlight,
      check: ({ previous, events }) => {
        caseCounter += 1
        const sessionId = `sa_rb_${caseCounter}`
        let state = freshState()
        const optimisticBusy: SessionStatus = { type: "busy" }
        if (previous) state.session_status[sessionId] = previous
        state.session_status[sessionId] = optimisticBusy
        const stampBefore = serverSessionStatusStamp(sessionId)
        let serverBusyArrived = false
        let superseded = false

        const applyStatus = (status: SessionStatus) => {
          const event = { type: "session.status", properties: { sessionID: sessionId, status } } as Event
          const draft = prepareEventDraft(state, event)
          applyDirectoryEvent(draft, event)
          state = draft
        }

        for (const ev of events) {
          if (ev.kind === "serverBusyDeduped" || ev.kind === "serverBusyWritten") {
            applyStatus({ type: "busy" })
            serverBusyArrived = true
          } else if (ev.kind === "serverIdle") {
            applyStatus({ type: "idle" })
          } else {
            state.session_status[sessionId] = { type: "busy" }
            superseded = true
          }
        }

        const current = state.session_status[sessionId]
        const rollback = shouldRollbackOptimisticStatus({
          currentStatus: current,
          optimisticBusy,
          statusStampBeforeSend: stampBefore,
          statusStampNow: serverSessionStatusStamp(sessionId),
        })
        const finalStatus = rollback ? previous : current

        const kinds = events.map((e) => e.kind)
        const lastIdle = kinds.lastIndexOf("serverIdle")
        if (serverBusyArrived && lastIdle < lastBusyIndex(events)) {
          if (finalStatus?.type !== "busy") {
            throw new Error(`rollback cleared server busy: final=${JSON.stringify(finalStatus)}`)
          }
        }
        if (superseded && rollback) throw new Error("stale send rolled back a newer send")
        if (events.length === 0) {
          expect(rollback).toBe(true)
          expect(finalStatus).toBe(previous)
        }
      },
    })
  })
})

function lastBusyIndex(events: FlightEvent[]): number {
  let idx = -1
  events.forEach((e, i) => {
    if (e.kind === "serverBusyDeduped" || e.kind === "serverBusyWritten") idx = i
  })
  return idx
}
