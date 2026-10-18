import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WorktreeMetadata } from "@/types/worktree"

const { removeWorktreeMock, listWorktreesMock, deleteRemoteBranchMock } = vi.hoisted(() => ({
  removeWorktreeMock: vi.fn(async () => ({ success: true })),
  listWorktreesMock: vi.fn(async () => [] as Array<{ path: string; branch?: string }>),
  deleteRemoteBranchMock: vi.fn(async () => undefined as unknown),
}))

vi.mock("@/lib/gitApi", () => ({
  git: { worktree: { remove: removeWorktreeMock, list: listWorktreesMock } },
  deleteRemoteBranch: deleteRemoteBranchMock,
}))

vi.mock("@/lib/worktrees/worktreeStatus", () => ({
  invalidateResolvedProjectRootCache: () => {},
  resolveProjectRoot: async () => "/repo",
}))

vi.mock("@/lib/terminalApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/terminalApi")>()),
  closeTerminal: vi.fn(async () => undefined),
}))

import { listProjectWorktrees, pruneExpiredWorktreeListEntries, removeProjectWorktree } from "./worktreeManager"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSessionWorktreeStore } from "@/sync/session-worktree-store"
import { useTerminalStore } from "@/stores/useTerminalStore"

const entry = (at: number) => ({ value: [] as WorktreeMetadata[], at })

describe("pruneExpiredWorktreeListEntries", () => {
  test("drops entries whose TTL has passed and keeps fresh ones", () => {
    const cache = new Map<string, { value: WorktreeMetadata[]; at: number }>()
    cache.set("/repo/old", entry(0))
    cache.set("/repo/fresh", entry(29_000))

    pruneExpiredWorktreeListEntries(cache, 30_000)

    expect([...cache.keys()]).toEqual(["/repo/fresh"])
  })

  test("an entry expiring exactly at the cutoff counts as expired, matching the cache read", () => {
    const cache = new Map<string, { value: WorktreeMetadata[]; at: number }>()
    cache.set("/repo/a", entry(0))

    pruneExpiredWorktreeListEntries(cache, 30_000)

    expect(cache.size).toBe(0)
  })
})

describe("removeProjectWorktree", () => {
  const project = { path: "/repo", name: "repo" } as unknown as Parameters<typeof removeProjectWorktree>[0]
  const metadata = {
    path: "/repo/.worktrees/feature",
    branch: "feature",
    worktreeRoot: "/repo/.worktrees/feature",
    projectDirectory: "/repo",
  } as unknown as WorktreeMetadata

  beforeEach(() => {
    removeWorktreeMock.mockClear()
    useSessionUIStore.setState({ worktreeMetadata: new Map(), availableWorktrees: [], availableWorktreesByProject: new Map() })
    useSessionWorktreeStore.setState({ attachments: new Map() })
    useTerminalStore.setState({ sessions: new Map(), projectActionRuns: {}, nextChunkId: 1, nextTabId: 1, hasHydrated: true })
    useSessionUIStore.getState().setWorktreeMetadata("ses_feature", metadata)
  })

  test("detaches the sessions that lived in the removed worktree", async () => {
    // The attachment is authoritative for a session's directory, so deleting only
    // the metadata map left the session resolving to the directory that git had
    // just removed: Files, Diff and Terminal pointed at a ghost path.
    expect(useSessionWorktreeStore.getState().getAttachment("ses_feature")?.cwd).toBe(metadata.path)

    await removeProjectWorktree(project, metadata, {})

    expect(removeWorktreeMock).toHaveBeenCalledTimes(1)
    expect(useSessionUIStore.getState().worktreeMetadata.has("ses_feature")).toBe(false)
    expect(useSessionWorktreeStore.getState().getAttachment("ses_feature")).toBeUndefined()
  })

  test("closes the removed worktree's terminals and runs", async () => {
    const terminalState = useTerminalStore.getState()
    terminalState.ensureDirectory(metadata.path)
    const tabId = useTerminalStore.getState().getDirectoryState(metadata.path)?.tabs[0]?.id
    useTerminalStore.getState().setTabSessionId(metadata.path, tabId!, "pty-worktree")
    const removeDirectorySpy = vi.spyOn(useTerminalStore.getState(), "removeDirectory")

    await removeProjectWorktree(project, metadata, {})

    expect(removeDirectorySpy).toHaveBeenCalledWith(metadata.path)
    expect(useTerminalStore.getState().getDirectoryState(metadata.path)).toBeUndefined()
    removeDirectorySpy.mockRestore()
  })

  test("reports a remote branch it could not delete instead of claiming success", async () => {
    // The remote delete is best-effort; the caller used to be told the remote branch
    // was gone either way.
    deleteRemoteBranchMock.mockRejectedValueOnce(new Error("remote ref does not exist"))

    const result = await removeProjectWorktree(project, metadata, { deleteRemoteBranch: true })

    expect(result).toEqual({ remoteBranchRemoved: false })
  })

  test("reports the remote branch when the delete succeeded", async () => {
    deleteRemoteBranchMock.mockResolvedValueOnce({ success: true })

    const result = await removeProjectWorktree(project, metadata, { deleteRemoteBranch: true })

    expect(result).toEqual({ remoteBranchRemoved: true })
  })

  test("leaves sessions in other worktrees alone", async () => {
    const other = {
      path: "/repo/.worktrees/other",
      branch: "other",
      worktreeRoot: "/repo/.worktrees/other",
      projectDirectory: "/repo",
    } as unknown as WorktreeMetadata
    useSessionUIStore.getState().setWorktreeMetadata("ses_other", other)

    await removeProjectWorktree(project, metadata, {})

    expect(useSessionUIStore.getState().worktreeMetadata.has("ses_other")).toBe(true)
    expect(useSessionWorktreeStore.getState().getAttachment("ses_other")?.cwd).toBe(other.path)
  })
})

