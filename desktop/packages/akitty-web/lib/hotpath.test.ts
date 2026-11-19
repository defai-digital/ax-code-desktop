/**
 * Hot-path behavior: the viewport is parsed once per change, writes do not allocate in wasm memory per call, the
 * renderer skips work that cannot change pixels, and a throwing frame does not end the render loop.
 */

import { describe, expect, test, vi } from 'vitest';
import { AkittyEngine } from './engine';
import type { AkittyTerminal } from './engine';
import { type IRenderable, CanvasRenderer } from './renderer';
import { createIsolatedTerminal } from './test-helpers';
import type { TerminalCell } from './types';

async function makeWasm(cols = 20, rows = 5): Promise<AkittyTerminal> {
  const engine = await AkittyEngine.load();
  return engine.createTerminal(cols, rows);
}

function rowText(cells: TerminalCell[] | null): string {
  return (cells ?? []).map((c) => (c.codepoint ? String.fromCodePoint(c.codepoint) : ' ')).join('').trimEnd();
}

function countCalls(term: AkittyTerminal, name: string): { count: () => number } {
  // The wasm exports object is frozen, so wrap a plain copy of it.
  const target = (term as any).exports;
  const wrapped: Record<string, unknown> = {};
  let calls = 0;
  for (const key of Object.keys(target)) wrapped[key] = target[key];
  const original = target[name] as (...args: unknown[]) => unknown;
  wrapped[name] = (...args: unknown[]) => {
    calls++;
    return original(...args);
  };
  (term as any).exports = wrapped;
  return { count: () => calls };
}

describe('AkittyTerminal viewport cache', () => {
  test('reading every row parses the viewport once', async () => {
    const term = await makeWasm();
    term.write('one\r\ntwo\r\nthree');
    const reads = countCalls(term, 'akitty_vt_viewport');

    const rows = [0, 1, 2, 3, 4].map((y) => rowText(term.getLine(y)));
    expect(rows).toEqual(['one', 'two', 'three', '', '']);
    expect(reads.count()).toBe(1);
    term.free();
  });

  test('a write invalidates the cache', async () => {
    const term = await makeWasm();
    term.write('abc');
    expect(rowText(term.getLine(0))).toBe('abc');
    term.write('\rXY');
    expect(rowText(term.getLine(0))).toBe('XYc');
    term.write('\x1b[2J\x1b[H');
    expect(rowText(term.getLine(0))).toBe('');
    term.free();
  });

  test('a resize invalidates the cache', async () => {
    const term = await makeWasm(10, 3);
    term.write('hello');
    expect(term.getLine(0)).toHaveLength(10);
    term.resize(30, 4);
    expect(term.getLine(0)).toHaveLength(30);
    expect(term.getLine(3)).not.toBeNull();
    expect(rowText(term.getLine(0))).toBe('hello');
    term.free();
  });

  test('getLine returns copies; getLineView shares the pooled cells', async () => {
    const term = await makeWasm();
    term.write('abc');
    const copy = term.getLine(0)!;
    const view = term.getLineView(0)!;
    expect(copy[0]).toEqual(view[0]);
    expect(copy[0]).not.toBe(view[0]);
    expect(term.getLineView(0)![0]).toBe(view[0]);
    expect(term.getLineView(-1)).toBeNull();
    expect(term.getLineView(99)).toBeNull();
    term.free();
  });
});

