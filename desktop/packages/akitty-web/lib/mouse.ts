/** Terminal mouse reports. Coordinates are one-based in the wire protocol. */
export function mouseReport(button: number, x: number, y: number, release: boolean, sgr: boolean, utf8: boolean): string {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return '';
  if (sgr) return `\x1b[<${button};${x + 1};${y + 1}${release ? 'm' : 'M'}`;
  const limit = utf8 ? 2014 : 222;
  return '\x1b[M' + String.fromCodePoint((release ? button | 3 : button) + 32, Math.min(x, limit) + 33, Math.min(y, limit) + 33);
}
