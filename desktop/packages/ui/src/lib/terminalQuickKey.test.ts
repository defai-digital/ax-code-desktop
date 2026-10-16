import { describe, expect, test } from "vitest"
import { quickKeyControlPayload } from "./terminalQuickKey"

describe("quickKeyControlPayload", () => {
  test("turns one armed letter into its control code", () => {
    expect(quickKeyControlPayload("c", "ctrl")).toBe("\x03")
    expect(quickKeyControlPayload("D", "cmd")).toBe("\x04")
  })

  test("leaves anything longer untouched", () => {
    // A paste arrives as one multi-character string. Turning its first letter into a control code and
    // dropping the rest sent `echo hello` to the shell as a single 0x05.
    expect(quickKeyControlPayload("echo hello", "ctrl")).toBeNull()
  })

  test("leaves a single non-letter untouched", () => {
    expect(quickKeyControlPayload("\x1b[A", "ctrl")).toBeNull()
    expect(quickKeyControlPayload("1", "ctrl")).toBeNull()
  })

  test("does nothing without an armed modifier", () => {
    expect(quickKeyControlPayload("c", null)).toBeNull()
    expect(quickKeyControlPayload("c", "shift")).toBeNull()
  })
})