describe('AkittyTerminal lazy row parsing', () => {
  test('a row read parses only that row', async () => {
    const term = await makeWasm(10, 4);
    term.write('aaa\r\nbbb\r\nccc');
    const pool = (term as any).cellPool as TerminalCell[];
    for (const cell of pool) cell.codepoint = 0x2603; // sentinel: rows that are never parsed keep it
    term.write('\r\nddd'); // invalidates the viewport

    expect(rowText(term.getLineView(1))).toBe('bbb');
    expect(pool[0].codepoint).toBe(0x2603);
    expect(pool[20].codepoint).toBe(0x2603);
    expect(pool[10].codepoint).toBe('b'.codePointAt(0));
    expect(rowText(term.getLineView(0))).toBe('aaa');
    term.free();
  });

  test('reading history between row reads does not corrupt unparsed rows', async () => {
    const term = await makeWasm(10, 3);
    for (let i = 0; i < 8; i++) term.write(`hist${i}\r\n`);
    term.write('row0\r\nrow1\r\nrow2');
    expect(term.getScrollbackLength()).toBeGreaterThan(0);

    // Load the viewport by reading the last row, then read history before the earlier rows are parsed.
    expect(rowText(term.getLineView(2))).toBe('row2');
    expect(rowText(term.getScrollbackLine(0))).toBe('hist0');
    expect(rowText(term.getLineView(0))).toBe('row0');
    expect(rowText(term.getScrollbackLine(1))).toBe('hist1');
    expect(rowText(term.getLineView(1))).toBe('row1');
    term.free();
  });

  test('getViewport after partial reads returns every row', async () => {
    const term = await makeWasm(10, 3);
    term.write('one\r\ntwo\r\nthree');
    term.getLineView(1);
    const reads = countCalls(term, 'akitty_vt_viewport');
    const all = term.getViewport();
    expect(String.fromCodePoint(all[0].codepoint)).toBe('o');
    expect(String.fromCodePoint(all[20].codepoint)).toBe('t');
    expect(reads.count()).toBe(0);
    term.free();
  });
});

describe('AkittyTerminal write path', () => {
  test('event callbacks observe the new viewport even when they throw', async () => {
    const term = await makeWasm(10, 2);
    try {
      term.write('old');
      expect(rowText(term.getLineView(0))).toBe('old');
      expect(() => term.write('\rnew\x1b]2;title\x07', () => {
        expect(rowText(term.getLineView(0))).toBe('new');
        throw new Error('listener failed');
      })).toThrow('listener failed');
      expect(rowText(term.getLineView(0))).toBe('new');
      term.clearDirty();
      expect(() => term.write('\x1b[?1049h\x1b]2;alternate\x07', () => { throw new Error('alternate'); })).toThrow('alternate');
      expect(term.needsFullRedraw()).toBe(true);
      expect(rowText(term.getLineView(0))).toBe('');
    } finally { term.free(); }
  });

  test('reentrant writes cannot consume the outer write event batch', async () => {
    const term = await makeWasm();
    const seen: string[] = [];
    try {
      term.write('\x1b]2;first\x07\x07\x1b]2;last\x07', event => {
        seen.push(event.type === 'title' ? event.title : 'bell');
        if (event.type === 'title' && event.title === 'first') term.write('nested\x1b]2;inner\x07', inner => {
          if (inner.type === 'title') seen.push(inner.title);
        });
      });
      expect(seen).toEqual(['first', 'bell', 'last', 'inner']);
      expect(rowText(term.getLineView(0))).toBe('nested');
    } finally { term.free(); }
  });

  test('reentrant writes keep later chunks attached to their original callback', async () => {
    const term = await makeWasm();
    const outer: string[] = [], nested: string[] = [];
    try {
      // The second title is parsed in the next bounded WASM write. A nested write
      // from the first title must not take ownership of that later outer event.
      term.write('\x1b]2;first\x07' + '\0'.repeat(1 << 20) + '\x1b]2;last\x07', event => {
        if (event.type !== 'title') return;
        outer.push(event.title);
        if (event.title === 'first') term.write('\x1b]2;inner\x07', inner => {
          if (inner.type === 'title') nested.push(inner.title);
        });
      });
      expect(outer).toEqual(['first', 'last']);
      expect(nested).toEqual(['inner']);
    } finally { term.free(); }
  });

  test('a throwing callback does not drop the rest of its event batch', async () => {
    const term = await makeWasm();
    const seen: string[] = [];
    try {
      expect(() => term.write('\x1b]2;first\x07\x1b]2;last\x07', event => {
        if (event.type === 'title') seen.push(event.title);
        if (seen.length === 1) throw new Error('first callback failed');
      })).toThrow('first callback failed');
      expect(seen).toEqual(['first', 'last']);
      term.write('\x1b]2;next\x07', event => { if (event.type === 'title') seen.push(event.title); });
      expect(seen).toEqual(['first', 'last', 'next']);
    } finally { term.free(); }
  });

  test('disposing from a callback stops the remaining callbacks', async () => {
    const term = await makeWasm();
    const seen: string[] = [];
    term.write('\x1b]2;first\x07\x1b]2;last\x07', event => {
      if (event.type === 'title') seen.push(event.title);
      term.free();
    });
    expect(seen).toEqual(['first']);
    expect(term.isFreed).toBe(true);
  });

  test('reuses one wasm buffer across writes', async () => {
    const term = await makeWasm();
    const allocs = countCalls(term, 'akitty_vt_alloc');
    for (let i = 0; i < 50; i++) term.write(`line ${i}\r\n`);
    // The first write sizes the buffer; the viewport read allocates once more.
    const duringWrites = allocs.count();
    expect(duringWrites).toBeLessThanOrEqual(1);
    term.write('tail');
    term.getLine(0);
    expect(allocs.count()).toBeLessThanOrEqual(duringWrites + 1);
    term.free();
  });

  test('encodes multibyte text, byte arrays and lone surrogates', async () => {
    const term = await makeWasm(30, 4);
    term.write('中文 é');
    term.write(new TextEncoder().encode('\r\nbytes'));
    term.write('\r\n\ud800x');
    const first = term.getLine(0)!;
    expect(first[0].codepoint).toBe('中'.codePointAt(0));
    expect(rowText(term.getLine(1))).toBe('bytes');
    const third = term.getLine(2)!;
    expect(third[0].codepoint).toBe(0xfffd);
    expect(third[1].codepoint).toBe('x'.codePointAt(0));
    term.free();
  });

  test('growing writes and writes above the buffer cap both arrive intact', async () => {
    const term = await makeWasm(40, 3);
    term.write('a');
    term.write('b'.repeat(5000));
    term.write('\x1b[H\x1b[2J');
    // 400k chars is 1.2 MB of worst-case UTF-8, above the 1 MiB buffer cap: one-off allocation path.
    term.write('x'.repeat(400_000) + '\r\nend');
    expect(rowText(term.getLine(1))).toBe('x'.repeat(40));
    expect(rowText(term.getLine(2))).toBe('end');
    term.write(new Uint8Array(0));
    term.write('');
    term.free();
  });
});

