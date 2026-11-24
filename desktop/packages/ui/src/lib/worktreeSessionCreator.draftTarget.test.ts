import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type Draft = {
  open: boolean
  directoryOverride: string | null
  pendingWorktreeRequestId?: string | null
  bootstrapPendingDirectory?: string | null
}

const h = vi.hoisted(() => {
  const state = { draft: null as unknown as Draft }
  const worktree: { resolve: (value: { path: string }) => void; reject: (error: Error) => void } = {
    resolve: () => {},
    reject: () => {},
  }
  return {
    state,
    worktree,
    overrideNewSessionDraftTarget: vi.fn((options: Partial<Draft>) => {
      state.draft = { ...state.draft, ...options }
    }),
    openNewSessionDraft: vi.fn((options: Partial<Draft>) => {
      state.draft = { open: true, directoryOverride: null, ...options }
    }),
    setDirectory: vi.fn<(directory: string) => void>(),
    resolvePendingDraftWorktreeRequest: vi.fn<(id: string, directory: string) => void>(),
    rejectPendingDraftWorktreeRequest: vi.fn<(id: string, error: Error) => void>(),
    resolvePendingDraftWorktreeTarget: vi.fn((requestId: string, directory: string | null) => {
      if (state.draft.pendingWorktreeRequestId !== requestId) return
      state.draft = { ...state.draft, pendingWorktreeRequestId: null, directoryOverride: directory }
    }),
    setDraftBootstrapPendingDirectory: vi.fn((directory: string | null) => {
      state.draft = { ...state.draft, bootstrapPendingDirectory: directory }
    }),
    createWorktreeWithDefaults: vi.fn(
      () =>
        new Promise<{ path: string }>((resolve, reject) => {
          worktree.resolve = resolve
          worktree.reject = reject
        }),
    ),
  }
})

vi.mock("@/components/ui", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}))
vi.mock("@/lib/gitApi", () => ({
  checkIsGitRepository: async () => true,
  previewGitWorktree: async () => ({ path: "/repo/.worktrees/preview" }),
}))
vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: { getState: () => ({ getActiveProject: () => ({ id: "proj_1", path: "/repo" }) }) },
}))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      newSessionDraft: h.state.draft,
      overrideNewSessionDraftTarget: h.overrideNewSessionDraftTarget,
      openNewSessionDraft: h.openNewSessionDraft,
      resolvePendingDraftWorktreeTarget: h.resolvePendingDraftWorktreeTarget,
      setDraftBootstrapPendingDirectory: h.setDraftBootstrapPendingDirectory,
    }),
  },
}))
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: { getState: vi.fn() } }))
vi.mock("@/stores/useAgentsStore", () => ({ useAgentsStore: { getState: vi.fn() } }))
vi.mock("@/sync/selection-store", () => ({ useSelectionStore: { getState: vi.fn() } }))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: { getState: () => ({ setDirectory: h.setDirectory, currentDirectory: "/repo" }) },
}))
vi.mock("@/lib/git/branchNameGenerator", () => ({ generateBranchName: () => "calm-river" }))
vi.mock("@/lib/worktrees/worktreeStatus", () => ({ getRootBranch: vi.fn() }))
vi.mock("@/lib/openchamberConfig", () => ({ getWorktreeSetupCommands: async () => [] }))
vi.mock("@/lib/worktrees/worktreeManager", () => ({ removeProjectWorktree: vi.fn() }))
vi.mock("@/lib/worktrees/worktreeCreate", () => ({ createWorktreeWithDefaults: h.createWorktreeWithDefaults }))
vi.mock("@/lib/worktrees/pendingDraftWorktree", () => ({
  createPendingDraftWorktreeRequest: () => "worktree_req_1",
  rejectPendingDraftWorktreeRequest: h.rejectPendingDraftWorktreeRequest,
  resolvePendingDraftWorktreeRequest: h.resolvePendingDraftWorktreeRequest,
}))

const { createWorktreeDraft } = await import("./worktreeSessionCreator")

const CREATED = "/repo/.worktrees/calm-river"

