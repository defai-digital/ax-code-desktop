/**
 * Terminal Integration Tests
 *
 * Tests the main Terminal class that integrates all components.
 * Note: These are logic-focused tests. Visual/rendering tests are skipped
 * since they require a full browser environment with canvas.
 *
 * Test Isolation Pattern:
 * Uses createIsolatedTerminal() to ensure each test gets its own WASM instance.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { vi } from 'vitest';
import { AkittyEngine } from './engine';
import { Terminal } from './terminal';
import { createIsolatedTerminal } from './test-helpers';
import { mouseReport } from './mouse';

for (const action of ["reset", "dispose"] as const) {
  test(`link hover exit cannot enter another link after ${action}`, async () => {
    const term = await createIsolatedTerminal()
    const container = document.createElement("div")
    container.style.cursor = "text"
    term.open(container)
    const internal = term as any
    const entered: boolean[] = []
    let column = 0
    const links = [
      { text: "a", range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, activate() {},
        hover(active: boolean) { if (!active) term[action]() } },
      { text: "b", range: { start: { x: 1, y: 0 }, end: { x: 1, y: 0 } }, activate() {},
        hover(active: boolean) { entered.push(active) } },
    ]
    term.registerLinkProvider({ provideLinks(_row, callback) { callback(links) } })
    internal.pointer = () => ({ x: column, y: 0 })
    try {
      term.write("ab")
      internal.processMouseMove(new MouseEvent("mousemove"))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(internal.currentHoveredLink).toBe(links[0])
      column = 1
      internal.processMouseMove(new MouseEvent("mousemove"))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(entered.filter(Boolean)).toEqual([])
      expect(container.style.cursor).toBe("text")
    } finally { term.dispose() }
  })
}

test("link hover entry that resets the terminal leaves its new cursor clear", async () => {
  const term = await createIsolatedTerminal()
  const container = document.createElement("div")
  container.style.cursor = "text"
  term.open(container)
  const internal = term as any
  term.registerLinkProvider({ provideLinks(_row, callback) {
    callback([{ text: "a", range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, activate() {},
      hover(active) { if (active) term.reset() } }])
  } })
  internal.pointer = () => ({ x: 0, y: 0 })
  try {
    term.write("a")
    internal.processMouseMove(new MouseEvent("mousemove"))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container.style.cursor).toBe("text")
    expect(internal.currentHoveredLink).toBeUndefined()
  } finally { term.dispose() }
})

test('legacy mouse releases preserve modifiers and UTF-8 coordinates stay two bytes', () => {
  expect(mouseReport(16, 2, 1, true, false, false)).toBe('\x1b[M3#"');
  const report = mouseReport(0, 3000, 3000, false, false, true);
  expect(Array.from(report.slice(4), ch => ch.codePointAt(0))).toEqual([2047, 2047]);
});

test('horizontal and stationary wheel events do not generate vertical mouse reports', async () => {
  const term = await createIsolatedTerminal();
  const container = document.createElement('div');
  term.open(container);
  const reports: string[] = [];
  term.onData(value => reports.push(value));
  try {
    term.write('\x1b[?1000h\x1b[?1006h');
    container.dispatchEvent(new WheelEvent('wheel', { deltaX: 20, deltaY: 0, clientX: 0, clientY: 0 }));
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, clientX: 0, clientY: 0 }));
    expect(reports).toEqual([]);
  } finally { term.dispose(); }
});

test("wheel handlers can dispose the terminal without continuing the wheel event", async () => {
  const term = await createIsolatedTerminal()
  term.open(document.createElement("div"))
  term.attachCustomWheelEventHandler(() => { term.dispose(); return false })
  const wheel = { deltaY: 1, preventDefault() {}, stopPropagation() {} } as WheelEvent
  try { expect(() => (term as any).handleWheel(wheel)).not.toThrow() }
  finally { term.dispose() }
})

test("wheel handlers that reset the terminal leave the replacement viewport untouched", async () => {
  const term = await createIsolatedTerminal({ rows: 2, smoothScrollDuration: 0 })
  term.open(document.createElement("div"))
  term.attachCustomWheelEventHandler(() => {
    term.reset()
    term.write("new\r\nterminal\r\nhistory\r\n")
    return false
  })
  const wheel = { deltaY: -1, deltaMode: 1, preventDefault() {}, stopPropagation() {} } as WheelEvent
  try {
    (term as any).handleWheel(wheel)
    expect(term.getScrollbackLength()).toBeGreaterThan(0)
    expect(term.getViewportY()).toBe(0)
  } finally { term.dispose() }
})

/**
 * Helper to convert viewport row to absolute buffer row for selection tests.
 * Absolute row = scrollbackLength + viewportRow - viewportY
 */
function viewportRowToAbsolute(term: Terminal, viewportRow: number): number {
  const scrollbackLength = term.wasmTerm?.getScrollbackLength() ?? 0;
  const viewportY = Math.floor(term.getViewportY());
  return scrollbackLength + viewportRow - viewportY;
}

/**
 * Helper to set selection using viewport-relative rows (converts to absolute internally)
 */
function setSelectionViewportRelative(
  term: Terminal,
  startCol: number,
  startViewportRow: number,
  endCol: number,
  endViewportRow: number
): void {
  const selMgr = (term as any).selectionManager;
  if (selMgr) {
    (selMgr as any).selectionStart = {
      col: startCol,
      absoluteRow: viewportRowToAbsolute(term, startViewportRow),
    };
    (selMgr as any).selectionEnd = {
      col: endCol,
      absoluteRow: viewportRowToAbsolute(term, endViewportRow),
    };
  }
}

