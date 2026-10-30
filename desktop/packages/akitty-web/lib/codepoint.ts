/**
 * Codepoint guards for cell text.
 *
 * The wasm reports raw cell codepoints. A value above U+10FFFF or a lone surrogate makes String.fromCodePoint throw a
 * RangeError, which aborted the whole frame (or selection copy) instead of showing one blank cell.
 */

export function isRenderableCodepoint(codepoint: number | null | undefined): codepoint is number {
  return (
    typeof codepoint === 'number' &&
    codepoint > 0 &&
    codepoint <= 0x10ffff &&
    !(codepoint >= 0xd800 && codepoint <= 0xdfff)
  );
}

/** The cell's character, or a space for an empty or invalid codepoint. */
export function cellChar(codepoint: number | null | undefined): string {
  return isRenderableCodepoint(codepoint) ? String.fromCodePoint(codepoint) : ' ';
}

/** A grapheme string with invalid codepoints replaced by spaces. */
export function graphemeString(codepoints: readonly number[]): string {
  return codepoints.map(cellChar).join('');
}
