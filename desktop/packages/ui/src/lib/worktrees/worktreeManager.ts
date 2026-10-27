import { substituteCommandVariables } from "@/lib/openchamberConfig"
import type { ProjectRef } from "@/lib/openchamberConfig"
import type { WorktreeMetadata } from "@/types/worktree"
import { deleteRemoteBranch, git } from "@/lib/gitApi"
import { clearWorktreeBootstrapState, markWorktreeBootstrapPending } from "@/lib/worktrees/worktreeBootstrap"
import { normalizeWorktreePath } from "@/lib/worktrees/path"
import { invalidateResolvedProjectRootCache, resolveProjectRoot } from "@/lib/worktrees/worktreeStatus"
import type { CreateGitWorktreePayload, GitWorktreeValidationResult } from "@/lib/api/types"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useGitStore } from "@/stores/useGitStore"
import { useTerminalStore } from "@/stores/useTerminalStore"

/** What a removal actually did, so callers report it instead of assuming. */
export type WorktreeRemovalResult = {
  /** True only when the remote branch was asked for and the delete succeeded. */
  remoteBranchRemoved: boolean
}

type WorktreeListEntry = {
  path?: string
  branch?: string
  head?: string
  name?: string
}

const deriveHeadStateFromWorktreeEntry = (entry: WorktreeListEntry): "branch" | "detached" | "unborn" => {
  const branch = (entry.branch || "").trim()
  const head = (entry.head || "").trim()
  if (!branch) {
    if (!head) return "unborn"
    return "detached"
  }
  return "branch"
}

const deriveCanonicalWorktreeFields = (
  entry: WorktreeListEntry,
  worktreePath: string,
): Pick<WorktreeMetadata, "worktreeRoot" | "worktreeStatus" | "headState" | "worktreeSource"> => {
  return {
    worktreeRoot: worktreePath,
    worktreeStatus: "ready",
    headState: deriveHeadStateFromWorktreeEntry(entry),
    worktreeSource: "existing",
  }
}

export type { ProjectRef }

const slugifyWorktreeName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^heads\//, "")
    .replace(/\s+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

const normalizeBranchName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^heads\//, "")
    .replace(/\s+/g, "-")
    .replace(/^\/+|\/+$/g, "")
}

const deriveSdkWorktreeNameFromDirectory = (directory: string): string => {
  const normalized = normalizeWorktreePath(directory)
  const parts = normalized.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

const buildSdkStartCommand = (args: {
  projectDirectory: string
  setupCommands: string[]
}): string | undefined => {
  const commands: string[] = []

  for (const raw of args.setupCommands) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    commands.push(substituteCommandVariables(trimmed, { rootWorktreePath: args.projectDirectory }))
  }

  const joined = commands.filter(Boolean).join(" && ")
  return joined.trim().length > 0 ? joined : undefined
}