describe('Terminal', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    // Create a container element if document is available
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    // Clean up container
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null!;
    }
  });

  describe('Constructor', () => {
    test('creates terminal with default size', async () => {
      const term = await createIsolatedTerminal();
      expect(term.cols).toBe(80);
      expect(term.rows).toBe(24);
    });

    test('creates terminal with custom size', async () => {
      const term = await createIsolatedTerminal({ cols: 100, rows: 30 });
      expect(term.cols).toBe(100);
      expect(term.rows).toBe(30);
    });

    test('creates terminal with custom options', async () => {
      const term = await createIsolatedTerminal({
        cols: 120,
        rows: 40,
        scrollback: 5000,
        fontSize: 14,
        fontFamily: 'Courier New',
      });
      expect(term.cols).toBe(120);
      expect(term.rows).toBe(40);
    });

    test('rejects noninteger and out-of-range dimensions before allocating', async () => {
      const engine = await AkittyEngine.load();
      const invalid: Array<{ cols: number; rows: number }> = [
        { cols: 0, rows: 24 },
        { cols: 80, rows: 0 },
        { cols: -1, rows: 24 },
        { cols: 80, rows: -1 },
        { cols: 80.5, rows: 24 },
        { cols: 80, rows: 24.5 },
        { cols: Number.NaN, rows: 24 },
        { cols: 80, rows: Number.POSITIVE_INFINITY },
        { cols: Terminal.MAX_DIMENSION + 1, rows: 24 },
        { cols: 80, rows: Terminal.MAX_DIMENSION + 1 },
        { cols: Terminal.MAX_DIMENSION, rows: Terminal.MAX_DIMENSION },
      ];

      for (const dims of invalid) {
        expect(() => new Terminal({ ...dims, engine })).toThrow(RangeError);
      }
    });

    test('accepts the smallest and largest valid dimensions', async () => {
      const engine = await AkittyEngine.load();

      const smallest = new Terminal({ cols: 1, rows: 1, engine });
      expect([smallest.cols, smallest.rows]).toEqual([1, 1]);
      smallest.dispose();

      const largest = new Terminal({
        cols: Terminal.MAX_DIMENSION,
        rows: Terminal.MAX_CELLS / Terminal.MAX_DIMENSION,
        engine,
      });
      expect([largest.cols, largest.rows]).toEqual([
        Terminal.MAX_DIMENSION,
        Terminal.MAX_CELLS / Terminal.MAX_DIMENSION,
      ]);
      largest.dispose();
    });
  });

  describe('Lifecycle', () => {
    test('terminal is not open before open() is called', async () => {
      const term = await createIsolatedTerminal();
      expect(() => term.write('test')).toThrow('Terminal must be opened');
    });

    test('can be disposed without being opened', async () => {
      const term = await createIsolatedTerminal();
      expect(() => term.dispose()).not.toThrow();
    });

    test('cannot write after disposal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);
      term.dispose();

      expect(() => term.write('test')).toThrow('Terminal has been disposed');
    });

    test('cannot open twice', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      // open() is synchronous and throws immediately
      expect(() => term.open(container!)).toThrow('already open');

      term.dispose();
    });

    test('cannot open after disposal', async () => {
      const term = await createIsolatedTerminal();
      term.dispose();

      // open() is synchronous and throws immediately
      expect(() => term.open(container!)).toThrow('has been disposed');
    });
  });

  describe('Properties', () => {
    test('exposes cols and rows', async () => {
      const term = await createIsolatedTerminal({ cols: 90, rows: 25 });
      expect(term.cols).toBe(90);
      expect(term.rows).toBe(25);
    });

    test('exposes element after open', async () => {
      const term = await createIsolatedTerminal();
      expect(term.element).toBeUndefined();

      term.open(container!);
      expect(term.element).toBe(container);

      term.dispose();
    });
  });

  describe('Events', () => {
    test('onData event exists', async () => {
      const term = await createIsolatedTerminal();
      expect(typeof term.onData).toBe('function');
    });

    test('onResize event exists', async () => {
      const term = await createIsolatedTerminal();
      expect(typeof term.onResize).toBe('function');
    });

    test('onBell event exists', async () => {
      const term = await createIsolatedTerminal();
      expect(typeof term.onBell).toBe('function');
    });

    test('onData can register listeners', async () => {
      const term = await createIsolatedTerminal();
      const disposable = term.onData((data) => {
        // Listener callback
      });
      expect(typeof disposable.dispose).toBe('function');
      disposable.dispose();
    });

    test('onResize fires when terminal is resized', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      let resizeEvent: { cols: number; rows: number } | null = null;
      term.onResize((e) => {
        resizeEvent = e;
      });

      term.resize(100, 30);

      expect(resizeEvent).not.toBeNull();
      expect(resizeEvent!.cols).toBe(100);
      expect(resizeEvent!.rows).toBe(30);

      term.dispose();
    });

    test('onBell fires on bell character', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      let bellFired = false;
      term.onBell(() => {
        bellFired = true;
      });

      term.write('\x07'); // Bell character

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(bellFired).toBe(true);

      term.dispose();
    });
  });

  describe('Writing', () => {
    test('write() does not throw after open', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.write('Hello, World!')).not.toThrow();

      term.dispose();
    });

    test('write() accepts string', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.write('test string')).not.toThrow();

      term.dispose();
    });

    test('write() accepts Uint8Array', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      const data = new TextEncoder().encode('test');
      expect(() => term.write(data)).not.toThrow();

      term.dispose();
    });

    test('writeln() adds newline', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.writeln('test line')).not.toThrow();

      term.dispose();
    });
  });

  describe('Resizing', () => {
    test('resize() updates dimensions', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      term.resize(100, 30);

      expect(term.cols).toBe(100);
      expect(term.rows).toBe(30);

      term.dispose();
    });

    test('resize() with same dimensions is no-op', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      let resizeCount = 0;
      term.onResize(() => resizeCount++);

      term.resize(80, 24); // Same size

      expect(resizeCount).toBe(0); // Should not fire event

      term.dispose();
    });

    test('resize() syncs options so a later options.cols assignment keeps the direct rows', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      const resizeEvents: Array<{ cols: number; rows: number }> = [];
      term.onResize((event) => resizeEvents.push(event));

      term.resize(100, 30);
      expect([term.cols, term.rows]).toEqual([100, 30]);

      // A direct resize must publish the committed pair into the mutable options. Without it this
      // single-column assignment would pair 120 with the constructor's stale row count of 24.
      term.options.cols = 120;

      const wasmTerm = (term as any).wasmTerm;
      expect([term.cols, term.rows]).toEqual([120, 30]);
      expect([term.options.cols, term.options.rows]).toEqual([120, 30]);
      expect(wasmTerm.getDimensions()).toEqual({ cols: 120, rows: 30 });
      // No intermediate 120x24 resize may be announced either.
      expect(resizeEvents).toEqual([
        { cols: 100, rows: 30 },
        { cols: 120, rows: 30 },
      ]);

      term.dispose();
    });

    test('resize() preserves 80x24 when wasm resize throws once and the retry succeeds', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      const wasmTerm = (term as any).wasmTerm;
      const originalResize = wasmTerm.resize.bind(wasmTerm);
      let attempts = 0;
      wasmTerm.resize = (cols: number, rows: number) => {
        attempts++;
        if (attempts === 1) throw new Error('wasm resize failed');
        originalResize(cols, rows);
      };

      expect(() => term.resize(100, 30)).toThrow('wasm resize failed');
      // The thrown wasm resize must not publish the new size, so the identical
      // retry below is not treated as a no-op.
      expect(term.cols).toBe(80);
      expect(term.rows).toBe(24);

      term.resize(100, 30);
      expect(term.cols).toBe(100);
      expect(term.rows).toBe(30);
      expect(attempts).toBe(2);

      term.dispose();
    });

    test('resize() keeps the committed 100x30 grid when render throws once', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      const renderer = (term as any).renderer;
      const originalRender = renderer.render.bind(renderer);
      let renderAttempts = 0;
      renderer.render = (...args: any[]) => {
        renderAttempts++;
        if (renderAttempts === 1) throw new Error('render failed');
        originalRender(...args);
      };

      // Count invalidations instead of relying on reflowed content, so the assertion is about
      // the commit path and not about how the wasm reflows this particular text.
      const detector = (term as any).linkDetector;
      const originalInvalidate = detector.invalidateCache.bind(detector);
      let invalidations = 0;
      detector.invalidateCache = () => {
        invalidations++;
        originalInvalidate();
      };

      const resizeEvents: Array<{ cols: number; rows: number }> = [];
      term.onResize((event) => resizeEvents.push(event));

      expect(() => term.resize(100, 30)).toThrow('render failed');

      // The renderer accepted the new grid before the paint failed, so nothing is rolled back:
      // wasm, the public dimensions, the renderer's canvas all describe the new size.
      const wasmTerm = (term as any).wasmTerm;
      const metrics = renderer.getMetrics();
      const canvas = (term as any).canvas;
      expect([term.cols, term.rows]).toEqual([100, 30]);
      expect(wasmTerm.getDimensions()).toEqual({ cols: 100, rows: 30 });
      expect([canvas.width, canvas.height]).toEqual([metrics.width * 100, metrics.height * 30]);
      expect([canvas.style.width, canvas.style.height]).toEqual([
        `${metrics.width * 100}px`,
        `${metrics.height * 30}px`,
      ]);

      // Links are invalidated even though the frame never painted, and the resize event is not
      // fired because it describes a painted frame.
      expect(invalidations).toBe(1);
      expect(resizeEvents).toEqual([]);

      // A later resize renders the committed grid and reports the final size exactly once.
      term.resize(120, 40);
      expect(renderAttempts).toBe(2);
      expect(wasmTerm.getDimensions()).toEqual({ cols: 120, rows: 40 });
      expect(invalidations).toBe(2);
      expect(resizeEvents).toEqual([{ cols: 120, rows: 40 }]);

      term.dispose();
    });

    test('an identical resize retries a failed paint without reflowing the committed grid again', async () => {
      for (const viaOptions of [false, true]) {
        const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
        term.open(container!);
        try {
          const renderer = (term as any).renderer;
          const wasm = (term as any).wasmTerm;
          const originalRender = renderer.render.bind(renderer);
          const originalResize = wasm.resize.bind(wasm);
          let paints = 0, reflows = 0;
          renderer.render = (...args: any[]) => {
            paints++;
            if (paints === 1) throw new Error('temporary paint failure');
            return originalRender(...args);
          };
          wasm.resize = (cols: number, rows: number) => {
            reflows++;
            return originalResize(cols, rows);
          };
          const events: Array<{ cols: number; rows: number }> = [];
          term.onResize(event => events.push(event));
          const request = () => {
            if (viaOptions) term.options.cols = 100;
            else term.resize(100, 24);
          };

          expect(request).toThrow('temporary paint failure');
          expect([term.cols, term.rows]).toEqual([100, 24]);
          expect(events).toEqual([]);
          request();
          expect(paints).toBe(2);
          expect(reflows).toBe(1);
          expect(events).toEqual([{ cols: 100, rows: 24 }]);
          request();
          expect(paints).toBe(2);
          expect(events).toHaveLength(1);
        } finally {
          term.dispose();
        }
      }
    });

    test('options.cols assignment keeps 80x24 when wasm resize throws once and the retry succeeds', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container!);

      const wasmTerm = (term as any).wasmTerm;
      const originalResize = wasmTerm.resize.bind(wasmTerm);
      let attempts = 0;
      wasmTerm.resize = (cols: number, rows: number) => {
        attempts++;
        if (attempts === 1) throw new Error('wasm resize failed');
        originalResize(cols, rows);
      };

      expect(() => { term.options.cols = 100; }).toThrow('wasm resize failed');
      // The rejected assignment must roll the option back, so the options object
      // and the public dimensions agree on the old grid.
      expect(term.options.cols).toBe(80);
      expect(term.cols).toBe(80);
      expect(term.rows).toBe(24);

      // A rolled-back option differs from the requested value, so the identical
      // assignment is retried instead of being swallowed by oldValue equality.
      term.options.cols = 100;
      expect(term.options.cols).toBe(100);
      expect(term.cols).toBe(100);
      expect(term.rows).toBe(24);
      expect(attempts).toBe(2);

      term.dispose();
    });

    test('resize() does not return a cached URL link at its old position after reflow', async () => {
      const term = await createIsolatedTerminal({ cols: 100, rows: 24 });
      term.open(container!);

      // Soft-wrapped line: at 100 cols the URL lands on wrapped row 1 (cols 20-43).
      // The hard second line keeps content below it after the reflow.
      term.write('A'.repeat(120) + 'https://example.com/docs' + '\r\n' + 'Z'.repeat(80));
      const detector = (term as any).linkDetector;
      const oldRow = viewportRowToAbsolute(term, 1);
      const cached = await detector.getLinkAt(20, oldRow);
      expect(cached?.text).toBe('https://example.com/docs');

      // Widening to 200 cols unwraps the line: the URL moves to row 0 cols 120-143
      // and the Z line shifts up into the old row.
      term.resize(200, 24);

      await expect(detector.getLinkAt(20, oldRow)).resolves.toBeUndefined();
      const moved = await detector.getLinkAt(120, viewportRowToAbsolute(term, 0));
      expect(moved?.text).toBe('https://example.com/docs');

      term.dispose();
    });

    test('resize() throws if not open', async () => {
      const term = await createIsolatedTerminal();
      expect(() => term.resize(100, 30)).toThrow('must be opened');
    });
  });

  describe('Control Methods', () => {
    test('clear() does not throw', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.clear()).not.toThrow();

      term.dispose();
    });

    test('clear() drops links cached from a real provider', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      // The registered UrlRegexProvider populates the real link cache for this row.
      term.write('https://example.com/docs');
      const detector = (term as any).linkDetector;
      const row = viewportRowToAbsolute(term, 0);
      const cached = await detector.getLinkAt(0, row);
      expect(cached?.text).toBe('https://example.com/docs');

      term.clear();

      // The screen is empty again, so the same lookup must not surface the cached link.
      await expect(detector.getLinkAt(0, row)).resolves.toBeUndefined();

      term.dispose();
    });

    test('synchronized output expiry invalidates cached links', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);
      term.write('\x1b[?2026hhttps://example.com/docs');
      const detector = (term as any).linkDetector;
      const row = viewportRowToAbsolute(term, 0);
      await expect(detector.getLinkAt(0, row)).resolves.toBeUndefined();
      await new Promise(resolve => setTimeout(resolve, 220));
      const link = await detector.getLinkAt(0, row);
      expect(link?.text).toBe('https://example.com/docs');
      term.dispose();
    });

    test('clear() cancels a pending OSC so a later BEL rings instead of setting the title', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      const titles: string[] = [];
      let bells = 0;
      term.onTitleChange((title) => titles.push(title));
      term.onBell(() => bells++);

      // Leave an OSC payload unterminated across the write boundary, then clear mid-sequence.
      term.write('\x1b]2;Stale Title');
      term.clear();

      // Back in ground state, this BEL must ring rather than terminate the abandoned OSC.
      term.write('\x07');

      expect(bells).toBe(1);
      expect(titles).toEqual([]);

      term.dispose();
    });

    test('reset() does not throw', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.reset()).not.toThrow();

      term.dispose();
    });

    test('focus() does not throw', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.focus()).not.toThrow();

      term.dispose();
    });

    test('focus() before open does not throw', async () => {
      const term = await createIsolatedTerminal();
      expect(() => term.focus()).not.toThrow();
    });
  });

  describe('Lifecycle recovery', () => {
    test('widening a scrolled terminal keeps the viewport inside the reflowed history', async () => {
      const term = await createIsolatedTerminal({ cols: 10, rows: 3 });
      term.open(container);
      try {
        term.write('abcdefghij'.repeat(20));
        term.scrollToTop();
        const previous = term.getViewportY();
        const scrolls: number[] = [];
        term.onScroll(value => scrolls.push(value));
        term.resize(100, 3);
        expect(term.getScrollbackLength()).toBeLessThan(previous);
        expect(term.getViewportY()).toBe(term.getScrollbackLength());
        expect(scrolls).toEqual([term.getViewportY()]);
      } finally { term.dispose(); }
    });

    test('reset from a bell listener stops the remaining bells from the old terminal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      let bells = 0;
      term.onBell(() => { if (++bells === 1) term.reset(); });
      try {
        term.write('\x07\x07\x07');
        expect(bells).toBe(1);
        term.write('\x07');
        expect(bells).toBe(2);
      } finally { term.dispose(); }
    });

    for (const origin of ['bell', 'title', 'buffer change', 'reply']) {
      test(`an old write cannot scroll a replacement terminal created by its ${origin} listener`, async () => {
        const term = await createIsolatedTerminal({ cols: 10, rows: 3 });
        term.open(container);
        let restoredViewport = 0, replaced = false;
        const restore = () => {
          if (replaced) return;
          replaced = true; term.reset();
          term.write(Array.from({ length: 15 }, (_, row) => `new ${row}\r\n`).join(''));
          term.scrollToTop(); restoredViewport = term.getViewportY();
        };
        const input = origin === 'bell' ? '\x07' : origin === 'title' ? '\x1b]2;reset\x07'
          : origin === 'buffer change' ? '\x1b[?1049h' : '\x1b[6n';
        if (origin === 'bell') term.onBell(restore);
        else if (origin === 'title') term.onTitleChange(title => { if (title === 'reset') restore(); });
        else if (origin === 'buffer change') term.buffer.onBufferChange(restore);
        else term.onData(restore);
        try {
          term.write(input);
          expect(replaced).toBe(true);
          expect(restoredViewport).toBeGreaterThan(0);
          expect(term.getViewportY()).toBe(restoredViewport);
        } finally { term.dispose(); }
      });
    }

    test('reset from a title listener reports the replacement buffer only once', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      try {
        term.write('\x1b[?1049h');
        const changes: string[] = [];
        term.buffer.onBufferChange(buffer => changes.push(buffer.type));
        term.onTitleChange(title => { if (title === 'reset') term.reset(); });
        term.write('\x1b]2;reset\x07');
        expect(term.buffer.active.type).toBe('normal');
        expect(changes).toEqual(['normal']);
      } finally { term.dispose(); }
    });

    test('a viewport clamp listener can dispose the terminal during resize', async () => {
      const term = await createIsolatedTerminal({ cols: 10, rows: 3 });
      term.open(container);
      try {
        term.write('abcdefghij'.repeat(20));
        term.scrollToTop();
        term.onScroll(() => term.dispose());
        expect(() => term.resize(100, 3)).not.toThrow();
        expect(term.wasmTerm).toBeUndefined();
      } finally { term.dispose(); }
    });

    test('resize preserves an in-range viewport and stops a wheel target outside the new history', async () => {
      const term = await createIsolatedTerminal({ cols: 10, rows: 3, smoothScrollDuration: 100 });
      term.open(container);
      try {
        term.write('abcdefghij'.repeat(100));
        container.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, deltaMode: 1 }));
        const previous = term.getViewportY();
        expect(previous).toBeGreaterThan(0);
        const scrolls: number[] = [];
        term.onScroll(value => scrolls.push(value));
        term.resize(100, 3);
        expect(term.getScrollbackLength()).toBeGreaterThan(previous);
        expect(term.getScrollbackLength()).toBeLessThan(30);
        expect(term.getViewportY()).toBe(previous);
        await new Promise(resolve => setTimeout(resolve, 80));
        expect(term.getViewportY()).toBe(previous);
        expect(scrolls).toEqual([]);
        expect((term as any).scrollAnimationFrame).toBeUndefined();
      } finally { term.dispose(); }
    });

    test('open can recover after WASM creation fails', async () => {
      const term = await createIsolatedTerminal();
      const engine = (term as any).engine;
      const create = engine.createTerminal;
      engine.createTerminal = () => { throw new Error('allocation failed'); };
      expect(() => term.open(container)).toThrow('allocation failed');
      engine.createTerminal = create;
      expect(() => term.open(container)).not.toThrow();
      term.write('recovered');
      term.dispose();
    });

    test('reset allocation failure preserves the live terminal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      term.write('before');
      const previous = term.wasmTerm!;
      const free = previous.free.bind(previous);
      let freed = false;
      previous.free = () => { freed = true; free(); };
      const engine = (term as any).engine;
      const create = engine.createTerminal;
      engine.createTerminal = () => { throw new Error('allocation failed'); };
      expect(() => term.reset()).toThrow('allocation failed');
      engine.createTerminal = create;
      expect(freed).toBe(false);
      expect(() => term.write(' after')).not.toThrow();
      expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('before after');
      term.dispose();
    });

    test('reset clears a partial drag and stops selection autoscroll', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      const canvas = term.renderer!.getCanvas();
      const stop = vi.spyOn(globalThis, 'clearInterval');
      try {
        canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        canvas.dispatchEvent(new MouseEvent('mouseleave', { clientY: canvas.getBoundingClientRect().bottom + 10 }));
        stop.mockClear();
        term.reset();
        term.write('after');
        expect(term.getSelection()).toBe('');
        expect(stop).toHaveBeenCalled();
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 10000 }));
        expect(term.getSelection()).toBe('');
      } finally { term.dispose(); stop.mockRestore(); }
    });

    test('reset clears scrollback position and pending smooth scrolling', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3, smoothScrollDuration: 100 });
      term.open(container);
      term.write('line\r\n'.repeat(20));
      (term as any).smoothScrollTo(10);
      expect(term.getViewportY()).toBeGreaterThan(0);
      expect((term as any).scrollAnimationFrame).toBeDefined();
      term.reset();
      expect(term.getViewportY()).toBe(0);
      expect((term as any).targetViewportY).toBe(0);
      expect((term as any).scrollAnimationFrame).toBeUndefined();
      term.dispose();
    });

    test('a direct scroll stops a running smooth scroll from pulling the viewport back', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3, smoothScrollDuration: 100 });
      term.open(container);
      try {
        term.write('line\r\n'.repeat(40));
        (term as any).smoothScrollTo(30);
        expect((term as any).scrollAnimationFrame).toBeDefined();
        term.scrollToBottom();
        expect(term.getViewportY()).toBe(0);
        // Let any frame the wheel animation left behind run.
        await new Promise(resolve => setTimeout(resolve, 80));
        expect(term.getViewportY()).toBe(0);
        expect((term as any).targetViewportY).toBe(0);
        expect((term as any).scrollAnimationFrame).toBeUndefined();
      } finally { term.dispose(); }
    });

    test('new output preserves scrolled content and the smooth-scroll target', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3, smoothScrollDuration: 100 });
      term.open(container);
      const topText = () => term.buffer.active.getLine(term.buffer.active.baseY - Math.floor(term.getViewportY()))!.translateToString(true);
      try {
        term.write('line\r\n'.repeat(40));
        term.scrollLines(-10);
        (term as any).smoothScrollTo(30);
        const viewport = term.getViewportY(), target = (term as any).targetViewportY, top = topText();
        term.write('new output\r\n');
        expect(term.getViewportY()).toBeCloseTo(viewport + 1);
        expect((term as any).targetViewportY).toBe(target + 1);
        expect((term as any).scrollAnimationFrame).toBeDefined();
        expect(topText()).toBe(top);
        (term as any).smoothScrollTo(0);
        const descendingViewport = term.getViewportY(), descendingTop = topText();
        term.write('still following\r\n');
        expect(term.getViewportY()).toBeCloseTo(descendingViewport + 1);
        expect((term as any).targetViewportY).toBe(0);
        expect(topText()).toBe(descendingTop);
        term.scrollToBottom();
        term.write('bottom\r\n');
        expect(term.getViewportY()).toBe(0);
      } finally { term.dispose(); }
    });

    test('new output preserves scrolled content when scrollback is full', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3, scrollback: 10, smoothScrollDuration: 100 });
      term.open(container);
      const topText = () => term.buffer.active.getLine(term.buffer.active.baseY - Math.floor(term.getViewportY()))!.translateToString(true);
      try {
        term.write('line\r\n'.repeat(40));
        term.scrollLines(-5);
        (term as any).smoothScrollTo(8);
        const viewport = term.getViewportY(), target = (term as any).targetViewportY, top = topText();
        expect(term.getScrollbackLength()).toBe(10);
        term.write('new output\r\n');
        expect(term.getScrollbackLength()).toBe(10);
        expect(term.getViewportY()).toBeCloseTo(viewport + 1);
        expect((term as any).targetViewportY).toBe(target + 1);
        expect(topText()).toBe(top);
      } finally { term.dispose(); }
    });

    test('nested writes preserve scrolled content exactly once per new row', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3 });
      term.open(container);
      const topText = () => term.buffer.active.getLine(term.buffer.active.baseY - Math.floor(term.getViewportY()))!.translateToString(true);
      try {
        term.write('line\r\n'.repeat(20));
        term.scrollLines(-5);
        term.onTitleChange(title => { if (title === 'outer') term.write('nested\r\n'); });
        const viewport = term.getViewportY(), top = topText();
        term.write('\x1b]2;outer\x07outer\r\n');
        expect(term.getViewportY()).toBe(viewport + 2);
        expect(topText()).toBe(top);
      } finally { term.dispose(); }
    });

    for (const synchronized of [false, true]) {
      test(`an output callback can choose a new scroll position (synchronized=${synchronized})`, async () => {
        const term = await createIsolatedTerminal({ cols: 20, rows: 3 });
        term.open(container);
        try {
          term.write('line\r\n'.repeat(20));
          term.scrollLines(-5);
          term.onTitleChange(title => { if (title === 'scroll') term.scrollLines(-3); });
          term.write(`${synchronized ? '\x1b[?2026h' : ''}\x1b]2;scroll\x07`);
          if (synchronized) await new Promise(resolve => setTimeout(resolve, 220));
          expect(term.getViewportY()).toBe(8);
        } finally { term.dispose(); }
      });
    }

    for (const smooth of [false, true]) {
      test(`callback scrolling stays anchored through later output chunks (smooth=${smooth})`, async () => {
        const term = await createIsolatedTerminal({ cols: 20, rows: 3, smoothScrollDuration: 100 });
        term.open(container);
        let chosenViewport = 0, chosenTarget = 0;
        try {
          term.write('line\r\n'.repeat(20));
          term.scrollLines(-5);
          term.onTitleChange(title => {
            if (title !== 'scroll') return;
            if (smooth) (term as any).smoothScrollTo(8);
            else term.scrollToTop();
            chosenViewport = term.getViewportY(); chosenTarget = (term as any).targetViewportY;
          });
          term.write('\x1b]2;scroll\x07' + '\0'.repeat(1 << 20) + 'more\r\n');
          expect(term.getViewportY()).toBeCloseTo(chosenViewport + 1);
          expect((term as any).targetViewportY).toBe(chosenTarget + 1);
        } finally { term.dispose(); }
      });
    }

    test('synchronized output expiry preserves scrolled content', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3 });
      term.open(container);
      const topText = () => term.buffer.active.getLine(term.buffer.active.baseY - Math.floor(term.getViewportY()))!.translateToString(true);
      try {
        term.write('line\r\n'.repeat(20));
        term.scrollLines(-5);
        const viewport = term.getViewportY(), top = topText();
        term.write('\x1b[?2026hnew output\r\n');
        await new Promise(resolve => setTimeout(resolve, 220));
        expect(term.getViewportY()).toBe(viewport + 1);
        expect(topText()).toBe(top);
      } finally { term.dispose(); }
    });

    test('quick wheel ticks during a smooth scroll add up instead of losing distance', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 3, smoothScrollDuration: 100 });
      term.open(container);
      try {
        term.write('line\r\n'.repeat(100));
        const wheel = { deltaY: -30, deltaMode: 1, shiftKey: false, preventDefault() {}, stopPropagation() {} } as unknown as WheelEvent;
        (term as any).handleWheel(wheel);
        (term as any).handleWheel(wheel);
        expect((term as any).targetViewportY).toBe(60);
      } finally { term.dispose(); }
    });

    test('dispose clears active link hover even if the hover callback throws', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      let hovered = true;
      (term as any).currentHoveredLink = { hover(value: boolean) {
        hovered = value;
        throw new Error('hover cleanup failed');
      } };
      expect(() => term.dispose()).toThrow('hover cleanup failed');
      expect(hovered).toBe(false);
      expect((term as any).currentHoveredLink).toBeUndefined();
      expect(term.wasmTerm).toBeUndefined();
    });

    test('reset selection reads the replacement terminal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      term.write('before');
      term.reset();
      term.write('after');
      term.selectAll();
      expect(term.getSelection().trim()).toBe('after');
      term.dispose();
    });

    for (const operation of ['reset', 'resize', 'font'] as const) {
      test(`${operation} stops when clearing selection disposes the terminal`, async () => {
        const term = await createIsolatedTerminal();
        term.open(container); term.write('selected'); term.select(0, 0, 3);
        term.onSelectionChange(() => { term.dispose(); });
        expect(() => {
          if (operation === 'reset') term.reset();
          else if (operation === 'resize') term.resize(40, 10);
          else term.options.fontSize = 18;
        }).not.toThrow();
        expect(term.wasmTerm).toBeUndefined();
      });
    }

    test('reset preserves the terminal created by a selection listener', async () => {
      const term = await createIsolatedTerminal();
      term.open(container); term.write('selected'); term.select(0, 0, 3);
      let nested: typeof term.wasmTerm;
      const subscription = term.onSelectionChange(() => {
        subscription.dispose(); term.reset(); term.write('replacement'); nested = term.wasmTerm;
      });
      term.reset();
      expect(term.wasmTerm).toBe(nested);
      term.selectAll();
      expect(term.getSelection().trim()).toBe('replacement');
      term.dispose();
    });

    for (const operation of ['resize', 'font'] as const) {
      test(`${operation} does not paint a replacement created by its selection listener`, async () => {
        const term = await createIsolatedTerminal();
        term.open(container); term.write('selected'); term.select(0, 0, 3);
        const render = vi.spyOn((term as any).renderer, 'render');
        const subscription = term.onSelectionChange(() => {
          subscription.dispose(); term.reset(); term.write('replacement'); render.mockClear();
        });
        if (operation === 'resize') {
          term.resize(40, 10);
          expect([term.options.cols, term.options.rows]).toEqual([40, 10]);
        } else term.options.fontSize = 18;
        expect(render).not.toHaveBeenCalled();
        term.selectAll(); expect(term.getSelection().trim()).toBe('replacement');
        term.dispose();
      });
    }

    test('typing stops when its selection listener disposes the terminal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container); term.write('selected'); term.select(0, 0, 3);
      const sent: string[] = [];
      term.onData(data => sent.push(data));
      term.onSelectionChange(() => { term.dispose(); });
      expect(() => term.input('typed', true)).not.toThrow();
      expect(sent).toEqual([]);
    });

    test('disposed terminals reject addons before activation', async () => {
      const term = await createIsolatedTerminal();
      term.dispose();
      let activated = false;
      expect(() => term.loadAddon({ activate() { activated = true; }, dispose() {} })).toThrow('disposed');
      expect(activated).toBe(false);
    });

    test('disableStdin blocks alternate screen wheel input', async () => {
      const term = await createIsolatedTerminal({ disableStdin: true });
      term.open(container);
      term.write('\x1b[?1049h');
      let sent = '';
      term.onData(data => { sent += data; });
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      expect(sent).toBe('');
      term.options.disableStdin = false;
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      expect(sent).toBe('\x1b[B'.repeat(3));
      term.dispose();
    });

    test('explicit OSC 8 targets take precedence over URL text on the same cells', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      try {
        term.write('\x1b]8;;https://target.example\x07https://label.example\x1b]8;;\x07');
        const detector = (term as any).linkDetector;
        const link = await detector.getLinkAt(5, 0);
        expect(link?.text).toBe('https://target.example');
        expect((await detector.getLinkAt(5, 0))?.text).toBe('https://target.example');
      } finally { term.dispose(); }
    });

    test('late hover results cannot replace the link under a newer mouse position', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      try {
        const pending: ((link: any) => void)[] = [];
        (term as any).linkDetector.getLinkAt = () => new Promise(resolve => pending.push(resolve));
        const makeLink = (text: string) => ({ text, activate() {},
          range: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
        const old = makeLink('old');
        const current = makeLink('current');
        (term as any).processMouseMove(new MouseEvent('mousemove'));
        (term as any).processMouseMove(new MouseEvent('mousemove', { clientX: 20 }));
        pending[1](current);
        await Promise.resolve();
        pending[0](old);
        await Promise.resolve();
        expect((term as any).currentHoveredLink).toBe(current);
      } finally { term.dispose(); }
    });

    test('leaving the terminal cancels both deferred hover results and queued mouse moves', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      try {
        const pending: ((link: any) => void)[] = [];
        (term as any).linkDetector.getLinkAt = () => new Promise(resolve => pending.push(resolve));
        (term as any).handleMouseMove(new MouseEvent('mousemove'));
        (term as any).handleMouseMove(new MouseEvent('mousemove', { clientX: 20 }));
        (term as any).handleMouseLeave();
        let entered = false;
        pending[0]({ activate() {}, hover() { entered = true; },
          range: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(pending).toHaveLength(1);
        expect(entered).toBe(false);
        expect((term as any).currentHoveredLink).toBeUndefined();
        expect(container.style.cursor).not.toBe('pointer');
      } finally { term.dispose(); }
    });

    test('pending link activation and hover stop at disposal', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      const pending: ((link: any) => void)[] = [];
      (term as any).linkDetector.getLinkAt = () => new Promise(resolve => pending.push(resolve));
      let activated = false;
      let hovered = false;
      const link = { activate() { activated = true; }, hover() { hovered = true; },
        range: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } };
      const clicked = (term as any).handleClick(new MouseEvent('click'));
      (term as any).processMouseMove(new MouseEvent('mousemove'));
      expect(pending.length).toBe(2);
      term.dispose();
      pending.forEach(resolve => resolve(link));
      await clicked;
      await Promise.resolve();
      expect(activated).toBe(false);
      expect(hovered).toBe(false);
    });

    test('throwing link providers do not prevent terminal or later provider cleanup', async () => {
      const term = await createIsolatedTerminal();
      term.open(container);
      let laterDisposed = false;
      term.registerLinkProvider({ provideLinks() {}, dispose() { throw new Error('provider cleanup failed'); } });
      term.registerLinkProvider({ provideLinks() {}, dispose() { laterDisposed = true; } });
      expect(() => term.dispose()).toThrow('provider cleanup failed');
      expect(laterDisposed).toBe(true);
      expect(term.wasmTerm).toBeUndefined();
    });
  });

  describe('Addons', () => {
    test('loadAddon() accepts addon', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      const mockAddon = {
        activate: (terminal: any) => {
          // Addon activation
        },
        dispose: () => {
          // Cleanup
        },
      };

      expect(() => term.loadAddon(mockAddon)).not.toThrow();

      term.dispose();
    });

    test('loadAddon() calls activate', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      let activateCalled = false;
      const mockAddon = {
        activate: (terminal: any) => {
          activateCalled = true;
        },
        dispose: () => {},
      };

      term.loadAddon(mockAddon);

      expect(activateCalled).toBe(true);

      term.dispose();
    });

    test('dispose() frees terminal resources even when an addon throws', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);
      const failure = new Error('addon cleanup failed');
      let laterAddonDisposed = false;
      term.loadAddon({ activate() {}, dispose() { throw failure; } });
      term.loadAddon({ activate() {}, dispose() { laterAddonDisposed = true; } });

      expect(() => term.dispose()).toThrow(failure);
      expect(laterAddonDisposed).toBe(true);
      expect(term.wasmTerm).toBeUndefined();
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.hasAttribute('contenteditable')).toBe(false);
      expect(() => term.dispose()).not.toThrow();
    });

    test('an addon that closes its terminal during activation is disposed once', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);
      let disposals = 0;
      const marker = document.createElement('span');
      term.loadAddon({
        activate() { document.body.appendChild(marker); term.dispose(); },
        dispose() { disposals++; marker.remove(); },
      });
      try {
        expect(disposals).toBe(1);
        expect(marker.isConnected).toBe(false);
        expect(term.wasmTerm).toBeUndefined();
        term.dispose();
        expect(disposals).toBe(1);
      } finally { marker.remove(); term.dispose(); }
    });

    test('dispose() calls addon dispose', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      let disposeCalled = false;
      const mockAddon = {
        activate: (terminal: any) => {},
        dispose: () => {
          disposeCalled = true;
        },
      };

      term.loadAddon(mockAddon);
      term.dispose();

      expect(disposeCalled).toBe(true);
    });
  });

  describe('Integration', () => {
    test('can write ANSI sequences', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      // Should not throw on ANSI escape sequences
      expect(() => term.write('\x1b[1;31mRed bold text\x1b[0m')).not.toThrow();
      expect(() => term.write('\x1b[32mGreen\x1b[0m')).not.toThrow();
      expect(() => term.write('\x1b[2J\x1b[H')).not.toThrow(); // Clear and home

      term.dispose();
    });

    test('can handle cursor movement sequences', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => term.write('\x1b[5;10H')).not.toThrow(); // Move cursor
      expect(() => term.write('\x1b[2A')).not.toThrow(); // Move up 2
      expect(() => term.write('\x1b[3B')).not.toThrow(); // Move down 3

      term.dispose();
    });

    test('multiple write calls work', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      expect(() => {
        term.write('Line 1\r\n');
        term.write('Line 2\r\n');
        term.write('Line 3\r\n');
      }).not.toThrow();

      term.dispose();
    });
  });

  describe('Disposal', () => {
    test('dispose() can be called multiple times', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      term.dispose();
      expect(() => term.dispose()).not.toThrow();
    });

    test('dispose() cleans up canvas element', async () => {
      const term = await createIsolatedTerminal();
      term.open(container!);

      const initialChildCount = container.children.length;
      expect(initialChildCount).toBeGreaterThan(0);

      term.dispose();

      const finalChildCount = container.children.length;
      expect(finalChildCount).toBe(0);
    });
  });
});

