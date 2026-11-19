/**
 * Unit tests for EventEmitter
 */

import { describe, expect, test } from 'bun:test';
import { EventEmitter } from './event-emitter';

describe('EventEmitter', () => {
  test('each subscription removes only itself, including repeated disposal', () => {
    const emitter = new EventEmitter<number>();
    const seen: number[] = [];
    const listener = (value: number) => seen.push(value);
    const first = emitter.event(listener);
    const second = emitter.event(listener);
    first.dispose();
    first.dispose();
    emitter.fire(1);
    expect(seen).toEqual([1]);
    second.dispose();
    emitter.fire(2);
    expect(seen).toEqual([1]);
  });

  test('an old subscription cannot remove a new one after emitter disposal', () => {
    const emitter = new EventEmitter<number>();
    const seen: number[] = [];
    const listener = (value: number) => seen.push(value);
    const old = emitter.event(listener);
    emitter.dispose();
    emitter.event(listener);
    old.dispose();
    emitter.fire(1);
    expect(seen).toEqual([1]);
  });

  test('fire notifies listeners in subscription order', () => {
    const emitter = new EventEmitter<number>();
    const seen: number[] = [];
    emitter.event((arg) => seen.push(arg * 10));
    emitter.event((arg) => seen.push(arg * 100));
    emitter.fire(1);
    expect(seen).toEqual([10, 100]);
  });

  test('listener disposing itself during fire does not skip the next listener', () => {
    const emitter = new EventEmitter<string>();
    const seen: string[] = [];
    const subA = emitter.event(() => {
      seen.push('a');
      subA.dispose();
    });
    emitter.event(() => seen.push('b'));
    emitter.fire('evt');
    expect(seen).toEqual(['a', 'b']);

    // The self-disposal must take effect for later events.
    seen.length = 0;
    emitter.fire('evt');
    expect(seen).toEqual(['b']);
  });

  test('listener added during fire does not receive the current event', () => {
    const emitter = new EventEmitter<number>();
    const seen: number[] = [];
    emitter.event((arg) => {
      seen.push(arg);
      if (arg === 1) emitter.event((later) => seen.push(later + 100));
    });
    emitter.fire(1);
    expect(seen).toEqual([1]);
    emitter.fire(2);
    expect(seen).toEqual([1, 2, 102]);
  });
});

describe('EventEmitter listener isolation', () => {
  test('a throwing listener does not abort fire or starve later listeners', async () => {
    const emitter = new EventEmitter<number>();
    const seen: number[] = [];
    const reported: unknown[] = [];
    const original = globalThis.reportError;
    globalThis.reportError = (error: unknown) => reported.push(error);
    try {
      emitter.event(() => {
        throw new Error('closed channel');
      });
      emitter.event((arg) => seen.push(arg));
      expect(() => emitter.fire(7)).not.toThrow();
    } finally {
      globalThis.reportError = original;
    }
    expect(seen).toEqual([7]);
    expect(reported).toHaveLength(1);
  });
});
