import { getGitBranches, getGitStatus } from "@/lib/gitApi"
import type { CreateWorktreeArgs, ProjectRef } from "@/lib/worktrees/worktreeManager"
import { createWorktree } from "@/lib/worktrees/worktreeManager"
import { getRootBranch } from "@/lib/worktrees/worktreeStatus"

const parseTrackingRef = (tracking: string | null | undefined): { remote: string; branch: string } | null => {
  const value = String(tracking || "")
    .trim()
    .replace(/^remotes\//, "")
  if (!value) {
    return null
  }

  const separatorIndex = value.indexOf("/")
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return null
  }

  return {
    remote: value.slice(0, separatorIndex),
    branch: value.slice(separatorIndex + 1),
  }
}

const normalizeBranchName = (value: string): string => {
  return String(value || "")
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^heads\//, "")
    .replace(/^remotes\//, "")
}

const resolveLocalBranchName = (args: CreateWorktreeArgs): string => {
  if (args.branchName) {
    return normalizeBranchName(args.branchName)
  }
  if (args.mode === "existing") {
    return normalizeBranchName(args.existingBranch || args.preferredName || "")
  }
  return normalizeBranchName(args.preferredName || "")
}

/**
 * The upstream is composed server-side as `<remote>/<branch>`. A selected remote
 * branch arrives qualified ("origin/foo"), so passing it through made the upstream
 * "origin/origin/foo" — a ref that does not exist, leaving the worktree branch with
 * no upstream. Strip the qualifier only when it is the remote we are configuring.
 */
export const resolveUpstreamBranchName = (remote: string, localBranch: string): string => {
  const normalizedBranch = normalizeBranchName(localBranch)
  const prefix = `${remote}/`
  return remote && normalizedBranch.startsWith(prefix) ? normalizedBranch.slice(prefix.length) : normalizedBranch
}

export const resolveRootTrackingRemote = async (projectDirectory: string): Promise<string | null> => {
  const rootBranch = await getRootBranch(projectDirectory)

  try {
    const branchState = await getGitBranches(projectDirectory)
    const tracking = branchState.branches?.[rootBranch]?.tracking || null
    const parsed = parseTrackingRef(tracking)
    if (parsed?.remote) {
      return parsed.remote
    }
  } catch {
    // ignore and fallback to status tracking
  }

  try {
    const status = await getGitStatus(projectDirectory)
    const parsed = parseTrackingRef(status.tracking)
    if (parsed?.remote) {
      return parsed.remote
    }
  } catch {
    // ignore
  }

  return null
}

const resolveWorktreeUpstreamDefaults = async (
  projectDirectory: string,
  localBranch: string,
): Promise<{ setUpstream: true; upstreamRemote: string; upstreamBranch: string } | null> => {
  const remote = await resolveRootTrackingRemote(projectDirectory)
  const normalizedBranch = normalizeBranchName(localBranch)
  if (!remote || !normalizedBranch) {
    return null
  }

  return {
    setUpstream: true,
    upstreamRemote: remote,
    upstreamBranch: resolveUpstreamBranchName(remote, normalizedBranch),
  }
}

export const withWorktreeUpstreamDefaults = async (
  projectDirectory: string,
  args: CreateWorktreeArgs,
  options?: { resolvedRootTrackingRemote?: string | null },
): Promise<CreateWorktreeArgs> => {
  const localBranch = resolveLocalBranchName(args)
  const resolvedRemote = options?.resolvedRootTrackingRemote
  const defaults =
    resolvedRemote === undefined
      ? await resolveWorktreeUpstreamDefaults(projectDirectory, localBranch)
      : resolvedRemote && normalizeBranchName(localBranch)
        ? {
            setUpstream: true as const,
            upstreamRemote: resolvedRemote,
            upstreamBranch: resolveUpstreamBranchName(resolvedRemote, localBranch),
          }
        : null
  if (!defaults) {
    return args
  }

  return {
    ...args,
    setUpstream: args.setUpstream ?? defaults.setUpstream,
    upstreamRemote: args.upstreamRemote || defaults.upstreamRemote,
    upstreamBranch: args.upstreamBranch || defaults.upstreamBranch,
  }
}

export const createWorktreeWithDefaults = async (
  project: ProjectRef,
  args: CreateWorktreeArgs,
  options?: { resolvedRootTrackingRemote?: string | null },
) => {
  const resolvedArgs = await withWorktreeUpstreamDefaults(project.path, args, options)
  return createWorktree(project, resolvedArgs)
}