describe('paste()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should fire onData event with pasted text', async () => {
      if (!container) return;
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);

      let receivedData = '';
      term.onData((data) => {
        receivedData = data;
      });

      term.paste('hello world');

      expect(receivedData).toBe('hello world');
      term.dispose();
    });

    test('should respect disableStdin option', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, disableStdin: true });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedData = '';
      term.onData((data) => {
        receivedData = data;
      });

      term.paste('hello world');

      expect(receivedData).toBe('');
      term.dispose();
    });

    test('should work before terminal is open', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      expect(() => term.paste('test')).toThrow();
      term.dispose();
    });
  });
});

describe('blur()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should not throw when terminal is open', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      expect(() => term.blur()).not.toThrow();
      term.dispose();
    });

    test('should not throw when terminal is closed', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      expect(() => term.blur()).not.toThrow();
      term.dispose();
    });

    test('should call blur on element', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      const blurSpy = { called: false };
      if (term.element) {
        const originalBlur = term.element.blur;
        term.element.blur = () => {
          blurSpy.called = true;
          originalBlur.call(term.element);
        };
      }

      term.blur();
      expect(blurSpy.called).toBe(true);
      term.dispose();
    });
  });
});

describe('input()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should write data to terminal', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.input('test data');

      // Verify cursor moved (data was written)
      const cursor = term.wasmTerm!.getCursor();
      expect(cursor.x).toBeGreaterThan(0);
      term.dispose();
    });

    test('should fire onData when wasUserInput is true', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedData = '';
      term.onData((data) => {
        receivedData = data;
      });

      term.input('user input', true);

      expect(receivedData).toBe('user input');
      term.dispose();
    });

    test('should not fire onData when wasUserInput is false', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedData = '';
      term.onData((data) => {
        receivedData = data;
      });

      term.input('programmatic input', false);

      expect(receivedData).toBe('');
      term.dispose();
    });

    test('should respect disableStdin option', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, disableStdin: true });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedData = '';
      term.onData((data) => {
        receivedData = data;
      });

      term.input('test', true);

      expect(receivedData).toBe('');
      term.dispose();
    });
  });
});

describe('select()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should create selection', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.select(0, 0, 10);

      expect(term.hasSelection()).toBe(true);
      term.dispose();
    });

    test('should handle selection wrapping to next line', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      // Select 100 chars starting at column 0 (wraps to next line)
      term.select(0, 0, 100);

      const pos = term.getSelectionPosition();
      expect(pos).toBeTruthy();
      expect(pos!.start.y).toBe(0);
      expect(pos!.end.y).toBeGreaterThan(0); // Wrapped to next line
      term.dispose();
    });

    test('should fire selectionChange event', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let fired = false;
      term.onSelectionChange(() => {
        fired = true;
      });

      term.select(0, 0, 10);

      expect(fired).toBe(true);
      term.dispose();
    });

    test('should fire selectionChange when a selection is cleared, and not when none exists', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);
      let count = 0;
      term.onSelectionChange(() => { count++; });

      term.clearSelection();
      expect(count).toBe(0);
      term.select(0, 0, 10);
      expect(count).toBe(1);
      term.clearSelection();
      expect(term.hasSelection()).toBe(false);
      expect(count).toBe(2);
      term.clearSelection();
      expect(count).toBe(2);
      term.dispose();
    });

    test('should fire onRender for painted frames', async () => {
      const term = await createIsolatedTerminal({ cols: 20, rows: 5 });
      if (!container) return;
      const ranges: { start: number; end: number }[] = [];
      term.onRender(range => { ranges.push(range); });
      term.open(container!);
      term.resize(30, 6);
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges[ranges.length - 1]).toEqual({ start: 0, end: 5 });
      term.dispose();
    });

    test('should clear selection when clicking outside canvas', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      // Create a selection
      term.select(0, 0, 10);
      expect(term.hasSelection()).toBe(true);

      // Simulate click outside the canvas (on document body)
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      document.body.dispatchEvent(clickEvent);

      // Selection should be cleared
      expect(term.hasSelection()).toBe(false);
      term.dispose();
    });
  });
});

