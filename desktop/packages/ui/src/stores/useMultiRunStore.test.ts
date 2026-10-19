import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

const upsertedSessions: Session[] = []
const registeredDirectories: Array<{ sessionID: string; directory: string }> = []
const ensureChildCalls: Array<{ directory: string; bootstrap?: boolean }> = []
const childState = {
  session: [] as Session[],
  sessionTotal: 0,
  limit: 5,
}
let currentDirectory = "/repo"

const routeMessageMock = vi.fn(() => Promise.resolve())

type SessionUpdateArgs = { sessionID: string; directory?: string; metadata?: Record<string, unknown> }
const defaultSessionUpdate = async (args: SessionUpdateArgs) => ({
  data: {
    id: args.sessionID,
    title: "updated",
    directory: args.directory,
    metadata: args.metadata,
    time: { created: 1, updated: 2 },
  } as unknown as Session,
})
const sessionUpdateMock = vi.fn(defaultSessionUpdate)
const scopedDirectories: string[] = []

vi.doMock("@/sync/session-ui-store", () => ({
  routeMessage: routeMessageMock,
  useSessionUIStore: {
    getState: () => ({
      setWorktreeMetadata: vi.fn(() => undefined),
    }),
  },
}))

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    withDirectory: async (directory: string, fn: () => Promise<Session>) => {
      const previous = currentDirectory
      currentDirectory = directory
      try {
        return await fn()
      } finally {
        currentDirectory = previous
      }
    },
    createSession: vi.fn(
      async (params?: { title?: string }): Promise<Session> =>
        ({
          id: "ses_multirun",
          title: params?.title ?? "",
          directory: currentDirectory,
          time: { created: 1, updated: 1 },
        }) as Session,
    ),
    checkHealth: vi.fn(() => Promise.resolve(true)),
    getScopedSdkClient: vi.fn((directory: string) => {
      scopedDirectories.push(directory)
      return { session: { update: sessionUpdateMock } }
    }),
    getDirectory: vi.fn(() => currentDirectory),
  },
}))

// gitApi stubs that delegate to window.__AX_CODE_DESKTOP_RUNTIME_APIS__.git when present,
// so gitApi.test.ts (which installs runtime git in each test) still works correctly.
const _getGitRuntime = (): Record<string, (...args: unknown[]) => unknown> | null => {
  const w = globalThis as unknown as {
    window?: { __AX_CODE_DESKTOP_RUNTIME_APIS__?: { git?: Record<string, (...args: unknown[]) => unknown> } }
  }
  return w.window?.__AX_CODE_DESKTOP_RUNTIME_APIS__?.git ?? null
}
const _runtimeOrStub =
  <T>(name: string, stub: T) =>
  (...args: unknown[]) => {
    const rt = _getGitRuntime()
    if (rt && typeof rt[name] === "function") return rt[name](...args)
    return stub instanceof Promise ? stub : Promise.resolve(stub)
  }

