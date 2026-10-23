import { describe, expect, test } from "vitest"
import type { Message, Part, SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { serverSessionStatusStampFloor, noteServerSessionStatus } from "./session-status-events"
import {
  getReconnectCandidateSessionIds,
  pickApplicableResyncedStatuses,
  resolveResyncedSessionStatus,
  hasCompletedAssistantReply,
} from "./reconnect-recovery"
import { PartMap } from "./part-map"

function createSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    title: id,
    time: { created: 1, updated: 1 },
    version: "1",
    ...overrides,
  } as Session
}

function createAssistantMessage(id: string, sessionID: string, completed?: number): Message {
  return {
    id,
    sessionID,
    role: "assistant",
    time: completed ? { created: 1, updated: 1, completed } : { created: 1, updated: 1 },
    parts: [],
  } as unknown as Message
}

function createPart(id: string, messageID: string): Part {
  return { id, messageID, sessionID: "active", type: "text", text: "done" } as Part
}

describe("getReconnectCandidateSessionIds", () => {
  test("includes non-idle, incomplete assistant, and parent sessions", () => {
    const busyStatus = { type: "busy" } as SessionStatus

    expect(
      getReconnectCandidateSessionIds({
        session: [
          createSession("busy"),
          createSession("child", { parentID: "parent" }),
          createSession("parent"),
          createSession("incomplete"),
        ],
        session_status: { busy: busyStatus },
        message: {
          incomplete: [createAssistantMessage("m-1", "incomplete")],
        },
      }).sort(),
    ).toEqual(["busy", "incomplete", "parent"])
  })

  test("includes the currently viewed session even when it looks idle and complete", () => {
    expect(
      getReconnectCandidateSessionIds(
        {
          session: [createSession("active")],
          session_status: { active: { type: "idle" } as SessionStatus },
          message: {
            active: [createAssistantMessage("m-1", "active", 1)],
          },
          part: PartMap.from({
            "m-1": [createPart("p-1", "m-1")],
          }),
        },
        {
          directory: "/repo",
          viewedSession: { directory: "/repo", sessionId: "active" },
        },
      ).sort(),
    ).toContain("active")
  })

  test("includes completed assistant sessions when the latest assistant parts are missing", () => {
    expect(
      getReconnectCandidateSessionIds({
        session: [createSession("blank")],
        session_status: { blank: { type: "idle" } as SessionStatus },
        message: {
          blank: [createAssistantMessage("m-1", "blank", 1)],
        },
        part: PartMap.from({}),
      }),
    ).toEqual(["blank"])
  })

  test("does not include a viewed session from another directory", () => {
    expect(
      getReconnectCandidateSessionIds(
        {
          session: [createSession("active")],
          session_status: { active: { type: "idle" } as SessionStatus },
          message: {
            active: [createAssistantMessage("m-1", "active", 1)],
          },
          part: PartMap.from({
            "m-1": [createPart("p-1", "m-1")],
          }),
        },
        {
          directory: "/repo-a",
          viewedSession: { directory: "/repo-b", sessionId: "active" },
        },
      ).sort(),
    ).not.toContain("active")
  })
})

describe("pickApplicableResyncedStatuses", () => {
  const busy = { type: "busy" } as SessionStatus
  const idle = { type: "idle" } as SessionStatus

  test("applies the answer where the status did not move while it was in flight", () => {
    expect(
      pickApplicableResyncedStatuses({
        beforeStatusStamp: serverSessionStatusStampFloor(),
        relevantStatuses: { ses_1: idle },
        beforeStatuses: { ses_1: busy },
        currentStatuses: { ses_1: busy },
      }),
    ).toEqual({ ses_1: idle })
  })

  test("keeps a status the event stream updated while the answer was in flight", () => {
    // A run started outside optimisticSend — shell mode, a scheduled task, another client — sends
    // `session.status{busy}` while the answer, computed before it, carries `idle`: applying it showed
    // an idle session (no working indicator, no Stop) until the next poll.
    expect(
      pickApplicableResyncedStatuses({
        beforeStatusStamp: serverSessionStatusStampFloor(),
        relevantStatuses: { ses_1: idle },
        beforeStatuses: { ses_1: idle },
        currentStatuses: { ses_1: busy },
      }),
    ).toEqual({})
  })

  test("decides each session on its own", () => {
    expect(
      pickApplicableResyncedStatuses({
        beforeStatusStamp: serverSessionStatusStampFloor(),
        relevantStatuses: { ses_1: idle, ses_2: busy },
        beforeStatuses: { ses_1: idle, ses_2: idle },
        currentStatuses: { ses_1: busy, ses_2: idle },
      }),
    ).toEqual({ ses_2: busy })
  })
})