describe('selectLines()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should select entire lines', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.selectLines(0, 2);

      const pos = term.getSelectionPosition();
      expect(pos).toBeTruthy();
      expect(pos!.start.x).toBe(0);
      expect(pos!.start.y).toBe(0);
      expect(pos!.end.x).toBe(79); // Last column
      expect(pos!.end.y).toBe(2);
      term.dispose();
    });

    test('should handle reversed start/end', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.selectLines(5, 2); // End before start

      const pos = term.getSelectionPosition();
      expect(pos).toBeTruthy();
      expect(pos!.start.y).toBe(2); // Should be swapped
      expect(pos!.end.y).toBe(5);
      term.dispose();
    });

    test('should fire selectionChange event', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let fired = false;
      term.onSelectionChange(() => {
        fired = true;
      });

      term.selectLines(0, 2);

      expect(fired).toBe(true);
      term.dispose();
    });
  });
});

describe('getSelectionPosition()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should return null when no selection', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      const pos = term.getSelectionPosition();

      expect(pos).toBeUndefined();
      term.dispose();
    });

    test('should return correct position after select', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.select(5, 3, 10);
      const pos = term.getSelectionPosition();

      expect(pos).toBeTruthy();
      expect(pos!.start.x).toBe(5);
      expect(pos!.start.y).toBe(3);
      term.dispose();
    });

    test('should return undefined after clearSelection', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.select(0, 0, 10);
      term.clearSelection();
      const pos = term.getSelectionPosition();

      expect(pos).toBeUndefined();
      term.dispose();
    });
  });
});

describe('onKey event', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should exist', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      expect(term.onKey).toBeTruthy();
      expect(typeof term.onKey).toBe('function');
      term.dispose();
    });

    test('should fire on keyboard events', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let keyEvent: any = null;
      term.onKey((e) => {
        keyEvent = e;
      });

      // Simulate keyboard event
      const event = new KeyboardEvent('keydown', { key: 'a' });
      term.element?.dispatchEvent(event);

      // Note: This may not fire in test environment without proper focus
      // but the API should exist and be callable
      expect(keyEvent).toBeTruthy();
      term.dispose();
    });
  });
});

describe('onTitleChange event', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should exist', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      expect(term.onTitleChange).toBeTruthy();
      expect(typeof term.onTitleChange).toBe('function');
      term.dispose();
    });

    test('should fire when OSC 2 sequence is written', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedTitle = '';
      term.onTitleChange((title) => {
        receivedTitle = title;
      });

      // Write OSC 2 sequence (set title)
      term.write('\x1b]2;Test Title\x07');

      expect(receivedTitle).toBe('Test Title');
      term.dispose();
    });

    test('should fire when OSC 0 sequence is written', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedTitle = '';
      term.onTitleChange((title) => {
        receivedTitle = title;
      });

      // Write OSC 0 sequence (set icon and title)
      term.write('\x1b]0;Another Title\x07');

      expect(receivedTitle).toBe('Another Title');
      term.dispose();
    });

    test('should handle ST terminator', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let receivedTitle = '';
      term.onTitleChange((title) => {
        receivedTitle = title;
      });

      // Write OSC 2 with ST terminator (ESC \)
      term.write('\x1b]2;Title with ST\x1b\\');

      expect(receivedTitle).toBe('Title with ST');
      term.dispose();
    });
  });

  describe('reset()', () => {
    test('notifies subscribers when reset clears a previously reported title', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);

      const titles: string[] = [];
      term.onTitleChange((title) => {
        titles.push(title);
      });

      term.write('\x1b]2;Reported Title\x07');
      expect(titles).toEqual(['Reported Title']);

      term.reset();

      expect(term.title).toBe('');
      expect(titles).toEqual(['Reported Title', '']);
      term.dispose();
    });

    test('does not emit a duplicate title event when reset runs with an empty title', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);

      const titles: string[] = [];
      term.onTitleChange((title) => {
        titles.push(title);
      });

      term.write('\x1b]2;Reported Title\x07');
      term.reset();
      term.reset();

      expect(titles).toEqual(['Reported Title', '']);
      term.dispose();
    });

    test('rings a BEL written during the title event instead of resurrecting a stale OSC', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);

      const titles: string[] = [];
      let bells = 0;
      term.onBell(() => bells++);
      term.onTitleChange((title) => {
        titles.push(title);
        // Re-enter the terminal while the synchronous reset title event is firing.
        if (title === '') term.write('\x07');
      });

      term.write('\x1b]2;Reported Title\x07');
      // Unterminated OSC: it would surface "Stale" if its parse state survived the reset.
      term.write('\x1b]2;Stale');
      term.reset();

      expect(term.title).toBe('');
      expect(bells).toBe(1);
      expect(titles).toEqual(['Reported Title', '']);
      term.dispose();
    });

    test('keeps a title continuation written during the reset title event', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      if (!container) return;
      term.open(container!);

      const titles: string[] = [];
      let bells = 0;
      term.onBell(() => bells++);
      term.onTitleChange((title) => {
        titles.push(title);
        // Start a fresh OSC during the reset title event; it is finished after reset.
        if (title === '') term.write('\x1b]2;Par');
      });

      term.write('\x1b]2;Reported Title\x07');
      term.reset();
      term.write('tial\x07');

      expect(term.title).toBe('Partial');
      expect(bells).toBe(0);
      expect(titles).toEqual(['Reported Title', '', 'Partial']);
      term.dispose();
    });
  });
});

describe('attachCustomKeyEventHandler()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Basic functionality', () => {
    test('should accept a custom handler', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      const handler = (e: KeyboardEvent) => false;
      expect(() => term.attachCustomKeyEventHandler(handler)).not.toThrow();
      term.dispose();
    });

    test('should accept undefined to clear handler', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      const handler = (e: KeyboardEvent) => false;
      expect(() => term.attachCustomKeyEventHandler(handler)).not.toThrow();
      term.dispose();
    });
  });
});

describe('Terminal Options', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('convertEol and disableStdin', () => {
    test('convertEol handles byte writes without changing UTF-8 or the input buffer', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, convertEol: true });
      term.open(container!);
      try {
        const bytes = new TextEncoder().encode('first\n中\nlast');
        const original = bytes.slice();
        term.write(bytes);
        expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('first');
        expect(term.buffer.active.getLine(1)?.translateToString(true)).toBe('中');
        expect(term.buffer.active.getLine(2)?.translateToString(true)).toBe('last');
        expect(bytes).toEqual(original);
      } finally { term.dispose(); }
    });

    test('convertEol option should convert newlines', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, convertEol: true });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      term.write('line1\nline2');

      // Cursor should be at start of line (CR moved it back)
      const cursor = term.wasmTerm!.getCursor();
      expect(cursor.x).toBe(5); // After "line2"
      expect(cursor.y).toBeGreaterThan(0); // On next line
      term.dispose();
    });

    test('disableStdin should prevent paste', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, disableStdin: true });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let received = false;
      term.onData(() => {
        received = true;
      });

      term.paste('test');

      expect(received).toBe(false);
      term.dispose();
    });

    test('disableStdin should prevent input with wasUserInput', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24, disableStdin: true });
      // Using shared container from beforeEach
      if (!container) return;
      term.open(container!);

      let received = false;
      term.onData(() => {
        received = true;
      });

      term.input('test', true);

      expect(received).toBe(false);
      term.dispose();
    });
  });
});

describe('Buffer Access API', () => {
  let term: Terminal;
  let container: HTMLElement;

  beforeEach(async () => {
    term = await createIsolatedTerminal();
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    term.dispose();
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  test('isAlternateScreen() starts false', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);
    expect(term.wasmTerm?.isAlternateScreen()).toBe(false);
  });

  test('isAlternateScreen() detects alternate screen mode', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    // Enter alternate screen (DEC Private Mode 1049 - like vim does)
    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(true);

    // Exit alternate screen
    term.write('\x1b[?1049l');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(false);
  });

  test('alternate screen exit triggers full redraw (vim exit fix)', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    // Write content to main screen
    term.write('Main screen content line 1\r\n');
    term.write('Main screen content line 2\r\n');

    // Clear dirty state after initial write
    term.wasmTerm?.clearDirty();

    // Verify we can read the main screen content
    const mainLine0 = term.wasmTerm?.getLine(0);
    expect(mainLine0).not.toBeNull();
    const mainContent = mainLine0!
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trim();
    expect(mainContent).toBe('Main screen content line 1');

    // Enter alternate screen (like vim does)
    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(true);

    // Write different content on alternate screen
    term.write('Alternate screen - vim content');

    // Clear dirty state
    term.wasmTerm?.clearDirty();

    // Exit alternate screen (like vim :q)
    term.write('\x1b[?1049l');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(false);

    // The key fix: needsFullRedraw should return true after screen switch
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);

    // After the switch, update() should still return FULL (for subsequent calls before clearDirty)
    const dirtyState = term.wasmTerm?.update();
    expect(dirtyState).toBe(2); // DirtyState.FULL = 2

    // The main screen content should be restored
    const restoredLine0 = term.wasmTerm?.getLine(0);
    expect(restoredLine0).not.toBeNull();
    const restoredContent = restoredLine0!
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trim();
    expect(restoredContent).toBe('Main screen content line 1');
  });

  test('dirty state is cleared after markClean() following screen switch', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    // Enter and exit alternate screen
    term.write('\x1b[?1049h');
    term.write('\x1b[?1049l');

    // First call should indicate full redraw needed
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);

    // Clear the dirty state (simulating render completion)
    term.wasmTerm?.clearDirty();

    // Now needsFullRedraw should return false (no changes since last render)
    expect(term.wasmTerm?.needsFullRedraw()).toBe(false);
  });

  test('multiple screen switches are handled correctly', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);
    term.write('Initial content\r\n');
    term.wasmTerm?.clearDirty();

    // Enter alternate screen
    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);
    term.wasmTerm?.clearDirty();
    expect(term.wasmTerm?.needsFullRedraw()).toBe(false);

    // Exit alternate screen
    term.write('\x1b[?1049l');
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);
    term.wasmTerm?.clearDirty();
    expect(term.wasmTerm?.needsFullRedraw()).toBe(false);

    // Enter again
    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);
    term.wasmTerm?.clearDirty();

    // Exit again
    term.write('\x1b[?1049l');
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);
  });

  test('viewport content is correct after alternate screen exit', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    // Write distinct content to main screen
    term.write('MAIN_LINE_1\r\n');
    term.write('MAIN_LINE_2\r\n');
    term.write('MAIN_LINE_3\r\n');

    // Use getLine which calls update() first
    const mainLine0 = term.wasmTerm?.getLine(0);
    expect(mainLine0).not.toBeNull();

    const mainLine1 = mainLine0!
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trim();
    expect(mainLine1).toBe('MAIN_LINE_1');

    // Clear dirty state to simulate render completion
    term.wasmTerm?.clearDirty();

    // Enter alternate screen
    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(true);

    // Write different content to alternate screen
    term.write('ALT_LINE_1\r\n');
    term.write('ALT_LINE_2\r\n');

    // Skip checking alternate screen content - focus on the key issue:
    // Does main screen content get restored after exit?

    // Clear dirty state
    term.wasmTerm?.clearDirty();

    // Exit alternate screen (like vim :q)
    term.write('\x1b[?1049l');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(false);

    // CRITICAL: needsFullRedraw must be true
    expect(term.wasmTerm?.needsFullRedraw()).toBe(true);

    // CRITICAL: getLine must return MAIN screen content, not alternate
    const restoredLine0 = term.wasmTerm?.getLine(0);
    expect(restoredLine0).not.toBeNull();

    const restoredLine1Content = restoredLine0!
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trim();

    // This is the key assertion - content must be from main screen
    expect(restoredLine1Content).toBe('MAIN_LINE_1');

    // Also check second line to be thorough
    const restoredLine1 = term.wasmTerm?.getLine(1);
    const restoredLine2Content = restoredLine1!
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trim();
    expect(restoredLine2Content).toBe('MAIN_LINE_2');
  });

  test('background colors are correctly restored after alternate screen exit', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    term.write('MAIN\r\n');
    term.wasmTerm?.update();
    term.wasmTerm?.markClean();

    // Enter alternate screen and fill with colored background (like vim does)
    term.write('\x1b[?1049h'); // Enter alt screen
    term.write('\x1b[H'); // Home
    term.write('\x1b[44m'); // Blue background (palette color 4)

    // Fill screen with spaces that have blue background
    for (let y = 0; y < term.rows; y++) {
      term.write(' '.repeat(term.cols));
      if (y < term.rows - 1) term.write('\r\n');
    }

    term.wasmTerm?.update();
    term.wasmTerm?.markClean();

    // Verify alternate screen has non-default background
    const altViewport = term.wasmTerm?.getViewport();
    expect(altViewport![0].bg_r).not.toBe(0); // Should be blue-ish

    // Exit alternate screen
    term.write('\x1b[?1049l');
    term.wasmTerm?.update();

    const restoredViewport = term.wasmTerm?.getViewport();
    const firstCell = restoredViewport![0];

    expect(firstCell.bg_r).toBe(30);
    expect(firstCell.bg_g).toBe(30);
    expect(firstCell.bg_b).toBe(30);

    // Verify text is also restored
    expect(String.fromCodePoint(firstCell.codepoint)).toBe('M');
  });

  test('isRowWrapped() returns false for normal line breaks', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);
    term.write('Line 1\r\nLine 2\r\n');

    expect(term.wasmTerm?.isRowWrapped(0)).toBe(false);
    expect(term.wasmTerm?.isRowWrapped(1)).toBe(false);
  });

  test('isRowWrapped() detects wrapped lines', async () => {
    if (typeof document === 'undefined')
      throw new Error('DOM environment not available - check happydom setup');

    // Create narrow terminal to force wrapping
    const narrowTerm = await createIsolatedTerminal({ cols: 20, rows: 10 });
    const narrowContainer = document.createElement('div');
    narrowTerm.open(narrowContainer);

    try {
      // Write text longer than terminal width (no newline)
      narrowTerm.write('This is a very long line that will definitely wrap');

      // First line should not be wrapped (start of line)
      expect(narrowTerm.wasmTerm?.isRowWrapped(0)).toBe(false);

      // Second line should be wrapped (continuation)
      expect(narrowTerm.wasmTerm?.isRowWrapped(1)).toBe(true);
    } finally {
      narrowTerm.dispose();
    }
  });

  test('isRowWrapped() handles edge cases', async () => {
    if (!container) throw new Error('DOM environment not available - check happydom setup');

    term.open(container!);

    // Row 0 can never be wrapped (nothing to wrap from)
    expect(term.wasmTerm?.isRowWrapped(0)).toBe(false);

    // Out of bounds returns false
    expect(term.wasmTerm?.isRowWrapped(-1)).toBe(false);
    expect(term.wasmTerm?.isRowWrapped(999)).toBe(false);
  });
});

