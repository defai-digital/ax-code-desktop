import type { GitHubPullRequestSummary } from "@/lib/api/types"

/**
 * Resolve the worktree arguments for a linked pull request.
 *
 * `localBranchExists` is the ownership fact the caller needs: when the PR's head
 * branch is already a local branch, the worktree creation reuses it (no `-b`), so
 * that branch predates the flow and must never be cleaned up as if the flow had
 * created it.
 */
export const normalizeBranchName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^heads\//, "")
    .replace(/\s+/g, "-")
    .replace(/^\/+|\/+$/g, "")
}

const sanitizeRemoteName = (value: string): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "pr-head"
}

export const resolvePrWorktreeConfig = (
  pr: GitHubPullRequestSummary,
  localBranches: string[],
  remoteBranches: string[],
) => {
  const headBranch = normalizeBranchName(pr.head || "")
  if (!headBranch) {
    throw new Error("PR head branch is missing")
  }

  if (localBranches.includes(headBranch)) {
    return {
      existingBranch: headBranch,
      localBranchExists: true,
      setUpstream: undefined,
      upstreamRemote: undefined,
      upstreamBranch: undefined,
      ensureRemoteName: undefined,
      ensureRemoteUrl: undefined,
      sourceLabel: headBranch,
    }
  }

  const availableRemoteBranch = remoteBranches.find((remoteBranch) => {
    const slashIndex = remoteBranch.indexOf("/")
    if (slashIndex <= 0 || slashIndex >= remoteBranch.length - 1) {
      return false
    }
    return remoteBranch.slice(slashIndex + 1) === headBranch
  })

  if (availableRemoteBranch) {
    const slashIndex = availableRemoteBranch.indexOf("/")
    const remoteName = availableRemoteBranch.slice(0, slashIndex)
    return {
      existingBranch: `remotes/${availableRemoteBranch}`,
      localBranchExists: false,
      setUpstream: true as const,
      upstreamRemote: remoteName,
      upstreamBranch: headBranch,
      ensureRemoteName: undefined,
      ensureRemoteUrl: undefined,
      sourceLabel: `${remoteName}/${headBranch}`,
    }
  }

  const ownerFromLabel = String(pr.headLabel || "")
    .split(":")[0]
    ?.trim()
  const remoteSeed = pr.headRepo?.owner || ownerFromLabel || "pr-head"
  const remoteName = `pr-${sanitizeRemoteName(remoteSeed)}`
  const remoteUrl = pr.headRepo?.sshUrl || pr.headRepo?.cloneUrl || ""

  if (!remoteUrl) {
    throw new Error("PR head repository URL is unavailable")
  }

  return {
    existingBranch: `remotes/${remoteName}/${headBranch}`,
    localBranchExists: false,
    setUpstream: true as const,
    upstreamRemote: remoteName,
    upstreamBranch: headBranch,
    ensureRemoteName: remoteName,
    ensureRemoteUrl: remoteUrl,
    sourceLabel: `${remoteName}/${headBranch}`,
  }
}
