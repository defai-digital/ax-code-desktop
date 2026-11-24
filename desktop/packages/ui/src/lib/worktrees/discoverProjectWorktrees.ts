import type { WorktreeMetadata } from "@/types/worktree"

export interface WorktreeDiscoveryProject {
  id: string
  /** Normalized project path, or null to skip the project. */
  path: string | null
}

export interface WorktreeDiscoveryDeps {
  isGitRepo: (projectPath: string) => Promise<boolean>
  listWorktrees: (project: { id: string; path: string }) => Promise<WorktreeMetadata[]>
  isCancelled: () => boolean
}

export interface WorktreeDiscovery {
  worktreesByProject: Map<string, WorktreeMetadata[]>
  allWorktrees: WorktreeMetadata[]
  readyProjectIds: Set<string>
  /**
   * Projects whose worktree listing succeeded, an empty one included. A failed listing, or a project that was not
   * listed because it does not look like a repository, is left out, so a worktree missing from it reads as unknown
   * rather than gone (C UX-03).
   */
  readyProjectPaths: Set<string>
}

/** List every project's worktrees; a failure in one project leaves the others intact. */
export async function discoverProjectWorktrees(
  projects: readonly WorktreeDiscoveryProject[],
  deps: WorktreeDiscoveryDeps,
): Promise<WorktreeDiscovery> {
  const discovery: WorktreeDiscovery = {
    worktreesByProject: new Map(),
    allWorktrees: [],
    readyProjectIds: new Set(),
    readyProjectPaths: new Set(),
  }
  await Promise.all(
    projects.map(async (project) => {
      const projectPath = project.path
      if (!projectPath) return
      try {
        if (!(await deps.isGitRepo(projectPath))) {
          // Ready for the archive's purposes, but no listing ran: a probe that failed also answers "not a
          // repository", so it proves nothing about a worktree a draft points at.
          discovery.readyProjectIds.add(project.id)
          return
        }
        const worktrees = await deps.listWorktrees({ id: project.id, path: projectPath })
        discovery.readyProjectIds.add(project.id)
        discovery.readyProjectPaths.add(projectPath)
        if (deps.isCancelled() || worktrees.length === 0) return
        discovery.worktreesByProject.set(projectPath, worktrees)
        discovery.allWorktrees.push(...worktrees)
      } catch {
        // A project whose listing failed stays out of the ready sets.
      }
    }),
  )
  return discovery
}
