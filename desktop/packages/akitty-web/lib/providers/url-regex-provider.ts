/** Plain URL detection with an explicit UTF-16-to-cell coordinate map. */
import { cellChar } from '../codepoint';
import type { ILink, ILinkProvider } from '../types';

interface Line { length: number; getCell(column: number): { getCodepoint(): number; getWidth?(): number; getChars?(): string } | undefined }
export interface ITerminalForUrlProvider { buffer: { active: { getLine(row: number): Line | undefined } } }

/** Remove prose punctuation while keeping balanced URL/IPv6 delimiters. */
function destinationText(value: string): string {
  const closers: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
  const openers: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
  const balance: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
  for (const ch of value) {
    if (closers[ch]) balance[ch]++;
    else if (openers[ch]) balance[openers[ch]]--;
  }
  let end = value.length;
  while (end > 0) {
    const ch = value[end - 1];
    if (/[.,;!?]/.test(ch)) { end--; continue; }
    if (closers[ch] && balance[ch] > 0) { balance[ch]--; end--; continue; }
    break;
  }
  return value.slice(0, end);
}

export class UrlRegexProvider implements ILinkProvider {
  constructor(private readonly host: ITerminalForUrlProvider) {}
  provideLinks(row: number, callback: (links: ILink[] | undefined) => void): void {
    const line = this.host.buffer.active.getLine(row);
    if (!line) { callback(undefined); return; }
    let source = '';
    const columns: number[] = [], ends: number[] = [];
    for (let column = 0; column < line.length; column++) {
      const cell = line.getCell(column);
      if (cell?.getWidth?.() === 0) continue;
      const value = cell?.getCodepoint() ?? 0;
      const glyph = cell?.getChars?.() || (value < 32 ? ' ' : cellChar(value));
      const lastColumn = Math.min(line.length - 1, column + Math.max(1, cell?.getWidth?.() ?? 1) - 1);
      source += glyph;
      for (let unit = 0; unit < glyph.length; unit++) { columns.push(column); ends.push(lastColumn); }
    }
    const results: ILink[] = [];
    const pattern = /(?:(?:https?|ftp|ssh|git|gemini|gopher):\/\/|(?:mailto|tel|magnet|news):)[^\s<>"'`]+/gi;
    for (const match of source.matchAll(pattern)) {
      const destination = destinationText(match[0]);
      const scheme = /^(?:[a-z]+:\/\/|[a-z]+:)/i.exec(destination)?.[0] ?? '';
      if (destination.length <= scheme.length) continue;
      const start = match.index!;
      results.push({ text: destination, range: { start: { x: columns[start], y: row },
        end: { x: ends[start + destination.length - 1], y: row } },
        activate: event => { if (event.ctrlKey || event.metaKey) window.open(destination, '_blank', 'noopener,noreferrer'); } });
    }
    callback(results.length ? results : undefined);
  }
  dispose(): void {}
}
