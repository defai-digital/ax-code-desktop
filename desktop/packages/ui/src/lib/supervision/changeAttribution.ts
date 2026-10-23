import { resolveSupervisionEvidence, type SessionSummaryLike } from "./sessionState"

/** The part of a git status that attribution reads. */
export interface DirtyTreeLike {
  worktreeRoot?: string
  isClean: boolean
  files: ReadonlyArray<{ path: string }>
}

const normalizePath = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")

/** Paths the runtime named in a session summary. Empty when it reported counts only. */
function summaryFilePaths(summary: SessionSummaryLike | null | undefined): string[] {
  const diffs = Array.isArray(summary?.diffs) ? summary.diffs : []
  const paths: string[] = []
  for (const diff of diffs) {
    if (typeof diff.file !== "string") continue
    const path = normalizePath(diff.file)
    if (path.length > 0) paths.push(path)
  }
  return paths
}

const absolutePath = (path: string): boolean => path.startsWith("/") || /^[A-Za-z]:\//.test(path)

/** Runtime snapshot paths and Git status paths are worktree-relative. Never infer a root from a suffix. */
function samePath(statusPath: string, summaryPath: string, root?: string): boolean {
  if (!absolutePath(summaryPath)) return statusPath === summaryPath
  if (absolutePath(statusPath)) return statusPath === summaryPath
  if (!root) return false
  const normalizedRoot = normalizePath(root).replace(/\/+$/, "")
  return summaryPath === `${normalizedRoot}/${statusPath}`
}

/**
 * Whether changes this session reported are still uncommitted. A dirty directory alone says nothing about a session:
 * the user's own edits or a sibling session in the same worktree make it dirty too.
 *
 * When the runtime named the files it changed, the answer is exact: one of them is still dirty. A session whose files
 * were all committed stops counting even though the tree is dirty for another reason. When the summary carries counts
 * only, the files are unknown, so a session that reported changes in a dirty directory still counts.
 */
export function sessionChangesStillUncommitted(
  summary: SessionSummaryLike | null | undefined,
  status: DirtyTreeLike | null | undefined,
): boolean {
  if (!status || status.isClean) return false
  if (resolveSupervisionEvidence(summary) === null) return false
  const named = summaryFilePaths(summary)
  if (named.length === 0) return true
  const dirty = status.files.map((file) => normalizePath(file.path))
  return named.some((path) => dirty.some((statusPath) => samePath(statusPath, path, status.worktreeRoot)))
}
