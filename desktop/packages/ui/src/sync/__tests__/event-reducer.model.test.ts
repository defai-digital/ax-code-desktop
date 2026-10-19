import { describe, expect, test } from "vitest"
import type { Event, Message, Part, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"
import { createRng, runProperty, type Rng } from "../../test/prng"

/**
 * Model 1: event-reducer interleavings.
 *
 * Generator: seeded traces (length <= 14) over 2 sessions / 3 messages /
 * 3 parts mixing creation, update, archive, delete, removal, text and tool
 * part updates, part deltas WITH offsets, and status events. No wall clock:
 * timestamps come from the generator's logical clock, which never goes
 * backwards for a session and never re-creates a live session (see the
 * reachability note by the stale-snapshot test below).
 *
 * The oracle is an independent minimal reference model over plain maps
 * (session -> messages -> parts with text/status). It shares no code with
 * the reducer: it re-derives insertion, removal, archive cleanup, delta
 * offset reconciliation, final-tool preservation and sessionTotal
 * membership from the event contract alone.
 */

const SESSION_IDS = ["ses_a", "ses_b"] as const
const MESSAGE_IDS = ["msg_a", "msg_b", "msg_c"] as const
const PART_IDS = ["prt_a", "prt_b", "prt_c"] as const
const FINAL_TOOL = new Set(["completed", "error", "aborted", "failed", "timeout", "cancelled"])
// A message id belongs to exactly one session for its whole life, as on the
// server; parts for it carry that same session id.
const MESSAGE_HOME: Record<string, string> = { msg_a: "ses_a", msg_b: "ses_b", msg_c: "ses_a" }

type TraceEvent =
  | { kind: "sessionCreated"; sessionId: string; updated: number }
  | { kind: "sessionUpdated"; sessionId: string; updated: number; archived?: boolean }
  | { kind: "sessionDeleted"; sessionId: string }
  | { kind: "messageUpdated"; sessionId: string; messageId: string; created: number }
  | { kind: "messageRemoved"; sessionId: string; messageId: string }
  | { kind: "partUpdated"; sessionId: string; messageId: string; partId: string; text: string }
  | { kind: "toolUpdated"; sessionId: string; messageId: string; partId: string; status: string }
  | { kind: "partRemoved"; messageId: string; partId: string }
  | { kind: "partDelta"; messageId: string; partId: string; delta: string; offset: number }
  | { kind: "status"; sessionId: string; status: "busy" | "idle" }

function generateTrace(rng: Rng): TraceEvent[] {
  const length = 1 + rng.int(14)
  const trace: TraceEvent[] = []
  const liveSessions = new Set<string>()
  let clock = 0
  for (let i = 0; i < length; i += 1) {
    clock += 1
    const sessionId = rng.pick(SESSION_IDS)
    const messageId = rng.pick(MESSAGE_IDS)
    const home = MESSAGE_HOME[messageId] ?? sessionId
    const partId = rng.pick(PART_IDS)
    switch (rng.int(10)) {
      case 0:
        // Reachable producers never publish session.created twice for a
        // live id (primary-keyed insert, then publish), so a duplicate
        // creation is not generated; re-creation after deletion is fine.
        if (liveSessions.has(sessionId)) {
          trace.push({ kind: "sessionUpdated", sessionId, updated: clock })
        } else {
          liveSessions.add(sessionId)
          trace.push({ kind: "sessionCreated", sessionId, updated: clock })
        }
        break
      case 1: {
        const archived = rng.chance(0.25)
        if (archived) liveSessions.delete(sessionId)
        else liveSessions.add(sessionId)
        trace.push({ kind: "sessionUpdated", sessionId, updated: clock, archived })
        break
      }
      case 2:
        liveSessions.delete(sessionId)
        trace.push({ kind: "sessionDeleted", sessionId })
        break
      case 3:
        trace.push({ kind: "messageUpdated", sessionId: home, messageId, created: clock })
        break
      case 4:
        trace.push({ kind: "messageRemoved", sessionId: home, messageId })
        break
      case 5:
        trace.push({
          kind: "partUpdated",
          sessionId: home,
          messageId,
          partId,
          text: rng.pick(["", "a", "ab", "hello", `t${clock}`]),
        })
        break
      case 6:
        trace.push({
          kind: "toolUpdated",
          sessionId: home,
          messageId,
          partId,
          status: rng.pick(["running", "pending", "completed", "error"]),
        })
        break
      case 7:
        trace.push({ kind: "partRemoved", messageId, partId })
        break
      case 8:
        // Offsets span contiguous (offset == current length), replayed
        // (offset < length) and gap (offset > length) deltas; the oracle
        // resolves each against the text at replay time.
        trace.push({
          kind: "partDelta",
          messageId,
          partId,
          delta: rng.pick(["x", "yz", "a"]),
          offset: rng.pick([0, 1, 2, 3, 6]),
        })
        break
      default:
        trace.push({ kind: "status", sessionId, status: rng.chance(0.5) ? "busy" : "idle" })
        break
    }
  }
  return trace
}

function toEvent(ev: TraceEvent): Event {
  switch (ev.kind) {
    case "sessionCreated":
      return {
        type: "session.created",
        properties: {
          info: { id: ev.sessionId, title: ev.sessionId, time: { created: 1, updated: ev.updated }, version: "1" },
        },
      } as Event
    case "sessionUpdated":
      return {
        type: "session.updated",
        properties: {
          info: {
            id: ev.sessionId,
            title: ev.sessionId,
            time: { created: 1, updated: ev.updated, ...(ev.archived ? { archived: ev.updated } : {}) },
            version: "1",
          },
        },
      } as Event
    case "sessionDeleted":
      return {
        type: "session.deleted",
        properties: {
          info: { id: ev.sessionId, title: ev.sessionId, time: { created: 1, updated: 1 }, version: "1" },
        },
      } as Event
    case "messageUpdated":
      return {
        type: "message.updated",
        properties: {
          info: {
            id: ev.messageId,
            sessionID: ev.sessionId,
            role: "assistant",
            parentID: "msg_user",
            modelID: "m",
            providerID: "p",
            mode: "build",
            agent: "coder",
            path: { cwd: "/repo", root: "/repo" },
            time: { created: ev.created, completed: ev.created + 1 },
            tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
          } as Message,
        },
      } as Event
    case "messageRemoved":
      return {
        type: "message.removed",
        properties: { sessionID: ev.sessionId, messageID: ev.messageId },
      } as Event
    case "partUpdated":
      return {
        type: "message.part.updated",
        properties: {
          part: {
            id: ev.partId,
            messageID: ev.messageId,
            sessionID: ev.sessionId,
            type: "text",
            text: ev.text,
          } as Part,
        },
      } as Event
    case "toolUpdated":
      return {
        type: "message.part.updated",
        properties: {
          part: {
            id: ev.partId,
            messageID: ev.messageId,
            sessionID: ev.sessionId,
            type: "tool",
            tool: "bash",
            state: {
              status: ev.status,
              input: {},
              time: { start: 1, ...(FINAL_TOOL.has(ev.status) ? { end: 9 } : {}) },
            },
          } as unknown as Part,
        },
      } as Event
    case "partRemoved":
      return {
        type: "message.part.removed",
        properties: { messageID: ev.messageId, partID: ev.partId },
      } as Event
    case "partDelta":
      return {
        type: "message.part.delta",
        properties: { messageID: ev.messageId, partID: ev.partId, field: "text", delta: ev.delta, offset: ev.offset },
      } as Event
    case "status":
      return {
        type: "session.status",
        properties: { sessionID: ev.sessionId, status: { type: ev.status } },
      } as Event
  }
}

/** Fresh DEEP state per case/replay: no slice is shared with INITIAL_STATE or another run. */
function baseState(): State {
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

type Applied = { state: State; materializationFor: Set<string> }

function collect(result: ReturnType<typeof applyDirectoryEvent>, into: Set<string>) {
  if (result && typeof result === "object" && "materialization" in result && result.materialization) {
    into.add(result.materialization.messageID)
  }
}

/** Event-by-event: a fresh prepared draft per event, as the pipeline does. */
function applySequential(trace: TraceEvent[]): Applied {
  let state = baseState()
  const materializationFor = new Set<string>()
  for (const ev of trace) {
    const event = toEvent(ev)
    const draft = prepareEventDraft(state, event)
    collect(applyDirectoryEvent(draft, event), materializationFor)
    state = draft
  }
  return { state, materializationFor }
}

/** One batch: every event applied to a single fresh draft. */
function applyBatch(trace: TraceEvent[]): Applied {
  const draft = baseState()
  const materializationFor = new Set<string>()
  for (const ev of trace) collect(applyDirectoryEvent(draft, toEvent(ev)), materializationFor)
  return { state: draft, materializationFor }
}

function snapshot(state: State) {
  return {
    sessions: state.session.map((s: Session) => `${s.id}@${s.time?.updated ?? 0}`).join(","),
    sessionTotal: state.sessionTotal,
    statuses: Object.entries(state.session_status)
      .map(([k, v]) => `${k}:${v.type}`)
      .sort()
      .join(","),
    messages: Object.entries(state.message)
      .map(([k, v]) => `${k}=[${v.map((m) => m.id).join(",")}]`)
      .sort()
      .join(";"),
    parts: Object.entries(state.part.toRecord())
      .map(
        ([k, v]) =>
          `${k}=[${v
            .map(
              (p) =>
                `${p.id}:${(p as { text?: string }).text ?? (p as { state?: { status?: string } }).state?.status ?? ""}`,
            )
            .join(",")}]`,
      )
      .sort()
      .join(";"),
  }
}

// ---------------------------------------------------------------------------
// Independent semantic oracle (plain maps only; no reducer helpers).
// ---------------------------------------------------------------------------

type RefPart = { text: string; toolStatus?: string; sessionId?: string }
type RefModel = {
  sessions: Map<string, number>
  sessionTotal: number
  statuses: Map<string, string>
  messages: Map<string, string[]>
  parts: Map<string, Map<string, RefPart>>
}

function insertSorted(list: string[], id: string) {
  if (!list.includes(id)) {
    list.push(id)
    list.sort()
  }
}

function refCleanup(model: RefModel, sessionId: string) {
  for (const messageId of model.messages.get(sessionId) ?? []) model.parts.delete(messageId)
  for (const [messageId, bucket] of [...model.parts]) {
    for (const part of bucket.values()) {
      if (part.sessionId === sessionId) {
        model.parts.delete(messageId)
        break
      }
    }
  }
  model.messages.delete(sessionId)
  model.statuses.delete(sessionId)
}

function refApply(model: RefModel, ev: TraceEvent): void {
  switch (ev.kind) {
    case "sessionCreated": {
      const isNew = !model.sessions.has(ev.sessionId)
      model.sessions.set(ev.sessionId, ev.updated)
      if (isNew) model.sessionTotal += 1
      break
    }
    case "sessionUpdated": {
      if (ev.archived) {
        if (model.sessions.delete(ev.sessionId)) model.sessionTotal = Math.max(0, model.sessionTotal - 1)
        refCleanup(model, ev.sessionId)
      } else {
        model.sessions.set(ev.sessionId, ev.updated)
      }
      break
    }
    case "sessionDeleted": {
      if (model.sessions.delete(ev.sessionId)) model.sessionTotal = Math.max(0, model.sessionTotal - 1)
      refCleanup(model, ev.sessionId)
      break
    }
    case "messageUpdated": {
      const list = model.messages.get(ev.sessionId) ?? []
      insertSorted(list, ev.messageId)
      model.messages.set(ev.sessionId, list)
      break
    }
    case "messageRemoved": {
      const list = model.messages.get(ev.sessionId)
      if (list)
        model.messages.set(
          ev.sessionId,
          list.filter((id) => id !== ev.messageId),
        )
      model.parts.delete(ev.messageId)
      break
    }
    case "partUpdated": {
      const bucket = model.parts.get(ev.messageId) ?? new Map<string, RefPart>()
      bucket.set(ev.partId, { text: ev.text, sessionId: ev.sessionId })
      model.parts.set(ev.messageId, bucket)
      break
    }
    case "toolUpdated": {
      const bucket = model.parts.get(ev.messageId) ?? new Map<string, RefPart>()
      const prev = bucket.get(ev.partId)
      const prevFinal = prev?.toolStatus !== undefined && FINAL_TOOL.has(prev.toolStatus)
      // A final tool state is never downgraded by a later non-final update.
      if (!(prevFinal && !FINAL_TOOL.has(ev.status))) {
        bucket.set(ev.partId, { text: prev?.text ?? "", toolStatus: ev.status, sessionId: ev.sessionId })
      }
      model.parts.set(ev.messageId, bucket)
      break
    }
    case "partRemoved": {
      const bucket = model.parts.get(ev.messageId)
      if (bucket) {
        bucket.delete(ev.partId)
        if (bucket.size === 0) model.parts.delete(ev.messageId)
      }
      break
    }
    case "partDelta": {
      const bucket = model.parts.get(ev.messageId)
      const part = bucket?.get(ev.partId)
      if (!bucket || !part) break
      if (ev.offset > part.text.length) break // gap: snapshot requested, text untouched
      part.text = part.text + ev.delta.slice(part.text.length - ev.offset)
      break
    }
    case "status":
      model.statuses.set(ev.sessionId, ev.status)
      break
  }
}

function runRef(trace: TraceEvent[]): RefModel {
  const model: RefModel = {
    sessions: new Map(),
    sessionTotal: 0,
    statuses: new Map(),
    messages: new Map(),
    parts: new Map(),
  }
  for (const ev of trace) refApply(model, ev)
  return model
}

function assertMatchesRef(state: State, ref: RefModel) {
  const actualSessions = new Map(state.session.map((s) => [s.id, s.time?.updated ?? 0]))
  expect(actualSessions).toEqual(ref.sessions)
  // sessionTotal membership: only a session actually held may be counted.
  if (state.sessionTotal !== ref.sessionTotal) {
    throw new Error(`sessionTotal=${state.sessionTotal}, expected ${ref.sessionTotal}`)
  }
  expect(new Map(Object.entries(state.session_status).map(([k, v]) => [k, v.type]))).toEqual(ref.statuses)
  const actualMessages = new Map(Object.entries(state.message).map(([k, v]) => [k, v.map((m) => m.id)]))
  // Reducer keeps an empty list key after the last message is removed; the
  // oracle drops it. Normalise empty lists away on both sides.
  for (const [k, v] of [...actualMessages]) if (v.length === 0) actualMessages.delete(k)
  const refMessages = new Map([...ref.messages].filter(([, v]) => v.length > 0))
  expect(actualMessages).toEqual(refMessages)
  // Visible parts: for every listed message, part ids and final text/status
  // must match the oracle exactly, and no part may sit under a wrong session.
  for (const [sessionId, messageIds] of refMessages) {
    for (const messageId of messageIds) {
      const actual = state.part.get(messageId) ?? []
      const expected = ref.parts.get(messageId)
      const actualSummary = actual
        .map(
          (p) =>
            `${p.id}:${(p as { text?: string }).text ?? (p as { state?: { status?: string } }).state?.status ?? ""}`,
        )
        .sort()
      const expectedSummary = expected ? [...expected].map(([id, p]) => `${id}:${p.toolStatus ?? p.text}`).sort() : []
      if (JSON.stringify(actualSummary) !== JSON.stringify(expectedSummary)) {
        throw new Error(
          `parts for ${messageId} in ${sessionId}: ${JSON.stringify(actualSummary)} != ${JSON.stringify(expectedSummary)}`,
        )
      }
      for (const p of actual) {
        const owner = (p as { sessionID?: string }).sessionID
        if (owner !== undefined && owner !== sessionId) {
          throw new Error(`part ${p.id} of ${messageId} landed under wrong session ${owner}, listed in ${sessionId}`)
        }
      }
    }
  }
}

describe("event-reducer model", () => {
  test("semantic oracle: visible messages, parts, text and sessionTotal match the reference model", () => {
    runProperty({
      name: "event-reducer semantic oracle",
      cases: 200,
      seed: 101,
      generate: generateTrace,
      check: (trace) => {
        const { state } = applySequential(trace)
        assertMatchesRef(state, runRef(trace))
        // Structural extras: no duplicate ids anywhere.
        for (const messages of Object.values(state.message)) {
          const ids = messages.map((m) => m.id)
          expect(new Set(ids).size).toBe(ids.length)
        }
        for (const parts of Object.values(state.part.toRecord())) {
          const ids = parts.map((p) => p.id)
          expect(new Set(ids).size).toBe(ids.length)
        }
        expect(state.sessionTotal).toBeGreaterThanOrEqual(0)
        expect(state.sessionTotal).toBeLessThanOrEqual(state.session.length)
      },
    })
  })

  test("batch equals event-by-event (extra check on top of the oracle)", () => {
    runProperty({
      name: "event-reducer batch equivalence",
      cases: 150,
      seed: 151,
      generate: generateTrace,
      check: (trace) => {
        expect(snapshot(applyBatch(trace).state)).toEqual(snapshot(applySequential(trace).state))
      },
    })
  })

  test("a delta or removal after message removal does not recreate the message", () => {
    runProperty({
      name: "event-reducer removal stays removed under delta",
      cases: 150,
      seed: 202,
      generate: generateTrace,
      check: (trace) => {
        const { state } = applySequential(trace)
        for (const sessionId of SESSION_IDS) {
          for (const messageId of MESSAGE_IDS) {
            let removed = false
            for (const ev of trace) {
              if (ev.kind === "messageUpdated" && ev.messageId === messageId && ev.sessionId === sessionId)
                removed = false
              if (ev.kind === "messageRemoved" && ev.messageId === messageId && ev.sessionId === sessionId)
                removed = true
            }
            if (!removed) continue
            const stillThere = (state.message[sessionId] ?? []).some((m) => m.id === messageId)
            if (stillThere) throw new Error(`removed message ${messageId} resurrected in ${sessionId}`)
          }
        }
      },
    })
  })

  // Reachable invariant replacing the old seed-303 expectation. The reducer
  // INTENTIONALLY buffers an orphan part for a removed/unknown message and
  // requests materialization (event-reducer.ts, message.part.updated), so a
  // stored orphan bucket is not resurrection. What must never happen: the
  // removed message becomes RENDERED/listed again, the orphan grows without
  // bound, no materialization is requested for it, or a part lands under the
  // wrong session.
  test("a late part for a removed message never renders it and stays bounded or materialization-requested", () => {
    runProperty({
      name: "event-reducer late part after removal",
      cases: 200,
      seed: 303,
      generate: generateTrace,
      check: (trace) => {
        const { state, materializationFor } = applySequential(trace)
        for (const sessionId of SESSION_IDS) {
          for (const messageId of MESSAGE_IDS) {
            let removed = false
            for (const ev of trace) {
              if (ev.kind === "messageUpdated" && ev.messageId === messageId && ev.sessionId === sessionId)
                removed = false
              if (ev.kind === "messageRemoved" && ev.messageId === messageId && ev.sessionId === sessionId)
                removed = true
            }
            if (!removed) continue
            if ((state.message[sessionId] ?? []).some((m) => m.id === messageId)) {
              throw new Error(`late part rendered removed message ${messageId} in ${sessionId}`)
            }
            const orphan = state.part.get(messageId)
            if (orphan !== undefined) {
              if (orphan.length > PART_IDS.length) {
                throw new Error(`orphan bucket for ${messageId} unbounded: ${orphan.length} parts`)
              }
              const lateAfterRemoval = trace.some(
                (ev) =>
                  (ev.kind === "partUpdated" || ev.kind === "toolUpdated" || ev.kind === "partDelta") &&
                  ev.messageId === messageId,
              )
              if (lateAfterRemoval && !materializationFor.has(messageId) && orphan.length === 0) {
                throw new Error(`orphan for ${messageId} neither bounded nor materialization-requested`)
              }
              for (const p of orphan) {
                const owner = (p as { sessionID?: string }).sessionID
                if (
                  owner !== undefined &&
                  owner !== sessionId &&
                  (state.message[owner] ?? []).some((m) => m.id === messageId)
                ) {
                  throw new Error(`part ${p.id} landed under wrong session ${owner}`)
                }
              }
            }
          }
        }
      },
    })
  })

  // Stale-update property on a REACHABLE producer. Duplicate session.created
  // with decreasing timestamps is unreachable (the server publishes creation
  // only after a successful primary-keyed insert and the pipeline does not
  // coalesce lifecycle events), so it is not generated. The reachable stale
  // producer is a session.updated carrying an older snapshot body than a
  // live event already applied: assert only what the contract guarantees —
  // the session stays listed once, sessionTotal membership is unchanged by
  // an update, and a later (newer) update is what the store ends with.
  test("a stale session.updated keeps membership and a newer update wins last", () => {
    const trace: TraceEvent[] = [
      { kind: "sessionCreated", sessionId: "ses_a", updated: 5 },
      { kind: "sessionUpdated", sessionId: "ses_a", updated: 3 },
      { kind: "sessionUpdated", sessionId: "ses_a", updated: 7 },
    ]
    const { state } = applySequential(trace)
    expect(state.session.map((s) => s.id)).toEqual(["ses_a"])
    expect(state.sessionTotal).toBe(1)
    expect(state.session[0]?.time?.updated).toBe(7)
  })

  test("delta offsets: contiguous appends, replayed overlap is not duplicated, gap requests materialization", () => {
    const base: TraceEvent[] = [
      { kind: "messageUpdated", sessionId: "ses_a", messageId: "msg_a", created: 1 },
      { kind: "partUpdated", sessionId: "ses_a", messageId: "msg_a", partId: "prt_a", text: "ab" },
    ]
    const contiguous = applySequential([
      ...base,
      { kind: "partDelta", messageId: "msg_a", partId: "prt_a", delta: "cd", offset: 2 },
    ])
    expect((contiguous.state.part.get("msg_a")?.[0] as { text?: string })?.text).toBe("abcd")
    const replayed = applySequential([
      ...base,
      { kind: "partDelta", messageId: "msg_a", partId: "prt_a", delta: "bc", offset: 1 },
    ])
    expect((replayed.state.part.get("msg_a")?.[0] as { text?: string })?.text).toBe("abc")
    const gap = applySequential([
      ...base,
      { kind: "partDelta", messageId: "msg_a", partId: "prt_a", delta: "zz", offset: 9 },
    ])
    expect((gap.state.part.get("msg_a")?.[0] as { text?: string })?.text).toBe("ab")
    expect(gap.materializationFor.has("msg_a")).toBe(true)
  })

  test("fresh state per case: INITIAL_STATE stays pristine and the same seed run twice is identical", () => {
    const trace = generateTrace(createRng(42))
    const first = snapshot(applySequential(trace).state)
    const second = snapshot(applySequential(trace).state)
    expect(second).toEqual(first)
    expect(INITIAL_STATE.session).toEqual([])
    expect(INITIAL_STATE.sessionTotal).toBe(0)
    expect(INITIAL_STATE.message).toEqual({})
    expect(INITIAL_STATE.part.size).toBe(0)
  })

  test("seeded generator is deterministic for a fixed seed", () => {
    expect(generateTrace(createRng(5))).toEqual(generateTrace(createRng(5)))
    expect(generateTrace(createRng(5))).toEqual(generateTrace(createRng(5)))
  })
})
