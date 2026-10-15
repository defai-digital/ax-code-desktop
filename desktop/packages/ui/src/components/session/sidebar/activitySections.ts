import type { Session } from "@defai-digital/ax-code-sdk/v2"
import type { SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"

import { isLiveState, type SupervisionState } from "@/lib/supervision/sessionState"

const ACTIVE_NOW_STORAGE_KEY = "oc.sessions.activeNow"
const ACTIVE_NOW_MAX_AGE_MS = 36 * 60 * 60 * 1000

export type ActiveNowEntry = {
  sessionId: string
}

const isSubtaskSession = (session: Session): boolean => {
  return Boolean((session as Session & { parentID?: string | null }).parentID)
}

const isArchivedSession = (session: Session): boolean => {
  return Boolean(session.time?.archived)
}

const getSessionUpdatedAt = (session: Session): number => {
  const updated = session.time?.updated
  const created = session.time?.created
  if (typeof updated === "number" && Number.isFinite(updated)) {
    return updated
  }
  if (typeof created === "number" && Number.isFinite(created)) {
    return created
  }
  return 0
}

export const readActiveNowEntries = (storage: Storage): ActiveNowEntry[] => {
  try {
    const raw = storage.getItem(ACTIVE_NOW_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    const seen = new Set<string>()
    const next: ActiveNowEntry[] = []
    parsed.forEach((item) => {
      const sessionId =
        typeof item === "string"
          ? item
          : item && typeof item === "object" && "sessionId" in item && typeof item.sessionId === "string"
            ? item.sessionId
            : null
      if (!sessionId || seen.has(sessionId)) {
        return
      }
      seen.add(sessionId)
      next.push({ sessionId })
    })
    return next
  } catch {
    return []
  }
}

export const persistActiveNowEntries = (storage: Storage, entries: ActiveNowEntry[]): void => {
  try {
    storage.setItem(ACTIVE_NOW_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignored
  }
}

export const pruneActiveNowEntries = (
  entries: ActiveNowEntry[],
  sessionsById: Map<string, Session>,
  now = Date.now(),
): ActiveNowEntry[] => {
  const minUpdatedAt = now - ACTIVE_NOW_MAX_AGE_MS
  return entries.filter((entry) => {
    const session = sessionsById.get(entry.sessionId)
    if (!session) {
      return true
    }
    if (isArchivedSession(session)) {
      return false
    }
    return getSessionUpdatedAt(session) >= minUpdatedAt
  })
}

export const addActiveNowSession = (entries: ActiveNowEntry[], sessionId: string): ActiveNowEntry[] => {
  if (!sessionId || entries.some((entry) => entry.sessionId === sessionId)) {
    return entries
  }
  return [{ sessionId }, ...entries]
}

const sortSessionsByUpdated = (sessions: Session[]): Session[] => {
  return [...sessions].sort((a, b) => getSessionUpdatedAt(b) - getSessionUpdatedAt(a))
}

export const deriveActiveNowSessions = (entries: ActiveNowEntry[], sessionsById: Map<string, Session>): Session[] => {
  const sessions = entries
    .map((entry) => sessionsById.get(entry.sessionId) ?? null)
    .filter((session): session is Session => Boolean(session))
    .filter((session) => !isArchivedSession(session))
    .filter((session) => !isSubtaskSession(session))
  return sortSessionsByUpdated(sessions)
}

export const deriveLiveActiveNowSessions = (
  sessions: Session[],
  statuses: Record<string, SessionStatus>,
): Session[] => {
  const activeSessions = sessions.filter((session) => {
    if (isArchivedSession(session) || isSubtaskSession(session)) {
      return false
    }

    const status = statuses[session.id]
    return status?.type === "busy" || status?.type === "retry"
  })

  return sortSessionsByUpdated(activeSessions)
}

/** How many Live rows the sidebar shows before "Show N more". */
export const LIVE_SECTION_VISIBLE_LIMIT = 12

export interface LiveSidebarRow {
  sessionId: string
  state: SupervisionState
  projectId: string | null
  projectLabel: string | null
  directory: string | null
}

export interface LiveSidebarResolution<TSession, TNode> {
  session: TSession
  node?: TNode | null
  projectId?: string | null
  projectLabel?: string | null
  groupDirectory?: string | null
  branchLabel?: string | null
}

export interface PlannedLiveSidebarItem<TSession, TNode> {
  session: TSession
  node: TNode | null
  projectId: string | null
  groupDirectory: string | null
  secondaryMeta: {
    projectLabel: string | null
    branchLabel: string | null
  }
}

/** Live supervision rows, in the order given. Idle history stays out of the section. */
export function selectLiveSidebarRows<T extends { state: SupervisionState }>(rows: readonly T[]): T[] {
  return rows.filter((row) => isLiveState(row.state))
}

/**
 * One sidebar entry per live root that we can actually render.
 * The project label comes from the supervision row so a session in another project still names it.
 */
export function planLiveSidebarItems<TSession, TNode>(
  rows: readonly LiveSidebarRow[],
  resolve: (row: LiveSidebarRow) => LiveSidebarResolution<TSession, TNode> | null,
): Array<PlannedLiveSidebarItem<TSession, TNode>> {
  const items: Array<PlannedLiveSidebarItem<TSession, TNode>> = []
  for (const row of selectLiveSidebarRows(rows)) {
    const resolved = resolve(row)
    if (!resolved) continue
    items.push({
      session: resolved.session,
      node: resolved.node ?? null,
      projectId: row.projectId ?? resolved.projectId ?? null,
      groupDirectory: resolved.groupDirectory ?? row.directory,
      secondaryMeta: {
        projectLabel: row.projectLabel ?? resolved.projectLabel ?? null,
        branchLabel: resolved.branchLabel ?? null,
      },
    })
  }
  return items
}

export type SidebarActivityMode = "live" | "active-now" | "none"

/**
 * The Live section replaces Active now. Active now remains only as a fallback when live rows exist
 * but none of them can be rendered as sidebar sessions. An empty live set hides the section.
 */
export function chooseSidebarActivityMode(input: {
  showRecent: boolean
  renderedLiveCount: number
  liveRowCount: number
  activeNowCount: number
}): SidebarActivityMode {
  if (!input.showRecent) return "none"
  if (input.renderedLiveCount > 0) return "live"
  if (input.liveRowCount > 0 && input.activeNowCount > 0) return "active-now"
  return "none"
}
