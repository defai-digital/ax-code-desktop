/**
 * Selection Manager Tests
 *
 * Tests for text selection functionality including:
 * - Basic selection operations
 * - Absolute coordinate system for scroll persistence
 * - Selection clearing behavior
 * - Auto-scroll during drag selection
 * - Copy functionality with scrollback
 *
 * Test Isolation Pattern:
 * Uses createIsolatedTerminal() to ensure each test gets its own WASM instance.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Terminal } from './terminal';
import { SelectionManager } from './selection-manager';
import { createIsolatedTerminal } from './test-helpers';

/**
 * Helper to set selection using absolute coordinates
 */
function setSelectionAbsolute(
  term: Terminal,
  startCol: number,
  startAbsRow: number,
  endCol: number,
  endAbsRow: number
): void {
  const selMgr = (term as any).selectionManager;
  if (selMgr) {
    (selMgr as any).selectionStart = { col: startCol, absoluteRow: startAbsRow };
    (selMgr as any).selectionEnd = { col: endCol, absoluteRow: endAbsRow };
  }
}

/**
 * Helper to convert viewport row to absolute row
 */
function viewportToAbsolute(term: Terminal, viewportRow: number): number {
  const scrollbackLength = term.wasmTerm?.getScrollbackLength() ?? 0;
  const viewportY = term.getViewportY();
  return scrollbackLength + viewportRow - Math.floor(viewportY);
}

