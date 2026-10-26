import type { ProjectEntry } from "@/lib/api/types"
import type { WorktreeMetadata } from "@/types/worktree"

export const normalizeProjectPath = (value?: string | null): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const replaced = trimmed.replace(/\\/g, "/").replace(/^([a-z]):/, (_, letter: string) => letter.toUpperCase() + ":")
  if (replaced === "/") return "/"
  const driveRoot = replaced.match(/^([A-Z]:)\/+$/)
  if (driveRoot) return `${driveRoot[1]}/`
  if (/^[A-Z]:$/.test(replaced)) return `${replaced}/`
  return replaced.length > 1 ? replaced.replace(/\/+$/, "") : replaced
}

const toComparableProjectPath = (path: string): string =>
  path.startsWith("//") || /^[A-Z]:\//.test(path) ? path.toLowerCase() : path

export const getProjectPathIdentityKey = (value?: string | null): string | null => {
  const normalized = normalizeProjectPath(value)
  return normalized ? toComparableProjectPath(normalized) : null
}

export const projectPathMatchesRoot = (directory: string, root: string): boolean => {
  const comparableDirectory = toComparableProjectPath(directory)
  const comparableRoot = toComparableProjectPath(root)
  if (comparableRoot.endsWith("/")) {
    return comparableDirectory === comparableRoot || comparableDirectory.startsWith(comparableRoot)
  }
  return comparableDirectory === comparableRoot || comparableDirectory.startsWith(`${comparableRoot}/`)
}

/**
 * Collapse "." and ".." segments the way a filesystem resolves them.
 */
const collapsePathSegments = (path: string): string => {
  const normalized = normalizeProjectPath(path)
  if (!normalized) return ""
  // Keep the filesystem root outside the collapsible segments. In particular,
  // UNC identity must not become a POSIX path or lose its server/share to "..".
  const uncRoot = normalized.match(/^(\/\/[^/]+\/[^/]+)(?:\/|$)/)?.[1]
  const root = uncRoot ? `${uncRoot}/` : (normalized.match(/^[A-Z]:\/|^\//)?.[0] ?? "")
  const segments: string[] = []
  for (const segment of normalized.slice(uncRoot?.length ?? root.length).split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") segments.pop()
      else if (!root) segments.push(segment)
      continue
    }
    segments.push(segment)
  }
  return root + segments.join("/")
}

/**
 * Whether a path really sits inside a root directory.
 *
 * `projectPathMatchesRoot` compares the written strings, so `<root>/../../../../etc/passwd` passes it
 * while the filesystem resolves it somewhere else entirely. Callers that act on a path named by stored
 * configuration — reading or deleting what a project config points at — need this instead.
 */
export const projectPathIsInsideRoot = (path: string, root: string): boolean => {
  const collapsedPath = collapsePathSegments(path)
  const collapsedRoot = collapsePathSegments(root)
  if (!collapsedPath || !collapsedRoot) return false
  return projectPathMatchesRoot(collapsedPath, collapsedRoot)
}

const findProjectByPath = (projects: ProjectEntry[], path: string): ProjectEntry | null =>
  projects.find((project) => {
    const projectPath = normalizeProjectPath(project.path)
    return projectPath ? toComparableProjectPath(projectPath) === toComparableProjectPath(path) : false
  }) ?? null

export const resolveProjectForDirectory = (projects: ProjectEntry[], directory: string | null): ProjectEntry | null => {
  const nd = normalizeProjectPath(directory)
  if (!nd) return null
  let best: ProjectEntry | null = null
  for (const p of projects) {
    const pp = normalizeProjectPath(p.path)
    if (!pp) continue
    if (!projectPathMatchesRoot(nd, pp)) continue
    if (!best || pp.length > (normalizeProjectPath(best.path)?.length ?? 0)) best = p
  }
  return best
}

const resolveProjectFromWorktreeDirectory = (
  projects: ProjectEntry[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  directory: string | null,
): ProjectEntry | null => {
  const nd = normalizeProjectPath(directory)
  if (!nd) return null
  let matchedWorktree: WorktreeMetadata | null = null
  let matchedProjectPath: string | null = null
  let bestLen = -1
  for (const [projectPath, worktrees] of availableWorktreesByProject.entries()) {
    for (const wt of worktrees) {
      const wp = normalizeProjectPath(wt.path)
      if (!wp) continue
      if (!projectPathMatchesRoot(nd, wp)) continue
      if (wp.length > bestLen) {
        bestLen = wp.length
        matchedWorktree = wt
        matchedProjectPath = normalizeProjectPath(projectPath)
      }
    }
  }
  if (!matchedWorktree) return null
  // A registered folder inside the worktree is more specific than its owner.
  const direct = resolveProjectForDirectory(projects, nd)
  if (direct && (normalizeProjectPath(direct.path)?.length ?? 0) >= bestLen) return direct
  const candidates = [normalizeProjectPath(matchedWorktree.projectDirectory), matchedProjectPath].filter(
    (v): v is string => Boolean(v),
  )
  for (const c of candidates) {
    const exact = findProjectByPath(projects, c)
    if (exact) return exact
  }
  for (const c of candidates) {
    const nested = resolveProjectForDirectory(projects, c)
    if (nested) return nested
  }
  return null
}

export const resolveProjectForSessionDirectory = (
  projects: ProjectEntry[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  directory: string | null,
): ProjectEntry | null =>
  resolveProjectFromWorktreeDirectory(projects, availableWorktreesByProject, directory) ??
  resolveProjectForDirectory(projects, directory)
