import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Session } from '@ax-code/sdk/v2';

const upsertedSessions: Session[] = [];
const registeredDirectories: Array<{ sessionID: string; directory: string }> = [];
const ensureChildCalls: Array<{ directory: string; bootstrap?: boolean }> = [];
const childState = {
  session: [] as Session[],
  sessionTotal: 0,
  limit: 5,
};
let currentDirectory = '/repo';

mock.module('@/sync/session-ui-store', () => ({
  routeMessage: mock(() => Promise.resolve()),
  useSessionUIStore: {
    getState: () => ({
      setWorktreeMetadata: mock(() => undefined),
    }),
  },
}));

mock.module('@/lib/ax-code/client', () => ({
  axCodeClient: {
    withDirectory: async (directory: string, fn: () => Promise<Session>) => {
      const previous = currentDirectory;
      currentDirectory = directory;
      try {
        return await fn();
      } finally {
        currentDirectory = previous;
      }
    },
    createSession: async (params?: { title?: string }): Promise<Session> => ({
      id: 'ses_multirun',
      title: params?.title ?? '',
      directory: currentDirectory,
      time: { created: 1, updated: 1 },
    } as Session),
    checkHealth: mock(() => Promise.resolve(true)),
    getScopedSdkClient: mock(() => ({})),
    getDirectory: mock(() => currentDirectory),
  },
}));

// gitApi stubs that delegate to window.__OPENCHAMBER_RUNTIME_APIS__.git when present,
// so gitApi.test.ts (which installs runtime git in each test) still works correctly.
const _getGitRuntime = (): Record<string, (...args: unknown[]) => unknown> | null => {
  const w = globalThis as unknown as { window?: { __OPENCHAMBER_RUNTIME_APIS__?: { git?: Record<string, (...args: unknown[]) => unknown> } } };
  return w.window?.__OPENCHAMBER_RUNTIME_APIS__?.git ?? null;
};
const _runtimeOrStub = <T>(name: string, stub: T) =>
  (...args: unknown[]) => {
    const rt = _getGitRuntime();
    if (rt && typeof rt[name] === 'function') return rt[name](...args);
    return stub instanceof Promise ? stub : Promise.resolve(stub);
  };

mock.module('@/lib/gitApi', () => ({
  checkIsGitRepository: mock(() => Promise.resolve(false)),
  getGitStatus: mock(_runtimeOrStub('getGitStatus', { current: 'HEAD', tracking: null, ahead: 0, behind: 0, files: [], isClean: true })),
  getGitDiff: mock(_runtimeOrStub('getGitDiff', {})),
  getGitFileDiff: mock(_runtimeOrStub('getGitFileDiff', {})),
  revertGitFile: mock(_runtimeOrStub('revertGitFile', undefined)),
  stageGitFile: mock(_runtimeOrStub('stageGitFile', undefined)),
  stageGitFiles: mock(_runtimeOrStub('stageGitFiles', undefined)),
  unstageGitFile: mock(_runtimeOrStub('unstageGitFile', undefined)),
  unstageGitFiles: mock(_runtimeOrStub('unstageGitFiles', undefined)),
  isLinkedWorktree: mock(() => Promise.resolve(false)),
  getGitBranches: mock(() => Promise.resolve({})),
  deleteGitBranch: mock(() => Promise.resolve({ success: false })),
  deleteRemoteBranch: mock(() => Promise.resolve({ success: false })),
  generateCommitMessage: mock(() => Promise.resolve('')),
  generatePullRequestDescription: mock(() => Promise.resolve('')),
  listGitWorktrees: mock(() => Promise.resolve([])),
  validateGitWorktree: mock(() => Promise.resolve({})),
  getGitWorktreeBootstrapStatus: mock(() => Promise.resolve({})),
  previewGitWorktree: mock(() => Promise.resolve({})),
  createGitWorktree: mock(() => Promise.resolve({})),
  deleteGitWorktree: mock(() => Promise.resolve({})),
  git: {},
  createGitCommit: mock(() => Promise.resolve({})),
  gitPush: mock(() => Promise.resolve({})),
  gitPull: mock(() => Promise.resolve({})),
  gitFetch: mock(() => Promise.resolve({})),
  listGitStashes: mock(() => Promise.resolve({ stashes: [] })),
  countGitStashFiles: mock(() => Promise.resolve({ counts: {} })),
  stashGitChanges: mock(() => Promise.resolve({ success: false, created: false, message: '', output: '' })),
  discoverGitCredentials: mock(() => Promise.resolve([])),
  getGlobalGitIdentity: mock(() => Promise.resolve(null)),
  getRemoteUrl: mock(() => Promise.resolve(null)),
  getRemotes: mock(() => Promise.resolve([])),
  removeRemote: mock(() => Promise.resolve({})),
  rebase: mock(() => Promise.resolve({})),
  abortRebase: mock(() => Promise.resolve({ success: false })),
  merge: mock(() => Promise.resolve({})),
  checkoutCommit: mock(() => Promise.resolve({})),
  cherryPick: mock(() => Promise.resolve({})),
  revertCommit: mock(() => Promise.resolve({})),
  resetToCommit: mock(() => Promise.resolve({})),
  abortMerge: mock(() => Promise.resolve({ success: false })),
  continueRebase: mock(() => Promise.resolve({ success: false, conflict: false })),
  continueMerge: mock(() => Promise.resolve({ success: false, conflict: false })),
  stash: mock(() => Promise.resolve({})),
  stashPop: mock(() => Promise.resolve({ success: false })),
  getConflictDetails: mock(() => Promise.resolve({})),
  validateWorktreeDirectory: mock(() => Promise.resolve({})),
  canonicalizeWorktreeState: mock(() => Promise.resolve({})),
}));

