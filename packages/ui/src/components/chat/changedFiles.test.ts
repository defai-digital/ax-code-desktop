import { describe, expect, test } from 'bun:test';
import type { ToolPart } from '@ax-code/sdk/v2';

import { extractChangedFiles, getFileStats } from './changedFiles';

type ToolFixtureOptions = {
  id?: string;
  tool?: string;
  status?: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const toolPart = (options: ToolFixtureOptions): ToolPart => {
  const status = options.status ?? 'completed';
  const base = {
    id: options.id ?? 'tool-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'tool',
    callID: `${options.id ?? 'tool-1'}-call`,
    tool: options.tool ?? 'edit',
  } satisfies Omit<ToolPart, 'state'>;

  if (status === 'pending') {
    return {
      ...base,
      state: {
        status,
        input: options.input ?? {},
        raw: '',
      },
    };
  }

  if (status === 'running') {
    return {
      ...base,
      state: {
        status,
        input: options.input ?? {},
        metadata: options.metadata,
        time: { start: 1 },
      },
    };
  }

  if (status === 'error') {
    return {
      ...base,
      state: {
        status,
        input: options.input ?? {},
        error: 'failed',
        metadata: options.metadata,
        time: { start: 1, end: 2 },
      },
    };
  }

  return {
    ...base,
    state: {
      status,
      input: options.input ?? {},
      output: '',
      title: 'Edit',
      metadata: options.metadata ?? {},
      time: { start: 1, end: 2 },
    },
  };
};

describe('extractChangedFiles', () => {
  test('extracts metadata file entries with stats and de-dupes paths', () => {
    const files = extractChangedFiles([
      toolPart({
        id: 'tool-a',
        metadata: {
          files: [
            { relativePath: 'src/app.ts', additions: 3.7, deletions: 1, patch: '+new\n-old' },
            { filePath: 'src/app.ts', additions: 99, deletions: 99 },
            { filePath: 'src/other.ts', additions: -3, deletions: 2.2 },
          ],
        },
      }),
    ]);

    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({
      path: 'src/app.ts',
      tool: 'edit',
      partId: 'tool-a',
      messageID: 'message-1',
      additions: 3,
      deletions: 1,
      patch: '+new\n-old',
    });
    expect(getFileStats(files[1])).toEqual({ additions: 0, deletions: 2 });
  });

  test('extracts filediff and result filediff metadata', () => {
    const files = extractChangedFiles([
      toolPart({
        id: 'single',
        metadata: {
          filediff: { file: 'src/single.ts', additions: 4, deletions: 0 },
        },
      }),
      toolPart({
        id: 'multi',
        tool: 'multiedit',
        metadata: {
          results: [
            { filediff: { file: 'src/one.ts', additions: 1, deletions: 2 } },
            { filediff: { file: 'src/two.ts', additions: 5, deletions: 6 } },
          ],
        },
      }),
    ]);

    expect(files.map((file) => file.path)).toEqual(['src/single.ts', 'src/one.ts', 'src/two.ts']);
    expect(files.map(getFileStats)).toEqual([
      { additions: 4, deletions: 0 },
      { additions: 1, deletions: 2 },
      { additions: 5, deletions: 6 },
    ]);
  });

  test('falls back to input paths and patch stats', () => {
    const files = extractChangedFiles([
      toolPart({
        id: 'path',
        tool: 'write',
        input: { file_path: 'src/input.ts' },
      }),
      toolPart({
        id: 'patch',
        tool: 'apply_patch',
        metadata: {
          patch: [
            '--- a/src/app.ts',
            '+++ b/src/app.ts',
            '@@',
            '-old',
            '+new',
            '+another',
          ].join('\n'),
        },
      }),
    ]);

    expect(files.map((file) => file.path)).toEqual(['src/input.ts', 'Diff']);
    expect(getFileStats(files[1])).toEqual({ additions: 2, deletions: 1 });
  });

  test('ignores non-edit tools and unfinished tool calls', () => {
    const files = extractChangedFiles([
      toolPart({
        id: 'read',
        tool: 'read',
        input: { filePath: 'src/read.ts' },
      }),
      toolPart({
        id: 'pending',
        status: 'pending',
        input: { filePath: 'src/pending.ts' },
      }),
      toolPart({
        id: 'running',
        status: 'running',
        input: { filePath: 'src/running.ts' },
      }),
    ]);

    expect(files).toEqual([]);
  });
});
