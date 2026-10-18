import { getProjectPathIdentityKey, projectPathMatchesRoot } from "@/lib/projectResolution"

/**
 * Derives an honest per-project activity summary from live session data.
 *
 * A project is "running" when any live session inside its folder is busy,
 * "attention" when one of those sessions needs a human (a pending approval
 * or an id in needsAttentionSessionIds, built from the needs-you reasons),
 * and "idle" otherwise. Nothing here is guessed: every number comes from
 * the sessions the runtime actually reports.
 */
export type ProjectActivityTone = "running" | "attention" | "idle"

export interface ProjectActivity {
  tone: ProjectActivityTone
  activeSessions: number
  busySessions: number
  pendingApprovals: number
  attentionSessions: number
}

export interface ProjectActivitySession {
  id: string
  directory: string | null
  /** The project root a managed worktree belongs to, when the session runs in one. */
  projectDirectory?: string | null
  archived?: boolean
}

export interface ProjectActivityInput {
  projects: ReadonlyArray<{ id: string; path: string }>
  sessions: ReadonlyArray<ProjectActivitySession>
  statuses: Readonly<Record<string, { type?: string } | undefined>>
  pendingPermissionSessionIds: ReadonlySet<string>
  needsAttentionSessionIds?: ReadonlySet<string>
}

const IDLE_ACTIVITY: ProjectActivity = {
  tone: "idle",
  activeSessions: 0,
  busySessions: 0,
  pendingApprovals: 0,
  attentionSessions: 0,
}

type ProjectPathKey = { id: string; key: string }

function projectPathKeys(projects: ReadonlyArray<{ id: string; path: string }>): ProjectPathKey[] {
  return projects
    .map((project) => ({ id: project.id, key: getProjectPathIdentityKey(project.path) }))
    .filter((entry): entry is ProjectPathKey => Boolean(entry.key))
    // Longest path first so nested projects claim their own sessions.
    .sort((a, b) => b.key.length - a.key.length)
}

function matchSessionProject(
  session: Pick<ProjectActivitySession, "directory" | "projectDirectory" | "archived">,
  projectKeys: readonly ProjectPathKey[],
): string | null {
  if (session.archived) return null
  // A managed worktree may live outside the project folder; its recorded root wins.
  const ownerRoot = getProjectPathIdentityKey(session.projectDirectory ?? null)
  const directory = getProjectPathIdentityKey(session.directory ?? null)
  const owner =
    (ownerRoot && projectKeys.find((project) => project.key === ownerRoot)) ||
    (directory && projectKeys.find((project) => projectPathMatchesRoot(directory, project.key))) ||
    null
  return owner?.id ?? null
}

/** Same project match deriveProjectActivity uses, including archived sessions as unmatched. */
export function resolveSessionProjectId(
  session: Pick<ProjectActivitySession, "directory" | "projectDirectory" | "archived">,
  projects: ReadonlyArray<{ id: string; path: string }>,
): string | null {
  return matchSessionProject(session, projectPathKeys(projects))
}

export function deriveProjectActivity(input: ProjectActivityInput): Map<string, ProjectActivity> {
  const result = new Map<string, ProjectActivity>()
  const projectKeys = projectPathKeys(input.projects)

  for (const project of input.projects) result.set(project.id, { ...IDLE_ACTIVITY })

  for (const session of input.sessions) {
    const ownerId = matchSessionProject(session, projectKeys)
    if (!ownerId) continue
    const current = result.get(ownerId) ?? { ...IDLE_ACTIVITY }
    const busy = (input.statuses[session.id]?.type ?? "idle") !== "idle"
    const waiting = input.pendingPermissionSessionIds.has(session.id)
    const needsAttention = waiting || (input.needsAttentionSessionIds?.has(session.id) ?? false)
    result.set(ownerId, {
      tone: current.tone,
      activeSessions: current.activeSessions + 1,
      busySessions: current.busySessions + (busy ? 1 : 0),
      pendingApprovals: current.pendingApprovals + (waiting ? 1 : 0),
      attentionSessions: current.attentionSessions + (needsAttention ? 1 : 0),
    })
  }

  for (const [id, activity] of result) {
    const tone: ProjectActivityTone =
      activity.attentionSessions > 0 ? "attention" : activity.busySessions > 0 ? "running" : "idle"
    result.set(id, { ...activity, tone })
  }
  return result
}