// A hand-rolled renderable and a counting context isolate what the renderer decides to draw.
function makeRenderable(cols: number, rows: number, text: string[]) {
  const cell = (ch: string, flags = 0): TerminalCell => ({
    codepoint: ch === ' ' ? 32 : ch.codePointAt(0)!,
    fg_r: 200,
    fg_g: 200,
    fg_b: 200,
    bg_r: 0,
    bg_g: 0,
    bg_b: 0,
    flags,
    width: 1,
    hyperlink_id: 0,
    grapheme_len: 0,
  });
  const dirty = new Set<number>(Array.from({ length: rows }, (_, i) => i));
  let viewLines = 0;
  const lines = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => cell(text[y]?.[x] ?? ' '))
  );
  const renderable: IRenderable = {
    getLine: (y) => lines[y]?.map((c) => ({ ...c })) ?? null,
    getLineView: (y) => {
      viewLines++;
      return lines[y] ?? null;
    },
    getCursor: () => ({ x: 0, y: 0, visible: true }),
    getDimensions: () => ({ cols, rows }),
    isRowDirty: (y) => dirty.has(y),
    clearDirty: () => dirty.clear(),
  };
  return { renderable, dirty, lines, viewLines: () => viewLines };
}

function makeRenderer(options: ConstructorParameters<typeof CanvasRenderer>[1] = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new CanvasRenderer(canvas, { fontSize: 15, cursorBlink: false, ...options });
  const ctx = (renderer as any).ctx;
  const counts = { fillText: 0, fillRect: 0, fontSets: 0, fillSets: 0, drawImage: 0 };
  ctx.fillText = () => void counts.fillText++;
  ctx.fillRect = () => void counts.fillRect++;
  ctx.drawImage = () => void counts.drawImage++;
  let font = ctx.font;
  Object.defineProperty(ctx, 'font', {
    get: () => font,
    set: (v: string) => {
      counts.fontSets++;
      font = v;
    },
  });
  let fill = ctx.fillStyle;
  Object.defineProperty(ctx, 'fillStyle', {
    get: () => fill,
    set: (v: string) => {
      counts.fillSets++;
      fill = v;
    },
  });
  const reset = () => {
    counts.fillText = counts.fillRect = counts.fontSets = counts.fillSets = counts.drawImage = 0;
  };
  return { renderer, counts, reset };
}