describe("listProjectWorktrees", () => {
  beforeEach(() => {
    listWorktreesMock.mockClear()
    useSessionUIStore.setState({
      worktreeMetadata: new Map(),
      availableWorktrees: [],
      availableWorktreesByProject: new Map(),
    })
    useSessionWorktreeStore.setState({ attachments: new Map() })
  })

  test("does not cache a listing a removal invalidated while it was in flight", async () => {
    // The listing that was already on its way answered with the worktree still in it and was
    // cached anyway: the removed worktree came back in the sidebar for its whole TTL.
    // A path of its own: the listing cache is module state that outlives a test.
    const project = {
      path: "/repo-inflight",
      name: "repo-inflight",
    } as unknown as Parameters<typeof listProjectWorktrees>[0]
    const staleWorktree = {
      path: "/repo-inflight/.worktrees/feature",
      branch: "feature",
      worktreeRoot: "/repo-inflight/.worktrees/feature",
      projectDirectory: "/repo-inflight",
    } as unknown as WorktreeMetadata

    let resolveStale: (value: Array<{ path: string; branch: string }>) => void = () => {}
    listWorktreesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve
      }),
    )

    const pending = listProjectWorktrees(project)
    await removeProjectWorktree(project, staleWorktree, {})
    resolveStale([{ path: staleWorktree.path, branch: "refs/heads/feature" }])
    await pending

    listWorktreesMock.mockResolvedValueOnce([])
    const next = await listProjectWorktrees(project)

    expect(listWorktreesMock).toHaveBeenCalledTimes(2)
    expect(next.map((worktree) => worktree.path)).toEqual([])
  })

  test("does not list the enclosing repository root as a worktree of a subdirectory project", async () => {
    // The project lives in /repo/packages/web, so its repository root (/repo) is a
    // different directory: listing it made the inner project adopt the outer
    // repository as a worktree and claim its sessions.
    listWorktreesMock.mockResolvedValue([
      { path: "/repo", branch: "refs/heads/main" },
      { path: "/repo/packages/web", branch: "refs/heads/web" },
      { path: "/tmp/wt/feature", branch: "refs/heads/feature-abc" },
    ])

    const worktrees = await listProjectWorktrees({ path: "/repo/packages/web", name: "web" } as never)

    expect(worktrees.map((entry) => entry.path)).toEqual(["/tmp/wt/feature"])
  })

  test("keeps a linked worktree of a project that is itself the repository root", async () => {
    listWorktreesMock.mockResolvedValue([
      { path: "/repo2", branch: "refs/heads/main" },
      { path: "/tmp/wt/other", branch: "refs/heads/other-xyz" },
    ])

    const worktrees = await listProjectWorktrees({ path: "/repo2", name: "repo2" } as never)

    expect(worktrees.map((entry) => entry.path)).toEqual(["/tmp/wt/other"])
  })
})
