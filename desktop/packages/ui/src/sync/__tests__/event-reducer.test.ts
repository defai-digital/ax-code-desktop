import { describe, expect, test } from "vitest"
import type {
  Event,
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
} from "@defai-digital/ax-code-sdk/v2/client"
import { serverSessionStatusStamp } from "../session-status-events"
import { blockingRequestStamp } from "../blocking-request-events"
import { applyDirectoryEvent, reduceGlobalEvent } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"

type ToolPart = Extract<Part, { type: "tool" }>

// The reducer mutates its draft in place, so hand it a draft part map (what
// prepareEventDraft provides in production) rather than a published one.
function state(overrides: Partial<State> = {}): State {
  const base: State = {
    ...INITIAL_STATE,
    message: {},
    part: PartMap.EMPTY,
    session_status: {},
    ...overrides,
  }
  return { ...base, part: base.part.fork() }
}

function deltaEvent(): Event {
  return {
    type: "message.part.delta",
    properties: {
      messageID: "msg_1",
      partID: "prt_1",
      field: "text",
      delta: "hello",
    },
  } as Event
}

function partUpdatedEvent(): Event {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_1",
        messageID: "msg_1",
        sessionID: "ses_1",
        type: "text",
        text: "hello",
      },
    },
  } as Event
}

function session(id: string, title: string): Session {
  return {
    id,
    title,
    time: { created: 1, updated: 1 },
    version: "1",
  } as Session
}

function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    sessionID: "ses_1",
    role: "assistant",
    parentID: "msg_user_1",
    providerID: "anthropic",
    modelID: "claude",
    mode: "build",
    agent: "coder",
    path: { cwd: "/repo", root: "/repo" },
    time: { created: 1, completed: 2 },
    tokens: {
      input: 1,
      output: 2,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    ...overrides,
  } as Message
}

describe("reduceGlobalEvent", () => {
  test("requests a refresh when the server reports a replay gap", () => {
    expect(
      reduceGlobalEvent({
        type: "server.resync_required",
        properties: { reason: "buffer_overflow", cursor: "boot:10" },
      }),
    ).toEqual({ type: "refresh" })
  })
})

