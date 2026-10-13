import { describe, expect, test } from "vitest"
import { shortSessionId } from "./sessionId"

describe("shortSessionId", () => {
  test("keeps the prefix and the random tail of a long id", () => {
    expect(shortSessionId("ses_z0192a3b4c5d6e7f8AbCdEfGhIj")).toBe("ses_…CdEfGhIj")
  })

  test("returns short ids unchanged", () => {
    expect(shortSessionId("ses_abc")).toBe("ses_abc")
    expect(shortSessionId("abcdef")).toBe("abcdef")
  })

  test("handles ids without a prefix separator", () => {
    expect(shortSessionId("0123456789abcdefghij")).toBe("…cdefghij")
  })

  test("trims surrounding whitespace", () => {
    expect(shortSessionId("  ses_abc  ")).toBe("ses_abc")
  })
})
