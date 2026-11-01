/**
 * Comprehensive test suite for FitAddon
 *
 * Note: Most FitAddon tests require DOM APIs (document, window, getComputedStyle).
 * These tests focus on basic functionality that doesn't require DOM.
 * For full integration tests, see examples/terminal-demo.html
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
});
