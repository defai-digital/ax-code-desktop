import { describe, expect, test } from "vitest"

import { ACTIVITY_PREVIEW_LIMIT, activityPreview, type ActivityParts } from "./activityPreview"

const partsOf = (records: Record<string, Array<Record<string, unknown>>>): ActivityParts => ({
  get: (messageId) => records[messageId],
})

const assistant = (id: string, text: string, extra: Array<Record<string, unknown>> = []) => ({
  messages: [
    { id: "user-1", role: "user" },
    { id, role: "assistant" },
  ],
  parts: partsOf({
    "user-1": [{ type: "text", text: "the user asked this" }],
    [id]: extra,
  }),
  text,
})

describe("activityPreview", () => {
  test("prefers the in-progress todo over a loaded assistant message", () => {
    const preview = activityPreview({
      todos: [
        { status: "pending", content: "later" },
        { status: "in_progress", content: "  fix   the parser \n next" },
        { status: "completed", content: "done" },
      ],
      messages: [{ id: "a1", role: "assistant" }],
      parts: partsOf({ a1: [{ type: "text", text: "I edited the parser" }] }),
    })
    expect(preview).toEqual({ kind: "todo", text: "Working on: fix the parser next" })
  })

  test("uses only the latest assistant text part", () => {
    const preview = activityPreview({
      messages: [
        { id: "user-1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "a2", role: "assistant" },
        { id: "user-2", role: "user" },
      ],
      parts: partsOf({
        "user-1": [{ type: "text", text: "please read the file" }],
        "user-2": [{ type: "text", text: "follow-up from the user" }],
        a1: [{ type: "text", text: "older reply" }],
        a2: [
          { type: "text", text: "first sentence" },
          { type: "text", text: "  visible   answer \n second line" },
          { type: "reasoning", text: "thinking about the diff" },
          { type: "tool", text: "tool output", state: { output: "file contents\nsecret" } },
          { type: "file", text: "entire file contents" },
          { type: "text", text: "ignored aside", ignored: true },
        ],
      }),
    })
    expect(preview).toEqual({ kind: "message", text: "visible answer" })
  })

  test("truncates the first line to 140 characters including the ellipsis", () => {
    const exact = "b".repeat(ACTIVITY_PREVIEW_LIMIT)
    expect(
      activityPreview({
        messages: [{ id: "a1", role: "assistant" }],
        parts: partsOf({ a1: [{ type: "text", text: exact }] }),
      })?.text,
    ).toBe(exact)
    const longer = "c".repeat(ACTIVITY_PREVIEW_LIMIT + 1)
    const truncated = activityPreview({
      messages: [{ id: "a1", role: "assistant" }],
      parts: partsOf({ a1: [{ type: "text", text: `${longer}\nstill more` }] }),
    })
    expect(truncated).toEqual({ kind: "message", text: `${"c".repeat(ACTIVITY_PREVIEW_LIMIT - 1)}…` })
    expect(truncated?.text).toHaveLength(ACTIVITY_PREVIEW_LIMIT)
  })

  test("returns null when todos, messages or parts are not loaded", () => {
    expect(activityPreview({})).toBeNull()
    expect(activityPreview({ todos: [{ status: "pending", content: "not started" }] })).toBeNull()
    expect(
      activityPreview({
        messages: [{ id: "a1", role: "assistant" }],
      }),
    ).toBeNull()
    expect(
      activityPreview({
        messages: [{ id: "a1", role: "assistant" }],
        parts: partsOf({}),
      }),
    ).toBeNull()
  })

  test("skips credential-looking text and falls back to an earlier safe line", () => {
    const preview = activityPreview({
      todos: [{ status: "in_progress", content: "api_key=abcd1234efgh5678" }],
      messages: [
        { id: "a1", role: "assistant" },
        { id: "a2", role: "assistant" },
      ],
      parts: partsOf({
        a1: [{ type: "text", text: "safe earlier line" }],
        a2: [{ type: "text", text: "Bearer sk-live-abcdefghijklmnopqrstuvwxyz" }],
      }),
    })
    expect(preview).toEqual({ kind: "message", text: "safe earlier line" })
  })

  test("does not treat ordinary prose as a credential", () => {
    const { messages, parts } = assistant("a1", "Reset the password flow", [
      { type: "text", text: "Reset the password flow" },
    ])
    expect(activityPreview({ messages, parts })).toEqual({ kind: "message", text: "Reset the password flow" })
  })
})