const startDraftAndWaitForCreate = async () => {
  const pending = createWorktreeDraft()
  await vi.waitFor(() => expect(h.createWorktreeWithDefaults).toHaveBeenCalledOnce())
  // Wrapped: an async function returning the promise itself would make the caller wait for the creation to finish.
  return { pending }
}

describe("instant worktree draft target", () => {
  beforeEach(() => {
    h.state.draft = { open: true, directoryOverride: "/repo", pendingWorktreeRequestId: null }
    h.overrideNewSessionDraftTarget.mockClear()
    h.openNewSessionDraft.mockClear()
    h.setDirectory.mockClear()
    h.resolvePendingDraftWorktreeRequest.mockClear()
    h.createWorktreeWithDefaults.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("points the draft that still waits on the request at the created worktree", async () => {
    const { pending } = await startDraftAndWaitForCreate()
    h.worktree.resolve({ path: CREATED })

    await expect(pending).resolves.toBe(CREATED)
    expect(h.resolvePendingDraftWorktreeRequest).toHaveBeenCalledWith("worktree_req_1", CREATED)
    expect(h.state.draft).toMatchObject({ directoryOverride: CREATED, pendingWorktreeRequestId: null })
    expect(h.setDirectory).toHaveBeenLastCalledWith(CREATED)
  })

  test("leaves a draft that moved to another request where it now points", async () => {
    // Writing the old worktree back undid the move, and a send waiting on the old request then took that worktree as
    // its own target and created its session there.
    const { pending } = await startDraftAndWaitForCreate()
    h.state.draft = { open: true, directoryOverride: "/repo/other", pendingWorktreeRequestId: "worktree_req_2" }
    h.worktree.resolve({ path: CREATED })

    await expect(pending).resolves.toBe(CREATED)
    // The waiting send is still released; it decides for itself that its target changed.
    expect(h.resolvePendingDraftWorktreeRequest).toHaveBeenCalledWith("worktree_req_1", CREATED)
    expect(h.state.draft).toMatchObject({ directoryOverride: "/repo/other", pendingWorktreeRequestId: "worktree_req_2" })
    expect(h.setDirectory).not.toHaveBeenCalledWith(CREATED)
  })

  test("leaves a closed draft closed", async () => {
    const { pending } = await startDraftAndWaitForCreate()
    h.state.draft = { open: false, directoryOverride: null, pendingWorktreeRequestId: null }
    h.worktree.resolve({ path: CREATED })

    await pending
    expect(h.state.draft).toMatchObject({ open: false, directoryOverride: null })
    expect(h.setDirectory).not.toHaveBeenCalledWith(CREATED)
  })

  test("a failed create releases a send waiting on its request even after the draft closed", async () => {
    // The draft no longer names the request, so reading it off the draft left that send waiting forever.
    const { pending } = await startDraftAndWaitForCreate()
    h.state.draft = { open: false, directoryOverride: null, pendingWorktreeRequestId: null }
    h.worktree.reject(new Error("git worktree add failed"))

    await expect(pending).resolves.toBeNull()
    expect(h.rejectPendingDraftWorktreeRequest).toHaveBeenCalledWith("worktree_req_1", expect.any(Error))
  })

  test("a failed create leaves the request a draft moved to alone", async () => {
    const { pending } = await startDraftAndWaitForCreate()
    h.state.draft = {
      open: true,
      directoryOverride: "/repo/other",
      pendingWorktreeRequestId: "worktree_req_2",
      bootstrapPendingDirectory: "/repo/.worktrees/other",
    }
    h.worktree.reject(new Error("git worktree add failed"))

    await expect(pending).resolves.toBeNull()
    expect(h.rejectPendingDraftWorktreeRequest).toHaveBeenCalledWith("worktree_req_1", expect.any(Error))
    expect(h.rejectPendingDraftWorktreeRequest).not.toHaveBeenCalledWith("worktree_req_2", expect.anything())
    expect(h.state.draft).toMatchObject({
      pendingWorktreeRequestId: "worktree_req_2",
      bootstrapPendingDirectory: "/repo/.worktrees/other",
    })
  })
})
