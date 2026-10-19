import { describe, expect, test } from "vitest"
import type { SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import {
  getReconnectCandidateSessionIds,
  pickApplicableResyncedStatuses,
  resolveResyncedSessionStatus,
} from "../reconnect-recovery"
import { PartMap } from "../part-map"
import { runProperty, type Rng } from "../../test/prng"

/**
 * Model 3: reconnect recovery.
 *
 * Seeded interleavings of local status changes while a resync snapshot is in
 * flight. Invariants: an explicit server status always wins in the resolver;
 * a snapshot entry whose local status moved since the request never rolls
 * live state back; snapshot + replay converges to the uninterrupted run.
 */

const SESSION_IDS = ["ses_a", "ses_b", "ses_c"] as const

function randomStatus(rng: Rng): SessionStatus {
  switch (rng.int(4)) {
    case 0:
      return { type: "idle" }
    case 1:
      return { type: "busy" }
    case 2:
      return { type: "retry", attempt: 1 + rng.int(3), message: "retrying", next: 1000 }
    default:
      return { type: "busy", step: rng.int(3) } as SessionStatus
  }
}

type StatusMap = Record<string, SessionStatus | undefined>

/** Independent structural equality for the oracle. Deliberately NOT the
 * production snapshot-equality helper: sharing it made the guard test pass
 * even when that helper was broken to always return true. */
function sameStatus(a: SessionStatus | undefined, b: SessionStatus | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.type !== b.type) return false
  if (a.type === "retry") {
    return b.type === "retry" && a.attempt === b.attempt && a.message === b.message && a.next === b.next
  }
  if (a.type === "busy") {
    return b.type === "busy" && (a as { step?: number }).step === (b as { step?: number }).step
  }
  return true
}

function randomStatusMap(rng: Rng): StatusMap {
  const map: StatusMap = {}
  for (const id of SESSION_IDS) {
    if (rng.chance(0.8)) map[id] = randomStatus(rng)
  }
  return map
}