describe('CanvasRenderer work skipping', () => {
  test('uniform row backgrounds are painted in runs', () => {
    const { renderer, counts } = makeRenderer();
    const { renderable } = makeRenderable(200, 4, ['hello']);
    renderer.render(renderable, true, 0);
    // One row clear and one background run per row, plus the cursor overlay.
    expect(counts.fillRect).toBeLessThanOrEqual(10);
    renderer.dispose();
  });

  test('a single dirty row avoids full viewport export and clean-row decoding', async () => {
    const term = await makeWasm(200, 50);
    const { renderer } = makeRenderer();
    try {
      term.write('a'.repeat(9999) + '\x1b[H');
      renderer.render(term, true, 0);
      const viewport = countCalls(term, 'akitty_vt_viewport');
      const rows = countCalls(term, 'akitty_vt_line');
      const reads = vi.spyOn(term, 'getLineView');
      term.write('\x1b[Hx');
      renderer.render(term, false, 0);
      expect(viewport.count()).toBe(0);
      expect(rows.count()).toBe(1);
      expect(reads).toHaveBeenCalledTimes(1);
      expect(rowText(term.getLineView(0))).toBe('x' + 'a'.repeat(199));
      // Reading a row not prepared by the renderer still loads a coherent viewport.
      expect(rowText(term.getLineView(1))).toBe('a'.repeat(200));
      expect(viewport.count()).toBe(1);
    } finally { renderer.dispose(); term.free(); }
  });

  test('blank cells are not drawn', async () => {
    const { renderer, counts } = makeRenderer();
    const { renderable } = makeRenderable(40, 10, ['hi there']);
    renderer.render(renderable, true, 0);
    expect(counts.fillText).toBe(7); // "hi there" minus the space
    renderer.dispose?.();
  });

  test('uses the copy-free line view and sets font and color once per run', async () => {
    const { renderer, counts } = makeRenderer();
    const { renderable, viewLines } = makeRenderable(40, 3, ['aaaa', 'bbbb', 'cccc']);
    renderer.render(renderable, true, 0);
    expect(viewLines()).toBe(3);
    expect(counts.fontSets).toBe(1);
    // Per line: the background clear plus one foreground color for every glyph, plus the cursor and the final text.
    expect(counts.fillSets).toBeLessThan(counts.fillText);
    renderer.dispose?.();
  });

  test('an unchanged frame draws nothing', async () => {
    const { renderer, counts, reset } = makeRenderer();
    const { renderable } = makeRenderable(20, 4, ['abc']);
    renderer.render(renderable, true, 0);
    reset();
    renderer.render(renderable, false, 0);
    expect(counts.fillText).toBe(0);
    renderer.dispose?.();
  });

  test.each([1.25, 1.5])('an idle frame after a fractional DPR frame (%s) does not resize', (dpr) => {
    const { renderer, counts, reset } = makeRenderer({ devicePixelRatio: dpr });
    const r = renderer as any;
    // 81 columns at 9px is 729 CSS px: a fractional device-pixel width at both ratios.
    r.metrics = { width: 9, height: 17, baseline: 13 };
    const resize = vi.spyOn(r, 'resize');
    const { renderable } = makeRenderable(81, 4, ['abc']);

    renderer.render(renderable, true, 0);
    expect(resize).toHaveBeenCalledTimes(1);
    expect(r.canvas.width).toBe(Math.round(81 * 9 * dpr));

    resize.mockClear();
    reset();
    renderer.render(renderable, false, 0);
    expect(resize).not.toHaveBeenCalled();
    expect(counts.fillText).toBe(0);
    expect(counts.fillRect).toBe(0); // unchanged cursor pixels must not accumulate opacity
    renderer.dispose?.();
  });

  test('cursor overlays are not repainted on idle or unrelated row damage', () => {
    const { renderer } = makeRenderer();
    const { renderable, dirty, lines } = makeRenderable(20, 4, ['abc', 'def']);
    let overlays = 0;
    const context = (renderer as any).ctx;
    context.fillRect = () => { if (context.globalAlpha === 0.5) overlays++; };
    renderer.render(renderable, true, 0);
    overlays = 0;
    renderer.render(renderable, false, 0);
    expect(overlays).toBe(0);
    lines[1][0].codepoint = 90; dirty.add(1);
    renderer.render(renderable, false, 0);
    expect(overlays).toBe(0);
    renderer.dispose();
  });

  test('idle frames do not recompute Rust row damage', async () => {
    const term = await makeWasm();
    const { renderer } = makeRenderer();
    try {
      renderer.render(term, true, 0);
      const clears = countCalls(term, 'akitty_vt_clean');
      for (let i = 0; i < 10; i++) renderer.render(term, false, 0);
      expect(clears.count()).toBe(0);
    } finally { renderer.dispose(); term.free(); }
  });

  test('an idle frame allocates no per-row hashes and reads no rows', () => {
    const { renderer } = makeRenderer();
    const { renderable, viewLines } = makeRenderable(20, 4, ['abc']);
    const dirty = new Set<number>();
    renderable.isDirty = () => dirty.size > 0;
    renderer.render(renderable, true, 0);
    const reads = viewLines();

    renderer.render(renderable, false, 0);
    expect(viewLines()).toBe(reads);
    renderer.dispose?.();
  });

  test('a monitor change rescales the canvas', () => {
    const original = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 1;
      const { renderer } = makeRenderer();
      const r = renderer as any;
      r.metrics = { width: 9, height: 17, baseline: 13 };
      const { renderable } = makeRenderable(20, 4, ['abc']);

      renderer.render(renderable, true, 0);
      expect([r.canvas.width, r.canvas.height]).toEqual([180, 68]);

      window.devicePixelRatio = 2;
      renderer.render(renderable, false, 0);
      expect(r.devicePixelRatio).toBe(2);
      expect([r.canvas.width, r.canvas.height]).toEqual([360, 136]);
      renderer.dispose?.();
    } finally {
      window.devicePixelRatio = original;
    }
  });

  test('an explicit devicePixelRatio is not overridden by the window', () => {
    const original = window.devicePixelRatio;
    try {
      const { renderer } = makeRenderer({ devicePixelRatio: 1.5 });
      const r = renderer as any;
      r.metrics = { width: 9, height: 17, baseline: 13 };
      const resize = vi.spyOn(r, 'resize');
      const { renderable } = makeRenderable(20, 4, ['abc']);
      renderer.render(renderable, true, 0);

      window.devicePixelRatio = 2;
      resize.mockClear();
      renderer.render(renderable, false, 0);
      expect(r.devicePixelRatio).toBe(1.5);
      expect(resize).not.toHaveBeenCalled();
      renderer.dispose?.();
    } finally {
      window.devicePixelRatio = original;
    }
  });

  test('an outside change to the backing store is repaired', () => {
    const { renderer } = makeRenderer();
    const r = renderer as any;
    r.metrics = { width: 9, height: 17, baseline: 13 };
    const { renderable } = makeRenderable(20, 4, ['abc']);
    renderer.render(renderable, true, 0);

    // handleFontChange() in terminal.ts sizes the canvas itself, without the DPR scale.
    r.canvas.width = 10;
    renderer.render(renderable, false, 0);
    expect(r.canvas.width).toBe(180);
    renderer.dispose?.();
  });

  test('a frame with no dirty rows does not poll them', async () => {
    const { renderer } = makeRenderer();
    const { renderable, dirty } = makeRenderable(20, 4, ['abc']);
    let polls = 0;
    const isRowDirty = renderable.isRowDirty.bind(renderable);
    renderable.isRowDirty = (y) => (polls++, isRowDirty(y));
    renderable.isDirty = () => dirty.size > 0;

    renderer.render(renderable, true, 0);
    polls = 0;
    renderer.render(renderable, false, 0);
    expect(polls).toBe(0);

    dirty.add(2);
    renderer.render(renderable, false, 0);
    expect(polls).toBeGreaterThan(0);
    renderer.dispose?.();
  });

  test('a still view scrolled into history draws nothing per frame', async () => {
    const { renderer, counts, reset } = makeRenderer();
    const { renderable, dirty } = makeRenderable(20, 4, ['abc']);
    const history: TerminalCell[] = Array.from({ length: 20 }, () => ({
      codepoint: 'h'.codePointAt(0)!,
      fg_r: 1,
      fg_g: 1,
      fg_b: 1,
      bg_r: 0,
      bg_g: 0,
      bg_b: 0,
      flags: 0,
      width: 1,
      hyperlink_id: 0,
      grapheme_len: 0,
    }));
    const scrollback = { getScrollbackLine: () => history, getScrollbackLength: () => 10 };

    renderer.render(renderable, false, 2, scrollback, 0);
    expect(counts.fillText).toBeGreaterThan(0);
    reset();
    renderer.render(renderable, false, 2, scrollback, 0);
    expect(counts.fillText).toBe(0);

    // Output while scrolled back repaints, because screen rows no longer map one-to-one onto viewport rows.
    dirty.add(1);
    renderer.render(renderable, false, 2, scrollback, 0);
    expect(counts.fillText).toBeGreaterThan(0);
    renderer.dispose?.();
  });

  test('a blinking cursor redraws its row only when the blink phase flips', async () => {
    const canvas = document.createElement('canvas');
    const renderer = new CanvasRenderer(canvas, { fontSize: 15, cursorBlink: true });
    const ctx = (renderer as any).ctx;
    let fillTexts = 0;
    ctx.fillText = () => void fillTexts++;
    const { renderable } = makeRenderable(20, 4, ['abc']);

    renderer.render(renderable, true, 0);
    fillTexts = 0;
    renderer.render(renderable, false, 0);
    renderer.render(renderable, false, 0);
    expect(fillTexts).toBe(0);

    (renderer as any).cursorVisible = false;
    renderer.render(renderable, false, 0);
    expect(fillTexts).toBe(3); // the cursor row, with the cursor erased
    renderer.dispose?.();
  });
});

