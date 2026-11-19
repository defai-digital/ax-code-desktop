/**
 * Comprehensive test suite for FitAddon
 *
 * Note: Most FitAddon tests require DOM APIs (document, window, getComputedStyle).
 * These tests focus on basic functionality that doesn't require DOM.
 * For full integration tests, see examples/terminal-demo.html
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { vi } from 'vitest';
import { FitAddon } from './fit';

// ============================================================================
// Mock Terminal Implementation
// ============================================================================

class MockTerminal {
  public element?: HTMLElement;
  public cols = 80;
  public rows = 24;
  public renderer = {
    getMetrics: () => ({ width: 9, height: 16, baseline: 12 }),
  };

  public resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('FitAddon', () => {
  let addon: FitAddon;
  let terminal: MockTerminal;

  beforeEach(() => {
    addon = new FitAddon();
    terminal = new MockTerminal();
  });

  afterEach(() => {
    addon.dispose();
  });

  // ==========================================================================
  // Activation & Disposal Tests
  // ==========================================================================

  test('activates successfully', () => {
    expect(() => addon.activate(terminal as any)).not.toThrow();
  });

  test('disposes successfully', () => {
    addon.activate(terminal as any);
    expect(() => addon.dispose()).not.toThrow();
  });

  test('can activate and dispose multiple times', () => {
    addon.activate(terminal as any);
    addon.dispose();
    addon.activate(terminal as any);
    addon.dispose();
  });

  // ==========================================================================
  // proposeDimensions() Tests
  // ==========================================================================

  test('proposeDimensions returns undefined without element', () => {
    addon.activate(terminal as any);
    const dims = addon.proposeDimensions();
    expect(dims).toBeUndefined();
  });

  test('proposeDimensions returns undefined without renderer', () => {
    // Remove renderer
    (terminal as any).renderer = undefined;
    terminal.element = {} as HTMLElement;
    addon.activate(terminal as any);

    const dims = addon.proposeDimensions();
    expect(dims).toBeUndefined();
  });

  // ==========================================================================
  // fit() Tests
  // ==========================================================================

  test('fit() does nothing without element', () => {
    addon.activate(terminal as any);
    const originalCols = terminal.cols;
    const originalRows = terminal.rows;

    addon.fit();

    expect(terminal.cols).toBe(originalCols);
    expect(terminal.rows).toBe(originalRows);
  });

  // ==========================================================================
  // observeResize() Tests
  // ==========================================================================

  test('observeResize() does not throw without element', () => {
    addon.activate(terminal as any);
    expect(() => addon.observeResize()).not.toThrow();
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  test('full workflow: activate → fit → observeResize → dispose', () => {
    // Activate
    addon.activate(terminal as any);

    // Initial fit (no-op without element)
    addon.fit();

    // Setup auto-resize (no-op without element)
    addon.observeResize();

    // Dispose
    addon.dispose();
  });

  test('fit() after dispose does nothing', () => {
    addon.activate(terminal as any);
    addon.dispose();

    const originalCols = terminal.cols;
    const originalRows = terminal.rows;

    addon.fit();

    expect(terminal.cols).toBe(originalCols);
    expect(terminal.rows).toBe(originalRows);
  });

  test('reused addon can fit immediately after disposal', () => {
    addon.activate(terminal as any);
    addon.proposeDimensions = () => ({ cols: 90, rows: 30 });
    addon.fit();
    expect(terminal.cols).toBe(90);
    addon.dispose();
    addon.activate(terminal as any);
    addon.proposeDimensions = () => ({ cols: 100, rows: 40 });
    addon.fit();
    expect(terminal.cols).toBe(100);
  });

  test('fit() prevents feedback loops by tracking dimensions', () => {
    addon.activate(terminal as any);

    // Track how many times resize is called
    let resizeCallCount = 0;
    const originalResize = terminal.resize.bind(terminal);
    terminal.resize = (cols: number, rows: number) => {
      resizeCallCount++;
      originalResize(cols, rows);
    };

    // First fit() should call resize
    addon.fit();
    expect(resizeCallCount).toBe(0); // No element, so no resize

    // Calling fit() multiple times without dimension change should not resize again
    addon.fit();
    addon.fit();
    addon.fit();
    expect(resizeCallCount).toBe(0); // Still 0 because no element
  });
});

// ==========================================================================
// Maximum dimension cap
// ==========================================================================

describe('Maximum dimension cap', () => {
  let addon: FitAddon;

  beforeEach(() => {
    addon = new FitAddon();
  });

  afterEach(() => {
    addon.dispose();
  });

  /**
   * 900x480 with 9x16 metrics and the 15px scrollbar reservation is 98x30;
   * oversized values are only reachable by making the container huge.
   */
  const createTerminal = (width: number, height: number, cell: { width: number; height: number }) => {
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(mockElement, 'clientHeight', { value: height, configurable: true });

    const calls: Array<{ cols: number; rows: number }> = [];
    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        getMetrics: () => ({ width: cell.width, height: cell.height, baseline: 12 }),
      },
      resize: (cols: number, rows: number) => {
        calls.push({ cols, rows });
        mockTerminal.cols = cols;
        mockTerminal.rows = rows;
      },
    };

    return { mockTerminal, calls };
  };

  test('fractional CSS padding cannot add a row or column that overflows the container', () => {
    const { mockTerminal, calls } = createTerminal(915, 480, { width: 9, height: 16 });
    mockTerminal.element.style.padding = '0.5px';
    document.body.appendChild(mockTerminal.element);
    try {
      addon.activate(mockTerminal as any);
      addon.fit();
      expect(calls).toEqual([{ cols: 99, rows: 29 }]);
    } finally { mockTerminal.element.remove(); }
  });

  test('proposeDimensions caps columns at 4096 for an oversized container', () => {
    const { mockTerminal } = createTerminal(1_000_000, 480, { width: 9, height: 16 });
    addon.activate(mockTerminal as any);

    expect(addon.proposeDimensions()).toEqual({ cols: 4096, rows: 30 });
  });

  test('proposeDimensions caps rows at 4096 for an oversized container', () => {
    const { mockTerminal } = createTerminal(900, 1_000_000, { width: 9, height: 16 });
    addon.activate(mockTerminal as any);

    expect(addon.proposeDimensions()).toEqual({ cols: 98, rows: 4096 });
  });

  test('fit() resizes with capped dimensions instead of the raw container size', () => {
    const { mockTerminal, calls } = createTerminal(1_000_000, 1_000_000, { width: 1, height: 1 });
    addon.activate(mockTerminal as any);

    addon.fit();

    expect(calls).toEqual([{ cols: 4096, rows: 256 }]);
    expect(mockTerminal.cols).toBe(4096);
    expect(mockTerminal.rows).toBe(256);
  });
});

