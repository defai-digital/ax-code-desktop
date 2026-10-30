/**
 * Opt-in timing probe for the agent read path (AKITTY_WEB_PROBE=1 npx vitest run lib/agent/agent.probe.test.ts).
 * It prints numbers and asserts nothing.
 */

import { describe, test } from 'vitest';
import { createIsolatedTerminal } from '../test-helpers';
import { createTerminalTools, TerminalReader, TerminalSessionRegistry } from './index';

const enabled = process.env.AKITTY_WEB_PROBE === '1';

function time(label: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < Math.min(iterations, 3); i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const per = (performance.now() - start) / iterations;
  process.stderr.write(`${label.padEnd(48)} ${per.toFixed(3)} ms\n`);
}

describe.skipIf(!enabled)('agent read path probe', () => {
  test('screen and output reads on a 200x50 terminal with full scrollback', async () => {
    const term = await createIsolatedTerminal({ cols: 200, rows: 50, scrollback: 10000 });
    term.open(document.createElement('div'));
    for (let i = 0; i < 3000; i++) term.write(`\x1b[3${i % 8}mlog line ${i} ${'lorem ipsum dolor sit amet '.repeat(5)}\x1b[0m\r\n`);
    const reader = new TerminalReader(term);
    const sessions = new TerminalSessionRegistry();
    sessions.add('a', term);
    const tools = Object.fromEntries(createTerminalTools(sessions).map((tool) => [tool.name, tool]));

    time('readScreen (50 rows)', 50, () => reader.readScreen());
    time('readOutput default (200 lines)', 20, () => reader.readOutput());
    time('readOutput max (1000 lines, 100k chars)', 10, () => reader.readOutput({ lines: 1000, maxChars: 100_000 }));
    time('readOutput page deep in history (offset 300)', 20, () => reader.readOutput({ offset: 300 }));
    time('tool read_screen', 50, () => tools.read_screen.execute({}));
    time('tool list_sessions', 200, () => tools.list_sessions.execute({}));
    term.dispose();
  });
});
