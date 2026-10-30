/**
 * Prepare pasted text for a terminal.
 *
 * Bracketed paste wraps the payload in `ESC[200~` … `ESC[201~` so the shell knows the newlines are
 * content rather than input to run. A payload that itself contains the closing marker — copied out of
 * a terminal, or crafted — ends the paste early, and everything after it is read as ordinary input,
 * newlines included: the protection the wrapper exists for is gone. Both markers can only come from
 * the wrapper, so they are removed from the text (in both the 7-bit and the 8-bit spelling).
 */
export const stripBracketedPasteMarkers = (text: string): string => {
  // Removing an inner marker can join its neighbours into another marker. Reduce the output as
  // characters arrive so nested markers cannot survive, without repeatedly rescanning the input.
  const output: string[] = []
  for (const character of text) {
    output.push(character)
    const end = output.length
    if (
      character !== "~" ||
      (output[end - 2] !== "0" && output[end - 2] !== "1") ||
      output[end - 3] !== "0" ||
      output[end - 4] !== "2"
    ) continue

    if (output[end - 5] === "\x9b") {
      output.length -= 5
    } else if (output[end - 6] === "\x1b" && output[end - 5] === "[") {
      output.length -= 6
    }
  }
  return output.join("")
}

/** The payload to send for a paste: wrapped when the terminal asked for bracketed paste. */
export const buildPastedInput = (text: string, bracketedPasteEnabled: boolean): string =>
  bracketedPasteEnabled ? `\x1b[200~${stripBracketedPasteMarkers(text)}\x1b[201~` : text