// ==========================================================================
// Reactivation cleanup
// ==========================================================================

describe('Reactivation cleanup', () => {
  class FakeResizeObserver {
    public static instances: FakeResizeObserver[] = [];
    public observed: Element[] = [];
    public disconnected = 0;

    constructor(public callback: (entries: unknown[]) => void) {
      FakeResizeObserver.instances.push(this);
    }

    public observe(target: Element): void {
      this.observed.push(target);
    }

    public unobserve(): void {}

    public disconnect(): void {
      this.disconnected++;
    }
  }

  let addon: FitAddon;
  let originalResizeObserver: typeof globalThis.ResizeObserver;

  /** 900x480 with 9x16 metrics is 98x30 (15px scrollbar reservation). */
  const createTerminal = () => {
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(mockElement, 'clientHeight', { value: 480, configurable: true });

    let resizeCallCount = 0;
    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        getMetrics: () => ({ width: 9, height: 16, baseline: 12 }),
      },
      resize: (cols: number, rows: number) => {
        resizeCallCount++;
        mockTerminal.cols = cols;
        mockTerminal.rows = rows;
      },
    };

    return { mockTerminal, getResizeCallCount: () => resizeCallCount };
  };

  beforeEach(() => {
    addon = new FitAddon();
    FakeResizeObserver.instances.length = 0;
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    addon.dispose();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  test('activate() disconnects the previous observer and observes the new element', () => {
    const first = createTerminal();
    const second = createTerminal();

    addon.activate(first.mockTerminal as any);
    addon.observeResize();
    addon.activate(second.mockTerminal as any);
    addon.observeResize();

    expect(FakeResizeObserver.instances).toHaveLength(2);
    // The first observer is disconnected, so the browser stops delivering the
    // old element's resize events into this addon.
    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(1);
    expect(FakeResizeObserver.instances[0]!.observed).toEqual([first.mockTerminal.element]);
    // Reactivation observes the new terminal's element, not the stale one.
    expect(FakeResizeObserver.instances[1]!.observed).toEqual([second.mockTerminal.element]);
    expect(second.getResizeCallCount()).toBe(0);
  });

  test('activate() clears a pending debounce so a stale resize cannot fit the new terminal', () => {
    vi.useFakeTimers();
    try {
      const first = createTerminal();
      const second = createTerminal();

      addon.activate(first.mockTerminal as any);
      addon.observeResize();

      // A container resize on the first terminal schedules a debounced fit.
      FakeResizeObserver.instances[0]!.callback([{}]);

      addon.activate(second.mockTerminal as any);
      vi.advanceTimersByTime(500);

      expect(second.getResizeCallCount()).toBe(0);
      expect(second.mockTerminal.cols).toBe(80);
      expect(second.mockTerminal.rows).toBe(24);
    } finally {
      vi.useRealTimers();
    }
  });

  test('activate() resets the settle window so the new terminal fits immediately', () => {
    vi.useFakeTimers();
    try {
      const first = createTerminal();
      const second = createTerminal();

      addon.activate(first.mockTerminal as any);
      addon.fit();
      expect(first.getResizeCallCount()).toBe(1); // first terminal's settle window is open

      addon.activate(second.mockTerminal as any);
      addon.fit();

      // Not queued behind the previous terminal's 50ms guard.
      expect(second.getResizeCallCount()).toBe(1);
      expect(second.mockTerminal.cols).toBe(98);
      expect(second.mockTerminal.rows).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ==========================================================================
// Dimension Calculation Tests
// ==========================================================================

describe('Dimension Calculation', () => {
  let addon: FitAddon;

  beforeEach(() => {
    addon = new FitAddon();
  });

  afterEach(() => {
    addon.dispose();
  });

  test('fit() calculates correct dimensions from container', () => {
    // Create a mock element with known dimensions
    // FitAddon subtracts 15px for scrollbar, so we need to account for that
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(mockElement, 'clientHeight', { value: 480, configurable: true });

    let resizedCols = 0;
    let resizedRows = 0;

    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        // 9px wide chars, 16px tall
        getMetrics: () => ({ width: 9, height: 16, baseline: 12 }),
      },
      resize: (cols: number, rows: number) => {
        resizedCols = cols;
        resizedRows = rows;
        mockTerminal.cols = cols;
        mockTerminal.rows = rows;
      },
    };

    addon.activate(mockTerminal as any);
    addon.fit();

    // Expected: (900 - 15 scrollbar) / 9 = 98 cols, 480 / 16 = 30 rows
    expect(resizedCols).toBe(98);
    expect(resizedRows).toBe(30);
  });

  test('proposeDimensions returns correct values', () => {
    // FitAddon subtracts 15px for scrollbar width
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: 720, configurable: true });
    Object.defineProperty(mockElement, 'clientHeight', { value: 384, configurable: true });

    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        getMetrics: () => ({ width: 8, height: 16, baseline: 12 }),
      },
      resize: () => {},
    };

    addon.activate(mockTerminal as any);
    const dims = addon.proposeDimensions();

    // Expected: (720 - 15 scrollbar) / 8 = 88 cols, 384 / 16 = 24 rows
    expect(dims).toEqual({ cols: 88, rows: 24 });
  });
});

