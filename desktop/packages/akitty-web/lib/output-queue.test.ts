import { afterEach, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { OutputQueue } from './output-queue';
import { createIsolatedTerminal } from './test-helpers';
import type { Terminal } from './terminal';

const terminals: Terminal[] = [];
const queues: OutputQueue[] = [];
afterEach(() => { for (const term of terminals.splice(0)) term.dispose(); for (const queue of queues.splice(0)) queue.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function terminal(cols = 80, rows = 4): Promise<Terminal> {
  const term = await createIsolatedTerminal({ cols, rows });
  terminals.push(term); term.open(document.createElement('div')); return term;
}

describe('cooperative terminal output', () => {
  test('queued Buffer views retain their accepted bytes when the caller reuses the storage', async () => {
    const term = await terminal();
    const storage = Buffer.from('__original__');
    const input = storage.subarray(2, -2);
    const completion = term.writeAsync(input);
    storage.fill(0);
    await completion;
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('original');
  });

  test('parses FIFO chunks, including UTF-8 and escape sequences split at a boundary', async () => {
    const term = await terminal();
    const input = new TextEncoder().encode('a'.repeat(8191) + '中\x1b[31m界\x1b[0m\r\n');
    const writes = vi.spyOn(term.wasmTerm!, 'write');
    const first = term.writeAsync(input);
    input.fill(0); // Accepted byte arrays belong to the queue, not the caller.
    const second = term.writeAsync('last');
    expect(writes).not.toHaveBeenCalled();
    await Promise.all([first, second]);
    expect(term.buffer.active.getLine(term.buffer.active.baseY + term.buffer.active.cursorY)?.translateToString(true)).toBe('last');
    expect(writes.mock.calls.every(([bytes]) => bytes.length <= OutputQueue.CHUNK_BYTES)).toBe(true);
    const history = Array.from({ length: term.buffer.active.length }, (_, row) => term.buffer.active.getLine(row)?.translateToString(true) ?? '').join('');
    expect(history).toContain('中界');
    expect(history).not.toContain('\ufffd');
  });

  test('synchronous output cannot overtake pending asynchronous output', async () => {
    const term = await terminal();
    const queued = term.writeAsync('first');
    expect(() => term.write('overtake')).toThrow('Asynchronous output is pending');
    await queued;
    term.write(' second');
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('first second');
  });

  test('the byte and entry bounds reject whole writes without parsing them', async () => {
    const term = await terminal();
    const pending = term.writeAsync(new Uint8Array(OutputQueue.MAX_BYTES));
    const cancelled = expect(pending).rejects.toThrow('disposed');
    await expect(term.writeAsync('overflow')).rejects.toThrow(RangeError);
    term.dispose(); await cancelled;

    const queue = new OutputQueue(() => { throw new Error('must not parse'); }); queues.push(queue);
    const barriers = Array.from({ length: OutputQueue.MAX_WRITES }, () => queue.enqueue('').catch(() => {}));
    await expect(queue.enqueue('')).rejects.toThrow(RangeError);
    queue.close(); await Promise.all(barriers);
  });

  test('reset cancels admitted output and a new generation still works', async () => {
    const term = await terminal();
    const old = expect(term.writeAsync('old')).rejects.toThrow('reset');
    term.reset();
    const current = term.writeAsync('current');
    await old; await current;
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('current');
  });

  test('a failed open does not permanently close asynchronous output', async () => {
    const term = await createIsolatedTerminal(); terminals.push(term);
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    expect(() => term.open(document.createElement('div'))).toThrow('canvas rendering is unavailable');
    context.mockRestore();
    term.open(document.createElement('div'));
    await term.writeAsync('retry');
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('retry');
  });

  test('a partially consumed allocation still counts against the byte bound', async () => {
    let calls = 0, overflow: Promise<void> | undefined;
    const queue = new OutputQueue(() => {
      if (++calls === 2) {
        overflow = queue.enqueue(new Uint8Array(1));
        overflow.catch(() => {});
        queue.close();
      }
    }); queues.push(queue);
    await expect(queue.enqueue(new Uint8Array(OutputQueue.MAX_BYTES))).rejects.toThrow('disposed');
    await expect(overflow!).rejects.toThrow(RangeError);
  });

  test('parse failures reject the pending batch without stranding later writes', async () => {
    const term = await terminal();
    const fail = vi.spyOn(term.wasmTerm!, 'write').mockImplementationOnce(() => { throw new Error('parse failed'); });
    const first = expect(term.writeAsync('first')).rejects.toThrow('parse failed');
    const second = expect(term.writeAsync('second')).rejects.toThrow('parse failed');
    await Promise.all([first, second]); fail.mockRestore();
    await term.writeAsync('recovered');
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('recovered');
  });

  test('a long write yields to other tasks before it completes', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    let turns = 0, consumed = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => consumed * 5);
    const queue = new OutputQueue(() => { consumed++; }); queues.push(queue);
    const completion = queue.enqueue(new Uint8Array(OutputQueue.CHUNK_BYTES * 8));
    const beat = setInterval(() => { turns++; }, 0);
    try { await completion; } finally { clearInterval(beat); now.mockRestore(); }
    expect(consumed).toBe(8);
    expect(turns).toBeGreaterThan(0);
  });

  test('disposal from an output callback cancels the remainder', async () => {
    const term = await terminal();
    term.onTitleChange(() => term.dispose());
    await expect(term.writeAsync('\x1b]2;close\x07' + 'x'.repeat(20000))).rejects.toThrow('disposed');
    await expect(term.writeAsync('after close')).rejects.toThrow('disposed');
  });

  test('reset from a callback can enqueue a new generation without stale output', async () => {
    const term = await terminal();
    let current: Promise<void> | undefined;
    term.onTitleChange(title => {
      if (title === 'reset') { term.reset(); current = term.writeAsync('new generation'); }
    });
    await expect(term.writeAsync('\x1b]2;reset\x07' + 'x'.repeat(20000))).rejects.toThrow('reset');
    await current;
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('new generation');
  });

  test('reset from a queued bell cancels old bells while allowing the new generation', async () => {
    const term = await terminal();
    let bells = 0, current: Promise<void> | undefined;
    term.onBell(() => {
      if (++bells === 1) { term.reset(); current = term.writeAsync('\x07new generation'); }
    });
    await expect(term.writeAsync('\x07\x07\x07' + 'x'.repeat(20000))).rejects.toThrow('reset');
    await current;
    expect(bells).toBe(2);
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe('new generation');
  });
});
