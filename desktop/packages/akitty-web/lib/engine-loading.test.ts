import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, vi } from 'vitest';
import { AkittyEngine } from './engine';

test('loads an encoded file URL without fetching or depending on the working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akitty wasm % # '));
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network request'));
  try {
    const path = join(directory, 'terminal % #.wasm');
    await copyFile(join(process.cwd(), 'akitty-vt.wasm'), path);
    const engine = await AkittyEngine.load(pathToFileURL(path).href);
    const terminal = engine.createTerminal(10, 2);
    try {
      terminal.write('loaded');
      expect(terminal.getCursor().x).toBe(6);
      expect(fetch).not.toHaveBeenCalled();
    } finally { terminal.free(); }
  } finally {
    fetch.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