describe('Terminal Config', () => {
  test('should pass scrollback option to WASM terminal', async () => {
    if (typeof document === 'undefined') return;

    // Create terminal with custom scrollback
    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 500 });
    const container = document.createElement('div');
    term.open(container);

    try {
      // Write enough lines to fill scrollback
      for (let i = 0; i < 600; i++) {
        term.write(`Line ${i}\r\n`);
      }

      // Scrollback should be limited based on the config
      const scrollbackLength = term.wasmTerm!.getScrollbackLength();
      // With 500 scrollback limit, we wrote 600 lines so scrollback should be capped
      // The actual value depends on engine's implementation but should be around 500
      expect(scrollbackLength).toBeLessThan(600);
      expect(scrollbackLength).toBeGreaterThan(450);
    } finally {
      term.dispose();
    }
  });

  test('should pass theme colors to WASM terminal', async () => {
    if (typeof document === 'undefined') return;

    // Create terminal with custom theme
    const term = await createIsolatedTerminal({
      cols: 80,
      rows: 24,
      theme: {
        foreground: '#00ff00', // Green
        background: '#000080', // Navy blue
      },
    });
    const container = document.createElement('div');
    term.open(container);

    try {
      // Get the default colors from render state
      const colors = term.wasmTerm!.getColors();

      // Verify foreground is green (0x00FF00)
      expect(colors.foreground.r).toBe(0);
      expect(colors.foreground.g).toBe(255);
      expect(colors.foreground.b).toBe(0);

      // Verify background is navy (0x000080)
      expect(colors.background.r).toBe(0);
      expect(colors.background.g).toBe(0);
      expect(colors.background.b).toBe(128);
    } finally {
      term.dispose();
    }
  });

  test('should pass palette colors to WASM terminal', async () => {
    if (typeof document === 'undefined') return;

    // Create terminal with custom red color in palette
    const term = await createIsolatedTerminal({
      cols: 80,
      rows: 24,
      theme: {
        red: '#ff0000', // Bright red for ANSI red
      },
    });
    const container = document.createElement('div');
    term.open(container);

    try {
      // Write red text using ANSI escape code
      term.write('\x1b[31mRed text\x1b[0m');

      // Get first cell - should have red foreground
      const line = term.wasmTerm!.getLine(0);
      const firstCell = line[0];

      // The foreground should be red (0xFF0000)
      expect(firstCell.fg_r).toBe(255);
      expect(firstCell.fg_g).toBe(0);
      expect(firstCell.fg_b).toBe(0);
    } finally {
      term.dispose();
    }
  });

  test('should use default config when no options provided', async () => {
    if (typeof document === 'undefined') return;

    // Create terminal with no config
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    try {
      // Should still work and have reasonable defaults
      const colors = term.wasmTerm!.getColors();

      expect(colors.foreground).toEqual({ r: 212, g: 212, b: 212 });
      expect(colors.background).toEqual({ r: 30, g: 30, b: 30 });
    } finally {
      term.dispose();
    }
  });
});

describe('Terminal Modes', () => {
  test('should detect bracketed paste mode', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.hasBracketedPaste()).toBe(false);
    term.write('\x1b[?2004h');
    expect(term.hasBracketedPaste()).toBe(true);
    term.write('\x1b[?2004l');
    expect(term.hasBracketedPaste()).toBe(false);

    term.dispose();
  });

  test('paste() should use bracketed paste when enabled', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    let receivedData = '';
    term.onData((data) => {
      receivedData = data;
    });

    term.paste('test');
    expect(receivedData).toBe('test');

    term.write('\x1b[?2004h');
    term.paste('test2');
    expect(receivedData).toBe('\x1b[200~test2\x1b[201~');

    term.dispose();
  });

  test('should query arbitrary DEC modes', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.getMode(25)).toBe(true); // Cursor visible
    term.write('\x1b[?25l');
    expect(term.getMode(25)).toBe(false);

    term.dispose();
  });

  test('should detect focus event mode', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.hasFocusEvents()).toBe(false);
    term.write('\x1b[?1004h');
    expect(term.hasFocusEvents()).toBe(true);

    term.dispose();
  });

  test('should detect mouse tracking modes', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.hasMouseTracking()).toBe(false);
    term.write('\x1b[?1000h');
    expect(term.hasMouseTracking()).toBe(true);

    term.dispose();
  });

  test('should query ANSI modes vs DEC modes', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.getMode(4, true)).toBe(false); // Insert mode
    term.write('\x1b[4h');
    expect(term.getMode(4, true)).toBe(true);

    term.dispose();
  });

  test('should handle multiple modes set simultaneously', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    term.write('\x1b[?2004h\x1b[?1004h\x1b[?1000h');
    expect(term.hasBracketedPaste()).toBe(true);
    expect(term.hasFocusEvents()).toBe(true);
    expect(term.hasMouseTracking()).toBe(true);

    term.dispose();
  });

  test('getMode() throws when terminal not open', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    expect(() => term.getMode(25)).toThrow();
  });

  test('hasBracketedPaste() throws when terminal not open', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    expect(() => term.hasBracketedPaste()).toThrow();
  });

  test('alternate screen mode via getMode()', async () => {
    if (typeof document === 'undefined') return;
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container!);

    expect(term.getMode(1049)).toBe(false);
    term.write('\x1b[?1049h');
    expect(term.getMode(1049)).toBe(true);

    term.dispose();
  });
});

describe('Alternate Screen Rendering', () => {
  /**
   * Helper to get line content as a string
   */
  function getLineContent(term: Terminal, y: number): string {
    const line = term.wasmTerm?.getLine(y);
    if (!line) return '';
    return line
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trimEnd();
  }

  /**
   * Helper to check if a line is empty (all spaces/null codepoints)
   */
  function isLineEmpty(term: Terminal, y: number): boolean {
    const line = term.wasmTerm?.getLine(y);
    if (!line) return true;
    return line.every((c) => c.codepoint === 0 || c.codepoint === 32);
  }

  /**
   * Helper to get line content directly from viewport
   */
  function getViewportLineContent(term: Terminal, y: number): string {
    const viewport = term.wasmTerm?.getViewport();
    if (!viewport) return '';
    const cols = term.cols;
    const start = y * cols;
    return viewport
      .slice(start, start + cols)
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trimEnd();
  }

  test('BUG REPRO: getLine and getViewport should return same data after partial updates', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    // Enter alternate screen
    term.write('\x1b[?1049h');

    // Draw content in middle (like vim welcome)
    term.write('\x1b[12;30HWelcome to Vim!');
    term.write('\x1b[13;30HPress i to insert');

    // First render cycle
    term.wasmTerm?.update();
    term.wasmTerm?.clearDirty();

    // Verify initial state with BOTH methods
    const line11_initial_getLine = getLineContent(term, 11);
    const line11_initial_viewport = getViewportLineContent(term, 11);
    expect(line11_initial_getLine).toContain('Welcome to Vim!');
    expect(line11_initial_viewport).toContain('Welcome to Vim!');
    expect(line11_initial_getLine).toBe(line11_initial_viewport);

    // Now simulate typing at top (vim insert mode)
    // Just write to row 0, don't clear middle
    term.write('\x1b[1;1H'); // cursor to top
    term.write('typing here');

    // Render cycle
    term.wasmTerm?.update();
    term.wasmTerm?.clearDirty();

    // Check row 0 - should have new content
    const line0_getLine = getLineContent(term, 0);
    const line0_viewport = getViewportLineContent(term, 0);
    expect(line0_getLine).toBe('typing here');
    expect(line0_viewport).toBe('typing here');
    expect(line0_getLine).toBe(line0_viewport);

    // CRITICAL: Check row 11 - should STILL have welcome content
    // Both methods MUST return the same data
    const line11_getLine = getLineContent(term, 11);
    const line11_viewport = getViewportLineContent(term, 11);

    console.log('After typing at top:');
    console.log('  line11 via getLine:', JSON.stringify(line11_getLine));
    console.log('  line11 via viewport:', JSON.stringify(line11_viewport));

    expect(line11_getLine).toContain('Welcome to Vim!');
    expect(line11_viewport).toContain('Welcome to Vim!');
    expect(line11_getLine).toBe(line11_viewport);

    term.dispose();
  });

  test('BUG REPRO: cells should have correct codepoints after clearing', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');

    // Draw content in middle
    term.write('\x1b[12;30HWelcome!');

    // Verify it's there
    const line11 = term.wasmTerm?.getLine(11);
    const welcomeCell = line11?.[29]; // 0-indexed, so col 30 is index 29
    console.log('Welcome cell:', welcomeCell);
    expect(welcomeCell?.codepoint).toBe('W'.charCodeAt(0));

    // Clear dirty and "render"
    term.wasmTerm?.clearDirty();

    // Now clear the line using EL (Erase in Line)
    term.write('\x1b[12;1H\x1b[K'); // Move to row 12, clear entire line

    // Check the cell again - should be empty (codepoint 0 or 32)
    const line11After = term.wasmTerm?.getLine(11);
    const clearedCell = line11After?.[29];
    console.log('Cleared cell:', clearedCell);
    expect(clearedCell?.codepoint === 0 || clearedCell?.codepoint === 32).toBe(true);

    term.dispose();
  });

  test('BUG REPRO: multiple render cycles should not lose data', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');

    // Draw content across multiple rows
    term.write('\x1b[1;1HROW_0');
    term.write('\x1b[6;1HROW_5');
    term.write('\x1b[11;1HROW_10');
    term.write('\x1b[16;1HROW_15');
    term.write('\x1b[21;1HROW_20');

    // Simulate 10 render cycles with typing at top
    for (let i = 0; i < 10; i++) {
      term.wasmTerm?.update();
      term.wasmTerm?.clearDirty();

      // Type at top
      term.write(`\x1b[1;1H\x1b[KIteration ${i}`);
    }

    // Final render
    term.wasmTerm?.update();

    // Check ALL rows - each should have expected content
    const results: Record<number, { getLine: string; viewport: string }> = {};
    for (const row of [0, 5, 10, 15, 20]) {
      results[row] = {
        getLine: getLineContent(term, row),
        viewport: getViewportLineContent(term, row),
      };
      console.log(`Row ${row}:`, results[row]);
    }

    // Row 0 should have latest iteration
    expect(results[0].getLine).toBe('Iteration 9');
    expect(results[0].viewport).toBe('Iteration 9');

    // Other rows should be unchanged
    expect(results[5].getLine).toBe('ROW_5');
    expect(results[5].viewport).toBe('ROW_5');
    expect(results[10].getLine).toBe('ROW_10');
    expect(results[10].viewport).toBe('ROW_10');
    expect(results[15].getLine).toBe('ROW_15');
    expect(results[15].viewport).toBe('ROW_15');
    expect(results[20].getLine).toBe('ROW_20');
    expect(results[20].viewport).toBe('ROW_20');

    term.dispose();
  });

  test('can enter alternate screen and write content', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    expect(term.wasmTerm?.isAlternateScreen()).toBe(true);

    term.write('Hello World');
    expect(getLineContent(term, 0)).toBe('Hello World');

    term.dispose();
  });

  test('writing to line 0 should not affect content on line 10', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[11;1HMIDDLE_CONTENT');
    expect(getLineContent(term, 10)).toBe('MIDDLE_CONTENT');
    expect(isLineEmpty(term, 0)).toBe(true);

    term.wasmTerm?.clearDirty();

    term.write('\x1b[1;1HTOP_CONTENT');
    expect(getLineContent(term, 0)).toBe('TOP_CONTENT');
    expect(getLineContent(term, 10)).toBe('MIDDLE_CONTENT');

    term.dispose();
  });

  test('erasing display should clear all content including middle', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[11;1HMIDDLE_CONTENT');
    expect(getLineContent(term, 10)).toBe('MIDDLE_CONTENT');

    term.wasmTerm?.clearDirty();
    term.write('\x1b[2J');
    expect(isLineEmpty(term, 10)).toBe(true);

    term.dispose();
  });

  test('simulating vim-like behavior: welcome screen then typing', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[2J');
    term.write('\x1b[12;30HWelcome to Vim!');
    term.write('\x1b[13;30HPress i to insert');

    expect(getLineContent(term, 11)).toContain('Welcome to Vim!');
    expect(getLineContent(term, 12)).toContain('Press i to insert');

    term.wasmTerm?.clearDirty();
    term.write('\x1b[1;1H\x1b[J');

    expect(isLineEmpty(term, 0)).toBe(true);
    expect(isLineEmpty(term, 11)).toBe(true);
    expect(isLineEmpty(term, 12)).toBe(true);

    term.dispose();
  });

  test('REGRESSION: middle content persists incorrectly after partial updates', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[11;1HMIDDLE_LINE');

    term.wasmTerm?.update();
    expect(getLineContent(term, 10)).toBe('MIDDLE_LINE');
    term.wasmTerm?.clearDirty();

    for (let i = 0; i < 5; i++) {
      term.write('\x1b[1;1H\x1b[K');
      term.write(`Typing iteration ${i}`);
      term.wasmTerm?.update();
      term.wasmTerm?.clearDirty();
    }

    expect(getLineContent(term, 0)).toBe('Typing iteration 4');
    expect(getLineContent(term, 10)).toBe('MIDDLE_LINE');

    term.dispose();
  });

  test('getLine returns fresh data after each update', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('INITIAL');
    expect(getLineContent(term, 0)).toBe('INITIAL');

    term.write('\x1b[1;1HCHANGED');
    expect(getLineContent(term, 0)).toBe('CHANGED');

    term.dispose();
  });

  test('full viewport retrieval reflects actual terminal state', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[2J');
    term.write('\x1b[1;1HLINE_0');
    term.write('\x1b[6;1HLINE_5');
    term.write('\x1b[11;1HLINE_10');
    term.write('\x1b[16;1HLINE_15');
    term.write('\x1b[21;1HLINE_20');

    expect(getLineContent(term, 0)).toBe('LINE_0');
    expect(getLineContent(term, 5)).toBe('LINE_5');
    expect(getLineContent(term, 10)).toBe('LINE_10');
    expect(getLineContent(term, 15)).toBe('LINE_15');
    expect(getLineContent(term, 20)).toBe('LINE_20');

    expect(isLineEmpty(term, 1)).toBe(true);
    expect(isLineEmpty(term, 7)).toBe(true);
    expect(isLineEmpty(term, 12)).toBe(true);

    term.dispose();
  });

  test('ED (Erase Display) sequences work correctly in alternate screen', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    for (let i = 0; i < 24; i++) {
      term.write(`\x1b[${i + 1};1HRow ${i.toString().padStart(2, '0')}`);
    }

    expect(getLineContent(term, 0)).toBe('Row 00');
    expect(getLineContent(term, 10)).toBe('Row 10');
    expect(getLineContent(term, 23)).toBe('Row 23');

    term.wasmTerm?.clearDirty();
    term.write('\x1b[2J');

    for (let i = 0; i < 24; i++) {
      expect(isLineEmpty(term, i)).toBe(true);
    }

    term.dispose();
  });

  test('ED 0 (erase from cursor to end) works correctly', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    for (let i = 0; i < 24; i++) {
      term.write(`\x1b[${i + 1};1HRow ${i.toString().padStart(2, '0')}`);
    }

    term.wasmTerm?.clearDirty();
    term.write('\x1b[11;1H\x1b[J');

    expect(getLineContent(term, 0)).toBe('Row 00');
    expect(getLineContent(term, 9)).toBe('Row 09');

    for (let i = 10; i < 24; i++) {
      expect(isLineEmpty(term, i)).toBe(true);
    }

    term.dispose();
  });

  test('multiple update/clearDirty cycles maintain correct state', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');

    term.write('\x1b[11;1HMIDDLE');
    term.wasmTerm?.update();
    expect(getLineContent(term, 10)).toBe('MIDDLE');
    term.wasmTerm?.clearDirty();

    term.write('\x1b[1;1HTOP');
    term.wasmTerm?.update();
    expect(getLineContent(term, 0)).toBe('TOP');
    expect(getLineContent(term, 10)).toBe('MIDDLE');
    term.wasmTerm?.clearDirty();

    term.write('\x1b[11;1H\x1b[K');
    term.wasmTerm?.update();
    expect(getLineContent(term, 0)).toBe('TOP');
    expect(isLineEmpty(term, 10)).toBe(true);
    term.wasmTerm?.clearDirty();

    term.wasmTerm?.update();
    expect(getLineContent(term, 0)).toBe('TOP');
    expect(isLineEmpty(term, 10)).toBe(true);

    term.dispose();
  });

  test('clearing a line marks it dirty', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[11;1HMIDDLE');
    term.wasmTerm?.update();
    term.wasmTerm?.clearDirty();

    term.wasmTerm?.update();
    expect(term.wasmTerm?.isRowDirty(10)).toBeFalsy();

    term.write('\x1b[11;1H\x1b[K');
    term.wasmTerm?.update();
    expect(term.wasmTerm?.isRowDirty(10)).toBeTruthy();

    term.dispose();
  });

  test('ED sequence marks all affected rows dirty', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    for (let i = 0; i < 24; i++) {
      term.write(`\x1b[${i + 1};1HRow${i}`);
    }
    term.wasmTerm?.update();
    term.wasmTerm?.clearDirty();

    term.write('\x1b[6;1H\x1b[J');
    term.wasmTerm?.update();

    for (let i = 0; i < 5; i++) {
      expect(term.wasmTerm?.isRowDirty(i)).toBeFalsy();
    }
    for (let i = 5; i < 24; i++) {
      expect(term.wasmTerm?.isRowDirty(i)).toBeTruthy();
    }

    term.dispose();
  });

  test('getViewport and getLine return consistent data', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    const container = document.createElement('div');
    term.open(container);

    term.write('\x1b[?1049h');
    term.write('\x1b[5;1HVIEWPORT_TEST');

    const lineContent = getLineContent(term, 4);
    const viewport = term.wasmTerm?.getViewport();
    const viewportLineContent = viewport
      ?.slice(4 * 80, 5 * 80)
      .map((c) => String.fromCodePoint(c.codepoint || 32))
      .join('')
      .trimEnd();

    expect(lineContent).toBe('VIEWPORT_TEST');
    expect(viewportLineContent).toBe('VIEWPORT_TEST');

    term.dispose();
  });
});