describe('SelectionManager', () => {
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

  test('copy preserves logical lines, significant spaces and wide-cell overlaps', async () => {
    for (const [input, startCol, startRow, length, expected] of [
      ['ab  cd', 0, 0, 6, 'ab  cd'],
      ['abc中', 0, 0, 6, 'abc中'],
      ['a中b', 2, 0, 2, '中b'],
      ['ab  ', 0, 0, 3, 'ab '],
      ['ab\u00a0', 0, 0, 4, 'ab\u00a0'],
      ['ab\r\ncd', 0, 0, 6, 'ab\ncd'],
      ['abcd\r\nefgh\r\nijkl', 3, 2, 20, 'l'],
    ] as const) {
      const term = await createIsolatedTerminal({ cols: 4, rows: 3 });
      term.open(container!);
      try {
        term.write(input);
        term.select(startCol, startRow, length);
        expect(term.getSelection(), JSON.stringify(input)).toBe(expected);
      } finally { term.dispose(); }
    }
  });

  test('a click without dragging neither selects a character nor copies it', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 3 });
    term.open(container!);
    const manager = (term as any).selectionManager;
    const copied: string[] = [];
    manager.copy = async (value: string) => { copied.push(value); };
    try {
      term.write('ABC');
      const canvas = (term as any).renderer.getCanvas() as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      expect(copied).toEqual([]);
      expect(term.getSelection()).toBe('');
      expect(term.hasSelection()).toBe(false);
      expect(term.getSelectionPosition()).toBeUndefined();
    } finally { term.dispose(); }
  });

  test('the selection API includes a single cell', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 3 });
    term.open(container!);
    try {
      term.write('ABC');
      term.select(0, 0, 1);
      expect(term.getSelection()).toBe('A');
      expect(term.hasSelection()).toBe(true);
      expect(term.getSelectionPosition()).toEqual({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
    } finally { term.dispose(); }
  });

  test('zero and negative selection lengths clear the held range', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 3 });
    term.open(container!);
    try {
      term.write('ABC');
      for (const length of [0, -1, 0.5]) {
        term.select(0, 0, 2);
        term.select(1, 0, length);
        expect(term.getSelection()).toBe('');
        expect(term.hasSelection()).toBe(false);
        expect(term.getSelectionPosition()).toBeUndefined();
      }
    } finally { term.dispose(); }
  });

  test('non-finite selection arguments fail without replacing the held range', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 3 });
    term.open(container!);
    try {
      term.write('ABC'); term.select(0, 0, 2);
      for (const value of [NaN, Infinity, -Infinity]) {
        for (const args of [[value, 0, 1], [0, value, 1], [0, 0, value]]) {
          expect(() => term.select(args[0], args[1], args[2])).toThrow(RangeError);
          expect(term.getSelection()).toBe('AB');
        }
        expect(() => term.selectLines(value, 0)).toThrow(RangeError);
        expect(() => term.selectLines(0, value)).toThrow(RangeError);
        expect(term.getSelection()).toBe('AB');
      }
    } finally { term.dispose(); }
  });

  test('auto-scroll preserves the drag endpoint at both retained-buffer boundaries', async () => {
    for (const [history, direction] of [[false, -1], [true, -1], [true, 1]] as const) {
      const term = await createIsolatedTerminal({ cols: 8, rows: 3, scrollback: 20 });
      term.open(container!);
      try {
        term.write(history ? 'a中bc\r\na中bc\r\na中bc\r\na中bc\r\na中bc' : 'a中bc');
        if (direction < 0) term.scrollToTop();
        const base = term.wasmTerm!.getScrollbackLength() - term.getViewportY();
        const row = direction < 0 ? 0 : 2;
        setSelectionAbsolute(term, 2, base + row, 3, base + row);
        const manager = (term as any).selectionManager;
        const before = manager.getSelection();
        expect(before).toBe('中b');
        manager.isSelecting = true; manager.autoScroll(direction);
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(manager.getSelection()).toBe(before);
      } finally { term.dispose(); }
    }
  });

  test('selection follows retained row identity when bounded history evicts rows', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 2, scrollback: 2 });
    term.open(container!);
    try {
      term.write('zero\r\none\r\ntwo\r\nthree');
      term.scrollToTop();
      term.select(0, 1, 3);
      expect(term.getSelection()).toBe('one');
      term.write('\r\nfour');
      expect(term.getSelection()).toBe('one');
      term.write('\r\nfive');
      expect(term.getSelection()).toBe('');
      expect(term.hasSelection()).toBe(false);
    } finally { term.dispose(); }
  });

  test('selection highlights both wide columns and clears after resize reflow', async () => {
    const term = await createIsolatedTerminal({ cols: 8, rows: 3 });
    term.open(container!);
    try {
      term.write('a中bc');
      term.select(2, 0, 2);
      expect(term.getSelectionPosition()).toEqual({ start: { x: 1, y: 0 }, end: { x: 3, y: 0 } });
      expect(term.getSelection()).toBe('中b');
      term.select(0, 0, 2);
      expect(term.getSelectionPosition()).toEqual({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });
      expect(term.getSelection()).toBe('a中');
      term.resize(4, 3);
      expect(term.getSelection()).toBe('');
      expect(term.hasSelection()).toBe(false);
    } finally { term.dispose(); }
  });

  describe('Construction', () => {
    test('creates without errors', async () => {
      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      expect(term).toBeDefined();
    });
  });

  describe('API', () => {
    test('has required public methods', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      const selMgr = (term as any).selectionManager;
      expect(typeof selMgr.getSelection).toBe('function');
      expect(typeof selMgr.hasSelection).toBe('function');
      expect(typeof selMgr.clearSelection).toBe('function');
      expect(typeof selMgr.selectAll).toBe('function');
      expect(typeof selMgr.getSelectionCoords).toBe('function');
      expect(typeof selMgr.dispose).toBe('function');
      expect(typeof selMgr.getDirtySelectionRows).toBe('function');
      expect(typeof selMgr.clearDirtySelectionRows).toBe('function');

      term.dispose();
    });
  });

  describe('Selection with absolute coordinates', () => {
    test('hasSelection returns false when no selection', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.hasSelection()).toBe(false);

      term.dispose();
    });

    test('hasSelection returns true when selection exists', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Hello World\r\n');

      // Set selection using absolute coordinates
      setSelectionAbsolute(term, 0, 0, 5, 0);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.hasSelection()).toBe(true);

      term.dispose();
    });

    test('hasSelection returns false for an uncommitted single-cell anchor', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      // A mouse-down anchor at one cell is not an explicit API range
      setSelectionAbsolute(term, 5, 0, 5, 0);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.hasSelection()).toBe(false);

      term.dispose();
    });

    test('clearSelection clears selection and marks rows dirty', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Line 1\r\nLine 2\r\nLine 3\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen, 5, scrollbackLen + 2);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.hasSelection()).toBe(true);

      selMgr.clearSelection();

      expect(selMgr.hasSelection()).toBe(false);
      // Dirty rows should be marked for redraw
      const dirtyRows = selMgr.getDirtySelectionRows();
      expect(dirtyRows.size).toBeGreaterThan(0);

      term.dispose();
    });
  });

  describe('Selection text extraction', () => {
    test('getSelection returns empty string when no selection', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.getSelection()).toBe('');

      term.dispose();
    });

    test('getSelection extracts text from screen buffer', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Hello World\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      // Select "Hello" (first 5 characters)
      setSelectionAbsolute(term, 0, scrollbackLen, 4, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.getSelection()).toBe('Hello');

      term.dispose();
    });

    test('getSelection extracts multi-line text', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Line 1\r\nLine 2\r\nLine 3\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      // Select all three lines
      setSelectionAbsolute(term, 0, scrollbackLen, 5, scrollbackLen + 2);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');
      expect(text).toContain('Line 3');

      term.dispose();
    });

    test('getSelection extracts text from scrollback', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
      term.open(container);

      // Write enough lines to create scrollback
      for (let i = 0; i < 50; i++) {
        term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
      }

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      expect(scrollbackLen).toBeGreaterThan(0);

      // Select from scrollback (first few lines)
      setSelectionAbsolute(term, 0, 0, 10, 2);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      expect(text).toContain('Line 000');
      expect(text).toContain('Line 001');
      expect(text).toContain('Line 002');

      term.dispose();
    });

    test('getSelection omits the spacer cell after a wide character (漢a)', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      // 漢 is two cells wide, so cell 1 is its zero-width spacer; "a" is cell 2.
      term.write('漢a\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen, 2, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.getSelection()).toBe('漢a');

      term.dispose();
    });

    test('getSelection omits the spacer cell before a trailing wide character (a漢b)', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      // Cells: 0="a", 1="漢", 2=spacer, 3="b".
      term.write('a漢b\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen, 3, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.getSelection()).toBe('a漢b');

      term.dispose();
    });

    test('getSelection extracts text spanning scrollback and screen', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
      term.open(container);

      // Write enough lines to fill scrollback and screen
      for (let i = 0; i < 50; i++) {
        term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
      }

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();

      // Select spanning scrollback and screen
      // End of scrollback through beginning of screen
      setSelectionAbsolute(term, 0, scrollbackLen - 2, 10, scrollbackLen + 2);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      // Should contain lines from both regions
      expect(text.split('\n').length).toBeGreaterThanOrEqual(4);

      term.dispose();
    });
  });

  describe('Selection persistence during scroll', () => {
    test('selection coordinates are preserved when scrolling', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
      term.open(container);

      // Write content
      for (let i = 0; i < 50; i++) {
        term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
      }

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();

      // Set selection at specific absolute position
      const startAbsRow = scrollbackLen + 5;
      const endAbsRow = scrollbackLen + 10;
      setSelectionAbsolute(term, 0, startAbsRow, 10, endAbsRow);

      const selMgr = (term as any).selectionManager;
      const textBefore = selMgr.getSelection();

      // Scroll up
      term.scrollLines(-10);

      // Selection should still return the same text
      const textAfter = selMgr.getSelection();
      expect(textAfter).toBe(textBefore);

      term.dispose();
    });

    test('selection coords convert correctly after scrolling', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
      term.open(container);

      // Write content
      for (let i = 0; i < 50; i++) {
        term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
      }

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();

      // Set selection in screen buffer area
      setSelectionAbsolute(term, 0, scrollbackLen, 10, scrollbackLen + 5);

      const selMgr = (term as any).selectionManager;

      // Get viewport coords before scroll
      const coordsBefore = selMgr.getSelectionCoords();
      expect(coordsBefore).not.toBeNull();

      // Scroll up 10 lines
      term.scrollLines(-10);

      // Get viewport coords after scroll - they should have shifted
      const coordsAfter = selMgr.getSelectionCoords();
      expect(coordsAfter).not.toBeNull();

      // Viewport row should have increased by the scroll amount
      expect(coordsAfter!.startRow).toBe(coordsBefore!.startRow + 10);
      expect(coordsAfter!.endRow).toBe(coordsBefore!.endRow + 10);

      term.dispose();
    });

    test('selection outside viewport returns null coords but preserves text', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
      term.open(container);

      // Write content
      for (let i = 0; i < 100; i++) {
        term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
      }

      // Select near the bottom of the buffer
      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen + 10, 10, scrollbackLen + 15);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      // Scroll to top - selection should be way off screen
      term.scrollToTop();

      // Coords should be null (off screen) but text should still work
      const coords = selMgr.getSelectionCoords();
      expect(coords).toBeNull();

      // Text extraction should still work
      expect(selMgr.getSelection()).toBe(text);

      term.dispose();
    });
  });

  describe('Dirty row tracking', () => {
    test('getDirtySelectionRows returns empty set initially', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      const selMgr = (term as any).selectionManager;
      expect(selMgr.getDirtySelectionRows().size).toBe(0);

      term.dispose();
    });

    test('clearSelection marks selection rows as dirty', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Test content\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen, 5, scrollbackLen + 3);

      const selMgr = (term as any).selectionManager;
      selMgr.clearSelection();

      const dirtyRows = selMgr.getDirtySelectionRows();
      expect(dirtyRows.size).toBeGreaterThan(0);

      term.dispose();
    });

    test('clearDirtySelectionRows clears the set', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Test\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      setSelectionAbsolute(term, 0, scrollbackLen, 5, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      selMgr.clearSelection();

      expect(selMgr.getDirtySelectionRows().size).toBeGreaterThan(0);

      selMgr.clearDirtySelectionRows();

      expect(selMgr.getDirtySelectionRows().size).toBe(0);

      term.dispose();
    });
  });

  describe('Backward selection', () => {
    test('handles selection from right to left', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Hello World\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      // Select backwards (end before start)
      setSelectionAbsolute(term, 10, scrollbackLen, 0, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      expect(text).toBe('Hello World');

      term.dispose();
    });

    test('handles selection from bottom to top', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Line 1\r\nLine 2\r\nLine 3\r\n');

      const scrollbackLen = term.wasmTerm!.getScrollbackLength();
      // Select backwards (end row before start row)
      setSelectionAbsolute(term, 5, scrollbackLen + 2, 0, scrollbackLen);

      const selMgr = (term as any).selectionManager;
      const text = selMgr.getSelection();

      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');
      expect(text).toContain('Line 3');

      term.dispose();
    });
  });

  describe('selectAll', () => {
    test('selectAll selects entire viewport', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Hello\r\nWorld\r\n');

      const selMgr = (term as any).selectionManager;
      selMgr.selectAll();

      expect(selMgr.hasSelection()).toBe(true);

      const coords = selMgr.getSelectionCoords();
      expect(coords).not.toBeNull();
      expect(coords!.startRow).toBe(0);
      expect(coords!.startCol).toBe(0);
      expect(coords!.endRow).toBe(23); // rows - 1

      term.dispose();
    });
  });

  describe('select() API', () => {
    test('select() creates selection at specified position', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Hello World\r\n');

      const selMgr = (term as any).selectionManager;
      selMgr.select(0, 0, 5);

      expect(selMgr.hasSelection()).toBe(true);
      expect(selMgr.getSelection()).toBe('Hello');

      term.dispose();
    });
  });

  describe('selectLines() API', () => {
    test('selectLines() selects entire lines', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);

      term.write('Line 1\r\nLine 2\r\nLine 3\r\n');

      const selMgr = (term as any).selectionManager;
      selMgr.selectLines(0, 1);

      expect(selMgr.hasSelection()).toBe(true);

      const text = selMgr.getSelection();
      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');

      term.dispose();
    });
  });

  describe('Document listener cleanup', () => {
    test('dispose() removes the document mousedown tracker with the identical reference', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });

      const added: Array<[string, EventListenerOrEventListenerObject]> = [];
      const removed: Array<[string, EventListenerOrEventListenerObject]> = [];
      const origAdd = document.addEventListener;
      const origRemove = document.removeEventListener;
      document.addEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
        added.push([type, listener]);
        return origAdd.call(this, type, listener, options);
      } as typeof document.addEventListener;
      document.removeEventListener = function (this: EventTarget, type: string, listener: any, options?: any) {
        removed.push([type, listener]);
        return origRemove.call(this, type, listener, options);
      } as typeof document.removeEventListener;
      try {
        term.open(container);
        term.dispose();
      } finally {
        document.addEventListener = origAdd;
        document.removeEventListener = origRemove;
      }

      const mousedownAdds = added.filter(([type]) => type === 'mousedown');
      const mousedownRemoves = removed.filter(([type]) => type === 'mousedown');
      expect(mousedownAdds.length).toBeGreaterThan(0);
      expect(mousedownRemoves.length).toBe(mousedownAdds.length);
      for (const [, handler] of mousedownAdds) {
        expect(mousedownRemoves.some(([, removedHandler]) => removedHandler === handler)).toBe(true);
      }
    });

    test('a reused document is not affected by a leaked mousedown tracker', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);
      const selMgr = (term as any).selectionManager;
      expect(selMgr).toBeDefined();
      term.dispose();

      // The pre-fix anonymous tracker kept mutating the disposed manager's
      // mouseDownTarget on every document mousedown
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      outside.remove();
      expect(selMgr.mouseDownTarget).toBeNull();
    });
  });

  describe('Canvas listener cleanup', () => {
    test('dispose() removes the five canvas selection listeners with identical references', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);
      const selMgr = (term as any).selectionManager;
      const canvas = (term as any).renderer.getCanvas() as HTMLCanvasElement;

      // Capture registration through the DOM API, independent of private field names.
      const stored: Array<[string, EventListenerOrEventListenerObject]> = [];
      const originalAdd = canvas.addEventListener;
      canvas.addEventListener = function (type: string, callback: any, options?: any) {
        stored.push([type, callback]); return originalAdd.call(this, type, callback, options);
      } as typeof canvas.addEventListener;
      let manager: SelectionManager;
      try { manager = new SelectionManager(term, (term as any).renderer, term.wasmTerm!, term.textarea!); }
      finally { canvas.addEventListener = originalAdd; }
      expect(stored.map(([type]) => type)).toEqual(expect.arrayContaining(['mousedown', 'mousemove', 'mouseleave', 'mouseenter', 'dblclick']));

      const removed: Array<[string, unknown]> = [];
      const origRemove = canvas.removeEventListener;
      (canvas as any).removeEventListener = function (type: string, listener: any, options?: any) {
        removed.push([type, listener]);
        return origRemove.call(this, type, listener, options);
      };
      try {
        manager!.dispose();
      } finally {
        canvas.removeEventListener = origRemove;
      }

      for (const [type, handler] of stored) {
        const match = removed.find(([, removedHandler]) => removedHandler === handler);
        expect(match?.[0]).toBe(type);
      }

      term.dispose();
    });

    test('a disposed manager no longer reacts to canvas selection events', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);
      term.write('Hello World\r\n');

      const selMgr = (term as any).selectionManager;
      const canvas = (term as any).renderer.getCanvas() as HTMLCanvasElement;

      // The live manager reacts to a canvas mousedown: it starts a selection.
      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      expect(selMgr.isSelecting).toBe(true);

      selMgr.dispose();

      // Reset every observable the handlers mutate, so any remaining listener
      // would be visible as a state change after the events below.
      selMgr.isSelecting = false;
      selMgr.selectionStart = null;
      selMgr.selectionEnd = null;
      selMgr.mouseDownTarget = null;
      selMgr.dirtySelectionRows.clear();

      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(selMgr.isSelecting).toBe(false);
      expect(selMgr.selectionStart).toBeNull();
      expect(selMgr.hasSelection()).toBe(false);

      term.dispose();
    });

    test('repeated dispose() is safe and keeps the manager inert', async () => {
      if (!container) return;

      const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
      term.open(container);
      const selMgr = (term as any).selectionManager;
      const canvas = (term as any).renderer.getCanvas() as HTMLCanvasElement;

      expect(() => {
        selMgr.dispose();
        selMgr.dispose();
      }).not.toThrow();

      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(selMgr.isSelecting).toBe(false);
      expect(selMgr.mouseDownTarget).toBeNull();

      term.dispose();
    });
  });
});

