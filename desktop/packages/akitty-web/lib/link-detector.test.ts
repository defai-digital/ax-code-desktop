/**
 * LinkDetector async cache regression tests.
 *
 * Providers are deferred so tests can observe an in-flight scan and then
 * settle it after an invalidation or disposal.
 */

import { describe, expect, test } from 'vitest';
import { LinkDetector } from './link-detector';
import type { ITerminalForLinkDetector } from './link-detector';
import type { ILink, ILinkProvider } from './types';

const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeLink(row: number, startX: number, endX: number, text: string): ILink {
  return {
    text,
    range: { start: { x: startX, y: row }, end: { x: endX, y: row } },
    activate: () => {},
  };
}

function makeTerminal(rows = 100, cols = 200, hyperlinkId = 0): ITerminalForLinkDetector {
  return {
    buffer: {
      active: {
        getLine: (y: number) => {
          if (y < 0 || y >= rows) return undefined;
          return {
            length: cols,
            getCell: (x: number) =>
              x >= 0 && x < cols ? { getHyperlinkId: () => hyperlinkId } : undefined,
          };
        },
      },
    },
  };
}

class DeferredProvider implements ILinkProvider {
  readonly calls: number[] = [];
  private readonly pending: Array<{ resolve: (links: ILink[] | undefined) => void }> = [];

  provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
    this.calls.push(y);
    this.pending.push({ resolve: callback });
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  resolveNext(links: ILink[] | undefined): void {
    const next = this.pending.shift();
    if (!next) throw new Error('no pending provideLinks call to resolve');
    next.resolve(links);
  }
}

