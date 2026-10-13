import { getProjectPathIdentityKey, projectPathMatchesRoot } from "@/lib/projectResolution"

/**
 * Derives an honest per-project activity summary from live session data.
 *
 * A project is "running" when any live session inside its folder is busy,
 * "attention" when one of those sessions is waiting for an approval, and
 * "idle" otherwise. Nothing here is guessed: every number comes from the
 * sessions the runtime actually reports.
 */
export type ProjectActivityTone = "running" | "attention" | "idle"

export interface ProjectActivity {
  tone: ProjectActivityTone
  activeSessions: number
  busySessions: number
  pendingApprovals: number
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
}

const IDLE_ACTIVITY: ProjectActivity = { tone: "idle", activeSessions: 0, busySessions: 0, pendingApprovals: 0 }

export function deriveProjectActivity(input: ProjectActivityInput): Map<string, ProjectActivity> {
  const result = new Map<string, ProjectActivity>()
  const projectKeys = input.projects
    .map((project) => ({ id: project.id, key: getProjectPathIdentityKey(project.path) }))
    .filter((entry): entry is { id: string; key: string } => Boolean(entry.key))
    // Longest path first so nested projects claim their own sessions.
    .sort((a, b) => b.key.length - a.key.length)

  for (const project of input.projects) result.set(project.id, { ...IDLE_ACTIVITY })

  for (const session of input.sessions) {
    if (session.archived) continue
    // A managed worktree may live outside the project folder; its recorded root wins.
    const ownerRoot = getProjectPathIdentityKey(session.projectDirectory ?? null)
    const directory = getProjectPathIdentityKey(session.directory ?? null)
    const owner =
      (ownerRoot && projectKeys.find((project) => project.key === ownerRoot)) ||
      (directory && projectKeys.find((project) => projectPathMatchesRoot(directory, project.key))) ||
      null
    if (!owner) continue
    const current = result.get(owner.id) ?? { ...IDLE_ACTIVITY }
    const busy = (input.statuses[session.id]?.type ?? "idle") !== "idle"
    const waiting = input.pendingPermissionSessionIds.has(session.id)
    result.set(owner.id, {
      tone: current.tone,
      activeSessions: current.activeSessions + 1,
      busySessions: current.busySessions + (busy ? 1 : 0),
      pendingApprovals: current.pendingApprovals + (waiting ? 1 : 0),
    })
  }

  for (const [id, activity] of result) {
    const tone: ProjectActivityTone =
      activity.pendingApprovals > 0 ? "attention" : activity.busySessions > 0 ? "running" : "idle"
    result.set(id, { ...activity, tone })
  }
  return result
}
