/** Conversion of untrusted numeric cells into valid Unicode text. */
export function isRenderableCodepoint(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 0x10ffff
    && (value < 0xd800 || value > 0xdfff);
}
export function cellChar(value: number | null | undefined): string {
  if (!isRenderableCodepoint(value)) return ' ';
  return String.fromCodePoint(value);
}
export function graphemeString(values: readonly number[]): string {
  let result = '';
  for (const value of values) result += cellChar(value);
  return result;
}
