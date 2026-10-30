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

describe("nested bracketed paste markers", () => {
  test.each(["\x1b[200~", "\x1b[201~", "\x9b200~", "\x9b201~"])(
    "does not reconstruct %j after removing an inner marker",
    (marker) => {
      const nested = `${marker.slice(0, -2)}\x1b[201~${marker.slice(-2)}`
      expect(stripBracketedPasteMarkers(`before${nested}after`)).toBe("beforeafter")
      expect(buildPastedInput(`${nested}\ncommand\n`, true)).toBe("\x1b[200~\ncommand\n\x1b[201~")
      expect(buildPastedInput(nested, false)).toBe(nested)
    },
  )

  test("reduces deeply nested mixed markers without losing ordinary Unicode text", () => {
    const nested = "\x1b[20".repeat(10_000) + "\x9b201~" + "1~".repeat(10_000)
    expect(stripBracketedPasteMarkers(`cafe\u0301 ${nested}👩‍👧 漢字`)).toBe("cafe\u0301 👩‍👧 漢字")
  })

  test("preserves unrelated escape sequences and incomplete markers", () => {
    const text = "\x1b[31mred\x1b[0m \x1b[20 \x9b201"
    expect(stripBracketedPasteMarkers(text)).toBe(text)
  })
})
