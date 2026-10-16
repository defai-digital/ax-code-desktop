/**
 * Prepare pasted text for a terminal.
 *
 * Bracketed paste wraps the payload in `ESC[200~` … `ESC[201~` so the shell knows the newlines are
 * content rather than input to run. A payload that itself contains the closing marker — copied out of
 * a terminal, or crafted — ends the paste early, and everything after it is read as ordinary input,
 * newlines included: the protection the wrapper exists for is gone. Both markers can only come from
 * the wrapper, so they are removed from the text (in both the 7-bit and the 8-bit spelling).
 */
export const stripBracketedPasteMarkers = (text: string): string =>
  // eslint-disable-next-line no-control-regex -- the markers are escape sequences, which is the point
  text.replace(/\x1b\[20[01]~|\x9b20[01]~/g, "")

/** The payload to send for a paste: wrapped when the terminal asked for bracketed paste. */
export const buildPastedInput = (text: string, bracketedPasteEnabled: boolean): string =>
  bracketedPasteEnabled ? `\x1b[200~${stripBracketedPasteMarkers(text)}\x1b[201~` : text