vi.doMock("@/lib/gitApi", () => ({
  checkIsGitRepository: vi.fn(() => Promise.resolve(false)),
  getGitStatus: vi.fn(
    _runtimeOrStub("getGitStatus", { current: "HEAD", tracking: null, ahead: 0, behind: 0, files: [], isClean: true }),
  ),
  getGitDiff: vi.fn(_runtimeOrStub("getGitDiff", {})),
  getGitFileDiff: vi.fn(_runtimeOrStub("getGitFileDiff", {})),
  revertGitFile: vi.fn(_runtimeOrStub("revertGitFile", undefined)),
  stageGitFile: vi.fn(_runtimeOrStub("stageGitFile", undefined)),
  stageGitFiles: vi.fn(_runtimeOrStub("stageGitFiles", undefined)),
  unstageGitFile: vi.fn(_runtimeOrStub("unstageGitFile", undefined)),
  unstageGitFiles: vi.fn(_runtimeOrStub("unstageGitFiles", undefined)),
  isLinkedWorktree: vi.fn(() => Promise.resolve(false)),
  getGitBranches: vi.fn(() => Promise.resolve({})),
  deleteGitBranch: vi.fn(() => Promise.resolve({ success: false })),
  deleteRemoteBranch: vi.fn(() => Promise.resolve({ success: false })),
  generateCommitMessage: vi.fn(() => Promise.resolve("")),
  generatePullRequestDescription: vi.fn(() => Promise.resolve("")),
  listGitWorktrees: vi.fn(() => Promise.resolve([])),
  validateGitWorktree: vi.fn(() => Promise.resolve({})),
  getGitWorktreeBootstrapStatus: vi.fn(() => Promise.resolve({})),
  previewGitWorktree: vi.fn(() => Promise.resolve({})),
  createGitWorktree: vi.fn(() => Promise.resolve({})),
  deleteGitWorktree: vi.fn(() => Promise.resolve({})),
  git: {},
  createGitCommit: vi.fn(() => Promise.resolve({})),
  gitPush: vi.fn(() => Promise.resolve({})),
  gitPull: vi.fn(() => Promise.resolve({})),
  gitFetch: vi.fn(() => Promise.resolve({})),
  listGitStashes: vi.fn(() => Promise.resolve({ stashes: [] })),
  countGitStashFiles: vi.fn(() => Promise.resolve({ counts: {} })),
  stashGitChanges: vi.fn(() => Promise.resolve({ success: false, created: false, message: "", output: "" })),
  discoverGitCredentials: vi.fn(() => Promise.resolve([])),
  getGlobalGitIdentity: vi.fn(() => Promise.resolve(null)),
  getRemoteUrl: vi.fn(() => Promise.resolve(null)),
  getRemotes: vi.fn(() => Promise.resolve([])),
  removeRemote: vi.fn(() => Promise.resolve({})),
  rebase: vi.fn(() => Promise.resolve({})),
  abortRebase: vi.fn(() => Promise.resolve({ success: false })),
  merge: vi.fn(() => Promise.resolve({})),
  checkoutCommit: vi.fn(() => Promise.resolve({})),
  cherryPick: vi.fn(() => Promise.resolve({})),
  revertCommit: vi.fn(() => Promise.resolve({})),
  resetToCommit: vi.fn(() => Promise.resolve({})),
  abortMerge: vi.fn(() => Promise.resolve({ success: false })),
  continueRebase: vi.fn(() => Promise.resolve({ success: false, conflict: false })),
  continueMerge: vi.fn(() => Promise.resolve({ success: false, conflict: false })),
  stash: vi.fn(() => Promise.resolve({})),
  stashPop: vi.fn(() => Promise.resolve({ success: false })),
  getConflictDetails: vi.fn(() => Promise.resolve({})),
  validateWorktreeDirectory: vi.fn(() => Promise.resolve({})),
  canonicalizeWorktreeState: vi.fn(() => Promise.resolve({})),
}))

vi.doMock("@/lib/worktrees/worktreeCreate", () => ({
  createWorktreeWithDefaults: vi.fn(),
  resolveRootTrackingRemote: vi.fn(() => Promise.resolve(null)),
}))

vi.doMock("@/lib/worktrees/worktreeManager", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worktrees/worktreeManager")>()),
  removeProjectWorktree: vi.fn(() => Promise.resolve()),
}))

vi.doMock("@/lib/openchamberConfig", () => ({
  saveWorktreeSetupCommands: vi.fn(() => Promise.resolve()),
}))

vi.doMock("./useDirectoryStore", () => ({
  useDirectoryStore: {
    getState: () => ({ currentDirectory: "/repo" }),
  },
}))

vi.doMock("./useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      activeProjectId: "project-1",
      projects: [{ id: "project-1", path: "/repo" }],
    }),
  },
}))

vi.doMock("./useSnippetsStore", () => ({
  useSnippetsStore: {
    getState: () => ({
      expandText: (value: string) => Promise.resolve(value),
    }),
  },
}))