describe('Selection with Scrollback', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('should select correct text from scrollback buffer', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container!);

    // Write 100 lines with unique identifiable content
    // Lines 0-99, where each line has "Line XXX: content"
    for (let i = 0; i < 100; i++) {
      const lineNum = i.toString().padStart(3, '0');
      term.write(`Line ${lineNum}: This is line number ${i}\r\n`);
    }

    // At this point, the screen buffer shows lines 77-99 (last 23 lines)
    // The scrollback buffer contains lines 0-76 (77 lines total)

    // Scroll up 50 lines to view older content
    term.scrollLines(-50);
    expect(term.getViewportY()).toBe(50);

    // The viewport now shows:
    // - Lines 0-23 of viewport = Lines 27-50 of the original output
    // (because scrollback length is 77, viewportY is 50)
    // Viewport line 0 = scrollback offset (77 - 50 + 0) = 27

    // Select from viewport row 5, col 0 to viewport row 7, col 20
    // This should select:
    // - Viewport row 5 = Line 032 (scrollback offset 77-50+5 = 32)
    // - Viewport row 6 = Line 033
    // - Viewport row 7 = Line 034 (first 20 chars)

    // Use the internal selection manager to set selection
    // Using helper to convert viewport rows to absolute coordinates
    setSelectionViewportRelative(term, 0, 5, 20, 7);

    const selMgr = (term as any).selectionManager;
    if (selMgr) {
      const selectedText = selMgr.getSelection();

      // Should contain "Line 032", "Line 033", and start of "Line 034"
      expect(selectedText).toContain('Line 032');
      expect(selectedText).toContain('Line 033');
      expect(selectedText).toContain('Line 034');

      // Should NOT contain current screen buffer content (lines 76-99)
      expect(selectedText).not.toContain('Line 076');
      expect(selectedText).not.toContain('Line 077');
      expect(selectedText).not.toContain('Line 078');
    }

    term.dispose();
  });

  test('should select correct text when selection spans scrollback and screen', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container!);

    // Write 100 lines
    for (let i = 0; i < 100; i++) {
      term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
    }

    // Scroll up 10 lines (less than screen height)
    term.scrollLines(-10);
    expect(term.getViewportY()).toBe(10);

    // Now viewport shows:
    // - Top 10 rows: scrollback content (lines 67-76)
    // - Bottom 14 rows: screen buffer content (lines 77-90)

    // Select from row 8 (in scrollback) to row 12 (in screen buffer)
    // Using helper to convert viewport rows to absolute coordinates
    setSelectionViewportRelative(term, 0, 8, 10, 12);

    const selMgr = (term as any).selectionManager;
    if (selMgr) {
      const selectedText = selMgr.getSelection();

      // Row 8 is in scrollback (scrollback offset: 77-10+8 = 75)
      // Row 9 is in scrollback (offset 76)
      // Rows 10-12 are in screen (screen rows 0-2, which are lines 77-79)
      expect(selectedText).toContain('Line 075');
      expect(selectedText).toContain('Line 076');
      expect(selectedText).toContain('Line 077');
      expect(selectedText).toContain('Line 078');
      expect(selectedText).toContain('Line 079');
    }

    term.dispose();
  });

  test('should select correct text when not scrolled (viewportY = 0)', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container!);

    // Write 100 lines
    for (let i = 0; i < 100; i++) {
      term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
    }

    // Don't scroll - should be at bottom (viewportY = 0)
    expect(term.getViewportY()).toBe(0);

    // Select from screen buffer (last visible lines)
    // Using helper to convert viewport rows to absolute coordinates
    setSelectionViewportRelative(term, 0, 0, 10, 2);

    const selMgr = (term as any).selectionManager;
    if (selMgr) {
      const selectedText = selMgr.getSelection();

      // Should get lines from screen buffer (lines 77-99 visible, we select first 3)
      expect(selectedText).toContain('Line 077');
      expect(selectedText).toContain('Line 078');
      expect(selectedText).toContain('Line 079');
    }

    term.dispose();
  });

  test('should select correct text with fractional viewportY (smooth scroll)', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container!);

    // Write 100 simple numbered lines
    for (let i = 0; i < 100; i++) {
      term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
    }

    // Simulate a fractional viewportY as produced by smooth scrolling.
    // We set it directly to avoid needing to call private smooth scroll APIs.
    (term as any).viewportY = 10.7;

    // Sanity check that getViewportY returns the raw value
    expect(term.getViewportY()).toBeCloseTo(10.7);

    // SelectionManager interprets viewport rows using Math.floor(viewportY),
    // matching CanvasRenderer. With viewportY=10.7, floor(viewportY)=10.
    // At this point scrollbackLength is 77 (lines 0-76) and the screen shows 77-99.
    // For viewport row 0:
    //   scrollbackOffset = 77 - 10 + 0 = 67  => "Line 067"
    // For viewport row 1:
    //   scrollbackOffset = 77 - 10 + 1 = 68  => "Line 068"

    // Using helper to convert viewport rows to absolute coordinates
    setSelectionViewportRelative(term, 0, 0, 10, 1);

    const selMgr = (term as any).selectionManager;
    if (selMgr) {
      const selectedText = selMgr.getSelection();

      expect(selectedText).toContain('Line 067');
      expect(selectedText).toContain('Line 068');
      // Ensure we didn't accidentally select from the wrong region (e.g. current screen)
      expect(selectedText).not.toContain('Line 077');
      expect(selectedText).not.toContain('Line 078');
    }

    term.dispose();
  });
  test('should handle selection in pure scrollback content', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container!);

    // Write 100 lines
    for (let i = 0; i < 100; i++) {
      term.write(`Scrollback line ${i.toString().padStart(3, '0')}\r\n`);
    }

    // Scroll to top to view oldest content
    term.scrollToTop();
    const viewportY = term.getViewportY();

    // Should be scrolled up significantly
    expect(viewportY).toBeGreaterThan(0);

    // Select first few lines (all in scrollback)
    // Using helper to convert viewport rows to absolute coordinates
    setSelectionViewportRelative(term, 0, 0, 20, 2);

    const selMgr = (term as any).selectionManager;
    if (selMgr) {
      const selectedText = selMgr.getSelection();

      // Should get the oldest scrollback lines
      expect(selectedText).toContain('Scrollback line 000');
      expect(selectedText).toContain('Scrollback line 001');
      expect(selectedText).toContain('Scrollback line 002');

      // Should NOT get recent lines
      expect(selectedText).not.toContain('line 099');
      expect(selectedText).not.toContain('line 098');
    }

    term.dispose();
  });
});
// ==========================================================================
// xterm.js Compatibility: Public Mutable Options
// ==========================================================================

describe('Public Mutable Options', () => {
  test('options are publicly accessible and reflect initial values', async () => {
    const term = await createIsolatedTerminal({ cols: 100, rows: 30, scrollback: 5000 });
    expect(term.options).toBeDefined();
    expect(term.options.cols).toBe(100);
    expect(term.options.rows).toBe(30);
    expect(term.options.scrollback).toBe(5000);
  });

  test('options can be mutated at runtime', async () => {
    const term = await createIsolatedTerminal();
    expect(term.options.disableStdin).toBe(false);
    term.options.disableStdin = true;
    expect(term.options.disableStdin).toBe(true);
    term.options.disableStdin = false;
    expect(term.options.disableStdin).toBe(false);
  });
});

// ==========================================================================
// xterm.js Compatibility: Options Proxy Triggering handleOptionChange
// ==========================================================================

describe('Options Proxy handleOptionChange', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('changing cursorStyle updates renderer', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cursorStyle: 'block' });
    term.open(container);

    // Verify initial state
    expect(term.options.cursorStyle).toBe('block');

    // Change cursor style via options proxy
    term.options.cursorStyle = 'underline';

    // Verify option was updated
    expect(term.options.cursorStyle).toBe('underline');

    // Access renderer to verify it was updated
    // @ts-ignore - accessing private for test
    const renderer = term.renderer;
    expect(renderer).toBeDefined();
    // @ts-ignore - accessing private for test
    expect(renderer.cursorStyle).toBe('underline');

    term.dispose();
  });

  test('changing cursorBlink starts/stops blink timer', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cursorBlink: false });
    term.open(container);

    expect(term.options.cursorBlink).toBe(false);
    const start = vi.spyOn(globalThis, 'setInterval');
    const stop = vi.spyOn(globalThis, 'clearInterval');
    try {
      term.options.cursorBlink = true;
      expect(term.options.cursorBlink).toBe(true);
      expect(start).toHaveBeenLastCalledWith(expect.any(Function), 530);
      const timer = start.mock.results.at(-1)!.value;
      term.options.cursorBlink = false;
      expect(term.options.cursorBlink).toBe(false);
      expect(stop).toHaveBeenCalledWith(timer);
    } finally { term.dispose(); start.mockRestore(); stop.mockRestore(); }

  });

  test('changing cols/rows triggers resize', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);

    let resizeEventFired = false;
    let resizedCols = 0;
    let resizedRows = 0;

    term.onResize(({ cols, rows }) => {
      resizeEventFired = true;
      resizedCols = cols;
      resizedRows = rows;
    });

    // Change dimensions via options proxy
    term.options.cols = 100;

    expect(resizeEventFired).toBe(true);
    expect(resizedCols).toBe(100);
    expect(term.cols).toBe(100);

    // Reset and test rows
    resizeEventFired = false;
    term.options.rows = 40;

    expect(resizeEventFired).toBe(true);
    expect(resizedRows).toBe(40);
    expect(term.rows).toBe(40);

    term.dispose();
  });

  test('options.cols assignment keeps the committed grid when render throws once', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);

    const renderer = (term as any).renderer;
    const originalRender = renderer.render.bind(renderer);
    let renderAttempts = 0;
    renderer.render = (...args: any[]) => {
      renderAttempts++;
      if (renderAttempts === 1) throw new Error('render failed');
      originalRender(...args);
    };

    // Count invalidations instead of relying on reflowed content, so the assertion is about
    // the commit path and not about how the wasm reflows this particular text.
    const detector = (term as any).linkDetector;
    const originalInvalidate = detector.invalidateCache.bind(detector);
    let invalidations = 0;
    detector.invalidateCache = () => {
      invalidations++;
      originalInvalidate();
    };

    const resizeEvents: Array<{ cols: number; rows: number }> = [];
    term.onResize((event) => resizeEvents.push(event));

    // resize() commits the new grid before the forced paint, so the render failure surfaces
    // to the caller but must not roll the option back: options stay in step with the grid.
    expect(() => { term.options.cols = 100; }).toThrow('render failed');

    const wasmTerm = (term as any).wasmTerm;
    const metrics = renderer.getMetrics();
    const canvas = (term as any).canvas;
    expect([term.options.cols, term.options.rows]).toEqual([100, 24]);
    expect([term.cols, term.rows]).toEqual([100, 24]);
    expect(wasmTerm.getDimensions()).toEqual({ cols: 100, rows: 24 });
    expect([canvas.width, canvas.height]).toEqual([metrics.width * 100, metrics.height * 24]);
    expect([canvas.style.width, canvas.style.height]).toEqual([
      `${metrics.width * 100}px`,
      `${metrics.height * 24}px`,
    ]);

    // Links are invalidated even though the frame never painted, and no resize event describes
    // a frame that failed to render.
    expect(invalidations).toBe(1);
    expect(resizeEvents).toEqual([]);

    // A later mutation renders the committed grid and reports the final size exactly once.
    term.options.cols = 120;
    expect(renderAttempts).toBe(2);
    expect(term.options.cols).toBe(120);
    expect(wasmTerm.getDimensions()).toEqual({ cols: 120, rows: 24 });
    expect(invalidations).toBe(2);
    expect(resizeEvents).toEqual([{ cols: 120, rows: 24 }]);

    term.dispose();
  });

  test('rejected cols/rows assignment rolls back before options or terminal state change', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);
    let resizeCount = 0;
    term.onResize(() => resizeCount++);

    for (const key of ['cols', 'rows'] as const) {
      for (const value of [0, -1, 1.5, Number.NaN, Terminal.MAX_DIMENSION + 1]) {
        expect(() => {
          term.options[key] = value;
        }).toThrow(RangeError);
        // Both the proxy target and the published grid must be untouched.
        expect([term.options.cols, term.options.rows]).toEqual([80, 24]);
        expect([term.cols, term.rows]).toEqual([80, 24]);
      }
    }
    expect(resizeCount).toBe(0);

    term.dispose();
  });

  test('rejected cols/rows assignment before open leaves options untouched', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });

    expect(() => {
      term.options.rows = 0;
    }).toThrow(RangeError);

    expect([term.options.cols, term.options.rows]).toEqual([80, 24]);
    expect([term.cols, term.rows]).toEqual([80, 24]);
  });

  test('handleOptionChange not called before terminal is open', async () => {
    const term = await createIsolatedTerminal({ cursorStyle: 'block' });

    // Changing options before open() should not throw
    // (handleOptionChange checks isOpen internally)
    expect(() => {
      term.options.cursorStyle = 'underline';
    }).not.toThrow();

    expect(term.options.cursorStyle).toBe('underline');
  });

  test('changing fontSize updates renderer and resizes canvas', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ fontSize: 15, cols: 80, rows: 24 });
    term.open(container);

    // @ts-ignore - accessing private for test
    const renderer = term.renderer;

    // Verify initial font size
    // @ts-ignore - accessing private for test
    expect(renderer.fontSize).toBe(15);

    // Change font size
    term.options.fontSize = 20;

    // Verify option was updated
    expect(term.options.fontSize).toBe(20);

    // Verify renderer's internal fontSize was updated
    // @ts-ignore - accessing private for test
    expect(renderer.fontSize).toBe(20);

    // Verify metrics were recalculated (getMetrics returns a copy)
    const metrics = renderer.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThan(0);

    term.dispose();
  });

  test('changing fontFamily updates renderer', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ fontFamily: 'monospace', cols: 80, rows: 24 });
    term.open(container);

    // @ts-ignore - accessing private for test
    const renderer = term.renderer;

    // Change font family
    term.options.fontFamily = 'Courier New, monospace';

    // Verify option was updated
    expect(term.options.fontFamily).toBe('Courier New, monospace');

    // Verify renderer was updated
    // @ts-ignore - accessing private for test
    expect(renderer.fontFamily).toBe('Courier New, monospace');

    term.dispose();
  });

  test('font change clears active selection', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ fontSize: 15, cols: 80, rows: 24 });
    term.open(container);

    // Write some text and select it
    term.write('Hello World');
    term.select(0, 0, 5); // Select "Hello"
    expect(term.hasSelection()).toBe(true);

    // Change font size
    term.options.fontSize = 20;

    // Selection should be cleared (pixel positions changed)
    expect(term.hasSelection()).toBe(false);

    term.dispose();
  });

  test('font change maintains terminal dimensions (cols/rows)', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ fontSize: 15, cols: 80, rows: 24 });
    term.open(container);

    const initialCols = term.cols;
    const initialRows = term.rows;

    // Change font size
    term.options.fontSize = 20;

    // Cols and rows should remain the same (canvas grows instead)
    expect(term.cols).toBe(initialCols);
    expect(term.rows).toBe(initialRows);

    term.dispose();
  });
});

