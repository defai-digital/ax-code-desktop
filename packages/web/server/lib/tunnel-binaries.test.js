import { describe, expect, it } from 'vitest';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { searchPathForBinary } from './tunnel-binaries.js';

describe('searchPathForBinary', () => {
  it('finds executable files on PATH for POSIX platforms', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-tunnel-bin-'));
    const binPath = path.join(tempRoot, 'cloudflared');

    try {
      await fsPromises.writeFile(binPath, '#!/bin/sh\n', { mode: 0o755 });
      await fsPromises.chmod(binPath, 0o755);

      await expect(searchPathForBinary('cloudflared', {
        env: { PATH: tempRoot },
        platform: 'linux',
      })).resolves.toBe(binPath);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips non-executable POSIX files', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-tunnel-bin-noexec-'));
    const binPath = path.join(tempRoot, 'ngrok');

    try {
      await fsPromises.writeFile(binPath, '', { mode: 0o644 });
      await fsPromises.chmod(binPath, 0o644);

      await expect(searchPathForBinary('ngrok', {
        env: { PATH: tempRoot },
        platform: 'linux',
      })).resolves.toBeNull();
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses PATHEXT on Windows platforms', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-tunnel-bin-win-'));
    const binPath = path.join(tempRoot, 'ngrok.cmd');

    try {
      await fsPromises.writeFile(binPath, '');

      await expect(searchPathForBinary('ngrok', {
        env: { PATH: tempRoot, PATHEXT: '.EXE;.CMD' },
        platform: 'win32',
      })).resolves.toBe(binPath);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