const toCreatePayload = (
  args: {
    preferredName?: string
    setupCommands?: string[]
    mode?: "new" | "existing"
    worktreeName?: string
    branchName?: string
    existingBranch?: string
    startRef?: string
    setUpstream?: boolean
    upstreamRemote?: string
    upstreamBranch?: string
    ensureRemoteName?: string
    ensureRemoteUrl?: string
  },
  projectDirectory: string,
): CreateGitWorktreePayload => {
  const mode = args.mode === "existing" ? "existing" : "new"

  const worktreeNameSeed = args.worktreeName ?? args.preferredName ?? ""
  const worktreeName = slugifyWorktreeName(worktreeNameSeed)

  const branchNameSeed = args.branchName ?? (mode === "new" ? args.preferredName : undefined) ?? ""
  const branchName = normalizeBranchName(branchNameSeed)

  const existingBranch = normalizeBranchName(args.existingBranch ?? args.branchName ?? "")
  const startRef = (args.startRef || "").trim()

  const commands = Array.isArray(args.setupCommands) ? args.setupCommands : []
  const startCommand = buildSdkStartCommand({
    projectDirectory,
    setupCommands: commands,
  })

  return {
    mode,
    ...(worktreeName ? { worktreeName } : {}),
    ...(branchName ? { branchName } : {}),
    ...(existingBranch ? { existingBranch } : {}),
    ...(startRef ? { startRef } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(args.setUpstream ? { setUpstream: true } : {}),
    ...(args.upstreamRemote ? { upstreamRemote: args.upstreamRemote } : {}),
    ...(args.upstreamBranch ? { upstreamBranch: args.upstreamBranch } : {}),
    ...(args.ensureRemoteName ? { ensureRemoteName: args.ensureRemoteName } : {}),
    ...(args.ensureRemoteUrl ? { ensureRemoteUrl: args.ensureRemoteUrl } : {}),
  }
}

// Cache worktree listings to avoid repeated git worktree list + rev-parse calls
const _worktreeListCache = new Map<string, { value: WorktreeMetadata[]; at: number }>()
const _worktreeListInflight = new Map<string, Promise<WorktreeMetadata[]>>()
const WORKTREE_LIST_CACHE_TTL = 30_000 // 30 seconds

// Bumped when a create or removal makes a listing in flight obsolete. Without it the answer that
// was already on its way was written into the cache anyway, so the new worktree stayed missing from
// the list — a removal brought the removed one back — for the whole TTL.
const _worktreeListEpoch = new Map<string, number>()

const invalidateWorktreeList = (projectDirectory: string): void => {
  _worktreeListCache.delete(projectDirectory)
  _worktreeListEpoch.set(projectDirectory, (_worktreeListEpoch.get(projectDirectory) ?? 0) + 1)
  // A caller arriving now must not be handed the obsolete answer the dedup map still holds.
  _worktreeListInflight.delete(projectDirectory)
}

// The TTL is only checked on read; purge on write so the cache holds the projects
// listed inside the TTL instead of every project ever listed.
export const pruneExpiredWorktreeListEntries = (
  cache: Map<string, { value: WorktreeMetadata[]; at: number }>,
  now: number,
): void => {
  for (const [key, entry] of cache) {
    if (now - entry.at >= WORKTREE_LIST_CACHE_TTL) {
      cache.delete(key)
    }
  }
}

export async function listProjectWorktrees(project: ProjectRef): Promise<WorktreeMetadata[]> {
  const projectDirectory = normalizeWorktreePath(project.path)

  // Return cached if fresh
  const cached = _worktreeListCache.get(projectDirectory)
  if (cached && Date.now() - cached.at < WORKTREE_LIST_CACHE_TTL) {
    return cached.value
  }

  // Dedup in-flight requests
  const inflight = _worktreeListInflight.get(projectDirectory)
  if (inflight) return inflight

  const epoch = _worktreeListEpoch.get(projectDirectory) ?? 0

  const promise = (async (): Promise<WorktreeMetadata[]> => {
    const metadataProjectDirectory = await resolveProjectRoot(projectDirectory).catch(() => projectDirectory)
    const normalizedProjectDirectory = normalizeWorktreePath(projectDirectory)

    // A failed listing must surface as an error, not be cached as "no
    // worktrees": callers cannot tell the two apart and would stop retrying
    // for the whole TTL.
    const worktrees = await git.worktree.list(projectDirectory)
    const results: WorktreeMetadata[] = worktrees
      .filter((entry) => typeof entry.path === "string" && entry.path.trim().length > 0)
      .map((entry) => {
        const worktreePath = normalizeWorktreePath(entry.path)
        const branch = (entry.branch || "").replace(/^refs\/heads\//, "").trim()
        const name = (entry.name || "").trim()

        // Derive canonical worktree metadata from worktree list entry
        const canonical = deriveCanonicalWorktreeFields(entry, worktreePath)

        return {
          source: "sdk" as const,
          name: name || deriveSdkWorktreeNameFromDirectory(worktreePath),
          path: worktreePath,
          projectDirectory: metadataProjectDirectory,
          branch: branch,
          label: branch || name || deriveSdkWorktreeNameFromDirectory(worktreePath),
          worktreeRoot: canonical.worktreeRoot,
          worktreeStatus: canonical.worktreeStatus,
          headState: canonical.headState,
          worktreeSource: canonical.worktreeSource,
        }
      })
      .filter((entry) => {
        // The primary worktree is the repository root, not "another worktree" of the
        // project. A project that lives in a subdirectory of its repository has a
        // project path different from that root, so both have to be dropped —
        // otherwise the project adopts the enclosing repository as one of its
        // worktrees and claims sessions that belong to the outer project.
        const entryPath = normalizeWorktreePath(entry.path)
        return entryPath !== normalizedProjectDirectory && entryPath !== normalizeWorktreePath(metadataProjectDirectory)
      })

    const sorted = results.sort((a, b) => {
      const aLabel = (a.label || a.branch || a.path).toLowerCase()
      const bLabel = (b.label || b.branch || b.path).toLowerCase()
      return aLabel.localeCompare(bLabel)
    })

    // Only cache what is still current: a create or removal that happened while this request was in
    // flight bumped the epoch, and its answer describes a topology that no longer exists.
    if ((_worktreeListEpoch.get(projectDirectory) ?? 0) === epoch) {
      const now = Date.now()
      pruneExpiredWorktreeListEntries(_worktreeListCache, now)
      _worktreeListCache.set(projectDirectory, { value: sorted, at: now })
    }
    return sorted
  })().finally(() => {
    if (_worktreeListInflight.get(projectDirectory) === promise) {
      _worktreeListInflight.delete(projectDirectory)
    }
  })

  _worktreeListInflight.set(projectDirectory, promise)
  return promise
}

export type CreateWorktreeArgs = {
  preferredName?: string
  setupCommands?: string[]
  mode?: "new" | "existing"
  worktreeName?: string
  branchName?: string
  existingBranch?: string
  startRef?: string
  setUpstream?: boolean
  upstreamRemote?: string
  upstreamBranch?: string
  ensureRemoteName?: string
  ensureRemoteUrl?: string
}

export async function createWorktree(project: ProjectRef, args: CreateWorktreeArgs): Promise<WorktreeMetadata> {
  const projectDirectory = normalizeWorktreePath(project.path)
  const metadataProjectDirectory = await resolveProjectRoot(projectDirectory).catch(() => projectDirectory)
  const payload = toCreatePayload(args, projectDirectory)

  const created = await git.worktree.create(projectDirectory, payload)
  const returnedName = typeof created?.name === "string" ? created.name : ""
  const returnedBranch = typeof created?.branch === "string" ? created.branch : ""
  const returnedPath = typeof created?.path === "string" ? created.path : ""

  if (!returnedName || !returnedPath) {
    throw new Error("Worktree create missing name/path")
  }

  const metadata: WorktreeMetadata = {
    source: "sdk",
    name: returnedName,
    path: normalizeWorktreePath(returnedPath),
    projectDirectory: metadataProjectDirectory,
    branch: returnedBranch,
    label: returnedBranch || returnedName,
    worktreeRoot: normalizeWorktreePath(returnedPath),
    worktreeStatus: "ready",
    headState: returnedBranch ? "branch" : "unborn",
    worktreeSource: "created-for-session",
  }

  markWorktreeBootstrapPending(metadata.path)

  invalidateWorktreeList(projectDirectory)
  // The new worktree changes the repo's worktree topology; drop cached root
  // resolutions so root-branch lookups re-resolve against the new layout.
  invalidateResolvedProjectRootCache()

  // Update sidebar store so new worktree appears immediately
  const sidebarProjectKey = projectDirectory
  const currentByProject = useSessionUIStore.getState().availableWorktreesByProject
  const updatedByProject = new Map(currentByProject)
  const existing = updatedByProject.get(sidebarProjectKey) ?? []
  updatedByProject.set(sidebarProjectKey, [...existing, metadata])
  useSessionUIStore.setState({
    availableWorktreesByProject: updatedByProject,
    availableWorktrees: [...useSessionUIStore.getState().availableWorktrees, metadata],
  })

  return metadata
}

export async function validateWorktreeCreate(
  project: ProjectRef,
  args: CreateWorktreeArgs,
): Promise<GitWorktreeValidationResult> {
  const projectDirectory = project.path
  const payload = toCreatePayload(args, projectDirectory)
  return git.worktree.validate(projectDirectory, payload)
}

export async function removeProjectWorktree(
  project: ProjectRef,
  worktree: WorktreeMetadata,
  options?: {
    deleteRemoteBranch?: boolean
    deleteLocalBranch?: boolean
    remoteName?: string
  },
): Promise<WorktreeRemovalResult> {
  const projectDirectory = normalizeWorktreePath(project.path)

  const deleteRemote = Boolean(options?.deleteRemoteBranch)
  const deleteLocalBranch = options?.deleteLocalBranch === true
  const remoteName = options?.remoteName
  const raw = await git.worktree.remove(projectDirectory, {
    directory: worktree.path,
    deleteLocalBranch,
  })
  if (!raw?.success) {
    throw new Error("Worktree removal failed")
  }

  clearWorktreeBootstrapState(worktree.path)

  // The removed directory may still own terminal tabs and project-action runs;
  // dropping them closes their PTYs instead of leaving orphaned processes
  // pointing at a directory that no longer exists.
  useTerminalStore.getState().removeDirectory(worktree.path)
  // Its Git state and repository summary describe a directory that no longer exists.
  const removedWorktreePath = normalizeWorktreePath(worktree.path)
  useGitStore.getState().removeDirectoriesMatching((directory) => normalizeWorktreePath(directory) === removedWorktreePath)

  invalidateWorktreeList(normalizeWorktreePath(project.path))
  // Removing a worktree changes the repo's worktree topology; drop cached root
  // resolutions so root-branch lookups re-resolve against the new layout.
  invalidateResolvedProjectRootCache()

  // Update sidebar store so removed worktree disappears immediately
  const normalizedWorktreePath = normalizeWorktreePath(worktree.path)
  const sidebarProjectKey = projectDirectory
  const currentByProject = useSessionUIStore.getState().availableWorktreesByProject
  const updatedByProject = new Map(currentByProject)
  const projectWorktrees = updatedByProject.get(sidebarProjectKey) ?? []
  updatedByProject.set(
    sidebarProjectKey,
    projectWorktrees.filter((w) => normalizeWorktreePath(w.path) !== normalizedWorktreePath),
  )

  // Sessions attached to the removed worktree. Detach them through the store
  // action: readers resolve a session's directory from the authoritative
  // session-worktree attachment first, so deleting only the metadata map would
  // leave those sessions pointing at the directory that no longer exists.
  const detachedSessionIds = [...useSessionUIStore.getState().worktreeMetadata.entries()]
    .filter(([, meta]) => meta && normalizeWorktreePath(meta.path) === normalizedWorktreePath)
    .map(([sid]) => sid)

  useSessionUIStore.setState({
    availableWorktreesByProject: updatedByProject,
    availableWorktrees: useSessionUIStore
      .getState()
      .availableWorktrees.filter((w) => normalizeWorktreePath(w.path) !== normalizedWorktreePath),
  })

  for (const sid of detachedSessionIds) {
    useSessionUIStore.getState().setWorktreeMetadata(sid, null)
  }

  const branchName = (worktree.branch || "").replace(/^refs\/heads\//, "").trim()
  if (!deleteRemote || !branchName) {
    return { remoteBranchRemoved: false }
  }

  // Reported, not assumed: telling the user the remote branch is gone when the push
  // failed (no such remote ref, no network, wrong remote) claims something that did
  // not happen.
  const removed = await deleteRemoteBranch(projectDirectory, { branch: branchName, remote: remoteName }).then(
    () => true,
    () => false,
  )
  return { remoteBranchRemoved: removed }
}