// ==========================================================================
// External Resize Tests
// ==========================================================================

describe('External resize refit', () => {
  let addon: FitAddon;

  beforeEach(() => {
    addon = new FitAddon();
  });

  afterEach(() => {
    addon.dispose();
  });

  const createFittableTerminal = () => {
    // FitAddon subtracts 15px for scrollbar: (900 - 15) / 9 = 98 cols, 480 / 16 = 30 rows
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(mockElement, 'clientHeight', { value: 480, configurable: true });

    let resizeCallCount = 0;
    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        getMetrics: () => ({ width: 9, height: 16, baseline: 12 }),
      },
      resize: (cols: number, rows: number) => {
        resizeCallCount++;
        mockTerminal.cols = cols;
        mockTerminal.rows = rows;
      },
    };

    return { mockTerminal, getResizeCallCount: () => resizeCallCount };
  };

  const settleGuard = () => new Promise((resolve) => setTimeout(resolve, 60));

  test('fit() refits after the 50ms guard when an external resize diverged from the proposal', async () => {
    const { mockTerminal, getResizeCallCount } = createFittableTerminal();
    addon.activate(mockTerminal as any);

    addon.fit();
    expect(getResizeCallCount()).toBe(1);
    expect(mockTerminal.cols).toBe(98);
    expect(mockTerminal.rows).toBe(30);

    // External terminal.resize diverges from the container-derived proposal
    mockTerminal.cols = 50;
    mockTerminal.rows = 20;

    // Feedback protection retained: fit() stays quiet while the 50ms
    // re-entrancy guard from the previous resize is active
    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    // Current dimensions are authoritative once the guard expires: the
    // proposal must be applied again even though it matches the last fit
    await settleGuard();
    addon.fit();
    expect(getResizeCallCount()).toBe(2);
    expect(mockTerminal.cols).toBe(98);
    expect(mockTerminal.rows).toBe(30);
  });

  test('fit() is a no-op when current dimensions already match the proposal', async () => {
    const { mockTerminal, getResizeCallCount } = createFittableTerminal();
    addon.activate(mockTerminal as any);

    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    await settleGuard();
    addon.fit();
    expect(getResizeCallCount()).toBe(1);
  });

  test('fit() refits again after a later external resize beyond the first guard window', async () => {
    const { mockTerminal, getResizeCallCount } = createFittableTerminal();
    addon.activate(mockTerminal as any);

    addon.fit();
    await settleGuard();

    mockTerminal.cols = 50;
    mockTerminal.rows = 20;
    addon.fit();
    expect(getResizeCallCount()).toBe(2);

    await settleGuard();
    mockTerminal.cols = 40;
    mockTerminal.rows = 10;
    addon.fit();
    expect(getResizeCallCount()).toBe(3);
    expect(mockTerminal.cols).toBe(98);
    expect(mockTerminal.rows).toBe(30);
  });
  test('a container resize inside the guard window is refit once the guard ends', async () => {
    const { mockTerminal, getResizeCallCount } = createFittableTerminal();
    const original = globalThis.ResizeObserver;
    let observed: ((entries: unknown[]) => void) | undefined;
    globalThis.ResizeObserver = class {
      constructor(callback: (entries: unknown[]) => void) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as any;
    try {
      addon.activate(mockTerminal as any);
      addon.observeResize();
      addon.fit();
      expect(getResizeCallCount()).toBe(1);

      // The container changes while the guard from our own resize is still active.
      mockTerminal.cols = 50;
      mockTerminal.rows = 20;
      observed!([{}]);
      expect(getResizeCallCount()).toBe(1);

      await settleGuard();
      expect(getResizeCallCount()).toBe(2);
      expect(mockTerminal.cols).toBe(98);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});

// ==========================================================================
// Direct fit() during the settle window
// ==========================================================================

describe('Direct fit() during the settle window', () => {
  let addon: FitAddon;

  beforeEach(() => {
    addon = new FitAddon();
    vi.useFakeTimers();
  });

  afterEach(() => {
    addon.dispose();
    vi.useRealTimers();
  });

  /**
   * The container size is mutable so a test can model a real layout change
   * between fits. Metrics are 9x16 with a 15px scrollbar reservation:
   * 900x480 -> 98x30, 500x240 -> 53x15.
   */
  const createFittableTerminal = (size: { width: number; height: number }) => {
    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', {
      get: () => size.width,
      configurable: true,
    });
    Object.defineProperty(mockElement, 'clientHeight', {
      get: () => size.height,
      configurable: true,
    });

    let resizeCallCount = 0;
    const mockTerminal = {
      cols: 80,
      rows: 24,
      element: mockElement,
      renderer: {
        getMetrics: () => ({ width: 9, height: 16, baseline: 12 }),
      },
      resize: (cols: number, rows: number) => {
        resizeCallCount++;
        mockTerminal.cols = cols;
        mockTerminal.rows = rows;
      },
    };

    return { mockTerminal, getResizeCallCount: () => resizeCallCount };
  };

  test('fit() called during the 50ms guard is queued and applied once the guard ends', () => {
    const size = { width: 900, height: 480 };
    const { mockTerminal, getResizeCallCount } = createFittableTerminal(size);
    addon.activate(mockTerminal as any);

    // First fit opens the re-entrancy window for 50ms.
    addon.fit();
    expect(getResizeCallCount()).toBe(1);
    expect(mockTerminal.cols).toBe(98);
    expect(mockTerminal.rows).toBe(30);

    // The container shrinks while the guard is still active; this direct
    // request used to be dropped on the early return.
    size.width = 500;
    size.height = 240;
    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    // The single trailing fit applies the final dimensions.
    vi.advanceTimersByTime(50);
    expect(getResizeCallCount()).toBe(2);
    expect(mockTerminal.cols).toBe(53);
    expect(mockTerminal.rows).toBe(15);
  });

  test('the queued trailing fit does not start a resize feedback loop', () => {
    const size = { width: 900, height: 480 };
    const { mockTerminal, getResizeCallCount } = createFittableTerminal(size);
    addon.activate(mockTerminal as any);

    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    size.width = 500;
    size.height = 240;
    addon.fit();
    vi.advanceTimersByTime(50);
    expect(getResizeCallCount()).toBe(2);
    expect(mockTerminal.cols).toBe(53);

    // The trailing fit's own settle window must not trigger another resize.
    vi.advanceTimersByTime(500);
    expect(getResizeCallCount()).toBe(2);
    expect(mockTerminal.cols).toBe(53);
    expect(mockTerminal.rows).toBe(15);
  });

  test('a queued fit whose proposal matches the applied dimensions stays a no-op', () => {
    const size = { width: 900, height: 480 };
    const { mockTerminal, getResizeCallCount } = createFittableTerminal(size);
    addon.activate(mockTerminal as any);

    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    // This is the own-canvas-resize echo case: queue a request without any
    // layout change, then settle. The proposal equals the applied dimensions.
    addon.fit();
    vi.advanceTimersByTime(50);
    expect(getResizeCallCount()).toBe(1);

    vi.advanceTimersByTime(500);
    expect(getResizeCallCount()).toBe(1);
  });

  test('dispose() clears a queued fit instead of applying it later', () => {
    const size = { width: 900, height: 480 };
    const { mockTerminal, getResizeCallCount } = createFittableTerminal(size);
    addon.activate(mockTerminal as any);

    addon.fit();
    expect(getResizeCallCount()).toBe(1);

    size.width = 500;
    size.height = 240;
    addon.fit(); // queued during the guard

    addon.dispose();
    vi.advanceTimersByTime(1000);

    expect(getResizeCallCount()).toBe(1);
    expect(mockTerminal.cols).toBe(98);
    expect(mockTerminal.rows).toBe(30);
  });
});
