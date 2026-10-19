import { describe, expect, test } from "vitest"
import {
  computeQueuedAutoSendStatusUpdate,
  decideQueuedDispatchAfterClaim,
  decideQueuedDispatchBeforeClaim,
  decideQueuedDispatchOnFailure,
  shouldDispatchQueuedAutoSend,
} from "../useQueuedMessageAutoSend"
import type { QueuedMessage } from "@/stores/messageQueueStore"
import { runProperty, type Rng } from "../../test/prng"

/**
 * Model 4: queued-message auto-send.
 *
 * Drives the REAL pure logic the hook runs: computeQueuedAutoSendStatusUpdate
 * (edge + deferred-edge preservation) plus decideQueuedDispatchBeforeClaim /
 * AfterClaim / OnFailure (claim, retry-id, hold and restore decisions). The
 * harness below only applies those decisions to a fake shared queue/claim
 * store; it makes no claim, id or restore decision of its own.
 *
 * Two windows share one queue and one claim set. The drain never synthesizes
 * a busy transition: holds lift and sessions stay idle, so a queue whose
 * edge was consumed while held is stranded and fails the test.
 */

const SESSION_IDS = ["ses_a", "ses_b"] as const
type StatusType = "idle" | "busy" | "retry"
type Entry = { id: string; messageId?: string }

type Tick = {
  statuses: Partial<Record<string, StatusType>>
  held: string[]
  enqueue: Array<{ sessionId: string; entryId: string }>
  sendFails: boolean
  holdDuringClaim: boolean
  clearSession?: string
}

function generateTrace(rng: Rng): Tick[] {
  const ticks: Tick[] = []
  let entryCounter = 0
  const enqueuedSessions = new Set<string>()
  for (let i = 0, n = 3 + rng.int(8); i < n; i += 1) {
    const statuses: Partial<Record<string, StatusType>> = {}
    for (const id of SESSION_IDS) {
      if (rng.chance(0.85)) statuses[id] = rng.pick(["idle", "busy", "retry"] as const)
    }
    const enqueue: Tick["enqueue"] = []
    // Entries are queued while their session is working, as in the real
    // composer; an entry queued on an already-idle session awaits its next
    // busy -> idle edge by design and is out of scope for the drain below.
    // One head entry per session: a busy -> idle edge dispatches exactly the
    // head, and the next entry awaits the edge produced by that send's own
    // turn, which this model deliberately does not synthesize.
    const busySessions = SESSION_IDS.filter(
      (id) => (statuses[id] === "busy" || statuses[id] === "retry") && !enqueuedSessions.has(id),
    )
    if (rng.chance(0.5) && busySessions.length > 0) {
      entryCounter += 1
      const sessionId = rng.pick(busySessions)
      enqueuedSessions.add(sessionId)
      enqueue.push({ sessionId, entryId: `q${entryCounter}` })
    }
    ticks.push({
      statuses,
      held: SESSION_IDS.filter(() => rng.chance(0.3)),
      enqueue,
      sendFails: rng.chance(0.3),
      holdDuringClaim: rng.chance(0.2),
      clearSession: rng.chance(0.1) ? rng.pick(SESSION_IDS) : undefined,
    })
  }
  return ticks
}

type Harness = {
  queues: Map<string, Entry[]>
  claims: Set<string>
  sends: Array<{ entryId: string; messageId: string }>
  attempts: Array<{ entryId: string; messageId: string }>
  mintCounter: number
}

function newHarness(): Harness {
  return { queues: new Map(), claims: new Set(), sends: [], attempts: [], mintCounter: 0 }
}

/** Apply the production decisions for one dispatch attempt of the head entry. */
function dispatchHead(
  h: Harness,
  sessionId: string,
  opts: { deferred: boolean; deferredDuringClaim: boolean; statusType: StatusType | undefined; sendFails: boolean },
): void {
  const queue = h.queues.get(sessionId) ?? []
  const head = queue[0]
  if (!head) return
  const before = decideQueuedDispatchBeforeClaim({
    isDeferred: opts.deferred,
    statusType: opts.statusType ?? "idle",
    entryPresent: true,
    hasContent: true,
  })
  if (before !== "claim") return
  // Cross-window claim: the first window wins, the loser sends nothing.
  if (h.claims.has(head.id)) return
  h.claims.add(head.id)
  const current = (h.queues.get(sessionId) ?? []).find((e) => e.id === head.id)
  const after = decideQueuedDispatchAfterClaim({
    entryPresent: Boolean(current),
    isDeferred: opts.deferredDuringClaim,
    statusType: opts.statusType ?? "idle",
    currentMessageId: current?.messageId,
    payloadMessageId: head.messageId,
    mintMessageId: () => `msg_${(h.mintCounter += 1)}`,
  })
  if (after.action !== "dispatch") {
    h.claims.delete(head.id)
    return
  }
  if (!current) return
  if (after.assignMessageId) current.messageId = after.messageId
  h.attempts.push({ entryId: head.id, messageId: after.messageId })
  // Entry removed before the send, as the hook does.
  h.queues.set(
    sessionId,
    (h.queues.get(sessionId) ?? []).filter((e) => e.id !== head.id),
  )
  if (opts.sendFails) {
    const onFailure = decideQueuedDispatchOnFailure({
      queueHasEntry: (h.queues.get(sessionId) ?? []).some((e) => e.id === head.id),
    })
    if (onFailure.releaseClaim) h.claims.delete(head.id)
    if (onFailure.restoreEntry) {
      h.queues.set(sessionId, [{ ...current, messageId: after.messageId }, ...(h.queues.get(sessionId) ?? [])])
    }
  } else {
    h.sends.push({ entryId: head.id, messageId: after.messageId })
  }
}