// Minimal in-memory store state so tests that call useGlobalSessionsStore.setState() also work
let _mockGlobalActiveSessions: Session[] = []
const _mockUpsertSession = (session: Session) => {
  upsertedSessions.push(session)
  const idx = _mockGlobalActiveSessions.findIndex((s) => s.id === session.id)
  if (idx >= 0) {
    _mockGlobalActiveSessions = [
      ..._mockGlobalActiveSessions.slice(0, idx),
      session,
      ..._mockGlobalActiveSessions.slice(idx + 1),
    ]
  } else {
    _mockGlobalActiveSessions = [..._mockGlobalActiveSessions, session]
  }
}

vi.doMock("./useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      activeSessions: _mockGlobalActiveSessions,
      archivedSessions: [] as Session[],
      upsertSession: _mockUpsertSession,
    }),
    setState: (updater: unknown) => {
      const patch =
        typeof updater === "function"
          ? (updater as (s: { activeSessions: Session[] }) => Partial<{ activeSessions: Session[] }>)({
              activeSessions: _mockGlobalActiveSessions,
            })
          : (updater as Partial<{ activeSessions: Session[] }>)
      if (
        patch &&
        "activeSessions" in patch &&
        Array.isArray((patch as { activeSessions: Session[] }).activeSessions)
      ) {
        _mockGlobalActiveSessions = (patch as { activeSessions: Session[] }).activeSessions
      }
    },
    subscribe: vi.fn(() => () => undefined),
  },
}))

vi.doMock("@/sync/sync-refs", () => ({
  setSyncRefs: vi.fn(() => undefined),
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredDirectories.push({ sessionID, directory })
  },
  getSyncSDK: vi.fn(() => ({})),
  getSyncDirectory: vi.fn(() => "/repo"),
  getDirectoryState: vi.fn(() => undefined),
  getSyncSessions: vi.fn(() => []),
  getAllSyncSessions: vi.fn(() => []),
  getSyncMessages: vi.fn(() => []),
  getSyncSessionMaterializationStatus: vi.fn(() => undefined),
  getSyncParts: vi.fn(() => []),
  getSyncSessionStatus: vi.fn(() => undefined),
  getSyncPermissions: vi.fn(() => []),
  getSyncQuestions: vi.fn(() => []),
  getSyncChildStores: () => ({
    ensureChild: (directory: string, options?: { bootstrap?: boolean }) => {
      ensureChildCalls.push({ directory, bootstrap: options?.bootstrap })
      return {
        setState: (
          updater: typeof childState | ((state: typeof childState) => Partial<typeof childState> | typeof childState),
        ) => {
          const patch = typeof updater === "function" ? updater(childState) : updater
          if (patch !== childState) {
            Object.assign(childState, patch)
          }
        },
      }
    },
  }),
}))

const { useMultiRunStore } = await import("./useMultiRunStore")

describe("useMultiRunStore", () => {
  beforeEach(() => {
    upsertedSessions.length = 0
    registeredDirectories.length = 0
    ensureChildCalls.length = 0
    childState.session = []
    childState.sessionTotal = 0
    childState.limit = 5
    currentDirectory = "/repo"
    useMultiRunStore.setState({ isLoading: false, error: null })
    routeMessageMock.mockReset()
    routeMessageMock.mockImplementation(() => Promise.resolve())
    sessionUpdateMock.mockReset()
    sessionUpdateMock.mockImplementation(defaultSessionUpdate)
    scopedDirectories.length = 0
  })

  test("registers created sessions without waiting for a sidebar refresh", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "Fix thing",
      isolateRuns: false,
      groups: [
        {
          prompt: "Fix it",
          models: [{ providerID: "anthropic", modelID: "claude-sonnet-4-5" }],
        },
      ],
    })

    expect(result?.sessionIds).toEqual(["ses_multirun"])
    // S4.5: no manual global-index write — the session.created bus event is
    // the writer of record. Only routing + the per-directory child store are
    // seeded here.
    expect(upsertedSessions).toEqual([])
    expect(registeredDirectories).toEqual([{ sessionID: "ses_multirun", directory: "/repo" }])
    expect(ensureChildCalls).toEqual([{ directory: "/repo", bootstrap: false }])
    expect(childState.session.map((session) => session.id)).toEqual(["ses_multirun"])
  })

  test("removes a worktree whose session could not be created", async () => {
    const { checkIsGitRepository } = await import("@/lib/gitApi")
    vi.mocked(checkIsGitRepository).mockResolvedValueOnce(true)

    const createdWorktree = {
      path: "/repo/.worktrees/fix-thing",
      branch: "fix-thing",
      worktreeRoot: "/repo",
      worktreeStatus: "ready",
      headState: "branch",
    }
    const { createWorktreeWithDefaults } = await import("@/lib/worktrees/worktreeCreate")
    vi.mocked(createWorktreeWithDefaults).mockResolvedValueOnce(createdWorktree as never)

    const { axCodeClient } = await import("@/lib/ax-code/client")
    vi.mocked(axCodeClient.createSession).mockRejectedValueOnce(new Error("session failed"))

    const { removeProjectWorktree } = await import("@/lib/worktrees/worktreeManager")
    vi.mocked(removeProjectWorktree).mockClear()

    const result = await useMultiRunStore.getState().createMultiRun({
      name: "Fix thing",
      isolateRuns: true,
      groups: [{ prompt: "Fix it", models: [{ providerID: "anthropic", modelID: "claude-sonnet-4-5" }] }],
    })

    // No session means nothing else would ever remove the worktree or its branch.
    expect(result).toBeNull()
    expect(removeProjectWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1", path: "/repo" }),
      expect.objectContaining({ path: "/repo/.worktrees/fix-thing" }),
      { deleteLocalBranch: true },
    )
  })
})

