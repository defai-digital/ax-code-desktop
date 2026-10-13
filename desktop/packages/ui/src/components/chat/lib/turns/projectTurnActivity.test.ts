import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { projectTurnActivity } from "./projectTurnActivity"
import type { ChatMessageEntry } from "./types"

const entry = (id: string, finish: string | undefined, parts: unknown[]): ChatMessageEntry =>
  ({
    info: { id, sessionID: "ses_1", role: "assistant", finish } as unknown as Message,
    parts: parts as Part[],
  }) as ChatMessageEntry

describe("projectTurnActivity justification classification", () => {
  test("a stop-finished answer is never folded into the activity, even with tools in the message", () => {
    // Regression: when a turn contains two answers, the earlier one used to be
    // classified as justification and hidden inside the collapsed activity.
    const result = projectTurnActivity({
      turnId: "turn_1",
      assistantMessages: [
        entry("msg_a", "stop", [
          { id: "prt_t", type: "tool", tool: "bash" },
          { id: "prt_a", type: "text", text: "First answer" },
        ]),
        entry("msg_b", "stop", [{ id: "prt_b", type: "text", text: "Second answer" }]),
      ],
      summarySourceMessageId: "msg_b",
      summarySourcePartId: "prt_b",
      showTextJustificationActivity: true,
    })

    const justificationIds = result.activityParts.filter((part) => part.kind === "justification").map((p) => p.id)
    expect(justificationIds).not.toContain("prt_a")
    expect(result.activityParts.some((part) => part.kind === "tool" && part.id === "prt_t")).toBe(true)
  })

  test("narration in an unfinished tool-calling message still folds into the activity", () => {
    const result = projectTurnActivity({
      turnId: "turn_1",
      assistantMessages: [
        entry("msg_a", "tool-calls", [
          { id: "prt_n", type: "text", text: "Let me check" },
          { id: "prt_t", type: "tool", tool: "bash" },
        ]),
      ],
      showTextJustificationActivity: true,
    })

    expect(result.activityParts.some((part) => part.kind === "justification" && part.id === "prt_n")).toBe(true)
  })
})
