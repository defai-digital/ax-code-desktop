import * as gitHttp from "@/lib/gitApiHttp"
import { normalizeWorktreePath } from "@/lib/worktrees/path"
import type { GitWorktreeBootstrapStatus } from "@/lib/api/types"

type WorktreeBootstrapState = GitWorktreeBootstrapStatus

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 250

const state = new Map<string, WorktreeBootstrapState>()
const waiters = new Map<string, Promise<void>>()

// One generation per directory, bumped when its state is cleared. A poll that was already running
// for the cleared directory belongs to the old generation and must not write: it re-created the
// state the caller had just cleared, where a stale "ready" let a worktree re-created at the same
// path pass its own wait before its setup commands had run, and a stale "failed" poisoned every
// later wait for that path.
const pollRuns = new Map<string, number>()

const getKey = (directory: string): string => normalizeWorktreePath(directory)

const getGitWorktreeBootstrapStatus = async (directory: string): Promise<GitWorktreeBootstrapStatus> => {
  const runtimeGit = typeof window !== "undefined" ? window.__AX_CODE_DESKTOP_RUNTIME_APIS__?.git : undefined
  if (runtimeGit?.worktree?.bootstrapStatus) {
    return runtimeGit.worktree.bootstrapStatus(directory)
  }
  if (runtimeGit?.getGitWorktreeBootstrapStatus) {
    return runtimeGit.getGitWorktreeBootstrapStatus(directory)
  }
  return gitHttp.getGitWorktreeBootstrapStatus(directory)
}

export const markWorktreeBootstrapPending = (directory: string): void => {
  const key = getKey(directory)
  if (!key) {
    return
  }
  state.set(key, {
    status: "pending",
    error: null,
    updatedAt: Date.now(),
  })
}

export const clearWorktreeBootstrapState = (directory: string): void => {
  const key = getKey(directory)
  if (!key) {
    return
  }
  state.delete(key)
  waiters.delete(key)
  pollRuns.set(key, (pollRuns.get(key) ?? 0) + 1)
}

const setWorktreeBootstrapState = (directory: string, next: WorktreeBootstrapState): void => {
  const key = getKey(directory)
  if (!key) {
    return
  }
  state.set(key, next)
  if (next.status !== "pending") {
    waiters.delete(key)
  }
}
const pollWorktreeBootstrapUntilSettled = async (directory: string, timeoutMs: number): Promise<void> => {
  const startedAt = Date.now()
  const key = getKey(directory)
  const run = pollRuns.get(key) ?? 0
  const isCurrentRun = () => (pollRuns.get(key) ?? 0) === run

  while (Date.now() - startedAt < timeoutMs) {
    const result = await getGitWorktreeBootstrapStatus(directory)
    // The wait still ends on the runtime's answer — that is what its caller is waiting for — but a
    // retired run leaves the state alone.
    if (isCurrentRun()) {
      setWorktreeBootstrapState(directory, result)
    }

    if (result.status === "ready") {
      return
    }

    if (result.status === "failed") {
      throw new Error(result.error || "Worktree bootstrap failed")
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error("Timed out waiting for worktree bootstrap")
}

export const waitForWorktreeBootstrap = async (directory: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> => {
  const key = getKey(directory)
  if (!key) {
    return
  }

  const current = state.get(key)
  if (current?.status === "ready") {
    return
  }
  if (current?.status === "failed") {
    throw new Error(current.error || "Worktree bootstrap failed")
  }

  const existing = waiters.get(key)
  if (existing) {
    return existing
  }

  const pending = pollWorktreeBootstrapUntilSettled(directory, timeoutMs).finally(() => {
    // Only its own entry: a wait that was cleared and replaced must not drop the new one, or the
    // next caller would poll the same directory a second time.
    if (waiters.get(key) === pending) {
      waiters.delete(key)
    }
  })
  waiters.set(key, pending)
  return pending
}