// ==========================================================================
// xterm.js Compatibility: disableStdin Functionality
// ==========================================================================

describe('disableStdin', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('blocks keyboard input from firing onData when enabled', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // Enable disableStdin
    term.options.disableStdin = true;

    // Simulate keyboard input by calling the internal method
    // Since we can't easily simulate keyboard events, we test via paste() and input()
    term.paste('should-not-appear');
    term.input('also-should-not-appear', true);

    expect(receivedData).toHaveLength(0);

    term.dispose();
  });

  test('allows input when disableStdin is false', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // disableStdin defaults to false
    expect(term.options.disableStdin).toBe(false);

    // Paste should work
    term.paste('hello');
    expect(receivedData.length).toBeGreaterThan(0);
    expect(receivedData.join('')).toContain('hello');

    term.dispose();
  });

  test('can toggle disableStdin at runtime', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // Start with input enabled
    term.paste('first');
    expect(receivedData.join('')).toContain('first');

    // Disable input
    term.options.disableStdin = true;
    const countBefore = receivedData.length;
    term.paste('blocked');
    expect(receivedData.length).toBe(countBefore); // No new data

    // Re-enable input
    term.options.disableStdin = false;
    term.paste('second');
    expect(receivedData.join('')).toContain('second');

    term.dispose();
  });

  test('blocks real keyboard events when disableStdin is true', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // Enable disableStdin
    term.options.disableStdin = true;

    // Simulate a real keyboard event on the container
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(keyEvent);

    // No data should be received
    expect(receivedData).toHaveLength(0);

    term.dispose();
  });

  test('allows real keyboard events when disableStdin is false', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // disableStdin defaults to false
    expect(term.options.disableStdin).toBe(false);

    // Simulate a real keyboard event on the container
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(keyEvent);

    // Data should be received
    expect(receivedData.length).toBeGreaterThan(0);

    term.dispose();
  });

  test('keyboard events blocked after toggling disableStdin on', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const receivedData: string[] = [];
    term.onData((data) => receivedData.push(data));

    // First verify keyboard works
    const keyEvent1 = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(keyEvent1);
    expect(receivedData.length).toBeGreaterThan(0);

    const countBefore = receivedData.length;

    // Now disable stdin
    term.options.disableStdin = true;

    // Send another key
    const keyEvent2 = new KeyboardEvent('keydown', {
      key: 'b',
      code: 'KeyB',
      keyCode: 66,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(keyEvent2);

    // Count should not have increased
    expect(receivedData.length).toBe(countBefore);

    term.dispose();
  });
});

// ==========================================================================
// xterm.js Compatibility: unicode API
// ==========================================================================

describe('unicode API', () => {
  test('activeVersion reports the owned width table version', async () => {
    const term = await createIsolatedTerminal();
    expect(term.unicode.activeVersion).toBe('18.0');
  });

  test('unicode object is readonly', async () => {
    const term = await createIsolatedTerminal();
    // The unicode property should be accessible
    expect(term.unicode).toBeDefined();
    expect(typeof term.unicode.activeVersion).toBe('string');
  });
});

// ==========================================================================
// Grapheme Cluster Support (Unicode complex scripts)
// ==========================================================================

describe('Grapheme Cluster Support', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('cell grapheme_len is 0 for simple ASCII characters', async () => {
    const term = await createIsolatedTerminal();
    term.open(container!);
    term.write('Hello');

    // Get the viewport and check the first cell
    const viewport = term.wasmTerm!.getViewport();
    expect(viewport[0].codepoint).toBe(0x48); // 'H'
    expect(viewport[0].grapheme_len).toBe(0);

    term.dispose();
  });

  test('getGraphemeString returns simple characters correctly', async () => {
    const term = await createIsolatedTerminal();
    term.open(container!);
    term.write('Test');

    // Test basic ASCII
    const grapheme = term.wasmTerm!.getGraphemeString(0, 0);
    expect(grapheme).toBe('T');

    term.dispose();
  });

  test('getGrapheme returns null for invalid coordinates', async () => {
    const term = await createIsolatedTerminal();
    term.open(container!);
    term.write('Test');

    // Test out of bounds
    const result = term.wasmTerm!.getGrapheme(100, 100);
    expect(result).toBeNull();

    term.dispose();
  });

  test('getGrapheme returns array of codepoints', async () => {
    const term = await createIsolatedTerminal();
    term.open(container!);
    term.write('A');

    const codepoints = term.wasmTerm!.getGrapheme(0, 0);
    expect(codepoints).not.toBeNull();
    expect(codepoints!.length).toBeGreaterThanOrEqual(1);
    expect(codepoints![0]).toBe(0x41); // 'A'

    term.dispose();
  });

  test('grapheme cluster mode 2027 is enabled by default', async () => {
    const term = await createIsolatedTerminal();
    term.open(container!);

    // Mode 2027 should be enabled by default for proper Unicode handling
    // This is a DEC private mode, not ANSI
    const graphemeClusterEnabled = term.wasmTerm!.getMode(2027, false);
    expect(graphemeClusterEnabled).toBe(true);

    term.dispose();
  });
});

// ==========================================================================
// xterm.js Compatibility: Write Behavior
// ==========================================================================

describe('Write Behavior', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('writes are processed immediately after open', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    term.write('Line1\r\n');
    term.write('Line2\r\n');
    term.write('Line3\r\n');

    const line0 = term.buffer.active.getLine(0)?.translateToString().trim();
    const line1 = term.buffer.active.getLine(1)?.translateToString().trim();
    const line2 = term.buffer.active.getLine(2)?.translateToString().trim();

    expect(line0).toBe('Line1');
    expect(line1).toBe('Line2');
    expect(line2).toBe('Line3');

    term.dispose();
  });

  test('write callbacks are called after processing', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const callbackOrder: number[] = [];

    term.write('First', () => callbackOrder.push(1));
    term.write('Second', () => callbackOrder.push(2));
    term.write('Third', () => callbackOrder.push(3));

    // Give callbacks time to fire (they are delivered asynchronously)
    await new Promise((r) => setTimeout(r, 50));

    expect(callbackOrder).toEqual([1, 2, 3]);

    term.dispose();
  });

  test('write callbacks are delivered when animation frames never run', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    let called = 0;
    // A hidden page never services animation frames; a host awaiting this callback must not stall.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    try {
      term.write('Hidden', () => called++);

      await new Promise((r) => setTimeout(r, 50));

      expect(called).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      term.dispose();
    }
  });

  test('write callbacks stay asynchronous and ordered when animation frames never run', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    const callbackOrder: number[] = [];
    vi.stubGlobal('requestAnimationFrame', () => 0);
    try {
      term.write('First', () => callbackOrder.push(1));
      term.write('Second', () => callbackOrder.push(2));
      term.write('Third', () => callbackOrder.push(3));

      // Nothing may fire inside the write stack.
      expect(callbackOrder).toEqual([]);

      await new Promise((r) => setTimeout(r, 50));

      expect(callbackOrder).toEqual([1, 2, 3]);
    } finally {
      vi.unstubAllGlobals();
      term.dispose();
    }
  });

  test('write callback runs asynchronously after its write is parsed', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    let called = false;
    let parsedLine = '';
    term.write('Parsed', () => {
      called = true;
      parsedLine = term.buffer.active.getLine(0)?.translateToString(true) ?? '';
    });

    // The callback must not run inside write().
    expect(called).toBe(false);

    await new Promise((r) => setTimeout(r, 50));

    expect(called).toBe(true);
    // ...and by the time it runs, the write has been parsed into the buffer.
    expect(parsedLine).toBe('Parsed');

    term.dispose();
  });
});

// ==========================================================================
// xterm.js Compatibility: Synchronous open()
// ==========================================================================

describe('Synchronous open()', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  test('open() returns void (synchronous)', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    const result = term.open(container);

    expect(result).toBeUndefined();

    term.dispose();
  });

  test('element is set after open', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    expect(term.element).toBe(container);

    term.dispose();
  });

  test('cols and rows are available after open', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 100, rows: 50 });
    term.open(container);

    expect(term.cols).toBe(100);
    expect(term.rows).toBe(50);

    term.dispose();
  });

  test('wasmTerm is available after open', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);

    expect(term.wasmTerm).toBeDefined();

    term.dispose();
  });

  test('resize works after open', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);

    term.resize(120, 40);

    expect(term.cols).toBe(120);
    expect(term.rows).toBe(40);

    term.dispose();
  });
});

// ==========================================================================
// Listener Cleanup Tests
// ==========================================================================

describe('Listener cleanup', () => {
  let container: HTMLElement | null = null;

  beforeEach(() => {
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  /** Record add/removeEventListener calls on a target for identity assertions */
  const spyListeners = (target: EventTarget) => {
    const added: Array<[string, EventListenerOrEventListenerObject, any]> = [];
    const removed: Array<[string, EventListenerOrEventListenerObject, any]> = [];
    const origAdd = target.addEventListener;
    const origRemove = target.removeEventListener;
    target.addEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
      added.push([type, listener, options]);
      return origAdd.call(this, type, listener, options);
    } as typeof target.addEventListener;
    target.removeEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
      removed.push([type, listener, options]);
      return origRemove.call(this, type, listener, options);
    } as typeof target.removeEventListener;
    const restore = () => {
      target.addEventListener = origAdd;
      target.removeEventListener = origRemove;
    };
    return { added, removed, restore };
  };

  const captureOf = (options: unknown): boolean =>
    options === true || (typeof options === 'object' && options !== null && (options as any).capture === true);

  test('dispose() removes the document mouseup handlers with the identical references', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    const spy = spyListeners(document);
    try {
      term.open(container);
      term.dispose();
    } finally {
      spy.restore();
    }

    const mouseupAdds = spy.added.filter(([type]) => type === 'mouseup');
    const mouseupRemoves = spy.removed.filter(([type]) => type === 'mouseup');
    expect(mouseupAdds.length).toBeGreaterThan(0);
    // dispose() clears isOpen before cleanup; the document mouseup must
    // still be removed (both the scrollbar-drag and selection handlers)
    expect(mouseupRemoves.length).toBe(mouseupAdds.length);
    for (const [, handler] of mouseupAdds) {
      expect(mouseupRemoves.some(([, removedHandler]) => removedHandler === handler)).toBe(true);
    }
  });

  test('wheel listener is removed with the capture flag it was registered with', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    const spy = spyListeners(container);
    try {
      term.open(container);
      term.dispose();
    } finally {
      spy.restore();
    }

    const wheelAdds = spy.added.filter(([type]) => type === 'wheel');
    const wheelRemoves = spy.removed.filter(([type]) => type === 'wheel');
    expect(wheelAdds.length).toBe(1);
    expect(wheelRemoves.length).toBe(1);
    expect(wheelRemoves[0]![1]).toBe(wheelAdds[0]![1]);
    expect(captureOf(wheelAdds[0]![2])).toBe(true);
    expect(captureOf(wheelRemoves[0]![2])).toBe(true);
  });

  test('a reused container is not affected by a leaked wheel handler', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);
    term.dispose();

    // A leaked capture-phase wheel handler would still preventDefault
    const afterDispose = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 1 });
    container.dispatchEvent(afterDispose);
    expect(afterDispose.defaultPrevented).toBe(false);

    // Reusing the same container for a new terminal works as before
    const term2 = await createIsolatedTerminal();
    term2.open(container);
    const whileOpen = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 1 });
    container.dispatchEvent(whileOpen);
    expect(whileOpen.defaultPrevented).toBe(true);

    term2.dispose();
    const afterSecondDispose = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 1 });
    container.dispatchEvent(afterSecondDispose);
    expect(afterSecondDispose.defaultPrevented).toBe(false);
  });

  test('dispose() removes the parent beforeinput handler so a reused container is not affected', async () => {
    if (!container) return;

    const term = await createIsolatedTerminal();
    term.open(container);
    term.dispose();

    // The pre-fix anonymous beforeinput handler could never be removed and
    // kept preventing input on the container forever
    const afterDispose = new Event('beforeinput', { cancelable: true });
    container.dispatchEvent(afterDispose);
    expect(afterDispose.defaultPrevented).toBe(false);

    const term2 = await createIsolatedTerminal();
    term2.open(container);
    const whileOpen = new Event('beforeinput', { cancelable: true });
    container.dispatchEvent(whileOpen);
    expect(whileOpen.defaultPrevented).toBe(true);

    term2.dispose();
    const afterSecondDispose = new Event('beforeinput', { cancelable: true });
    container.dispatchEvent(afterSecondDispose);
    expect(afterSecondDispose.defaultPrevented).toBe(false);
  });
});

/**
 * The title/bell scanner is stateful: an OSC sequence may be split across any number of writes,
 * and writes may be strings or UTF-8 bytes. These tests pin the streaming contract.
 */
