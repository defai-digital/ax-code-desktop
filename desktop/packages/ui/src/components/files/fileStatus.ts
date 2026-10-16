import type { GitStatus } from "@/lib/api/types"
import { normalizeProjectPath, projectPathMatchesRoot } from "@/lib/projectResolution"
import type { FileStatus } from "./types"

const getRelativePathForRoot = (path: string, root: string): string => {
  const normalizedRoot = normalizeProjectPath(root)
  const normalizedPath = normalizeProjectPath(path)
  if (!normalizedRoot || !normalizedPath || !projectPathMatchesRoot(normalizedPath, normalizedRoot)) {
    return path
  }
  if (normalizedPath === normalizedRoot) {
    return ""
  }
  const relative = normalizedPath.slice(normalizedRoot.length)
  return relative.startsWith("/") ? relative.slice(1) : relative
}

export const getFileStatusForPath = (
  path: string,
  options: {
    root: string
    isOpen: (path: string) => boolean
    gitStatus: GitStatus | null | undefined
  },
): FileStatus | null => {
  if (options.isOpen(path)) return "open"

  const files = options.gitStatus?.files
  if (!files) return null

  const relative = getRelativePathForRoot(path, options.root)
  const file = files.find((entry) => entry.path === relative)
  if (!file) return null

  if (file.index === "A" || file.working_dir === "?") return "git-added"
  if (file.index === "D") return "git-deleted"
  if (file.index === "M" || file.working_dir === "M") return "git-modified"
  return null
}

export const getFolderBadgeForPath = (
  path: string,
  options: {
    root: string
    gitStatus: GitStatus | null | undefined
  },
): { modified: number; added: number } | null => {
  const files = options.gitStatus?.files
  if (!files) return null

  const relative = getRelativePathForRoot(path, options.root)
  const prefix = relative ? `${relative}/` : ""

  let modified = 0
  let added = 0
  for (const file of files) {
    if (!file.path.startsWith(prefix)) {
      continue
    }
    // Each file lands in at most one bucket, in the order `getFileStatusForPath` classifies it: a file staged as
    // added and edited again (`A` + `M`) is "added" there, and counting it in both made a folder with one changed
    // file report `modified: 1, added: 1`.
    if (file.index === "A" || file.working_dir === "?") {
      added++
      continue
    }
    if (file.index === "D") {
      // A staged deletion has its own status and no badge bucket.
      continue
    }
    if (file.index === "M" || file.working_dir === "M") modified++
  }

  return modified + added > 0 ? { modified, added } : null
}