describe("resolveResyncedSessionStatus", () => {
  const busy = { type: "busy" } as SessionStatus
  const idle = { type: "idle" } as SessionStatus

  test("trusts an explicit server status", () => {
    expect(
      resolveResyncedSessionStatus({
        serverStatus: busy,
        existingStatus: idle,
        promptRecentlyAccepted: false,
        hasCompletedAssistantReply: false,
      }),
    ).toEqual(busy)
  })

  test("defaults to idle when the server reports no active status", () => {
    expect(
      resolveResyncedSessionStatus({
        serverStatus: undefined,
        existingStatus: busy,
        promptRecentlyAccepted: false,
        hasCompletedAssistantReply: false,
      }),
    ).toEqual(idle)
  })

  test("preserves optimistic busy during the accept→start gap (no reply yet)", () => {
    // The core fix: a freshly accepted prompt whose turn hasn't started
    // streaming must not be flipped to idle by an authoritative snapshot.
    expect(
      resolveResyncedSessionStatus({
        serverStatus: undefined,
        existingStatus: busy,
        promptRecentlyAccepted: true,
        hasCompletedAssistantReply: false,
      }),
    ).toEqual(busy)
  })

  test("goes idle once a completed assistant reply exists even within the grace window", () => {
    expect(
      resolveResyncedSessionStatus({
        serverStatus: undefined,
        existingStatus: busy,
        promptRecentlyAccepted: true,
        hasCompletedAssistantReply: true,
      }),
    ).toEqual(idle)
  })

  test("goes idle if the existing local status was already idle", () => {
    expect(
      resolveResyncedSessionStatus({
        serverStatus: undefined,
        existingStatus: idle,
        promptRecentlyAccepted: true,
        hasCompletedAssistantReply: false,
      }),
    ).toEqual(idle)
  })
})

describe("hasCompletedAssistantReply", () => {
  test("true when the last message is a completed assistant reply", () => {
    expect(hasCompletedAssistantReply([createAssistantMessage("m-1", "s", 5)])).toBe(true)
  })

  test("false for an in-progress assistant reply", () => {
    expect(hasCompletedAssistantReply([createAssistantMessage("m-1", "s")])).toBe(false)
  })

  test("false when the last message is a user message", () => {
    const userMessage = { id: "m-1", sessionID: "s", role: "user", time: { created: 1 } } as unknown as Message
    expect(hasCompletedAssistantReply([createAssistantMessage("m-1", "s", 5), userMessage])).toBe(false)
  })

  test("false for an empty/undefined message list", () => {
    expect(hasCompletedAssistantReply([])).toBe(false)
    expect(hasCompletedAssistantReply(undefined)).toBe(false)
  })
})


test("status event ABA invalidates a snapshot even when the final status is equivalent", () => {
  const idle = { type: "idle" } as const
  const beforeStatusStamp = serverSessionStatusStampFloor()
  noteServerSessionStatus("ses_aba")
  noteServerSessionStatus("ses_aba")
  expect(pickApplicableResyncedStatuses({
    beforeStatusStamp,
    relevantStatuses: { ses_aba: { type: "busy" } },
    beforeStatuses: { ses_aba: idle },
    currentStatuses: { ses_aba: { type: "idle" } },
  })).toEqual({})
})
