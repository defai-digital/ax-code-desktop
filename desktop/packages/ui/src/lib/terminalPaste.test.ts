import { describe, expect, test } from "vitest"
import { buildPastedInput, stripBracketedPasteMarkers } from "./terminalPaste"

describe("buildPastedInput", () => {
  test("wraps the text when the terminal asked for bracketed paste", () => {
    expect(buildPastedInput("echo hi\n", true)).toBe("\x1b[200~echo hi\n\x1b[201~")
  })

  test("sends the text as written when bracketed paste is off", () => {
    expect(buildPastedInput("echo \x1b hi", false)).toBe("echo \x1b hi")
  })

  test("an embedded closing marker cannot end the paste early", () => {
    // Copied out of a terminal, or crafted: everything after the embedded marker is read as ordinary
    // input, newlines included, so the paste protection the wrapper exists for is gone.
    const pasted = "\x1b[201~\nrm -rf x\n"

    expect(buildPastedInput(pasted, true)).toBe("\x1b[200~\nrm -rf x\n\x1b[201~")
  })

  test("removes the markers in both spellings and keeps the rest", () => {
    expect(stripBracketedPasteMarkers("a\x1b[200~b\x1b[201~c\u009b201~d")).toBe("abcd")
  })
})