mock.module('@/lib/worktrees/worktreeCreate', () => ({
  createWorktreeWithDefaults: mock(),
  resolveRootTrackingRemote: mock(() => Promise.resolve(null)),
}));

mock.module('@/lib/openchamberConfig', () => ({
  saveWorktreeSetupCommands: mock(() => Promise.resolve()),
}));

mock.module('./useDirectoryStore', () => ({
  useDirectoryStore: {
    getState: () => ({ currentDirectory: '/repo' }),
  },
}));

mock.module('./useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', path: '/repo' }],
    }),
  },
}));

mock.module('./useSnippetsStore', () => ({
  useSnippetsStore: {
    getState: () => ({
      expandText: (value: string) => Promise.resolve(value),
    }),
  },
}));

// Minimal in-memory store state so tests that call useGlobalSessionsStore.setState() also work
let _mockGlobalActiveSessions: Session[] = [];
const _mockUpsertSession = (session: Session) => {
  upsertedSessions.push(session);
  const idx = _mockGlobalActiveSessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    _mockGlobalActiveSessions = [
      ..._mockGlobalActiveSessions.slice(0, idx),
      session,
      ..._mockGlobalActiveSessions.slice(idx + 1),
    ];
  } else {
    _mockGlobalActiveSessions = [..._mockGlobalActiveSessions, session];
  }
};

mock.module('./useGlobalSessionsStore', () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      activeSessions: _mockGlobalActiveSessions,
      archivedSessions: [] as Session[],
      upsertSession: _mockUpsertSession,
    }),
    setState: (updater: unknown) => {
      const patch = typeof updater === 'function'
        ? (updater as (s: { activeSessions: Session[] }) => Partial<{ activeSessions: Session[] }>)({ activeSessions: _mockGlobalActiveSessions })
        : updater as Partial<{ activeSessions: Session[] }>;
      if (patch && 'activeSessions' in patch && Array.isArray((patch as { activeSessions: Session[] }).activeSessions)) {
        _mockGlobalActiveSessions = (patch as { activeSessions: Session[] }).activeSessions;
      }
    },
    subscribe: mock(() => () => undefined),
  },
}));

mock.module('@/sync/sync-refs', () => ({
  setSyncRefs: mock(() => undefined),
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredDirectories.push({ sessionID, directory });
  },
  getSyncSDK: mock(() => ({})),
  getSyncDirectory: mock(() => '/repo'),
  getDirectoryState: mock(() => undefined),
  getSyncSessions: mock(() => []),
  getAllSyncSessions: mock(() => []),
  getSyncMessages: mock(() => []),
  getSyncSessionMaterializationStatus: mock(() => undefined),
  getSyncParts: mock(() => []),
  getSyncSessionStatus: mock(() => undefined),
  getSyncPermissions: mock(() => []),
  getSyncQuestions: mock(() => []),
  getSyncChildStores: () => ({
    ensureChild: (directory: string, options?: { bootstrap?: boolean }) => {
      ensureChildCalls.push({ directory, bootstrap: options?.bootstrap });
      return {
        setState: (updater: typeof childState | ((state: typeof childState) => Partial<typeof childState> | typeof childState)) => {
          const patch = typeof updater === 'function' ? updater(childState) : updater;
          if (patch !== childState) {
            Object.assign(childState, patch);
          }
        },
      };
    },
  }),
}));

const { useMultiRunStore } = await import('./useMultiRunStore');

describe('useMultiRunStore', () => {
  beforeEach(() => {
    upsertedSessions.length = 0;
    registeredDirectories.length = 0;
    ensureChildCalls.length = 0;
    childState.session = [];
    childState.sessionTotal = 0;
    childState.limit = 5;
    currentDirectory = '/repo';
    useMultiRunStore.setState({ isLoading: false, error: null });
  });

  test('registers created sessions without waiting for a sidebar refresh', async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Fix thing',
      isolateRuns: false,
      groups: [{
        prompt: 'Fix it',
        models: [{ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' }],
      }],
    });

    expect(result?.sessionIds).toEqual(['ses_multirun']);
    expect(upsertedSessions.map((session) => session.id)).toEqual(['ses_multirun']);
    expect(registeredDirectories).toEqual([{ sessionID: 'ses_multirun', directory: '/repo' }]);
    expect(ensureChildCalls).toEqual([{ directory: '/repo', bootstrap: false }]);
    expect(childState.session.map((session) => session.id)).toEqual(['ses_multirun']);
  });
});
