import { beforeEach, describe, expect, test } from "vitest"
import type { Message } from "@defai-digital/ax-code-sdk/v2/client"
import { MessageFreshnessDetector } from "./messageFreshness"

const assistantMessage = (id: string, created: number): Message =>
  ({ id, sessionID: "ses_1", role: "assistant", time: { created } }) as Message

describe("MessageFreshnessDetector", () => {
  const detector = MessageFreshnessDetector.getInstance()

  beforeEach(() => {
    detector.clearAll()
  })

  test("animates a message created after the session start", () => {
    detector.recordSessionStart("ses_1")

    expect(detector.shouldAnimateMessage(assistantMessage("msg_fresh", Date.now()), "ses_1")).toBe(true)
  })

  test("never animates a user message", () => {
    detector.recordSessionStart("ses_1")
    const userMessage = { id: "msg_user", sessionID: "ses_1", role: "user", time: { created: Date.now() } } as Message

    expect(detector.shouldAnimateMessage(userMessage, "ses_1")).toBe(false)
  })

  test("keeps the tracked ids bounded across many messages", () => {
    for (let index = 0; index < 6000; index += 1) {
      detector.markMessageAsAnimated(`msg_${index}`, index)
    }

    const { seenMessageIds, messageCreationTimes } = detector.getDebugInfo()

    // Both containers used to grow with every message the app ever rendered.
    expect(seenMessageIds.size).toBe(5000)
    expect(messageCreationTimes.size).toBe(5000)
    // The newest ids survive, the oldest are evicted, and a dropped id is simply re-evaluated.
    expect(seenMessageIds.has("msg_5999")).toBe(true)
    expect(seenMessageIds.has("msg_0")).toBe(false)
    expect(detector.hasBeenAnimated("msg_999")).toBe(false)
    expect(detector.hasBeenAnimated("msg_5000")).toBe(true)
  })

  test("re-marking a tracked message does not evict another one", () => {
    for (let index = 0; index < 5000; index += 1) {
      detector.markMessageAsAnimated(`msg_${index}`, index)
    }

    detector.markMessageAsAnimated("msg_0", 0)

    const { seenMessageIds } = detector.getDebugInfo()
    expect(seenMessageIds.size).toBe(5000)
    expect(seenMessageIds.has("msg_0")).toBe(true)
    expect(seenMessageIds.has("msg_1")).toBe(true)
  })
})
