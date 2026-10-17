import { describe, expect, it } from "vitest"

import { sanitizeForSummary, summarizeText } from "./summarization.js"

describe("text summarization stubs", () => {
  it("keeps a slash inside a word, and still drops a path", () => {
    // The path pattern matched any `/<word>`, so prose that uses a slash lost its second half.
    expect(sanitizeForSummary("either/or and TCP/IP and/or UDP")).toBe("either/or and TCP/IP and/or UDP")
    expect(sanitizeForSummary("see /usr/local/bin for details")).toBe("see for details")
    // A trailing separator goes with the path rather than being left behind.
    expect(sanitizeForSummary("in /usr/bin/ today")).toBe("in today")
  })

  it("removes code from summary text before stripping markdown punctuation", () => {
    expect(sanitizeForSummary("Read `const value = 1` aloud")).toBe("Read aloud")
    expect(sanitizeForSummary("Before\n```js\nconst value = 1\n```\nAfter")).toBe("Before After")
  })

  it("does not call the retired zen provider", async () => {
    const result = await summarizeText({
      text: "The implementation now correctly loads notification templates before dispatching the notification. It also fetches the latest assistant message when the event payload does not include message parts. This should make completion notifications match user settings.",
      threshold: 0,
      maxLength: 80,
      zenModel: "gpt-5-nano",
      mode: "notification",
    })

    expect(result.summarized).toBe(false)
    expect(result.reason).toBe("Model summarization provider unavailable")
    expect(result.summary).toBe("The implementation now correctly loads notification templates before dispatchin…")
  })

  it("returns local note fallback while provider is unavailable", async () => {
    const result = await summarizeText({
      text: "First sentence. Second sentence with the useful insight.",
      threshold: 0,
      maxLength: 100,
      mode: "note",
    })

    expect(result).toMatchObject({
      summary: "First sentence.",
      summarized: false,
      reason: "Model summarization provider unavailable",
    })
  })
})
