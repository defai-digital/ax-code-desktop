/**
 * OSC 8 hyperlink regression tests against the real AkittyEngine wasm artifact.
 *
 * These cover the wasm URI read (active screen and scrollback), the provider's
 * link identity rules (distinct adjacent URIs stay separate, wrapped links stay
 * whole) and bounded/error reads. Hyperlink ids are page-local, so identity is
 * never taken from the id alone.
 */

import { describe, expect, test } from 'vitest';
import { Buffer } from './buffer';
import { AkittyEngine, type AkittyTerminal } from './engine';
import { LinkDetector } from './link-detector';
import { OSC8LinkProvider } from './providers/osc8-link-provider';
import type { ILink } from './types';

async function makeWasm(cols = 40, rows = 8): Promise<AkittyTerminal> {
  const engine = await AkittyEngine.load();
  return engine.createTerminal(cols, rows);
}

/** OSC 8 with a URI, closed by the empty-URI terminator. */
function link(uri: string, text: string): string {
  return `\x1b]8;;${uri}\x07${text}\x1b]8;;\x07`;
}

/**
 * A provider-facing terminal backed by the real wasm terminal and the real
 * Buffer row mapping (scrollback rows first, then the viewport).
 */
function makeProvider(wasm: AkittyTerminal): {
  provider: OSC8LinkProvider;
  buffer: Buffer;
  terminal: ITerminalForOSC8;
} {
  const buffer = new Buffer({ wasmTerm: wasm, getViewportY: () => 0 } as any, 'normal');
  const terminal: ITerminalForOSC8 = {
    buffer: {
      active: {
        get length(): number {
          return buffer.length;
        },
        getLine: (y: number) => buffer.getLine(y),
      },
    },
    wasmTerm: wasm,
  };
  return { provider: new OSC8LinkProvider(terminal as any), buffer, terminal };
}

interface ITerminalForOSC8 {
  buffer: {
    active: {
      length: number;
      getLine(y: number): ReturnType<Buffer['getLine']>;
    };
  };
  wasmTerm: AkittyTerminal;
}

function provide(provider: OSC8LinkProvider, y: number): Promise<ILink[] | undefined> {
  return new Promise((resolve) => provider.provideLinks(y, resolve));
}

describe('AkittyTerminal hyperlink URI reads', () => {
  test('active-screen cells report their OSC 8 URI by coordinate', async () => {
    const wasm = await makeWasm();
    const uri = 'https://a.example/x';
    wasm.write(link(uri, 'abc'));

    expect(wasm.getHyperlinkUri(0, 0)).toBe(uri);
    expect(wasm.getHyperlinkUri(0, 2)).toBe(uri);
    expect(wasm.getHyperlinkUri(0, 3)).toBeNull(); // cell past the link text
  });

  test('scrollback cells report their OSC 8 URI', async () => {
    const wasm = await makeWasm(40, 4);
    const uri = 'https://scroll.example/s';
    wasm.write(link(uri, 'S') + '\n'.repeat(4)); // scrolls the link row into history

    expect(wasm.getScrollbackLength()).toBe(1);
    expect(wasm.getHyperlinkUri(0, 0, true)).toBe(uri); // history offset 0
    expect(wasm.getHyperlinkUri(0, 0)).toBeNull(); // viewport row 0 is now empty
  });

  test('bounded reads refuse a URI that does not fit instead of truncating', async () => {
    const wasm = await makeWasm();
    const uri = 'https://bounded.example/path';
    wasm.write(link(uri, 'B'));

    expect(wasm.getHyperlinkUri(0, 0, false, 4)).toBeNull();
    expect(wasm.getHyperlinkUri(0, 0, false, uri.length)).toBe(uri); // exact fit
  });

  test('invalid coordinates and unlinked cells read as null', async () => {
    const wasm = await makeWasm();
    wasm.write(link('https://bounded.example/path', 'B'));

    expect(wasm.getHyperlinkUri(-1, 0)).toBeNull();
    expect(wasm.getHyperlinkUri(0, -1)).toBeNull();
    expect(wasm.getHyperlinkUri(99, 0)).toBeNull();
    expect(wasm.getHyperlinkUri(0, 99)).toBeNull();
    expect(wasm.getHyperlinkUri(0, 5, true)).toBeNull(); // no such scrollback row
    expect(wasm.getHyperlinkUri(0, 1)).toBeNull(); // 'B' occupies column 0 only
  });
});

