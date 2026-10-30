/**
 * Hot-path behavior: the viewport is parsed once per change, writes do not allocate in wasm memory per call, the
 * renderer skips work that cannot change pixels, and a throwing frame does not end the render loop.
 */

import { describe, expect, test, vi } from 'vitest';
import { Ghostty } from './ghostty';
import type { GhosttyTerminal } from './ghostty';
import { type IRenderable, CanvasRenderer } from './renderer';
import { createIsolatedTerminal } from './test-helpers';
import type { GhosttyCell } from './types';

async function makeWasm(cols = 20, rows = 5): Promise<GhosttyTerminal> {
  const ghostty = await Ghostty.load();
  return ghostty.createTerminal(cols, rows);
}

function rowText(cells: GhosttyCell[] | null): string {
  return (cells ?? []).map((c) => (c.codepoint ? String.fromCodePoint(c.codepoint) : ' ')).join('').trimEnd();
}

function countCalls(term: GhosttyTerminal, name: string): { count: () => number } {
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

describe('GhosttyTerminal viewport cache', () => {
  test('reading every row parses the viewport once', async () => {
    const term = await makeWasm();
    term.write('one\r\ntwo\r\nthree');
    const reads = countCalls(term, 'ghostty_render_state_get_viewport');

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

describe('GhosttyTerminal write path', () => {
  test('reuses one wasm buffer across writes', async () => {
    const term = await makeWasm();
    const allocs = countCalls(term, 'ghostty_wasm_alloc_u8_array');
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
  const cell = (ch: string, flags = 0): GhosttyCell => ({
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

function makeRenderer() {
  const canvas = document.createElement('canvas');
  const renderer = new CanvasRenderer(canvas, { fontSize: 15, cursorBlink: false });
  const ctx = (renderer as any).ctx;
  const counts = { fillText: 0, fillRect: 0, fontSets: 0, fillSets: 0 };
  ctx.fillText = () => void counts.fillText++;
  ctx.fillRect = () => void counts.fillRect++;
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
    counts.fillText = counts.fillRect = counts.fontSets = counts.fillSets = 0;
  };
  return { renderer, counts, reset };
}

describe('CanvasRenderer work skipping', () => {
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

  test('a still view scrolled into history draws nothing per frame', async () => {
    const { renderer, counts, reset } = makeRenderer();
    const { renderable, dirty } = makeRenderable(20, 4, ['abc']);
    const history: GhosttyCell[] = Array.from({ length: 20 }, () => ({
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
});
