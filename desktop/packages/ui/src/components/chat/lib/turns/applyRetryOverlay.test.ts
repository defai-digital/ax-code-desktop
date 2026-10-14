import { describe, expect, test } from "vitest"
import type { Message } from "@defai-digital/ax-code-sdk/v2"
import { applyRetryOverlay } from "./applyRetryOverlay"
import { projectTurnRecords } from "./projectTurnRecords"
import type { ChatMessageEntry } from "./types"

const userMessage = (id: string): ChatMessageEntry => ({
  info: { id, sessionID: "ses_1", role: "user", time: { created: 1 } } as unknown as Message,
  parts: [{ id: `${id}_part`, type: "text", text: "hello", sessionID: "ses_1", messageID: id } as never],
})

describe("applyRetryOverlay", () => {
  test("the retry notice joins the turn so it can actually render", () => {
    // Regression: the synthetic was an assistant message without a parent, so it
    // joined no turn and assistant messages are not ungrouped — dead code on screen.
    const messages = applyRetryOverlay([userMessage("msg_u")], {
      sessionId: "ses_1",
      message: "Quota limit reached. Retrying automatically.",
      fallbackTimestamp: 2,
    })

    const notice = messages.find((message) => String(message.info.id).startsWith("synthetic_retry_notice_"))
    expect(notice).toBeDefined()
    expect((notice?.info as { parentID?: string }).parentID).toBe("msg_u")

    const projection = projectTurnRecords(messages)
    const turn = projection.turns[0]
    expect(turn?.assistantMessageIds).toContain(notice?.info.id)
  })
})
