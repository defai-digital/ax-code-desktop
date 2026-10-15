import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import { areRenderRelevantMessagesEqual, areRenderRelevantPartsEqual } from "./renderCompare"

const messageRecord = (info: Partial<Message>): { info: Message; parts: Part[] } => ({
  info: { id: "msg_1", role: "assistant", sessionID: "ses_1", ...info } as Message,
  parts: [],
})

const shellPart = (output: string, status: string): Part =>
  ({
    type: "text",
    text: "/shell",
    shellAction: { command: "npm test", output, status },
  }) as unknown as Part

describe("areRenderRelevantPartsEqual", () => {
  test("notices an injected shell bridge block", () => {
    // Regression: the part's id and text stay identical while the bridge fills in
    // command/output/status, so the memo used to keep the frozen first render.
    const before = [{ type: "text", text: "/shell" } as unknown as Part]
    const after = [shellPart("running…", "running")]

    expect(areRenderRelevantPartsEqual(before, after)).toBe(false)
  })

  test("notices shell output and status changes", () => {
    expect(areRenderRelevantPartsEqual([shellPart("running…", "running")], [shellPart("DONE", "completed")])).toBe(
      false,
    )
  })

  test("notices an injected subtask session link", () => {
    const before = [{ type: "subtask" } as unknown as Part]
    const after = [{ type: "subtask", taskSessionID: "ses_child" } as unknown as Part]

    expect(areRenderRelevantPartsEqual(before, after)).toBe(false)
  })

  test("still treats an unchanged bridge block as equal", () => {
    expect(areRenderRelevantPartsEqual([shellPart("DONE", "completed")], [shellPart("DONE", "completed")])).toBe(true)
  })
})

describe("areRenderRelevantMessagesEqual", () => {
  test("notices a feedback change on an otherwise identical message", () => {
    // Regression: setMessageFeedback replaces the record with only `feedback`
    // differing; the memo comparator used to skip the re-render, so the pressed
    // state never appeared.
    expect(
      areRenderRelevantMessagesEqual(messageRecord({}), messageRecord({ feedback: "up" as never })),
    ).toBe(false)
  })

  test("notices an error landing on a finished message", () => {
    expect(
      areRenderRelevantMessagesEqual(
        messageRecord({ finish: "error" as never }),
        messageRecord({ finish: "error" as never, error: { message: "rate limit" } as never }),
      ),
    ).toBe(false)
  })
})
