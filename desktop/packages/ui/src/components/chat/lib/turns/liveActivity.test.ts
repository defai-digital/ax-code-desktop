import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"

import { getLiveFinalMessage, getTurnsWithLaterAssistant, hasLiveActivity } from "./liveActivity"
import { summarizeLiveActivity } from "./liveActivitySummary"
import type { ChatMessageEntry, TurnActivityRecord, TurnRecord } from "./types"

const text = (id: string, value: string, synthetic = false): Part =>
  ({ id, type: "text", text: value, synthetic, messageID: "m", sessionID: "s" }) as Part

const assistant = (id: string, parts: Part[], finish?: string): ChatMessageEntry =>
  ({
    info: { id, role: "assistant", finish } as Message,
    parts,
  }) as ChatMessageEntry

const user = (id: string): ChatMessageEntry =>
  ({
    info: { id, role: "user" } as Message,
    parts: [text(`${id}-text`, "Question")],
  }) as ChatMessageEntry

const toolPart = (id: string, tool: string, status: string): Part =>
  ({ id, type: "tool", tool, callID: id, messageID: "m", sessionID: "s", state: { status } }) as Part

const activity = (id: string, kind: TurnActivityRecord["kind"], part: Part): TurnActivityRecord => ({
  id,
  turnId: "turn",
  messageId: "m",
  part,
  partIndex: 0,
  kind,
})

const turn = (overrides: Partial<TurnRecord> = {}): TurnRecord =>
  ({
    turnId: "turn",
    assistantMessages: [],
    activityParts: [],
    ...overrides,
  }) as TurnRecord

describe("getLiveFinalMessage", () => {
  test("returns the assistant when it stopped with text", () => {
    const final = assistant("final", [text("done", "Done")], "stop")
    const viaClientRole = {
      info: { id: "client", role: "user", clientRole: "assistant", finish: "stop" } as unknown as Message,
      parts: [text("done", "Done")],
    } as ChatMessageEntry
    expect(getLiveFinalMessage([final])).toBe(final)
    expect(getLiveFinalMessage([viaClientRole])).toBe(viaClientRole)
  })

  test("returns nothing while the latest assistant is still working", () => {
    const working = assistant("working", [text("check", "Checking")], "tool-calls")
    expect(getLiveFinalMessage([working])).toBeUndefined()
  })

  test("does not scan back to an earlier stop once a later step is working", () => {
    const final = assistant("final", [text("done", "Done")], "stop")
    const working = assistant("working", [toolPart("read", "read", "running")], "tool-calls")
    expect(getLiveFinalMessage([final, working])).toBeUndefined()
  })

  test("skips a synthetic-only trailing record and keeps the stopped answer", () => {
    const final = assistant("final", [text("done", "Done")], "stop")
    const synthetic = assistant("synthetic", [text("hidden", "plugin prompt", true)], "stop")
    const notice = { info: { id: "notice", role: "system" } as unknown as Message, parts: [] } as ChatMessageEntry
    expect(getLiveFinalMessage([final, synthetic])).toBe(final)
    expect(getLiveFinalMessage([final, notice])).toBe(final)
    expect(getLiveFinalMessage([final, user("next")])).toBeUndefined()
  })
})

describe("getTurnsWithLaterAssistant", () => {
  test("a later user message does not retire the previous turn", () => {
    const turns = [
      { turnId: "first", assistantMessages: [assistant("a", [text("a", "Hi")], "stop")] },
      { turnId: "queued", assistantMessages: [] },
    ]
    expect(getTurnsWithLaterAssistant(turns).size).toBe(0)
  })

  test("retires every turn once a later turn has an assistant message", () => {
    const turns = [
      { turnId: "first", assistantMessages: [assistant("a", [text("a", "Hi")], "stop")] },
      { turnId: "queued", assistantMessages: [] },
      { turnId: "second", assistantMessages: [assistant("b", [text("b", "Next")])] },
    ]
    expect(getTurnsWithLaterAssistant(turns)).toEqual(new Set(["first", "queued"]))
  })
})

