/**
 * Unit tests for EventEmitter
 */

import { describe, expect, test } from 'bun:test';
import { EventEmitter } from './event-emitter';

describe('EventEmitter', () => {
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