function runTrace(trace: Tick[]) {
  const h = newHarness()
  // Each window keeps its own status baseline, as two hook instances would.
  const baselines = [new Map<string, StatusType>(), new Map<string, StatusType>()]
  let currentStatuses: Partial<Record<string, StatusType>> = {}

  const runTick = (
    statuses: Partial<Record<string, StatusType>>,
    held: Set<string>,
    sendFails: boolean,
    holdDuringClaim: boolean,
  ) => {
    currentStatuses = { ...statuses }
    const queuedMessages: Record<string, QueuedMessage[]> = {}
    for (const [id, entries] of h.queues) {
      queuedMessages[id] = entries.map(
        (e) => ({ id: e.id, content: e.id, createdAt: 1, messageId: e.messageId }) as QueuedMessage,
      )
    }
    const statusRecord: Record<string, { type: string }> = {}
    for (const [id, type] of Object.entries(statuses)) if (type) statusRecord[id] = { type }
    const isDeferred = (id: string) => held.has(id) || !(id in statusRecord)
    for (let w = 0; w < baselines.length; w += 1) {
      const update = computeQueuedAutoSendStatusUpdate(queuedMessages, statusRecord, baselines[w], isDeferred)
      for (const sessionId of update.sessionIdsToDispatch) {
        dispatchHead(h, sessionId, {
          deferred: isDeferred(sessionId),
          deferredDuringClaim: holdDuringClaim && w === 0,
          statusType: statuses[sessionId],
          sendFails,
        })
      }
      baselines[w] = update.nextStatusMap
    }
  }

  for (const tick of trace) {
    for (const { sessionId, entryId } of tick.enqueue) {
      h.queues.set(sessionId, [...(h.queues.get(sessionId) ?? []), { id: entryId }])
    }
    if (tick.clearSession) h.queues.delete(tick.clearSession)
    runTick(tick.statuses, new Set(tick.held), tick.sendFails, tick.holdDuringClaim)
  }

  // Drain: holds lifted, sessions idle, NO further status transitions and no
  // synthesized busy edge. An edge kept armed while held must fire on its own.
  const allIdle: Partial<Record<string, StatusType>> = { ses_a: "idle", ses_b: "idle" }
  for (let round = 0; round < 32; round += 1) {
    if ([...h.queues.values()].every((q) => q.length === 0)) break
    runTick(allIdle, new Set(), false, false)
  }
  void currentStatuses
  return h
}

