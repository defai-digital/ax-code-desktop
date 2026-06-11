import { describe, expect, test } from 'bun:test';
import { requestDirectoryAccess } from './desktop';

const restoreWindow = () => {
  delete (globalThis as Record<string, unknown>).window;
};

const mockDesktopWindow = (dialogOpen: (options: Record<string, unknown>) => Promise<unknown>) => {
  (globalThis as Record<string, unknown>).window = {
    location: { origin: 'http://localhost:5173' },
    __OPENCHAMBER_ELECTRON__: { runtime: 'electron' },
    __TAURI__: {
      core: { invoke: async () => null },
      dialog: { open: dialogOpen },
    },
  };
};

describe('requestDirectoryAccess', () => {
  test('uses the desktop dialog bridge for local Electron directory selection', async () => {
    const calls: Record<string, unknown>[] = [];
    mockDesktopWindow(async (options) => {
      calls.push(options);
      return '/Users/test/project';
    });

    const result = await requestDirectoryAccess('/Users/test');
    expect(result).toEqual({
      success: true,
      path: '/Users/test/project',
    });
    expect(calls).toEqual([{
      directory: true,
      multiple: false,
      title: 'Select Working Directory',
    }]);
    restoreWindow();
  });

  test('reports cancellation when the desktop dialog returns no path', async () => {
    mockDesktopWindow(async () => null);

    const result = await requestDirectoryAccess('/Users/test');
    expect(result).toEqual({
      success: false,
      error: 'Directory selection cancelled',
    });
    restoreWindow();
  });
});