describe("applyDirectoryEvent", () => {
  test("returns typed materialization when delta arrives before parts", () => {
    const result = applyDirectoryEvent(state(), deltaEvent())

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "msg_1", partID: "prt_1" },
    })
  })

  test("returns typed materialization when delta part is missing", () => {
    const result = applyDirectoryEvent(
      state({ part: PartMap.from({ msg_1: [{ id: "prt_2", messageID: "msg_1", type: "text", text: "" } as Part] }) }),
      deltaEvent(),
    )

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "msg_1", partID: "prt_1" },
    })
  })

  test("applies part update and requests materialization when owning message is absent", () => {
    const draft = state()
    const result = applyDirectoryEvent(draft, partUpdatedEvent())

    expect(draft.part.get("msg_1")!.map((item) => item.id)).toEqual(["prt_1"])
    expect(result).toEqual({
      changed: true,
      materialization: {
        type: "incomplete-session-snapshot",
        sessionID: "ses_1",
        messageID: "msg_1",
        partID: "prt_1",
      },
    })
  })

  test("applies part update without materialization when owning message exists", () => {
    const draft = state({
      message: { ses_1: [{ id: "msg_1", sessionID: "ses_1", role: "assistant", time: { created: 1 } } as never] },
    })
    const result = applyDirectoryEvent(draft, partUpdatedEvent())

    expect(draft.part.get("msg_1")!.map((item) => item.id)).toEqual(["prt_1"])
    expect(result).toBe(true)
  })

  test("updates existing session metadata such as generated title", () => {
    const draft = state({
      session: [session("ses_1", "New session")],
      sessionTotal: 1,
    })

    const result = applyDirectoryEvent(draft, {
      type: "session.updated",
      properties: { info: session("ses_1", "Generated title") },
    } as Event)

    expect(result).toBe(true)
    expect(draft.session).toHaveLength(1)
    expect(draft.session[0].title).toBe("Generated title")
    expect(draft.sessionTotal).toBe(1)
  })

  test("merges late assistant message metadata", () => {
    const initial = assistantMessage()
    const draft = state({
      message: { ses_1: [initial] },
    })
    const next = assistantMessage({
      tokens: {
        total: 10,
        input: 3,
        output: 7,
        reasoning: 1,
        cache: { read: 2, write: 0 },
      },
      variant: "thinking",
    })

    const result = applyDirectoryEvent(draft, {
      type: "message.updated",
      properties: { info: next },
    } as Event)

    expect(result).toBe(true)
    expect(draft.message.ses_1[0]).not.toBe(initial)
    expect((draft.message.ses_1[0] as Extract<Message, { role: "assistant" }>).tokens.total).toBe(10)
    expect((draft.message.ses_1[0] as Extract<Message, { role: "assistant" }>).variant).toBe("thinking")
  })

  test("preserves message reference for duplicate message updates", () => {
    const initial = assistantMessage()
    const draft = state({
      message: { ses_1: [initial] },
    })

    const result = applyDirectoryEvent(draft, {
      type: "message.updated",
      properties: { info: assistantMessage() },
    } as Event)

    expect(result).toBe(false)
    expect(draft.message.ses_1[0]).toBe(initial)
  })

  test("detects assistant message finish changes without deep serialization", () => {
    const initial = assistantMessage()
    const draft = state({
      message: { ses_1: [initial] },
    })

    const result = applyDirectoryEvent(draft, {
      type: "message.updated",
      properties: { info: assistantMessage({ finish: "stop" }) },
    } as Event)

    expect(result).toBe(true)
    expect(draft.message.ses_1[0]).not.toBe(initial)
    expect((draft.message.ses_1[0] as Extract<Message, { role: "assistant" }>).finish).toBe("stop")
  })

  test("stamps a session.status event that does not change the stored status", () => {
    // The reducer dedupes an equal status without writing, so the store keeps the object a caller wrote.
    // Callers that need to know "the server published a status" (optimisticSend's failure path) read the
    // stamp instead, which is why it is noted before the dedupe.
    const draft = state()
    const status = { type: "busy" as const }
    draft.session_status = { ses_counted: status }
    const before = serverSessionStatusStamp("ses_counted")

    applyDirectoryEvent(draft, {
      type: "session.status",
      properties: { sessionID: "ses_counted", status: { type: "busy" } },
    } as Event)

    expect(serverSessionStatusStamp("ses_counted")).toBeGreaterThan(before)
    // The stored object is untouched: the dedupe still holds.
    expect(draft.session_status.ses_counted).toBe(status)
  })

  test("stamps every question and permission event, including one it does not store", () => {
    // The resync paths compare this stamp around their snapshot request: a question asked and answered
    // inside that window leaves the id list back where it started, so the signature comparison alone
    // cannot tell that the answer they are about to apply is older than the store. The stamp lives in
    // module state because the reducer's draft is discarded whenever it reports no change — which is
    // exactly what a reply for a question this client never saw does.
    const draft = state()
    const beforeQuestions = blockingRequestStamp("ses_1")

    applyDirectoryEvent(draft, {
      type: "question.asked",
      properties: { id: "que_1", sessionID: "ses_1", questions: [] },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "question.replied",
      properties: { sessionID: "ses_1", requestID: "que_1" },
    } as Event)

    expect(blockingRequestStamp("ses_1")).toBeGreaterThanOrEqual(beforeQuestions + 2)

    const beforePermissions = blockingRequestStamp("ses_1")
    applyDirectoryEvent(draft, {
      type: "permission.asked",
      properties: { id: "perm_1", sessionID: "ses_1", permission: "bash" },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "permission.replied",
      properties: { sessionID: "ses_1", requestID: "perm_1" },
    } as Event)

    expect(blockingRequestStamp("ses_1")).toBeGreaterThanOrEqual(beforePermissions + 2)

    // A reply for a session whose question list this client never held reports no change to the store and
    // is still stamped: the draft it would have carried the count on is dropped.
    const unknownBefore = blockingRequestStamp("ses_unknown")
    const changed = applyDirectoryEvent(draft, {
      type: "question.replied",
      properties: { sessionID: "ses_unknown", requestID: "que_unknown" },
    } as Event)
    expect(changed).toBe(false)
    expect(blockingRequestStamp("ses_unknown")).toBeGreaterThan(unknownBefore)
  })

  test("a permission re-published with the idle allow-once deadline updates in place, and one without removes it", () => {
    // The runtime re-sends an ask under the same id to add autoOnceAt (a queued ask was promoted) and to remove it
    // (the mode changed). A second row for the same request, or a deadline that outlives the cancel, would show a
    // countdown for an approval the runtime will not give.
    // Its own permission map: the default one is shared, and a request left on ses_1 would protect that session from
    // the eviction test that follows.
    const draft = state({ permission: {} })
    const ask = (extra: Record<string, unknown> = {}) =>
      applyDirectoryEvent(draft, {
        type: "permission.asked",
        properties: { id: "perm_1", sessionID: "ses_1", permission: "hook", patterns: [], always: [], metadata: {}, ...extra },
      } as Event)
    ask()
    ask({ autoOnceAt: 1_800_000_015_000 })
    expect(draft.permission["ses_1"]).toHaveLength(1)
    expect(draft.permission["ses_1"]?.[0]).toMatchObject({ id: "perm_1", autoOnceAt: 1_800_000_015_000 })
    ask()
    expect(draft.permission["ses_1"]).toHaveLength(1)
    expect(draft.permission["ses_1"]?.[0]?.autoOnceAt).toBeUndefined()
  })

  test("replaces an optimistic part the server echo did not land in front of", () => {
    // The replacement scanned only when the *first* slot lacks a sessionID ("optimistic parts are
    // always inserted first"), but insertions are by sorted id and the server echoes a prompt's parts
    // one at a time. Once an earlier echo sorts in front of them, the scan was skipped and the
    // matching optimistic part stayed: the user's prompt text rendered twice.
    const draft = state()
    draft.part.set("msg_opt", [
      { id: "prt_opt_file", messageID: "msg_opt", type: "file", mime: "text/plain" } as unknown as Part,
      { id: "prt_opt_text", messageID: "msg_opt", type: "text", text: "hello" } as unknown as Part,
    ])

    const echo = (part: Record<string, unknown>) =>
      applyDirectoryEvent(draft, { type: "message.part.updated", properties: { part } } as Event)

    // The server's file part echo sorts below both optimistic ids, so it becomes the first slot.
    echo({ id: "prt_aaa", messageID: "msg_opt", sessionID: "ses_1", type: "file", mime: "text/plain" })
    echo({ id: "prt_aab", messageID: "msg_opt", sessionID: "ses_1", type: "text", text: "hello" })

    const parts = draft.part.get("msg_opt") ?? []
    expect(parts.filter((part) => part.type === "text")).toHaveLength(1)
    expect(parts.filter((part) => part.type === "file")).toHaveLength(1)
    expect(parts.map((part) => part.id)).toEqual(["prt_aaa", "prt_aab"])
  })

  test("dedupes long delta overlaps after long accumulated text", () => {
    const draft = state()
    const longPrefix = "x".repeat(50_000)
    const longOverlap = "abcdef".repeat(300)

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: "prt_long",
          messageID: "msg_long",
          sessionID: "ses_1",
          type: "text",
          text: longPrefix,
        },
      },
    } as Event)

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: "prt_long",
          messageID: "msg_long",
          sessionID: "ses_1",
          type: "text",
          text: `${longPrefix}${longOverlap}`,
        },
      },
    } as Event)

    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: {
        messageID: "msg_long",
        partID: "prt_long",
        field: "text",
        delta: `${longOverlap}ghi`,
      },
    } as Event)

    expect((draft.part.get("msg_long")?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe(
      `${longPrefix}${longOverlap}ghi`,
    )
  })

  test("dedupes a delta overlap that contains an astral character", () => {
    const draft = state()
    const messageID = "msg_emoji"
    const partID = "prt_emoji"

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: { id: partID, messageID, sessionID: "ses_1", type: "text", text: "ab" },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: { id: partID, messageID, sessionID: "ses_1", type: "text", text: "ab\u{1F600}" },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: { messageID, partID, field: "text", delta: "\u{1F600}z" },
    } as Event)

    expect((draft.part.get(messageID)?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe("ab\u{1F600}z")
  })

  test("does not duplicate overlapping delta text after a newer part update", () => {
    const draft = state()
    const messageID = "msg_overlap"
    const partID = "prt_overlap"

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "Fix typo in ToolOutputDialog - ",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "Fix typo in ToolOutputDialog - toolFailedToReadDiagram vs toolFailedReadDiagram. Let me fix it.",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: {
        messageID,
        partID,
        field: "text",
        delta: "toolFailedToReadDiagram vs toolFailedReadDiagram. Let me fix it.",
      },
    } as Event)

    expect(draft.part.get(messageID)).toHaveLength(1)
    expect((draft.part.get(messageID)?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe(
      "Fix typo in ToolOutputDialog - toolFailedToReadDiagram vs toolFailedReadDiagram. Let me fix it.",
    )
  })

  test("appends only the non-overlapping suffix of a streaming delta", () => {
    const draft = state()
    const messageID = "msg_suffix"
    const partID = "prt_suffix"

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "toolFailedToReadDiagram vs toolFailedRead",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "toolFailedToReadDiagram vs toolFailedReadDiagra",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: {
        messageID,
        partID,
        field: "text",
        delta: "Diagram. Let me fix it.",
      },
    } as Event)

    expect((draft.part.get(messageID)?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe(
      "toolFailedToReadDiagram vs toolFailedReadDiagram. Let me fix it.",
    )
  })

  test("appends a non-overlapping delta unchanged", () => {
    const draft = state()
    const messageID = "msg_non_overlap"
    const partID = "prt_non_overlap"

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "PR comment done - ",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: {
        messageID,
        partID,
        field: "text",
        delta: "Let me fix it.",
      },
    } as Event)

    expect((draft.part.get(messageID)?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe(
      "PR comment done - Let me fix it.",
    )
  })

  test("preserves legitimate repeated output without an update-to-delta dedupe window", () => {
    const draft = state()
    const messageID = "msg_repeat"
    const partID = "prt_repeat"

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          messageID,
          sessionID: "ses_1",
          type: "text",
          text: "ha",
        },
      },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: {
        messageID,
        partID,
        field: "text",
        delta: "ha",
      },
    } as Event)

    expect((draft.part.get(messageID)?.[0] as Extract<Part, { type: "text" }> | undefined)?.text).toBe("haha")
  })

  test("preserves newer completed tool parts when a stale snapshot arrives later", () => {
    const draft = state({
      message: { ses_1: [{ id: "msg_1", sessionID: "ses_1" } as Message] },
    })
    const newerToolPart = {
      id: "tool_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "bash",
      callID: "call_1",
      state: {
        status: "completed",
        input: {},
        output: "newer",
        title: "bash",
        metadata: {},
        time: { start: 1, end: 20 },
      },
    } satisfies ToolPart
    const staleToolPart = {
      ...newerToolPart,
      state: {
        ...newerToolPart.state,
        output: "stale",
        time: { start: 1, end: 10 },
      },
    } satisfies ToolPart

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: newerToolPart },
    } as Event)
    const result = applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: staleToolPart },
    } as Event)

    expect(result).toBe(false)
    expect((draft.part.get("msg_1")?.[0] as Extract<Part, { type: "tool" }> | undefined)?.state).toMatchObject({
      output: "newer",
      time: { start: 1, end: 20 },
    })
  })

  test("still requests the owning message when a preserved part's owner is missing", () => {
    // Regression: the preserve branch returned a bare false, so a replayed
    // out-of-order part update never asked for the missing owning message and
    // the part stayed orphaned.
    const draft = state()
    const completedToolPart = {
      id: "tool_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "bash",
      callID: "call_1",
      state: {
        status: "completed",
        input: {},
        output: "done",
        title: "bash",
        metadata: {},
        time: { start: 1, end: 20 },
      },
    } satisfies ToolPart
    const staleToolPart = {
      ...completedToolPart,
      state: { ...completedToolPart.state, status: "running", time: { start: 1 } },
    } satisfies ToolPart

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: completedToolPart },
    } as Event)
    const result = applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: staleToolPart },
    } as Event)

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", sessionID: "ses_1", messageID: "msg_1", partID: "tool_1" },
    })
  })

  test("does not preserve invalid tool end times over newer updates", () => {
    const draft = state()
    const invalidToolPart = {
      id: "tool_invalid",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "apply_patch",
      callID: "call_1",
      state: {
        time: { start: 20, end: 10 },
      },
    } as unknown as ToolPart
    const runningToolPart = {
      ...invalidToolPart,
      state: {
        status: "running",
        input: {},
        time: { start: 20 },
      },
    } satisfies ToolPart

    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: invalidToolPart },
    } as Event)
    applyDirectoryEvent(draft, {
      type: "message.part.updated",
      properties: { part: runningToolPart },
    } as Event)

    expect((draft.part.get("msg_1")?.[0] as Extract<Part, { type: "tool" }> | undefined)?.state).toMatchObject({
      status: "running",
      time: { start: 20 },
    })
    expect(
      ((draft.part.get("msg_1")?.[0] as Extract<Part, { type: "tool" }> | undefined)?.state as { time?: { end?: number } })
        .time?.end,
    ).toBeUndefined()
  })

  test("skips duplicate session status events", () => {
    const draft = state()
    const busyStatus = { type: "busy" } as SessionStatus
    const event = {
      type: "session.status",
      properties: { sessionID: "ses_1", status: busyStatus },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("skips duplicate session idle events", () => {
    const draft = state()
    const event = {
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("skips duplicate session error idle-state events", () => {
    const draft = state()
    const event = {
      type: "session.error",
      properties: { sessionID: "ses_1" },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("detects retry status metadata changes", () => {
    const draft = state({
      session_status: {
        ses_1: { type: "retry", attempt: 1, message: "rate limited", next: 10 } as SessionStatus,
      },
    })

    const event = {
      type: "session.status",
      properties: {
        sessionID: "ses_1",
        status: { type: "retry", attempt: 2, message: "rate limited", next: 20 } as SessionStatus,
      },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    expect((draft.session_status.ses_1 as Extract<SessionStatus, { type: "retry" }>).attempt).toBe(2)
  })

  test("updates permission request arrays immutably", () => {
    const initialPermissions = [{ id: "perm_1", sessionID: "ses_1" } as PermissionRequest]
    const draft = state({ permission: { ses_1: initialPermissions } })

    applyDirectoryEvent(draft, {
      type: "permission.asked",
      properties: { id: "perm_2", sessionID: "ses_1" } as PermissionRequest,
    } as Event)

    expect(draft.permission.ses_1).not.toBe(initialPermissions)
    expect(draft.permission.ses_1.map((item) => item.id)).toEqual(["perm_1", "perm_2"])

    const afterAsk = draft.permission.ses_1
    applyDirectoryEvent(draft, {
      type: "permission.replied",
      properties: { sessionID: "ses_1", requestID: "perm_1" },
    } as Event)

    expect(draft.permission.ses_1).not.toBe(afterAsk)
    expect(draft.permission.ses_1.map((item) => item.id)).toEqual(["perm_2"])
  })

  test("updates question request arrays immutably", () => {
    const initialQuestions = [{ id: "ques_1", sessionID: "ses_1" } as QuestionRequest]
    const draft = state({ question: { ses_1: initialQuestions } })

    applyDirectoryEvent(draft, {
      type: "question.asked",
      properties: { id: "ques_2", sessionID: "ses_1" } as QuestionRequest,
    } as Event)

    expect(draft.question.ses_1).not.toBe(initialQuestions)
    expect(draft.question.ses_1.map((item) => item.id)).toEqual(["ques_1", "ques_2"])

    const afterAsk = draft.question.ses_1
    applyDirectoryEvent(draft, {
      type: "question.replied",
      properties: { sessionID: "ses_1", requestID: "ques_1" },
    } as Event)

    expect(draft.question.ses_1).not.toBe(afterAsk)
    expect(draft.question.ses_1.map((item) => item.id)).toEqual(["ques_2"])

    const afterReply = draft.question.ses_1
    applyDirectoryEvent(draft, {
      type: "question.rejected",
      properties: { sessionID: "ses_1", requestID: "ques_2" },
    } as Event)

    expect(draft.question.ses_1).not.toBe(afterReply)
    expect(draft.question.ses_1).toEqual([])
  })

  test("does not evict a session with a pending question when trimming", () => {
    const draft = state({
      limit: 2,
      session: [session("ses_1", "first"), session("ses_2", "second")],
      question: { ses_1: [{ id: "ques_1", sessionID: "ses_1" } as QuestionRequest] },
    })

    applyDirectoryEvent(draft, {
      type: "session.created",
      properties: { info: session("ses_3", "third") },
    } as Event)

    // ses_1 is the oldest (would be evicted first) but has a pending question,
    // so trimming must stop and keep it visible.
    const ids = draft.session.map((s) => s.id)
    expect(ids).toContain("ses_1")
    expect(ids).toContain("ses_3")
  })

  test("does not evict a session that is working when trimming", () => {
    // Only pending requests were protected, so a busy session with the smallest id was spliced out as
    // soon as the list grew past the limit — a subagent appearing was enough. Every lookup by id starts
    // from this list (`useSession`, fork, undo, the parent resync), so the session the user was watching
    // disappeared from it and its later events re-inserted it only to be trimmed away again.
    const draft = state({
      limit: 2,
      session: [session("ses_1", "first"), session("ses_2", "second")],
      session_status: { ses_1: { type: "busy" } as SessionStatus },
    })

    applyDirectoryEvent(draft, {
      type: "session.created",
      properties: { info: session("ses_3", "third") },
    } as Event)

    const ids = draft.session.map((s) => s.id)
    expect(ids).toContain("ses_1")
    expect(ids).toContain("ses_3")
  })

  test("evicts the oldest session when trimming and none are protected", () => {
    const draft = state({
      limit: 2,
      session: [session("ses_1", "first"), session("ses_2", "second")],
    })

    applyDirectoryEvent(draft, {
      type: "session.created",
      properties: { info: session("ses_3", "third") },
    } as Event)

    expect(draft.session.map((s) => s.id)).toEqual(["ses_2", "ses_3"])
  })
})

describe("message.part.delta offset reconciliation", () => {
  const textPart = (text: string): Part =>
    ({ id: "prt_1", messageID: "msg_1", sessionID: "ses_1", type: "text", text }) as unknown as Part

  const applyDelta = (draft: State, offset: number, delta: string) =>
    applyDirectoryEvent(draft, {
      type: "message.part.delta",
      properties: { messageID: "msg_1", partID: "prt_1", field: "text", offset, delta },
    } as Event)

  const textOf = (draft: State) => (draft.part.get("msg_1")?.[0] as Extract<Part, { type: "text" }> | undefined)?.text

  test("appends the whole delta when the offset matches the local text", () => {
    const draft = state({ part: PartMap.from({ msg_1: [textPart("hello")] }) })
    applyDelta(draft, 5, " world")
    expect(textOf(draft)).toBe("hello world")
  })

  test("does not re-apply a replayed delta whose text is already present", () => {
    // Replay after a parts refetch: the local text already contains the delta, and
    // blind appending pasted it a second time as duplicated output.
    const draft = state({ part: PartMap.from({ msg_1: [textPart("hello world")] }) })
    applyDelta(draft, 6, "world")
    expect(textOf(draft)).toBe("hello world")
  })

  test("appends only the missing tail when the local text ends inside the delta", () => {
    const draft = state({ part: PartMap.from({ msg_1: [textPart("hello wor")] }) })
    applyDelta(draft, 6, "world")
    expect(textOf(draft)).toBe("hello world")
  })

  test("drops a delta that continues beyond the local text and asks for a snapshot", () => {
    const draft = state({ part: PartMap.from({ msg_1: [textPart("hel")] }) })
    const result = applyDelta(draft, 10, "lo world")

    expect(textOf(draft)).toBe("hel")
    // Dropping the delta without requesting a snapshot lost its text for good: the
    // sibling branches that cannot apply a delta all ask for one.
    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "msg_1", partID: "prt_1" },
    })
  })
})
