import { isFilesViewPathWithinRoot, normalizeFilesViewPath, getFilesViewPathIdentityKey } from "./filesViewPath"
import { isPlainRecord } from "./record"

export interface FilesViewRootTabsState {
  openPaths: string[]
  selectedPath: string | null
  expandedPaths: string[]
  touchedAt: number
}

export const FILES_VIEW_MAX_ROOTS = 20

export const mergeFilesViewPaths = (existing: readonly string[], incoming: readonly string[]): string[] => {
  const result = [...existing]
  const seen = new Set(existing.map(getFilesViewPathIdentityKey))
  for (const path of incoming) {
    const key = getFilesViewPathIdentityKey(path)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(path)
  }
  return result
}

const sanitizePaths = (value: unknown, root: string): string[] => {
  if (!Array.isArray(value)) return []
  const paths = value
    .filter((path): path is string => typeof path === "string")
    .map(normalizeFilesViewPath)
    .filter((path) => isFilesViewPathWithinRoot(path, root))
  return mergeFilesViewPaths([], paths)
}

export const clampFilesViewRoots = (
  byRoot: Record<string, FilesViewRootTabsState>,
  activeRoot?: string,
): Record<string, FilesViewRootTabsState> => {
  const entries = Object.entries(byRoot)
  if (entries.length <= FILES_VIEW_MAX_ROOTS) return byRoot
  entries.sort((a, b) => {
    if (a[0] === activeRoot) return -1
    if (b[0] === activeRoot) return 1
    return b[1].touchedAt - a[1].touchedAt
  })
  return Object.fromEntries(entries.slice(0, FILES_VIEW_MAX_ROOTS))
}

export const sanitizeFilesViewRoots = (value: unknown): Record<string, FilesViewRootTabsState> => {
  if (!isPlainRecord(value)) return {}
  const roots = new Map<string, FilesViewRootTabsState>()
  for (const [rawRoot, rawState] of Object.entries(value)) {
    const root = normalizeFilesViewPath(rawRoot)
    if (!root || !isPlainRecord(rawState)) continue
    let openPaths = sanitizePaths(rawState.openPaths, root)
    const expandedPaths = sanitizePaths(rawState.expandedPaths, root)
    const candidate = typeof rawState.selectedPath === "string" ? normalizeFilesViewPath(rawState.selectedPath) : null
    const selectedPath = candidate && isFilesViewPathWithinRoot(candidate, root) ? candidate : (openPaths[0] ?? null)
    // Legacy snapshots may have a selection without a tab. Keep that file usable by
    // restoring it into the open list, matching the invariant of live selection.
    if (selectedPath) openPaths = mergeFilesViewPaths(openPaths, [selectedPath])
    const touchedAt =
      typeof rawState.touchedAt === "number" && Number.isFinite(rawState.touchedAt) ? rawState.touchedAt : Date.now()
    const existing = roots.get(root)
    roots.set(
      root,
      existing
        ? {
            openPaths: mergeFilesViewPaths(existing.openPaths, openPaths),
            expandedPaths: mergeFilesViewPaths(existing.expandedPaths, expandedPaths),
            selectedPath: existing.selectedPath ?? selectedPath,
            touchedAt: Math.max(existing.touchedAt, touchedAt),
          }
        : { openPaths, expandedPaths, selectedPath, touchedAt },
    )
  }
  return clampFilesViewRoots(Object.fromEntries(roots))
}