describe('CanvasRenderer row reuse', () => {
  // The renderer's record of what each row shows must equal that row's real content after every frame, or a later
  // frame would skip a row whose pixels are stale.
  function expectBookkeepingMatches(renderer: CanvasRenderer, term: AkittyTerminal, rows: number): void {
    const r = renderer as any;
    r.frameLines = [];
    const expected = Array.from({ length: rows }, (_, y) => r.rowHash(term, y));
    expect(r.drawnRows).toEqual(expected);
  }
  function lines(count: number, from = 0): string {
    return Array.from({ length: count }, (_, i) => `line ${from + i}`).join('\r\n');
  }

  test('a screen that scrolled is moved with one copy and only the new rows are drawn', async () => {
    const term = await makeWasm(20, 12);
    const { renderer, counts, reset } = makeRenderer();
    term.write(lines(12));
    renderer.render(term, true, 0);
    const fullFrame = counts.fillText;
    reset();

    term.write('\r\n' + 'line 12');
    renderer.render(term, false, 0);
    expect(counts.drawImage).toBe(1);
    // Row 0 (it may hold overflow from the row that scrolled away) and the new bottom row with the cursor rows and
    // their neighbours: 5 of 12 rows.
    expect(counts.fillText).toBeLessThan(fullFrame * 0.5);
    expectBookkeepingMatches(renderer, term, 12);

    reset();
    term.write('\r\n' + lines(3, 13)); // a burst that scrolls three rows in one frame
    renderer.render(term, false, 0);
    expect(counts.drawImage).toBe(1);
    expectBookkeepingMatches(renderer, term, 12);
    renderer.dispose();
    term.free();
  });

  test('rewriting the text a row already shows draws nothing', async () => {
    const term = await makeWasm(20, 5);
    const { renderer, counts, reset } = makeRenderer();
    term.write(lines(5) + '\x1b[5;1H');
    renderer.render(term, true, 0);
    reset();

    // A full-screen program repainting an unchanged screen: every row is dirty, none changed.
    term.write('\x1b[H' + lines(5) + '\x1b[5;1H');
    renderer.render(term, false, 0);
    expect(counts.fillText).toBe(0);
    expect(counts.drawImage).toBe(0);

    term.write('\x1b[2;1HLINE');
    renderer.render(term, false, 0);
    expect(counts.fillText).toBeGreaterThan(0);
    expectBookkeepingMatches(renderer, term, 5);
    renderer.dispose();
    term.free();
  });

  test('rows that may overflow into their neighbours are redrawn when dirty, as before', async () => {
    const term = await makeWasm(20, 5);
    const { renderer, counts, reset } = makeRenderer();
    term.write('\x1b[2;1H漢字 😀\x1b[5;1H');
    renderer.render(term, true, 0);
    reset();
    term.write('\x1b[2;1H漢字 😀\x1b[5;1H');
    renderer.render(term, false, 0);
    expect(counts.fillText).toBeGreaterThan(0);
    renderer.dispose();
    term.free();
  });

  test('no copy where it could blur or blend: fractional device-pixel rows, translucent background', async () => {
    for (const options of [{ devicePixelRatio: 1.5 }, { theme: { background: 'rgba(0, 0, 0, 0.5)' } }]) {
      const term = await makeWasm(20, 5);
      const { renderer, counts, reset } = makeRenderer(options);
      const r = renderer as any;
      // An odd row height makes 1.5x rows fractional whatever the test environment measured.
      r.metrics = { ...r.metrics, height: 17 };
      term.write(lines(5));
      renderer.render(term, true, 0);
      reset();
      term.write('\r\n' + 'line 5');
      renderer.render(term, false, 0);
      expect(counts.drawImage).toBe(0);
      expect(counts.fillText).toBeGreaterThan(0);
      renderer.dispose();
      term.free();
    }
  });

  test('a selection, a hovered link or a scrolled-back view turns reuse off', async () => {
    const term = await makeWasm(20, 5);
    const { renderer, counts, reset } = makeRenderer();
    term.write(lines(5));
    renderer.render(term, true, 0);

    renderer.setHoveredLinkRange({ startX: 0, startY: 0, endX: 3, endY: 0 });
    reset();
    term.write('\r\n' + 'line 5');
    renderer.render(term, false, 0);
    expect(counts.drawImage).toBe(0);
    expect((renderer as any).drawnRows).toEqual([]);

    renderer.setHoveredLinkRange(null);
    renderer.render(term, true, 0);
    expectBookkeepingMatches(renderer, term, 5);
    renderer.dispose();
    term.free();
  });

  test('history growing behind a hidden scrollbar does not force a full redraw', async () => {
    const { renderer, counts, reset } = makeRenderer();
    const { renderable, dirty } = makeRenderable(20, 4, ['abc', 'def']);
    let length = 0;
    const scrollback = { getScrollbackLine: () => null, getScrollbackLength: () => length };
    renderer.render(renderable, true, 0, scrollback, 0);
    reset();
    length = 5;
    renderer.render(renderable, false, 0, scrollback, 0);
    expect(counts.fillText).toBe(0);

    // A visible scrollbar does depend on the history length.
    length = 6;
    dirty.clear();
    renderer.render(renderable, false, 0, scrollback, 1);
    expect(counts.fillText).toBeGreaterThan(0);
    renderer.dispose?.();
  });
});

