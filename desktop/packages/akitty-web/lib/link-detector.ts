/** Ordered asynchronous providers with row-scoped cancellation and range invalidation. */
import type { ILink, ILinkProvider } from './types';
export interface ITerminalForLinkDetector { buffer: { active: { getLine(row: number): { length: number } | undefined } } }
interface Ranked { link: ILink; priority: number }
interface Scan {
  controller: AbortController;
  version: number;
  start: number;
  complete: boolean;
  links: Ranked[];
  done: Promise<void>;
}
const intersects = (link: ILink, first: number, last: number): boolean => link.range.start.y <= last && link.range.end.y >= first;
const contains = (link: ILink, x: number, y: number): boolean => {
  const { start, end } = link.range;
  return y >= start.y && y <= end.y && (y !== start.y || x >= start.x) && (y !== end.y || x <= end.x);
};

export class LinkDetector {
  private readonly providers: ILinkProvider[] = [];
  private readonly scans = new Map<number, Scan>();
  private readonly changed = new Map<number, number>();
  private sequence = 0;
  private closed = false;
  constructor(private readonly host: ITerminalForLinkDetector) {}
  registerProvider(provider: ILinkProvider): void { if (!this.closed) { this.providers.push(provider); this.invalidateCache(); } }
  async getLinkAt(column: number, row: number): Promise<ILink | undefined> {
    if (this.closed || !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0) return undefined;
    const line = this.host.buffer.active.getLine(row);
    if (!line || column >= line.length) return undefined;
    let scan = this.scans.get(row);
    if (!scan) {
      scan = { controller: new AbortController(), version: this.changed.get(row) ?? 0, start: this.sequence,
        complete: false, links: [], done: Promise.resolve() };
      this.scans.set(row, scan);
      scan.done = this.collect(row, scan);
    }
    await scan.done;
    if (this.closed || scan.controller.signal.aborted || !scan.complete || this.scans.get(row) !== scan) return undefined;
    let best: Ranked | undefined;
    for (const candidate of this.scans.values()) {
      if (!candidate.complete) continue;
      for (const entry of candidate.links) {
        if ((!best || entry.priority < best.priority) && contains(entry.link, column, row)) best = entry;
      }
    }
    return best?.link;
  }
  private async collect(row: number, scan: Scan): Promise<void> {
    const results: Ranked[] = [];
    try {
      for (let priority = 0; priority < this.providers.length; priority++) {
        if (scan.controller.signal.aborted) return;
        const links = await this.ask(this.providers[priority], row, scan.controller.signal);
        for (const link of links ?? []) results.push({ link, priority });
      }
      if (scan.controller.signal.aborted || this.scans.get(row) !== scan || (this.changed.get(row) ?? 0) !== scan.version) return;
      for (const [changedRow, stamp] of this.changed) {
        if (stamp > scan.start && results.some(entry => intersects(entry.link, changedRow, changedRow))) {
          this.scans.delete(row); return;
        }
      }
      scan.links = results; scan.complete = true;
    } catch (error) {
      if (this.scans.get(row) === scan) this.scans.delete(row);
      throw error;
    }
  }
  private ask(provider: ILinkProvider, row: number, signal: AbortSignal): Promise<ILink[] | undefined> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (links?: ILink[]): void => {
        if (finished) return;
        finished = true; signal.removeEventListener('abort', cancel); resolve(links);
      };
      const cancel = (): void => finish();
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) { finish(); return; }
      try { provider.provideLinks(row, finish); }
      catch (error) { finished = true; signal.removeEventListener('abort', cancel); reject(error); }
    });
  }
  invalidateCache(): void {
    this.sequence++;
    for (const scan of this.scans.values()) scan.controller.abort();
    this.scans.clear(); this.changed.clear();
  }
  invalidateRows(first: number, last: number): void {
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) return;
    const affected = new Set<number>();
    for (let row = first; row <= Math.min(last, first + 100000); row++) affected.add(row);
    for (const [row, scan] of this.scans) {
      const overlaps = scan.links.filter(entry => intersects(entry.link, first, last));
      if (!overlaps.length) continue;
      affected.add(row);
      for (const { link } of overlaps) {
        for (let y = link.range.start.y; y <= Math.min(link.range.end.y, link.range.start.y + 100000); y++) affected.add(y);
      }
    }
    const stamp = ++this.sequence;
    for (const row of affected) {
      this.changed.set(row, stamp);
      const scan = this.scans.get(row);
      if (scan) { scan.controller.abort(); this.scans.delete(row); }
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.invalidateCache();
    let firstError: unknown;
    for (const provider of this.providers) { try { provider.dispose?.(); } catch (error) { firstError ??= error; } }
    this.providers.length = 0;
    if (firstError !== undefined) throw firstError;
  }
}