describe("useQueuedMessageAutoSend model", () => {
  test("edge detector only fires on busy/retry -> idle", () => {
    const types: Array<StatusType | undefined> = [undefined, "idle", "busy", "retry"]
    for (const prev of types) {
      for (const cur of types) {
        if (cur === undefined) continue
        expect(shouldDispatchQueuedAutoSend(prev, cur)).toBe((prev === "busy" || prev === "retry") && cur === "idle")
      }
    }
  })

  test("dispatch decisions: claim, retry id, hold and restore", () => {
    expect(
      decideQueuedDispatchBeforeClaim({ isDeferred: true, statusType: "idle", entryPresent: true, hasContent: true }),
    ).toBe("deferred")
    expect(
      decideQueuedDispatchBeforeClaim({ isDeferred: false, statusType: "busy", entryPresent: true, hasContent: true }),
    ).toBe("skip")
    expect(
      decideQueuedDispatchBeforeClaim({ isDeferred: false, statusType: "idle", entryPresent: false, hasContent: true }),
    ).toBe("skip")
    expect(
      decideQueuedDispatchBeforeClaim({ isDeferred: false, statusType: "idle", entryPresent: true, hasContent: true }),
    ).toBe("claim")
    let mints = 0
    const mint = () => `m${(mints += 1)}`
    expect(
      decideQueuedDispatchAfterClaim({
        entryPresent: false,
        isDeferred: false,
        statusType: "idle",
        mintMessageId: mint,
      }),
    ).toEqual({ action: "missing" })
    expect(
      decideQueuedDispatchAfterClaim({ entryPresent: true, isDeferred: true, statusType: "idle", mintMessageId: mint }),
    ).toEqual({ action: "deferred" })
    expect(
      decideQueuedDispatchAfterClaim({
        entryPresent: true,
        isDeferred: false,
        statusType: "idle",
        currentMessageId: "keep",
        mintMessageId: mint,
      }),
    ).toEqual({ action: "dispatch", messageId: "keep", assignMessageId: false })
    expect(mints).toBe(0)
    expect(
      decideQueuedDispatchAfterClaim({
        entryPresent: true,
        isDeferred: false,
        statusType: "idle",
        mintMessageId: mint,
      }),
    ).toEqual({
      action: "dispatch",
      messageId: "m1",
      assignMessageId: true,
    })
    expect(decideQueuedDispatchOnFailure({ queueHasEntry: false })).toEqual({ releaseClaim: true, restoreEntry: true })
    expect(decideQueuedDispatchOnFailure({ queueHasEntry: true })).toEqual({ releaseClaim: true, restoreEntry: false })
  })

  test("never double-sends, retry id is stable, and idle queues never strand", () => {
    runProperty({
      name: "queued auto-send claim model",
      cases: 200,
      seed: 901,
      generate: generateTrace,
      check: (trace) => {
        const h = runTrace(trace)
        expect(new Set(h.sends.map((s) => s.entryId)).size).toBe(h.sends.length)
        const byEntry = new Map<string, string>()
        for (const attempt of h.attempts) {
          const prior = byEntry.get(attempt.entryId)
          if (prior !== undefined && prior !== attempt.messageId) {
            throw new Error(`retry id changed for ${attempt.entryId}: ${prior} -> ${attempt.messageId}`)
          }
          byEntry.set(attempt.entryId, attempt.messageId)
        }
        // An entry whose send FAILED awaits the next busy -> idle edge by
        // design (no retry loop). An entry that was NEVER attempted and is
        // still queued after the idle drain lost its edge while held.
        const attempted = new Set(h.attempts.map((a) => a.entryId))
        for (const [sessionId, queue] of h.queues) {
          for (const entry of queue) {
            if (!attempted.has(entry.id)) {
              throw new Error(`session ${sessionId} stranded never-attempted entry ${entry.id}`)
            }
          }
        }
      },
    })
  })

  test("deferred edge: busy->idle while held fires when the hold lifts, with no new transition", () => {
    const h = newHarness()
    h.queues.set("ses_a", [{ id: "q1" }])
    let baseline = new Map<string, StatusType>([["ses_a", "busy"]])
    const queued = () => ({
      ses_a: [
        { id: "q1", content: "q1", createdAt: 1, messageId: h.queues.get("ses_a")?.[0]?.messageId },
      ] as QueuedMessage[],
    })
    const idle = { ses_a: { type: "idle" } }
    // Edge arrives while held: no dispatch, baseline stays armed at busy.
    let update = computeQueuedAutoSendStatusUpdate(queued(), idle, baseline, () => true)
    expect(update.sessionIdsToDispatch).toEqual([])
    baseline = update.nextStatusMap
    expect(baseline.get("ses_a")).toBe("busy")
    // Hold lifts, status record unchanged: the armed edge fires by itself.
    update = computeQueuedAutoSendStatusUpdate(queued(), idle, baseline, () => false)
    expect(update.sessionIdsToDispatch).toEqual(["ses_a"])
    for (const id of update.sessionIdsToDispatch) {
      dispatchHead(h, id, { deferred: false, deferredDuringClaim: false, statusType: "idle", sendFails: false })
    }
    expect(h.sends).toEqual([{ entryId: "q1", messageId: "msg_1" }])
    expect(h.queues.get("ses_a")).toEqual([])
  })

  test("abort during an outstanding retry: failure restores the entry and the retry reuses its id", () => {
    const h = newHarness()
    h.queues.set("ses_a", [{ id: "q1" }])
    // First attempt fails and is restored with its minted id.
    dispatchHead(h, "ses_a", { deferred: false, deferredDuringClaim: false, statusType: "idle", sendFails: true })
    expect(h.sends).toEqual([])
    expect(h.queues.get("ses_a")?.[0]?.messageId).toBe("msg_1")
    // Retry attempt: an abort hold lands during the claim, so nothing sends.
    dispatchHead(h, "ses_a", { deferred: false, deferredDuringClaim: true, statusType: "idle", sendFails: false })
    expect(h.sends).toEqual([])
    expect(h.queues.get("ses_a")).toHaveLength(1)
    // Hold lifts: the retry goes out under the SAME id, exactly once.
    dispatchHead(h, "ses_a", { deferred: false, deferredDuringClaim: false, statusType: "idle", sendFails: false })
    expect(h.sends).toEqual([{ entryId: "q1", messageId: "msg_1" }])
    expect(h.attempts.filter((a) => a.entryId === "q1").map((a) => a.messageId)).toEqual(["msg_1", "msg_1"])
    expect(h.claims.size).toBe(1)
  })

  test("competing windows: only the first claim sends the head entry", () => {
    const h = newHarness()
    h.queues.set("ses_a", [{ id: "q1" }])
    dispatchHead(h, "ses_a", { deferred: false, deferredDuringClaim: false, statusType: "idle", sendFails: false })
    // Second window races the same edge with a fresh queue snapshot.
    h.queues.set("ses_a", [{ id: "q1", messageId: "msg_1" }])
    dispatchHead(h, "ses_a", { deferred: false, deferredDuringClaim: false, statusType: "idle", sendFails: false })
    expect(h.sends).toEqual([{ entryId: "q1", messageId: "msg_1" }])
  })
})