describe('Programmatic selection in a scrolled viewport', () => {
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

  /**
   * 100 numbered lines leave 77 lines of scrollback on a 24-row screen.
   * Scrolling back 50 lines puts "Line 027" at the top visible row.
   */
  async function openScrolledTerminal(): Promise<Terminal> {
    if (!container) throw new Error('test container missing');
    const term = await createIsolatedTerminal({ cols: 80, rows: 24, scrollback: 1000 });
    term.open(container);
    for (let i = 0; i < 100; i++) {
      term.write(`Line ${i.toString().padStart(3, '0')}\r\n`);
    }
    term.scrollLines(-50);
    expect(term.getViewportY()).toBe(50);
    return term;
  }

  test('selectAll selects the visible rows instead of old scrollback', async () => {
    const term = await openScrolledTerminal();

    term.selectAll();

    const lines = term.getSelection().split('\n');
    expect(lines).toHaveLength(24);
    expect(lines[0]).toBe('Line 027');
    expect(lines[23]).toBe('Line 050');

    term.dispose();
  });

  test('select maps viewport rows through the scrollback offset', async () => {
    const term = await openScrolledTerminal();

    term.select(0, 0, 9);

    expect(term.getSelection()).toBe('Line 027');

    term.dispose();
  });

  test('selectLines maps viewport rows through the scrollback offset', async () => {
    const term = await openScrolledTerminal();

    term.selectLines(0, 0);

    expect(term.getSelection()).toBe('Line 027');

    term.dispose();
  });
});
