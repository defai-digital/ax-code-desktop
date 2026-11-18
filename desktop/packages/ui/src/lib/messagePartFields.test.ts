import { describe, expect, test } from "vitest"
import {
  getMessagePartEndTime,
  getMessagePartStartTime,
  getValidMessagePartEndTime,
  getMessagePartText,
} from "./messagePartFields"

describe("message part fields", () => {
  test("prefers state timing, retaining zero and falling back independently for each boundary", () => {
    const part = { state: { time: { start: 0, end: "pending" } }, time: { start: 4, end: 8 } }
    expect(getMessagePartStartTime(part)).toBe(0)
    expect(getMessagePartEndTime(part)).toBe(8)
    expect(getValidMessagePartEndTime(part)).toBe(8)
    expect(getMessagePartEndTime({ ...part, state: { time: { end: 0 } } })).toBe(0)
  })
  test.each([null, [], "bad", {}, { time: null }, { state: { time: "bad" } }])(
    "ignores missing/malformed timing %j",
    (part) => {
      expect(getMessagePartStartTime(part)).toBeUndefined()
      expect(getMessagePartEndTime(part)).toBeUndefined()
      expect(getValidMessagePartEndTime(part)).toBeUndefined()
    },
  )
  test("does not treat an end before start as completion", () => {
    expect(getMessagePartEndTime({ time: { start: 5, end: 4 } })).toBe(4)
    expect(getValidMessagePartEndTime({ time: { start: 5, end: 4 } })).toBeUndefined()
    expect(getValidMessagePartEndTime({ time: { end: 4 } })).toBe(4)
  })
  test("uses nonblank text before content without trimming the returned text", () => {
    expect(getMessagePartText({ text: " text ", content: "other" })).toBe(" text ")
    expect(getMessagePartText({ text: " ", content: " fallback " })).toBe(" fallback ")
    expect(getMessagePartText({ text: 42, content: "" })).toBeUndefined()
    expect(getMessagePartText(null)).toBeUndefined()
  })
})