describe('Terminal render loop', () => {
  test('keeps rendering after a frame throws', async () => {
    const term = await createIsolatedTerminal({ cols: 20, rows: 4 });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    term.open(container);

    const renderer = term.renderer!;
    const original = renderer.render.bind(renderer);
    let calls = 0;
    const forced: boolean[] = [];
    renderer.render = ((...args: Parameters<typeof original>) => {
      calls++;
      forced.push(args[1] === true);
      if (calls === 2) throw new Error('boom');
      return original(...args);
    }) as typeof renderer.render;

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls).toBeGreaterThan(3);
    expect(error).toHaveBeenCalledTimes(1);
    expect(forced[2]).toBe(true); // the frame after a failure is a full redraw

    error.mockRestore();
    term.dispose();
    container.remove();
  });

  test('a font change resizes the canvas once and keeps the device-pixel scale', async () => {
    const original = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 2;
      const term = await createIsolatedTerminal({ cols: 20, rows: 4 });
      const container = document.createElement('div');
      document.body.appendChild(container);
      term.open(container);

      const renderer = term.renderer!;
      const resize = vi.spyOn(renderer as any, 'resize');
      term.options.fontSize = 18;

      expect(resize).toHaveBeenCalledTimes(1);
      const { width } = renderer.getMetrics();
      expect((renderer as any).canvas.width).toBe(Math.round(20 * width * 2));

      term.dispose();
      container.remove();
    } finally {
      window.devicePixelRatio = original;
    }
  });
});

