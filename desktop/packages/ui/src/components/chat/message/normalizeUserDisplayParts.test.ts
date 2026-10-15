import { describe, expect, test } from "vitest"
import { normalizeUserDisplayParts } from "./normalizeUserDisplayParts"
import type { Part } from "@defai-digital/ax-code-sdk/v2"

const textPart = (text: string, synthetic = false): Part =>
  ({ type: "text", text, ...(synthetic ? { synthetic: true } : {}) }) as unknown as Part

describe("normalizeUserDisplayParts", () => {
  test("collapses the synthetic shell context to /shell", () => {
    expect(normalizeUserDisplayParts([textPart("The following tool was executed by the user: ls", true)])).toEqual([
      textPart("/shell"),
    ])
  })

  test("keeps a user message that merely starts with the shell context phrase", () => {
    const part = textPart("The following tool was executed by the user accidentally; help me debug it.")
    expect(normalizeUserDisplayParts([part])).toEqual([part])
  })

  test("drops synthetic text parts and keeps ordinary ones", () => {
    const kept = textPart("hello")
    expect(normalizeUserDisplayParts([textPart("internal context", true), kept])).toEqual([kept])
  })
})