describe('LinkDetector async scan cache', () => {
  test('the first provider wins when two links have exactly the same range', async () => {
    const detector = new LinkDetector(makeTerminal());
    const explicit = makeLink(0, 0, 10, 'explicit target');
    const detected = makeLink(0, 0, 10, 'detected target');
    detector.registerProvider({ provideLinks: (_row, callback) => callback([explicit]) });
    detector.registerProvider({ provideLinks: (_row, callback) => callback([detected]) });
    await expect(detector.getLinkAt(5, 0)).resolves.toBe(explicit);
    await expect(detector.getLinkAt(5, 0)).resolves.toBe(explicit);
    detector.dispose();
  });

  test('provider priority survives overlapping multi-line links cached from another row', async () => {
    const detector = new LinkDetector(makeTerminal());
    const explicit = makeLink(1, 0, 10, 'explicit target');
    const fallback: ILink = {
      ...makeLink(0, 0, 10, 'fallback target'),
      range: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 } },
    };
    detector.registerProvider({ provideLinks: (row, callback) => callback(row === 1 ? [explicit] : undefined) });
    detector.registerProvider({ provideLinks: (_row, callback) => callback([fallback]) });
    await expect(detector.getLinkAt(5, 0)).resolves.toBe(fallback);
    await expect(detector.getLinkAt(5, 1)).resolves.toBe(explicit);
    await expect(detector.getLinkAt(5, 0)).resolves.toBe(fallback);
    detector.invalidateRows(1, 1);
    await expect(detector.getLinkAt(5, 1)).resolves.toBe(explicit);
    detector.dispose();
  });

  test('concurrent getLinkAt calls on one unscanned row share a single provider scan', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const expected = makeLink(5, 0, 10, 'shared');
    const first = detector.getLinkAt(0, 5);
    const second = detector.getLinkAt(10, 5);

    // Both callers must wait on the same provider call.
    expect(provider.calls).toEqual([5]);
    expect(provider.pendingCount).toBe(1);

    provider.resolveNext([expected]);

    await expect(first).resolves.toBe(expected);
    await expect(second).resolves.toBe(expected);
    expect(provider.calls).toEqual([5]);

    detector.dispose();
  });

  test('providers are queried sequentially in registration order', async () => {
    const terminal = makeTerminal();
    const detector = new LinkDetector(terminal);
    const firstProvider = new DeferredProvider();
    const secondProvider = new DeferredProvider();
    detector.registerProvider(firstProvider);
    detector.registerProvider(secondProvider);

    const firstLink = makeLink(2, 0, 4, 'first');
    const secondLink = makeLink(2, 6, 9, 'second');
    const lookup = detector.getLinkAt(0, 2);

    expect(firstProvider.calls).toEqual([2]);
    expect(secondProvider.calls).toEqual([]);

    firstProvider.resolveNext([firstLink]);
    await flush();
    expect(secondProvider.calls).toEqual([2]);

    secondProvider.resolveNext([secondLink]);
    await expect(lookup).resolves.toBe(firstLink);

    detector.dispose();
  });

  test('invalidateCache drops an in-flight result instead of caching or returning it', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const stale = makeLink(3, 0, 5, 'stale');
    const pending = detector.getLinkAt(0, 3);
    expect(provider.pendingCount).toBe(1);

    detector.invalidateCache();
    provider.resolveNext([stale]);

    await expect(pending).resolves.toBeUndefined();

    // The stale link must not be cached: the next lookup scans again.
    const fresh = makeLink(3, 0, 5, 'fresh');
    const next = detector.getLinkAt(0, 3);
    expect(provider.calls).toEqual([3, 3]);
    expect(provider.pendingCount).toBe(1);

    provider.resolveNext([fresh]);
    await expect(next).resolves.toBe(fresh);

    detector.dispose();
  });

  test('invalidateRows rescans invalidated rows and keeps other rows cached', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const oldRow2 = makeLink(2, 0, 4, 'row2-old');
    const row8 = makeLink(8, 0, 4, 'row8');

    const first2 = detector.getLinkAt(0, 2);
    provider.resolveNext([oldRow2]);
    await expect(first2).resolves.toBe(oldRow2);

    const first8 = detector.getLinkAt(0, 8);
    provider.resolveNext([row8]);
    await expect(first8).resolves.toBe(row8);

    detector.invalidateRows(0, 4);

    // Row 8 is outside the invalidated range and stays cached.
    await expect(detector.getLinkAt(0, 8)).resolves.toBe(row8);
    expect(provider.calls).toEqual([2, 8]);

    // Row 2 was invalidated and must be scanned again.
    const newRow2 = makeLink(2, 0, 4, 'row2-new');
    const second2 = detector.getLinkAt(0, 2);
    expect(provider.calls).toEqual([2, 8, 2]);
    provider.resolveNext([newRow2]);
    await expect(second2).resolves.toBe(newRow2);

    detector.dispose();
  });

  test('invalidateRows drops an in-flight scan for a covered row', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const stale = makeLink(5, 0, 5, 'stale');
    const pending = detector.getLinkAt(0, 5);
    expect(provider.pendingCount).toBe(1);

    detector.invalidateRows(0, 10);
    provider.resolveNext([stale]);

    await expect(pending).resolves.toBeUndefined();

    const fresh = makeLink(5, 0, 5, 'fresh');
    const next = detector.getLinkAt(0, 5);
    expect(provider.calls).toEqual([5, 5]);
    provider.resolveNext([fresh]);
    await expect(next).resolves.toBe(fresh);

    detector.dispose();
  });

  test('invalidateRows rescans rows covered by a removed multi-line link', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const multiLine: ILink = {
      text: 'multi',
      range: { start: { x: 0, y: 2 }, end: { x: 4, y: 8 } },
      activate: () => {},
    };

    const first2 = detector.getLinkAt(0, 2);
    provider.resolveNext([multiLine]);
    await expect(first2).resolves.toBe(multiLine);

    const first8 = detector.getLinkAt(0, 8);
    provider.resolveNext([multiLine]);
    await expect(first8).resolves.toBe(multiLine);
    expect(provider.calls).toEqual([2, 8]);

    // The link touches row 2, so invalidating 0..4 removes it and must
    // invalidate row 8 as well even though 8 is outside the range.
    detector.invalidateRows(0, 4);

    const restored: ILink = {
      text: 'restored',
      range: { start: { x: 0, y: 2 }, end: { x: 4, y: 8 } },
      activate: () => {},
    };
    const second8 = detector.getLinkAt(0, 8);
    expect(provider.calls).toEqual([2, 8, 8]);
    provider.resolveNext([restored]);
    await expect(second8).resolves.toBe(restored);

    detector.dispose();
  });

  test('invalidateRows leaves an untouched in-flight row scan and result intact', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const row8 = makeLink(8, 0, 4, 'row8');
    const pending = detector.getLinkAt(0, 8);
    expect(provider.calls).toEqual([8]);

    // Rows 0..4 change while row 8 is still being scanned.
    detector.invalidateRows(0, 4);
    expect(provider.pendingCount).toBe(1);

    provider.resolveNext([row8]);

    // The untouched scan must finish and publish instead of being cancelled.
    await expect(pending).resolves.toBe(row8);
    expect(provider.calls).toEqual([8]);

    // Its result is a cache hit, not a rescan.
    await expect(detector.getLinkAt(0, 8)).resolves.toBe(row8);
    expect(provider.calls).toEqual([8]);

    detector.dispose();
  });

  test('rejects an outside-row scan whose multi-line link spans an invalidated row', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const staleMulti: ILink = {
      text: 'stale-multi',
      range: { start: { x: 0, y: 2 }, end: { x: 4, y: 8 } },
      activate: () => {},
    };

    const pending = detector.getLinkAt(0, 8);
    expect(provider.calls).toEqual([8]);

    detector.invalidateRows(0, 4);
    provider.resolveNext([staleMulti]);

    // The link reaches into an invalidated row, so the whole scan is discarded
    // rather than publishing stale multi-line content for row 8.
    await expect(pending).resolves.toBeUndefined();

    // The row is not poisoned: a fresh scan may publish a current link.
    const fresh = makeLink(8, 0, 4, 'row8-fresh');
    const next = detector.getLinkAt(0, 8);
    expect(provider.calls).toEqual([8, 8]);
    provider.resolveNext([fresh]);
    await expect(next).resolves.toBe(fresh);

    detector.dispose();
  });

  test('dispose resolves an in-flight lookup without returning a link', async () => {
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal());
    detector.registerProvider(provider);

    const pending = detector.getLinkAt(0, 9);
    expect(provider.pendingCount).toBe(1);

    detector.dispose();

    // Must settle promptly even though the provider has not called back.
    await expect(pending).resolves.toBeUndefined();

    // A late provider callback must not resurrect cache entries.
    provider.resolveNext([makeLink(9, 0, 3, 'late')]);
    await flush();
    await expect(detector.getLinkAt(0, 9)).resolves.toBeUndefined();
  });

  test('links sharing a page-local hyperlink id stay distinct in the cache', async () => {
    // Cells all report hyperlink id 7, as they can when two links on different
    // pages share an id. Cache identity must be positional, not id-based.
    const provider = new DeferredProvider();
    const detector = new LinkDetector(makeTerminal(100, 200, 7));
    detector.registerProvider(provider);

    const row2 = makeLink(2, 0, 4, 'row2');
    const first2 = detector.getLinkAt(0, 2);
    provider.resolveNext([row2]);
    await expect(first2).resolves.toBe(row2);

    const row8 = makeLink(8, 0, 4, 'row8');
    const first8 = detector.getLinkAt(0, 8);
    provider.resolveNext([row8]);
    await expect(first8).resolves.toBe(row8);

    // Both links must survive in the cache: a lookup on row 2 must not return
    // row 8's link just because their cells report the same id.
    await expect(detector.getLinkAt(0, 2)).resolves.toBe(row2);
    await expect(detector.getLinkAt(0, 8)).resolves.toBe(row8);
    expect(provider.calls).toEqual([2, 8]);

    detector.dispose();
  });
});