describe("useMultiRunStore multi-run metadata", () => {
  beforeEach(() => {
    childState.session = []
    useMultiRunStore.setState({ isLoading: false, error: null })
    routeMessageMock.mockReset()
    routeMessageMock.mockImplementation(() => Promise.resolve())
    sessionUpdateMock.mockReset()
    sessionUpdateMock.mockImplementation(defaultSessionUpdate)
    scopedDirectories.length = 0
  })

  const metadataOf = (callIndex: number) =>
    (sessionUpdateMock.mock.calls[callIndex]?.[0] as SessionUpdateArgs | undefined)?.metadata as
      | ({ multiRun?: Record<string, unknown> } & Record<string, unknown>)
      | undefined

  test("launch writes metadata.multiRun and preserves existing metadata", async () => {
    const { axCodeClient } = await import("@/lib/ax-code/client")
    vi.mocked(axCodeClient.createSession).mockResolvedValueOnce({
      id: "ses_multirun",
      title: "fix-thing/anthropic/claude-sonnet-4-5",
      directory: "/repo",
      metadata: { queue: { source: "multi-run" }, app: { pinned: true } },
      time: { created: 1, updated: 1 },
    } as unknown as Session)

    const result = await useMultiRunStore.getState().createMultiRun({
      name: "Fix thing",
      isolateRuns: false,
      agent: "build",
      groups: [{ prompt: "Fix it", models: [{ providerID: "anthropic", modelID: "claude-sonnet-4-5" }] }],
    })

    expect(result?.sessionIds).toEqual(["ses_multirun"])
    expect(sessionUpdateMock).toHaveBeenCalledTimes(1)
    const args = sessionUpdateMock.mock.calls[0][0] as SessionUpdateArgs
    expect(args.sessionID).toBe("ses_multirun")
    expect(args.directory).toBe("/repo")
    expect(scopedDirectories).toEqual(["/repo"])
    const metadata = metadataOf(0)
    expect(metadata?.queue).toEqual({ source: "multi-run" })
    expect(metadata?.app).toEqual({ pinned: true })
    const multiRun = metadata?.multiRun as Record<string, string>
    expect(Object.keys(multiRun).sort()).toEqual(["agent", "groupId", "model", "variantId"])
    expect(multiRun.model).toBe("anthropic/claude-sonnet-4-5")
    expect(multiRun.agent).toBe("build")
    expect(multiRun.groupId.length).toBeGreaterThan(0)
    expect(multiRun.groupId.length).toBeLessThanOrEqual(160)
    expect(multiRun.variantId.length).toBeLessThanOrEqual(160)
    // The registered session carries the identity so grouping works before the next event.
    expect((childState.session[0] as Session & { metadata?: unknown }).metadata).toEqual(metadata)
  })

  test("lanes of one run group share a groupId with distinct variants; run groups and launches differ", async () => {
    const launch = () =>
      useMultiRunStore.getState().createMultiRun({
        name: "Fix thing",
        isolateRuns: false,
        groups: [
          {
            prompt: "Fix it",
            models: [
              { providerID: "anthropic", modelID: "claude" },
              { providerID: "anthropic", modelID: "claude" },
            ],
          },
          { prompt: "Other", models: [{ providerID: "openai", modelID: "gpt-5" }] },
        ],
      })

    await launch()
    const first = [0, 1, 2].map((index) => metadataOf(index)?.multiRun as Record<string, string>)
    expect(first[0].groupId).toBe(first[1].groupId)
    expect(first[0].variantId).not.toBe(first[1].variantId)
    expect(first[2].groupId).not.toBe(first[0].groupId)
    expect(first[0]).not.toHaveProperty("agent")
    expect(first[0]).not.toHaveProperty("worktree")

    await launch()
    const second = metadataOf(3)?.multiRun as Record<string, string>
    expect(second.groupId).not.toBe(first[0].groupId)
  })

  test("isolated lanes record their worktree path", async () => {
    const { checkIsGitRepository } = await import("@/lib/gitApi")
    vi.mocked(checkIsGitRepository).mockResolvedValueOnce(true)
    const { createWorktreeWithDefaults } = await import("@/lib/worktrees/worktreeCreate")
    vi.mocked(createWorktreeWithDefaults).mockResolvedValueOnce({
      path: "/repo/.worktrees/fix-thing",
      branch: "fix-thing",
      worktreeRoot: "/repo",
      worktreeStatus: "ready",
      headState: "branch",
    } as never)

    const result = await useMultiRunStore.getState().createMultiRun({
      name: "Fix thing",
      isolateRuns: true,
      groups: [{ prompt: "Fix it", models: [{ providerID: "anthropic", modelID: "claude" }] }],
    })

    expect(result?.sessionIds).toEqual(["ses_multirun"])
    expect(scopedDirectories).toEqual(["/repo/.worktrees/fix-thing"])
    expect(metadataOf(0)?.multiRun).toMatchObject({ worktree: "/repo/.worktrees/fix-thing" })
  })

  test("a failed metadata update does not fail the launch and is logged once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    sessionUpdateMock.mockRejectedValueOnce(new Error("update failed"))
    sessionUpdateMock.mockResolvedValueOnce({ error: { message: "bad" } } as never)

    const result = await useMultiRunStore.getState().createMultiRun({
      name: "Fix thing",
      isolateRuns: false,
      groups: [
        {
          prompt: "Fix it",
          models: [
            { providerID: "anthropic", modelID: "claude" },
            { providerID: "openai", modelID: "gpt-5" },
          ],
        },
      ],
    })

    expect(result?.sessionIds).toHaveLength(2)
    expect(result?.startedRunCount).toBe(2)
    expect(useMultiRunStore.getState().error).toBeNull()
    const metadataWarnings = warn.mock.calls.filter((call) => String(call[0]).includes("multi-run metadata"))
    expect(metadataWarnings).toHaveLength(1)
    warn.mockRestore()
  })
})

describe("useMultiRunStore dispatch", () => {
  test("reports the runs whose prompt reached the server", async () => {
    // Create and start are two round trips. Reporting the created sessions as started left a run whose
    // send failed showing nothing anywhere: empty session, prompt gone, success returned.
    const { useMultiRunStore } = await import("./useMultiRunStore")
    const params = {
      name: "Fix thing",
      isolateRuns: false,
      groups: [
        {
          prompt: "Fix it",
          models: [
            { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
            { providerID: "openai", modelID: "gpt-5" },
          ],
        },
      ],
    }

    routeMessageMock.mockImplementationOnce(() => Promise.resolve())
    routeMessageMock.mockImplementationOnce(() => Promise.reject(new Error("send failed")))

    const result = await useMultiRunStore.getState().createMultiRun(params as never)

    expect(result?.sessionIds).toHaveLength(2)
    expect(result?.startedRunCount).toBe(1)
  })
})