describe('Terminal visibility', () => {
  test('does not render while off-screen and redraws fully when shown again', async () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
    let disconnected = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe() {}
        disconnect() {
          disconnected = true;
        }
      }
    );

    try {
      const term = await createIsolatedTerminal({ cols: 20, rows: 4 });
      const container = document.createElement('div');
      document.body.appendChild(container);
      term.open(container);

      const renderer = term.renderer!;
      const original = renderer.render.bind(renderer);
      const forced: boolean[] = [];
      renderer.render = ((...args: Parameters<typeof original>) => {
        forced.push(args[1] === true);
        return original(...args);
      }) as typeof renderer.render;
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      await wait(80);
      expect(forced.length).toBeGreaterThan(1);

      notify([{ isIntersecting: false }]);
      await wait(40); // let any frame already scheduled finish
      const hiddenAt = forced.length;
      term.write('output while hidden');
      await wait(120);
      expect(forced.length).toBe(hiddenAt);

      notify([{ isIntersecting: true }]);
      await wait(80);
      expect(forced.length).toBeGreaterThan(hiddenAt);
      expect(forced[hiddenAt]).toBe(true); // first frame back is a full redraw
      expect(forced.slice(hiddenAt + 1).every((full) => !full)).toBe(true);

      term.dispose();
      expect(disconnected).toBe(true);
      container.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test.each(["fadeInScrollbar", "fadeOutScrollbar"])("renewed activity supersedes %s", async (animation) => {
    const term = await createIsolatedTerminal({ cols: 20, rows: 4 })
    const terminal = term as any
    let nextId = 0
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++
      pending.set(id, callback)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id))
    const clock = vi.spyOn(Date, "now").mockReturnValue(0)
    const container = document.createElement("div")
    try {
      term.open(container)
      terminal.scrollbarVisible = true
      terminal.scrollbarOpacity = 1
      terminal[animation]()
      terminal.showScrollbar()
      clock.mockReturnValue(100)
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(100))
      expect(terminal.scrollbarVisible).toBe(true)
      expect(terminal.scrollbarOpacity).toBe(1)
    } finally {
      term.dispose()
      clock.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test.each(["fadeInScrollbar", "fadeOutScrollbar"])("stops %s callbacks after disposal", async (animation) => {
    let nextId = 0
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++
      pending.set(id, callback)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id))
    const term = await createIsolatedTerminal({ cols: 20, rows: 4 })
    const terminal = term as any
    const container = document.createElement("div")
    try {
      term.open(container)
      terminal[animation]()
      term.dispose()
      // A scrollbar callback already queued before disposal must not create another frame chain.
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(0))
      expect(pending.size).toBe(0)
    } finally {
      term.dispose()
      container.remove()
      vi.unstubAllGlobals()
    }
  })

  test('stops scheduling frames while off-screen and resumes with a full redraw when shown', async () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame');

    try {
      const term = await createIsolatedTerminal({ cols: 20, rows: 4 });
      const container = document.createElement('div');
      document.body.appendChild(container);
      term.open(container);

      const renderer = term.renderer!;
      const original = renderer.render.bind(renderer);
      const forced: boolean[] = [];
      renderer.render = ((...args: Parameters<typeof original>) => {
        forced.push(args[1] === true);
        return original(...args);
      }) as typeof renderer.render;
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      await wait(80);
      expect(frames.mock.calls.length).toBeGreaterThan(1);
      // Scroll up with history present so hidden output takes the auto-scroll and scrollbar-fade paths.
      term.write('\r\n'.repeat(12));
      await wait(40);
      term.scrollLines(-2);
      await wait(40);

      notify([{ isIntersecting: false }]);
      await wait(40); // the frame already scheduled observes onScreen=false and parks
      const parkedAt = frames.mock.calls.length;
      const renderedAt = forced.length;
      term.write('output while hidden\r\n');
      await wait(120);
      expect(frames.mock.calls.length).toBe(parkedAt);
      expect(forced.length).toBe(renderedAt);

      notify([{ isIntersecting: true }]);
      expect(forced.length).toBe(renderedAt + 1); // restarted synchronously on the visible edge
      expect(forced[renderedAt]).toBe(true);
      notify([{ isIntersecting: true }]); // a duplicate visible notification must not start a second loop
      expect(forced.length).toBe(renderedAt + 1);
      await wait(80);
      expect(frames.mock.calls.length).toBeGreaterThan(parkedAt + 1);

      // A second cycle parks again, and disposing while parked schedules nothing further.
      notify([{ isIntersecting: false }]);
      await wait(40);
      const parkedAgainAt = frames.mock.calls.length;
      await wait(60);
      expect(frames.mock.calls.length).toBe(parkedAgainAt);
      term.dispose();
      await wait(40);
      expect(frames.mock.calls.length).toBe(parkedAgainAt);
      container.remove();
    } finally {
      frames.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
