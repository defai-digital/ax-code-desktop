import { describe, expect, test } from "vitest"
import { quickDispatchSessionLabel } from "./quickDispatch"

describe("quickDispatchSessionLabel", () => {
  test("uses the title, then the prompt, then the id", () => {
    expect(quickDispatchSessionLabel({ title: "  Rename the parser  ", prompt: "ignored", sessionId: "ses" })).toBe(
      "Rename the parser",
    )
    expect(quickDispatchSessionLabel({ title: " ", prompt: "Fix the flaky test\nmore", sessionId: "ses" })).toBe(
      "Fix the flaky test",
    )
    const long = "x".repeat(90)
    expect(quickDispatchSessionLabel({ title: null, prompt: long, sessionId: "ses" })).toBe(`${"x".repeat(79)}…`)
    expect(quickDispatchSessionLabel({ title: null, prompt: "   ", sessionId: "ses_1" })).toBe("ses_1")
  })
})
