/**
 * Opt-in timing probe (AKITTY_WEB_PROBE=1 npx vitest run lib/hotpath.probe.test.ts). It prints numbers and asserts
 * nothing; "old" re-creates the pre-cache behavior by invalidating the viewport cache before every row read.
 */

import { describe, test } from 'vitest';
import { Ghostty } from './ghostty';

const enabled = process.env.AKITTY_WEB_PROBE === '1';

function time(label: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < Math.min(iterations, 5); i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const per = (performance.now() - start) / iterations;
  console.log(`${label.padEnd(44)} ${per.toFixed(3)} ms`);
}

describe.skipIf(!enabled)('web hot path probe', () => {
  test('full-screen reads and writes', async () => {
    const ghostty = await Ghostty.load();
    const term = ghostty.createTerminal(200, 50);
    let screen = '';
    for (let y = 0; y < 50; y++) screen += `\x1b[3${y % 8}mline ${y} ${'lorem ipsum dolor sit amet '.repeat(7)}\x1b[0m\r\n`;
    term.write(screen);

    time('read 50 rows, old (parse + copy per row)', 100, () => {
      for (let y = 0; y < 50; y++) {
        (term as any).viewportValid = false;
        term.getLine(y);
      }
    });
    time('read 50 rows, new (one parse, shared cells)', 100, () => {
      (term as any).viewportValid = false;
      for (let y = 0; y < 50; y++) term.getLineView(y);
    });
    time('read 1 dirty row after a write (new)', 1000, () => {
      term.write('x');
      term.getLineView(0);
    });

    const chunk = 'some typical output line of text\r\n';
    time('write 100 small chunks', 200, () => {
      for (let i = 0; i < 100; i++) term.write(chunk);
    });
    const big = chunk.repeat(2000);
    time('write one 66 KB chunk', 200, () => term.write(big));
    term.free();
  });
});
