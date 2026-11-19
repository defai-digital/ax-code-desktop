/** Resolve explicit hyperlinks by sequence identity within a row and URI across soft wraps. */
import type { ILink, ILinkProvider } from '../types';
interface LinkCell { getHyperlinkId(): number }
interface Line { readonly length: number; readonly isWrapped: boolean; getCell(column: number): LinkCell | undefined }
export interface ITerminalForOSC8Provider {
  buffer: { active: { length: number; getLine(row: number): Line | undefined } };
  wasmTerm?: { getHyperlinkUri(row: number, col: number, history?: boolean): string | null;
    getScrollbackLength(): number; isAlternateScreen(): boolean };
}

export class OSC8LinkProvider implements ILinkProvider {
  constructor(private readonly host: ITerminalForOSC8Provider) {}
  private uri(row: number, column: number): string | null {
    const engine = this.host.wasmTerm;
    if (!engine) return null;
    const history = engine.isAlternateScreen() ? 0 : engine.getScrollbackLength();
    return engine.getHyperlinkUri(row < history ? row : row - history, column, row < history);
  }
  provideLinks(row: number, callback: (links: ILink[] | undefined) => void): void {
    const buffer = this.host.buffer.active, line = buffer.getLine(row);
    if (!line) { callback(undefined); return; }
    const links: ILink[] = [];
    let column = 0;
    while (column < line.length) {
      const id = line.getCell(column)?.getHyperlinkId();
      const uri = id ? this.uri(row, column) : null;
      if (!id || !uri) { column++; continue; }
      const matches = (y: number, x: number, identity?: number): boolean => {
        const cell = buffer.getLine(y)?.getCell(x), value = cell?.getHyperlinkId();
        return !!value && (identity === undefined || identity === value) && this.uri(y, x) === uri;
      };
      let first = column, last = column;
      while (first > 0 && matches(row, first - 1, id)) first--;
      while (last + 1 < line.length && matches(row, last + 1, id)) last++;
      const start = { x: first, y: row }, end = { x: last, y: row };
      while (start.x === 0 && start.y > 0 && buffer.getLine(start.y)?.isWrapped) {
        const previous = buffer.getLine(start.y - 1);
        if (!previous?.length || !matches(start.y - 1, previous.length - 1)) break;
        start.y--; start.x = previous.length - 1;
        while (start.x > 0 && matches(start.y, start.x - 1)) start.x--;
      }
      let current = line;
      while (end.x === current.length - 1 && end.y + 1 < buffer.length) {
        const next = buffer.getLine(end.y + 1);
        if (!next?.isWrapped || !next.length || !matches(end.y + 1, 0)) break;
        end.y++; end.x = 0; current = next;
        while (end.x + 1 < current.length && matches(end.y, end.x + 1)) end.x++;
      }
      links.push({ text: uri, range: { start, end }, activate: event => {
        if ((event.ctrlKey || event.metaKey) && !/^(?:javascript|vbscript|data):/i.test(uri.trim())) {
          window.open(uri, '_blank', 'noopener,noreferrer');
        }
      } });
      column = last + 1;
    }
    callback(links.length ? links : undefined);
  }
  dispose(): void {}
}
