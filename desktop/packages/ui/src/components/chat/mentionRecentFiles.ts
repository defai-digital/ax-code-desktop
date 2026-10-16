// Recent-file candidates for the @ mention list.
//
// The list is derived from the Files tabs (selected path first, then the open tabs
// newest-first). A file deleted or renamed after it was opened kept its tab, so the list
// went on offering it and choosing it inserted a path that is gone.

import { isFileMissingError } from "@/components/views/filesViewTreeUtils"

export type RecentFileStat = { isFile: boolean }
export type RecentFileStatProbe = (path: string) => Promise<RecentFileStat | null | undefined>

export const filterStaleRecentPaths = <T extends { path: string }>(
  files: readonly T[],
  stalePaths: ReadonlySet<string>,
): T[] => {
  if (stalePaths.size === 0) {
    return [...files]
  }
  return files.filter((file) => !stalePaths.has(file.path))
}

export const collectUnverifiedPaths = (paths: readonly string[], verified: ReadonlySet<string>): string[] =>
  paths.filter((path) => path.length > 0 && !verified.has(path))

/**
 * The paths whose file is gone, out of those that are not a regular file any more or whose
 * stat failed because the file is missing. Any other failure leaves the path alone: an
 * unreadable file is not a deleted one, and hiding it would be worse than offering it.
 */
export const findStaleRecentPaths = async (
  paths: readonly string[],
  statFile: RecentFileStatProbe | undefined,
): Promise<Set<string>> => {
  const stale = new Set<string>()
  if (!statFile || paths.length === 0) {
    return stale
  }

  await Promise.all(
    paths.map(async (path) => {
      try {
        const stat = await statFile(path)
        if (stat && !stat.isFile) {
          stale.add(path)
        }
      } catch (error) {
        if (isFileMissingError(error)) {
          stale.add(path)
        }
      }
    }),
  )

  return stale
}