describe("reconnect-recovery model", () => {
  test("resolver: explicit server status always wins; grace only preserves non-idle", () => {
    runProperty({
      name: "resolveResyncedSessionStatus precedence",
      cases: 200,
      seed: 501,
      generate: (rng) => ({
        server: rng.chance(0.5) ? randomStatus(rng) : undefined,
        existing: rng.chance(0.8) ? randomStatus(rng) : undefined,
        recent: rng.chance(0.5),
        completed: rng.chance(0.5),
      }),
      check: ({ server, existing, recent, completed }) => {
        const result = resolveResyncedSessionStatus({
          serverStatus: server,
          existingStatus: existing,
          promptRecentlyAccepted: recent,
          hasCompletedAssistantReply: completed,
        })
        if (server) {
          expect(result).toBe(server)
        } else if (recent && !completed && existing && existing.type !== "idle") {
          expect(result).toBe(existing)
        } else {
          expect(result).toEqual({ type: "idle" })
        }
      },
    })
  })

  test("stale snapshot entries never roll back a status that moved in flight", () => {
    runProperty({
      name: "pickApplicableResyncedStatuses staleness guard",
      cases: 200,
      seed: 601,
      generate: (rng) => ({
        before: randomStatusMap(rng),
        current: randomStatusMap(rng),
        snapshot: randomStatusMap(rng) as Record<string, SessionStatus>,
      }),
      check: ({ before, current, snapshot }) => {
        const applicable = pickApplicableResyncedStatuses({
          relevantStatuses: snapshot,
          beforeStatuses: before,
          currentStatuses: current,
        })
        for (const id of SESSION_IDS) {
          const moved = !sameStatus(current[id], before[id])
          if (moved) {
            // A stream status newer than the snapshot must survive.
            expect(applicable[id]).toBeUndefined()
          } else if (snapshot[id]) {
            expect(applicable[id]).toBe(snapshot[id])
          }
        }
      },
    })
  })

  // Arrival order is modelled explicitly: a live event lands while the
  // snapshot is in flight. If the snapshot was captured BEFORE the live
  // event it is older and the live value must win; if captured AFTER, the
  // snapshot is newer and must win. Replay never overwrites the snapshot
  // result unconditionally.
  test("snapshot vs live: the newer arrival wins", () => {
    runProperty({
      name: "reconnect snapshot/live newer-wins",
      cases: 200,
      seed: 701,
      generate: (rng) => {
        const sessions: Record<
          string,
          { before?: SessionStatus; live?: SessionStatus; snapshot?: SessionStatus; snapshotNewer: boolean }
        > = {}
        for (const id of SESSION_IDS) {
          sessions[id] = {
            before: rng.chance(0.8) ? randomStatus(rng) : undefined,
            live: rng.chance(0.6) ? randomStatus(rng) : undefined,
            snapshot: rng.chance(0.7) ? randomStatus(rng) : undefined,
            snapshotNewer: rng.chance(0.5),
          }
        }
        return sessions
      },
      check: (sessions) => {
        for (const id of SESSION_IDS) {
          const { before, live, snapshot, snapshotNewer } = sessions[id]
          const currentAtArrival = live ?? before
          // "before" for the guard is the status when the snapshot was
          // captured: pre-live for an older snapshot, post-live for a newer.
          const capturedAgainst = snapshotNewer ? currentAtArrival : before
          const relevant = resolveResyncedSessionStatus({
            serverStatus: snapshot,
            existingStatus: currentAtArrival,
            promptRecentlyAccepted: false,
            hasCompletedAssistantReply: true,
          })
          const applicable = pickApplicableResyncedStatuses({
            relevantStatuses: { [id]: relevant },
            beforeStatuses: { [id]: capturedAgainst },
            currentStatuses: { [id]: currentAtArrival },
          })
          const final = applicable[id] ?? currentAtArrival
          // Net-unmoved ambiguity: a live event that re-publishes the exact
          // pre-snapshot value is indistinguishable from no movement, so the
          // snapshot answer may legitimately win there.
          const ambiguous = !snapshotNewer && live !== undefined && sameStatus(live, before)
          const expected: SessionStatus = snapshotNewer || !live ? (snapshot ?? { type: "idle" }) : live
          if (ambiguous) {
            if (!sameStatus(final, live) && !sameStatus(final, snapshot ?? { type: "idle" })) {
              throw new Error(`${id}: ambiguous final=${JSON.stringify(final)} matches neither arrival`)
            }
          } else if (!sameStatus(final, expected)) {
            throw new Error(
              `${id}: final=${JSON.stringify(final)} expected newer=${JSON.stringify(expected)} (snapshotNewer=${snapshotNewer})`,
            )
          }
        }
      },
    })
  })

  test("every non-idle or incomplete session is a reconnect candidate", () => {
    runProperty({
      name: "getReconnectCandidateSessionIds coverage",
      cases: 200,
      seed: 801,
      generate: (rng) => {
        const statuses: Record<string, SessionStatus> = {}
        const messages: Record<string, Array<{ id: string; role: string; completed?: number }>> = {}
        const partsFor = new Set<string>()
        for (const id of SESSION_IDS) {
          if (rng.chance(0.7)) statuses[id] = randomStatus(rng)
          switch (rng.int(5)) {
            case 0:
              break // no messages at all
            case 1: // last assistant INCOMPLETE, parts present (renderable)
              messages[id] = [{ id: `m_${id}`, role: "assistant" }]
              partsFor.add(`m_${id}`)
              break
            case 2: // last assistant completed, parts present
              messages[id] = [{ id: `m_${id}`, role: "assistant", completed: 5 }]
              partsFor.add(`m_${id}`)
              break
            case 3: // last assistant completed, parts never fetched
              messages[id] = [{ id: `m_${id}`, role: "assistant", completed: 5 }]
              break
            default: // last message from the user
              messages[id] = [{ id: `m_${id}`, role: "user", completed: 5 }]
              break
          }
        }
        return { statuses, messages, partsFor: [...partsFor] }
      },
      check: ({ statuses, messages, partsFor }) => {
        const candidates = new Set(
          getReconnectCandidateSessionIds({
            session: SESSION_IDS.map(
              (id) => ({ id, title: id, time: { created: 1, updated: 1 }, version: "1" }) as never,
            ),
            session_status: statuses,
            message: Object.fromEntries(
              Object.entries(messages).map(([id, list]) => [
                id,
                list.map((m) => ({
                  id: m.id,
                  sessionID: id,
                  role: m.role,
                  time: { created: 1, ...(m.completed !== undefined ? { completed: m.completed } : {}) },
                })),
              ]),
            ) as never,
            part: PartMap.from(Object.fromEntries(partsFor.map((mid) => [mid, [{ id: "p1" } as never]]))),
          }),
        )
        // Independent expected set, derived from the contract only.
        const expected = new Set<string>()
        for (const id of SESSION_IDS) {
          if (statuses[id] && statuses[id].type !== "idle") expected.add(id)
          const list = messages[id]
          if (!list || list.length === 0) continue
          const last = list[list.length - 1]
          if (last.role === "assistant" && last.completed === undefined) {
            expected.add(id) // incomplete last assistant reply
            continue
          }
          const renderable = list.every((m) => m.role !== "assistant" || partsFor.includes(m.id))
          if (!renderable) expected.add(id)
        }
        expect([...candidates].sort()).toEqual([...expected].sort())
      },
    })
  })
})