describe("hasLiveActivity", () => {
  test("a turn that only ran tasks gets no fold", () => {
    const onlyTask = turn({
      activityParts: [activity("task", "tool", toolPart("task", "task", "completed"))],
    })
    expect(hasLiveActivity(onlyTask, true)).toBe(false)
  })

  test("a bash call counts", () => {
    const withBash = turn({
      activityParts: [activity("bash", "tool", toolPart("bash", "bash", "completed"))],
    })
    expect(hasLiveActivity(withBash, false)).toBe(true)
  })

  test("reasoning counts only when traces are shown", () => {
    const thinking = turn({
      activityParts: [activity("think", "reasoning", text("think", "thinking"))],
    })
    expect(hasLiveActivity(thinking, false)).toBe(false)
    expect(hasLiveActivity(thinking, true)).toBe(true)
  })
})

describe("summarizeLiveActivity", () => {
  test("reads file totals from the turn diff and classifies completed tools", () => {
    const result = summarizeLiveActivity(
      turn({
        diffStats: { files: 2, additions: 10, deletions: 4 },
        assistantMessages: [
          assistant("a", [
            toolPart("read", "read", "completed"),
            toolPart("grep", "grep", "completed"),
            toolPart("bash-1", "bash", "completed"),
            toolPart("bash-2", "shell", "completed"),
            toolPart("web", "web_search", "completed"),
            toolPart("fetch", "webfetch", "completed"),
            toolPart("task-1", "task", "completed"),
            toolPart("task-2", "task", "completed"),
            toolPart("task-3", "task", "completed"),
          ]),
        ],
      }),
    )
    expect(result).toEqual({
      files: 2,
      additions: 10,
      deletions: 4,
      hasDiff: true,
      explored: true,
      commands: 2,
      researched: true,
      subagents: 3,
    })
  })

  test("ignores running calls, edits, and repeated task ids", () => {
    const result = summarizeLiveActivity(
      turn({
        diffStats: { files: 0, additions: 3, deletions: 1 },
        assistantMessages: [
          assistant("a", [
            toolPart("edit", "edit", "completed"),
            toolPart("bash", "bash", "running"),
            toolPart("task", "task", "completed"),
            toolPart("task", "task", "completed"),
            toolPart("task-error", "task", "error"),
          ]),
          assistant("b", [toolPart("list", "list", "pending"), toolPart("web", "websearch", "running")]),
        ],
      }),
    )
    expect(result).toEqual({
      files: 0,
      additions: 3,
      deletions: 1,
      hasDiff: false,
      explored: false,
      commands: 0,
      researched: false,
      subagents: 1,
    })
  })

  test("treats a missing diff as no file changes", () => {
    expect(summarizeLiveActivity(turn())).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
      hasDiff: false,
      explored: false,
      commands: 0,
      researched: false,
      subagents: 0,
    })
  })

  test("recognizes explore, research, and shell tool names", () => {
    const explored = ["read", "list", "ls", "grep", "search", "find", "ripgrep", "glob"]
    for (const name of explored) {
      const result = summarizeLiveActivity(
        turn({ assistantMessages: [assistant("a", [toolPart(name, name, "completed")])] }),
      )
      expect(result.explored, name).toBe(true)
    }
    for (const name of ["webfetch", "websearch", "web_search", "fetch"]) {
      const result = summarizeLiveActivity(
        turn({ assistantMessages: [assistant("a", [toolPart(name, name, "completed")])] }),
      )
      expect(result.researched, name).toBe(true)
    }
    for (const name of ["bash", "shell", "cmd", "terminal"]) {
      const result = summarizeLiveActivity(
        turn({ assistantMessages: [assistant("a", [toolPart(name, name, "completed")])] }),
      )
      expect(result.commands, name).toBe(1)
    }
  })
})