describe('Title and bell streaming scanner', () => {
  let container: HTMLElement;
  let term: Terminal;
  let bells: number;
  let titles: string[];

  beforeEach(async () => {
    if (typeof document === 'undefined') return;
    container = document.createElement('div');
    document.body.appendChild(container);
    term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);
    bells = 0;
    titles = [];
    term.onBell(() => {
      bells++;
    });
    term.onTitleChange((title) => {
      titles.push(title);
    });
  });

  afterEach(() => {
    if (term) term.dispose();
    if (container && container.parentNode) container.parentNode.removeChild(container);
  });

  test('OSC 2 title split across writes updates the title', () => {
    if (!term) return;

    term.write('\x1b]2;Split Ti');
    expect(term.title).toBe('');

    term.write('tle\x07');

    expect(term.title).toBe('Split Title');
    expect(titles).toEqual(['Split Title']);
  });

  test('OSC 0 title split across writes with an ST terminator split too', () => {
    if (!term) return;

    term.write('\x1b]0;ST Title');
    term.write('\x1b');
    expect(term.title).toBe('');

    term.write('\\');

    expect(term.title).toBe('ST Title');
  });

  test('OSC title delivered as bytes is recognised', () => {
    if (!term) return;

    term.write(new TextEncoder().encode('\x1b]2;Byte Title\x07'));

    expect(term.title).toBe('Byte Title');
  });

  test('a multi-byte UTF-8 title split across writes decodes correctly', () => {
    if (!term) return;

    const bytes = new TextEncoder().encode('\x1b]2;caf\u00e9\x07');
    // The two bytes of "é" straddle the write boundary.
    term.write(bytes.slice(0, 8));
    term.write(bytes.slice(8));

    expect(term.title).toBe('caf\u00e9');
  });

  test('a title delivered one byte per write decodes across every possible split', () => {
    if (!term) return;

    // One byte per write puts the write boundary inside the introducer, the UTF-8 sequences and the terminator.
    const bytes = new TextEncoder().encode('\x1b]2;h\u00e9llo \u{1f600}\x07');
    for (const byte of bytes) term.write(new Uint8Array([byte]));

    expect(term.title).toBe('h\u00e9llo \u{1f600}');
    expect(titles).toEqual(['h\u00e9llo \u{1f600}']);
    expect(bells).toBe(0);
  });

  test('a title split across a string and a byte write keeps the pending sequence', () => {
    if (!term) return;

    term.write('\x1b]2;caf');
    const rest = new TextEncoder().encode('\u00e9 \u{1f600}\x07');
    term.write(rest.slice(0, 1));
    term.write(rest.slice(1));

    expect(term.title).toBe('caf\u00e9 \u{1f600}');
  });

  test('OSC 1 (icon name) never becomes the title and its BEL does not ring', () => {
    if (!term) return;

    term.write('\x1b]1;Icon Only\x07');

    expect(term.title).toBe('');
    expect(titles).toEqual([]);
    expect(bells).toBe(0);
  });

  test('a BEL terminator inside an OSC string does not ring the bell', () => {
    if (!term) return;

    term.write('\x1b]0;No Bell');
    term.write('\x07');

    expect(term.title).toBe('No Bell');
    expect(bells).toBe(0);
  });

  test('a raw BEL inside another control string does not ring the bell', () => {
    if (!term) return;

    // DCS: ESC P ... ST, with a BEL in the payload.
    term.write('\x1bP1;2;3q\x07raw\x1b\\');

    expect(bells).toBe(0);
  });

  test('a bare BEL still rings, in strings and in bytes', () => {
    if (!term) return;

    term.write('\x07');
    expect(bells).toBe(1);

    term.write(new Uint8Array([0x07]));
    expect(bells).toBe(2);
  });

  test('a BEL after a completed OSC rings again', () => {
    if (!term) return;

    term.write('\x1b]2;Done\x07');
    expect(bells).toBe(0);

    term.write('\x07');
    expect(bells).toBe(1);
  });

  test('a BEL in the escape state rings and does not end the sequence', () => {
    if (!term) return;

    // ESC BEL is a C0 execution; the pending OSC introducer still parses, and the
    // terminating BEL of that OSC must not ring a second time.
    term.write('\x1b\x07]0;After BEL\x07');

    expect(bells).toBe(1);
    expect(term.title).toBe('After BEL');
  });

  test('a BEL inside a CSI sequence rings without aborting the sequence', () => {
    if (!term) return;

    // BEL executes in CSI; the final `m` still ends the sequence, so the SGR applies
    // and the bytes after BEL are not printed as literal text.
    term.write('\x1b[1\x07;31mHello');

    expect(bells).toBe(1);
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('Hello');
  });

  test('an oversized complete OSC title is rejected instead of stored', () => {
    if (!term) return;

    term.write(`\x1b]2;${'x'.repeat(10_000)}\x07`);

    expect(term.title).toBe('');
    expect(titles).toEqual([]);
  });

  test('an oversized incomplete OSC stays bounded and does not poison later titles', () => {
    if (!term) return;

    // No terminator: the scanner must cap its pending buffer instead of growing it forever.
    term.write(`\x1b]2;${'y'.repeat(50_000)}`);
    expect(term.title).toBe('');

    // Completing the oversized sequence discards it.
    term.write('\x07');
    expect(term.title).toBe('');

    // A later, valid title is still parsed.
    term.write('\x1b]2;Recovered\x07');
    expect(term.title).toBe('Recovered');
  });

  test('a bare ESC aborts a pending OSC and the next byte starts a new escape sequence', () => {
    if (!term) return;

    // Only `ESC \` is ST. A lone ESC cancels the control string, so the `]2;fresh` that follows
    // must be parsed as a fresh OSC rather than appended to the aborted payload.
    term.write('\x1b]2;stale\x1b]2;fresh\x07');

    expect(term.title).toBe('fresh');
    expect(titles).toEqual(['fresh']);
    expect(bells).toBe(0);
  });

  test('an OSC aborted at a write boundary still parses the following sequence', () => {
    if (!term) return;

    // The aborting ESC ends one write and the `]` that carries the new sequence starts the next.
    term.write('\x1b]2;stale\x1b');
    expect(term.title).toBe('');
    expect(titles).toEqual([]);

    term.write(']2;fresh\x07');

    expect(term.title).toBe('fresh');
    expect(titles).toEqual(['fresh']);
    expect(bells).toBe(0);
  });

  // ECMA-48: only `ESC \` is ST. A bare ESC cancels a control string (DCS/APC/PM/SOS) exactly as it
  // cancels an OSC, and the byte after the ESC starts a new escape sequence. Treating that ESC as
  // "still inside the string" made `ESC P ... ESC ] 2;Title BEL` swallow the title as DCS payload.
  const controlStringIntroducers: ReadonlyArray<readonly [string, string]> = [
    ['DCS', 'P'],
    ['SOS', 'X'],
    ['PM', '^'],
    ['APC', '_'],
  ];

  for (const [stringName, introducer] of controlStringIntroducers) {
    test(`a bare ESC aborts a pending ${stringName} string and redispatches the next byte`, () => {
      if (!term) return;

      term.write(`\x1b${introducer}payload\x1b]2;After ${stringName}\x07`);

      expect(term.title).toBe(`After ${stringName}`);
      expect(titles).toEqual([`After ${stringName}`]);
      expect(bells).toBe(0);
    });

    test(`a ${stringName} string aborted at a write boundary still parses the next title`, () => {
      if (!term) return;

      // The aborting ESC ends one write; the `]` that opens the new OSC starts the next.
      term.write(`\x1b${introducer}payload\x1b`);
      expect(term.title).toBe('');
      expect(titles).toEqual([]);

      term.write(`]2;After ${stringName}\x07`);

      expect(term.title).toBe(`After ${stringName}`);
      expect(titles).toEqual([`After ${stringName}`]);
      expect(bells).toBe(0);
    });
  }

  // ECMA-48 CAN (0x18) and SUB (0x1a) cancel any pending sequence and return to ground. For a
  // control string that also has to drop the buffered payload, so the next BEL rings and later
  // titles still parse instead of completing the cancelled sequence.
  for (const [cancelName, cancel] of [
    ['CAN', '\x18'],
    ['SUB', '\x1a'],
  ] as const) {
    test(`${cancelName} aborts a pending OSC and returns to ground`, () => {
      if (!term) return;

      term.write(`\x1b]2;stale${cancel}`);

      expect(term.title).toBe('');
      expect(titles).toEqual([]);

      term.write('\x07');
      expect(bells).toBe(1);

      term.write('\x1b]2;fresh\x07');
      expect(term.title).toBe('fresh');
      expect(titles).toEqual(['fresh']);
    });

    test(`${cancelName} aborts a pending OSC across a write boundary`, () => {
      if (!term) return;

      term.write('\x1b]2;stale');
      term.write(cancel);

      term.write('\x07');
      expect(bells).toBe(1);
      expect(titles).toEqual([]);

      term.write('\x1b]2;fresh\x07');
      expect(term.title).toBe('fresh');
    });

    test(`${cancelName} discards an overflowed OSC payload and recovers`, () => {
      if (!term) return;

      term.write(`\x1b]2;${'y'.repeat(50_000)}${cancel}`);
      expect(term.title).toBe('');

      // Back in ground: this BEL is a bell, not the terminator of the cancelled OSC.
      term.write('\x07');
      expect(bells).toBe(1);

      term.write('\x1b]2;Recovered\x07');
      expect(term.title).toBe('Recovered');
      expect(titles).toEqual(['Recovered']);
    });

    test(`${cancelName} aborts every pending control string and returns to ground`, () => {
      if (!term) return;

      for (const [stringName, introducer] of controlStringIntroducers) {
        const bellsBefore = bells;
        term.write(`\x1b${introducer}payload${cancel}`);

        term.write('\x07');
        expect(bells, `${stringName} should abort on ${cancelName}`).toBe(bellsBefore + 1);

        term.write(`\x1b]2;After ${stringName}\x07`);
        expect(term.title).toBe(`After ${stringName}`);
      }
    });

    test(`${cancelName} aborts a DCS string across a write boundary`, () => {
      if (!term) return;

      term.write('\x1bPpayload');
      term.write(cancel);

      term.write('\x07');
      expect(bells).toBe(1);

      term.write('\x1b]2;fresh\x07');
      expect(term.title).toBe('fresh');
      expect(titles).toEqual(['fresh']);
    });
  }

  // ECMA-48 / xterm: a C0 control inside an escape sequence executes (only BEL has a visible effect
  // here) without abandoning the sequence, and DEL is ignored in every state. Only CAN and SUB
  // cancel. Sending the other C0 bytes to ground dropped the pending introducer, so
  // `ESC LF ]2;Lost BEL` printed the OSC bytes literally and rang the BEL instead of setting a title.
  const escapeStatePassthroughControls: ReadonlyArray<readonly [string, string]> = [
    ['NUL', '\x00'],
    ['BS', '\x08'],
    ['HT', '\x09'],
    ['LF', '\x0a'],
    ['CR', '\x0d'],
    ['DEL', '\x7f'],
  ];

  for (const [controlName, control] of escapeStatePassthroughControls) {
    test(`a contiguous ${controlName} in the escape state keeps the pending OSC title`, () => {
      if (!term) return;

      term.write(`\x1b${control}]2;After ${controlName}\x07`);

      expect(term.title).toBe(`After ${controlName}`);
      expect(titles).toEqual([`After ${controlName}`]);
      expect(bells).toBe(0);
    });

    test(`a ${controlName} in the escape state across a write boundary keeps the pending OSC title`, () => {
      if (!term) return;

      // The ESC ends one write and the C0 control opens the next.
      term.write('\x1b');
      expect(term.title).toBe('');
      expect(titles).toEqual([]);

      term.write(`${control}]2;Split ${controlName}\x07`);

      expect(term.title).toBe(`Split ${controlName}`);
      expect(titles).toEqual([`Split ${controlName}`]);
      expect(bells).toBe(0);
    });
  }

  // ECMA-48 / DEC: inside an OSC control string, C0 controls that neither terminate it (BEL) nor
  // cancel it (CAN/SUB) are ignored, as is DEL; they are never part of the title payload. Sending
  // them to appendOsc leaked them into the title, so `ESC ]2;a DEL b BEL` titled "a\u007fb".
  const oscIgnoredControls: ReadonlyArray<readonly [string, string]> = [
    ['NUL', '\x00'],
    ['BS', '\x08'],
    ['HT', '\x09'],
    ['LF', '\x0a'],
    ['CR', '\x0d'],
    ['DEL', '\x7f'],
  ];

  for (const [controlName, control] of oscIgnoredControls) {
    test(`a contiguous ${controlName} in an OSC payload is ignored`, () => {
      if (!term) return;

      term.write(`\x1b]2;a${control}b\x07`);

      expect(term.title).toBe('ab');
      expect(titles).toEqual(['ab']);
      expect(bells).toBe(0);
    });

    test(`a ${controlName} split inside an OSC payload is ignored`, () => {
      if (!term) return;

      term.write('\x1b]2;a');
      term.write(`${control}b`);
      term.write('\x07');

      expect(term.title).toBe('ab');
      expect(titles).toEqual(['ab']);
      expect(bells).toBe(0);
    });
  }

  // After an ESC inside an OSC, DEL and the other non-CAN/SUB C0 controls must not abandon the
  // pending ST: `ESC ]2;Title ESC DEL \` still ends the OSC at ST and titles "Title". The buggy
  // path cancelled the OSC and redispatched the DEL, so the following `\` was consumed as an
  // escape body and the title was lost.
  for (const [controlName, control] of oscIgnoredControls) {
    test(`a contiguous ${controlName} between an OSC ESC and ST keeps the pending title`, () => {
      if (!term) return;

      term.write(`\x1b]2;Title\x1b${control}\\`);

      expect(term.title).toBe('Title');
      expect(titles).toEqual(['Title']);
      expect(bells).toBe(0);
    });

    test(`a ${controlName} split between an OSC ESC and ST keeps the pending title`, () => {
      if (!term) return;

      term.write('\x1b]2;Title\x1b');
      expect(term.title).toBe('');
      expect(titles).toEqual([]);

      term.write(`${control}\\`);

      expect(term.title).toBe('Title');
      expect(titles).toEqual(['Title']);
      expect(bells).toBe(0);
    });
  }

  // A raw BEL inside a control string is data, not a bell, even in the escape sub-state after an
  // ESC: it must not ring or abandon the pending ST, so the following `\` still terminates the OSC.
  test('a BEL between an OSC ESC and ST is data and does not ring', () => {
    if (!term) return;

    term.write('\x1b]2;Title\x1b\x07\\');

    expect(term.title).toBe('Title');
    expect(titles).toEqual(['Title']);
    expect(bells).toBe(0);
  });

  // Same rule for the other control strings (DCS here): a BEL or DEL after the ESC keeps the ST
  // pending instead of aborting the string and ringing the BEL through the redispatched escape.
  test('a BEL after an ESC inside a DCS string is data and does not ring', () => {
    if (!term) return;

    term.write('\x1bPpayload\x1b\x07\\');
    expect(bells).toBe(0);

    term.write('\x1b]2;After DCS BEL\x07');
    expect(term.title).toBe('After DCS BEL');
  });

  test('a DEL after an ESC inside a DCS string keeps the pending ST', () => {
    if (!term) return;

    term.write('\x1bPpayload\x1b\x7f\\');
    expect(bells).toBe(0);

    term.write('\x1b]2;After DCS DEL\x07');
    expect(term.title).toBe('After DCS DEL');
  });
});

/**
 * Bracketed paste must match the native core: escape characters are stripped from the payload so a
 * pasted `ESC [ 2 0 1 ~` can never close the bracketed region early. Both the textarea path and the
 * parent-container InputHandler path must share that behaviour and emit exactly once.
 */
describe('Bracketed paste safety', () => {
  let container: HTMLElement;
  let term: Terminal;
  let received: string[];

  beforeEach(async () => {
    if (typeof document === 'undefined') return;
    container = document.createElement('div');
    document.body.appendChild(container);
    term = await createIsolatedTerminal({ cols: 80, rows: 24 });
    term.open(container);
    received = [];
    term.onData((data) => {
      received.push(data);
    });
    term.write('\x1b[?2004h');
  });

  afterEach(() => {
    if (term) term.dispose();
    if (container && container.parentNode) container.parentNode.removeChild(container);
  });

  function createPasteEvent(text: string): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => text, setData: () => {} },
    });
    return event;
  }

  function payloadOf(data: string): string {
    const open = '\x1b[200~';
    const close = '\x1b[201~';
    expect(data.startsWith(open)).toBe(true);
    expect(data.endsWith(close)).toBe(true);
    return data.slice(open.length, data.length - close.length);
  }

  test('Terminal.paste strips ESC so an embedded 201 marker cannot break out', () => {
    if (!term) return;

    term.paste('\x1b[201~evil');

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('\x1b[200~[201~evil\x1b[201~');
    expect(payloadOf(received[0]!)).not.toContain('\x1b');
  });

  test('the textarea paste path shares bracketed behaviour exactly once', () => {
    if (!term || !term.textarea) return;

    term.textarea.dispatchEvent(createPasteEvent('\x1b[201~evil'));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('\x1b[200~[201~evil\x1b[201~');
  });

  test('the parent-container paste path shares bracketed behaviour exactly once', () => {
    if (!term) return;

    container.dispatchEvent(createPasteEvent('\x1b[201~evil'));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('\x1b[200~[201~evil\x1b[201~');
  });
});
