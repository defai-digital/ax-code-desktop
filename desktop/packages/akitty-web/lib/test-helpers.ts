/**
 * Test helpers for akitty-web
 *
 * Provides utilities for test isolation and setup.
 */

import { AkittyEngine } from './engine';
import type { ITerminalOptions } from './interfaces';
import { Terminal } from './terminal';

/**
 * Creates a Terminal instance with an isolated AkittyEngine WASM instance.
 * This ensures complete test isolation with no shared state between tests.
 *
 * @param options - Terminal options (cols, rows, etc.)
 * @returns Promise resolving to Terminal instance
 *
 * @example
 * ```typescript
 * import { createIsolatedTerminal } from './test-helpers';
 *
 * describe('My Tests', () => {
 *   test('my test', async () => {
 *     const term = await createIsolatedTerminal({ cols: 80, rows: 24 });
 *     term.open(container);
 *     // ... test logic ...
 *     term.dispose();
 *   });
 * });
 * ```
 */
export async function createIsolatedTerminal(
  options: Omit<ITerminalOptions, 'engine'> = {}
): Promise<Terminal> {
  const engine = await AkittyEngine.load();
  return new Terminal({ ...options, engine });
}
