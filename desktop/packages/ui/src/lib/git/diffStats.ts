import type { GitStatus } from "@/lib/api/types"

// Per-file line counts for a Git status, split by the scope they were diffed in. A file
// with edits in both scopes has an entry in both maps, so a consumer showing one row's
// number has to say which scope that row is, instead of summing the two.

export type GitDiffStats = NonNullable<GitStatus["diffStats"]>
export type GitDiffStatsScope = "staged" | "working"

export const DIFF_STATS_SCOPES: readonly GitDiffStatsScope[] = ["staged", "working"]

const NO_STATS = { insertions: 0, deletions: 0 }

export const diffStatsForPath = (stats: GitStatus["diffStats"], path: string, scope: GitDiffStatsScope) =>
  stats?.[scope]?.[path] ?? NO_STATS

/** Both scopes added up, for a surface that reports a single total for a file. */
export const combinedDiffStatsForPath = (stats: GitStatus["diffStats"], path: string) => {
  const staged = diffStatsForPath(stats, path, "staged")
  const working = diffStatsForPath(stats, path, "working")
  return { insertions: staged.insertions + working.insertions, deletions: staged.deletions + working.deletions }
}

/** Every path whose line counts moved in any scope, including one that appeared or left. */
export const collectChangedDiffStatPaths = (
  previous: GitDiffStats | undefined,
  next: GitDiffStats | undefined,
  into: Set<string>,
): Set<string> => {
  for (const scope of DIFF_STATS_SCOPES) {
    const previousScope = previous?.[scope] ?? {}
    const nextScope = next?.[scope] ?? {}
    for (const path of new Set([...Object.keys(previousScope), ...Object.keys(nextScope)])) {
      const previousEntry = previousScope[path]
      const nextEntry = nextScope[path]
      if (
        !previousEntry ||
        !nextEntry ||
        previousEntry.insertions !== nextEntry.insertions ||
        previousEntry.deletions !== nextEntry.deletions
      ) {
        into.add(path)
      }
    }
  }
  return into
}