describe('OSC8LinkProvider', () => {
  test('returns the link with its URI and exact range', async () => {
    const wasm = await makeWasm();
    const uri = 'https://a.example/x';
    wasm.write(link(uri, 'abc'));

    const { provider } = makeProvider(wasm);
    const links = await provide(provider, 0);

    expect(links).toHaveLength(1);
    expect(links![0]!.text).toBe(uri);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });
  });

  test('keeps two adjacent different-URI links separate', async () => {
    const wasm = await makeWasm();
    const uriA = 'https://one.example/';
    const uriB = 'https://two.example/';
    wasm.write(link(uriA, 'AAA') + link(uriB, 'BBB'));

    const { provider, buffer } = makeProvider(wasm);
    const links = await provide(provider, 0);

    expect(links).toHaveLength(2);
    expect(links![0]!.text).toBe(uriA);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });
    expect(links![1]!.text).toBe(uriB);
    expect(links![1]!.range).toEqual({ start: { x: 3, y: 0 }, end: { x: 5, y: 0 } });

    // Cells must not collapse both links onto one hyperlink id.
    const line = buffer.getLine(0)!;
    const idA = line.getCell(0)!.getHyperlinkId();
    const idB = line.getCell(3)!.getHyperlinkId();
    expect(idA).toBeGreaterThan(0);
    expect(idB).toBeGreaterThan(0);
    expect(idA).not.toBe(idB);
  });

  test('merges a soft-wrapped link into a single multi-row range', async () => {
    const wasm = await makeWasm(20, 5);
    const uri = 'https://wrap.example/long';
    wasm.write(link(uri, 'x'.repeat(50))); // 50 columns at width 20 wraps to rows 0..2

    const { provider } = makeProvider(wasm);
    const links = await provide(provider, 0);
    expect(links).toHaveLength(1);
    expect(links![0]!.text).toBe(uri);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 9, y: 2 } });

    // Scanning the wrapped continuation row resolves to the same whole link.
    const fromMiddle = await provide(provider, 1);
    expect(fromMiddle).toHaveLength(1);
    expect(fromMiddle![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 9, y: 2 } });
  });

  test('keeps distinct same-URI sequences on one row separate', async () => {
    const wasm = await makeWasm();
    const uri = 'https://same.example/';
    wasm.write(link(uri, 'A') + link(uri, 'B'));

    const { provider } = makeProvider(wasm);
    const links = await provide(provider, 0);

    expect(links).toHaveLength(2);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
    expect(links![1]!.range).toEqual({ start: { x: 1, y: 0 }, end: { x: 1, y: 0 } });
  });

  test('does not merge same-URI links across a hard newline at the right edge', async () => {
    const wasm = await makeWasm(20, 5);
    const uri = 'https://hard.example/';
    wasm.write(link(uri, 'x'.repeat(20)) + '\r\n' + link(uri, 'y'));

    const { provider } = makeProvider(wasm);
    const first = await provide(provider, 0);
    const second = await provide(provider, 1);

    expect(first).toHaveLength(1);
    expect(first![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 19, y: 0 } });
    expect(second).toHaveLength(1);
    expect(second![0]!.range).toEqual({ start: { x: 0, y: 1 }, end: { x: 0, y: 1 } });
  });

  test('keeps a soft-wrapped link whole after it enters scrollback', async () => {
    const wasm = await makeWasm(20, 2);
    const uri = 'https://history-wrap.example/';
    wasm.write(link(uri, 'x'.repeat(40)) + '\n'.repeat(2));
    expect(wasm.getScrollbackLength()).toBe(2);

    const { provider } = makeProvider(wasm);
    const links = await provide(provider, 0);

    expect(links).toHaveLength(1);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 19, y: 1 } });
  });

  test('resolves links on scrollback rows through buffer coordinates', async () => {
    const wasm = await makeWasm(40, 4);
    const uri = 'https://scroll.example/s';
    wasm.write(link(uri, 'S') + '\n'.repeat(4));
    expect(wasm.getScrollbackLength()).toBe(1);

    const { provider } = makeProvider(wasm);
    const links = await provide(provider, 0); // buffer row 0 = scrollback offset 0

    expect(links).toHaveLength(1);
    expect(links![0]!.text).toBe(uri);
    expect(links![0]!.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
  });

  test('LinkDetector resolves an OSC 8 link end to end', async () => {
    const wasm = await makeWasm();
    const uri = 'https://a.example/x';
    wasm.write(link(uri, 'abc'));

    const { terminal, provider } = makeProvider(wasm);
    const detector = new LinkDetector(terminal as any);
    detector.registerProvider(provider);

    const link1 = await detector.getLinkAt(1, 0);
    expect(link1?.text).toBe(uri);
    expect(link1?.range).toEqual({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });

    detector.dispose();
  });
});
