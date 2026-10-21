/**
 * Builds the snapshot the Electron tray renders (the `desktop_tray_update`
 * payload). Kept as a pure function so the shape the main process's tray
 * controller expects can be pinned by tests without a window.
 */

import { truncateToCodeUnits } from "@/lib/textTruncate"

export type TraySessionStatus = "idle" | "busy" | "retry"

export type TraySession = {
  id: string
  title: string
  status: TraySessionStatus
  branch: string
  unseen: number
  hasError: boolean
  directory: string
  /** Secondary menu row line: "project · branch". */
  subtitle: string
}

export type TrayApproval = {
  kind: "permission" | "question"
  id: string
  sessionId: string
  sessionTitle: string
  label: string
  directory: string
  /** Whether "always" would remember anything; the tray hides the item if not. */
  canSave: boolean
}

export type TrayUsageRow = { label: string; value: string }
export type TrayUsageGroup = { provider: string; rows: TrayUsageRow[]; status: string | null }
export type TrayUsage = { mode: "usage" | "remaining"; groups: TrayUsageGroup[] }

export type TraySnapshot = {
  sessions: TraySession[]
  approvals: TrayApproval[]
  instanceName: string
  usage: TrayUsage
  /**
   * Decisions waiting for the person (permissions and questions, child sessions included, before the menu limit). The OS
   * badge means "this many things need you"; unread activity has its own count on the titlebar Activity button.
   * 0 clears the dock badge.
   */
  dockBadgeCount: number
}

export type TraySessionInput = {
  id: string
  title?: string | null
  parentID?: string | null
  directory?: string | null
  updatedAt?: number
  archived?: number | null
}

const UNCLASSIFIED_RISK_RANK = 2

export type TrayApprovalInput = {
  kind: "permission" | "question"
  id: string
  sessionId: string
  title?: string | null
  resource?: string | null
  directory?: string | null
  canSave?: boolean
  /**
   * Lower is more consequential (`requestRiskRank`: must-decide 0, risky 1, unclassified 2, safe 3).
   * Approvals are listed by it before the menu limit applies; missing ranks as unclassified.
   */
  riskRank?: number
}

export type BuildTraySnapshotInput = {
  sessions: TraySessionInput[]
  /** Per-session runtime status ("busy" | "retry" | "idle"). */
  statusBySession: Record<string, string | undefined>
  /** Unseen activity counts and error flags from the notification index. */
  unseenCountBySession: Record<string, number | undefined>
  errorBySession: Record<string, boolean | undefined>
  approvals: TrayApprovalInput[]
  /** Branch per normalized directory, when known. */
  branchByDirectory?: Map<string, string>
  usage?: TrayUsage
  instanceName?: string
  maxSessions?: number
  maxApprovals?: number
}

const DEFAULT_MAX_SESSIONS = 8
const DEFAULT_MAX_APPROVALS = 10

const basenameOf = (value: string): string => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "")
  const index = normalized.lastIndexOf("/")
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

const toStatus = (value: string | undefined): TraySessionStatus => {
  if (value === "busy" || value === "retry") return value
  return "idle"
}

export const buildTraySnapshot = (input: BuildTraySnapshotInput): TraySnapshot => {
  const maxSessions = Math.max(0, input.maxSessions ?? DEFAULT_MAX_SESSIONS)
  const maxApprovals = Math.max(0, input.maxApprovals ?? DEFAULT_MAX_APPROVALS)
  const branchByDirectory = input.branchByDirectory ?? new Map<string, string>()

  // Root sessions only: children are work delegated by a root session and would
  // just pad the menu. Newest first, like the sidebar.
  const ordered = input.sessions
    .filter((session) => Boolean(session?.id) && !session.parentID && !session.archived)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))

  // Titles come from every session the menu can name, not only the root rows above: an approval can belong
  // to a child session (a subagent asking for a tool), and the tray would otherwise show its raw id.
  const sessionTitleById = new Map<string, string>()
  for (const session of input.sessions) {
    if (!session?.id) continue
    sessionTitleById.set(session.id, session.title?.trim() || "Untitled Session")
  }

  const sessions: TraySession[] = ordered.slice(0, maxSessions).map((session) => {
    const directory = typeof session.directory === "string" ? session.directory : ""
    const projectName = directory ? basenameOf(directory) : ""
    const branch = directory ? (branchByDirectory.get(directory) ?? "") : ""
    return {
      id: session.id,
      title: truncateToCodeUnits(sessionTitleById.get(session.id) ?? "Untitled Session", 40),
      status: toStatus(input.statusBySession[session.id]),
      branch,
      unseen: input.unseenCountBySession[session.id] ?? 0,
      hasError: Boolean(input.errorBySession[session.id]),
      directory,
      subtitle: branch ? `${projectName} · ${branch}` : projectName,
    }
  })

  const directoryBySession = new Map<string, string>()
  for (const session of ordered) {
    directoryBySession.set(session.id, typeof session.directory === "string" ? session.directory : "")
  }

  const seenApprovals = new Set<string>()
  const approvals: TrayApproval[] = input.approvals
    .filter((approval) => Boolean(approval?.id) && Boolean(approval?.sessionId))
    // A session can linger in two directory stores after a move; list each request once, as the badge counts it.
    .filter((approval) => {
      const key = `${approval.kind}\u0000${approval.sessionId}\u0000${approval.id}`
      if (seenApprovals.has(key)) return false
      seenApprovals.add(key)
      return true
    })
    .map((approval, index) => ({ approval, index, rank: approval.riskRank ?? UNCLASSIFIED_RISK_RANK }))
    // Most consequential first, so the menu limit never hides a must-decide request behind safe ones.
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ approval }) => approval)
    .slice(0, maxApprovals)
    .map((approval) => {
      const head = (approval.title ?? "").trim() || (approval.kind === "permission" ? "Permission" : "Question")
      const resource = (approval.resource ?? "").trim()
      return {
        kind: approval.kind,
        id: approval.id,
        sessionId: approval.sessionId,
        sessionTitle: truncateToCodeUnits(sessionTitleById.get(approval.sessionId) ?? approval.sessionId, 24),
        label: truncateToCodeUnits(resource ? `${head}: ${resource}` : head, 34),
        // Fall back to the session's directory: the tray's "Open in app" action
        // needs one, and the request itself may not carry it.
        directory:
          typeof approval.directory === "string" && approval.directory.length > 0
            ? approval.directory
            : (directoryBySession.get(approval.sessionId) ?? ""),
        // A question can never be remembered and a permission only when it
        // carries save patterns; the tray drops the "Allow always" item
        // otherwise instead of offering a no-op.
        canSave: approval.kind === "permission" && approval.canSave === true,
      }
    })

  const dockBadgeCount = new Set(
    input.approvals
      .filter((approval) => Boolean(approval?.id) && Boolean(approval?.sessionId))
      .map((approval) => `${approval.kind}\u0000${approval.sessionId}\u0000${approval.id}`),
  ).size

  return {
    sessions,
    approvals,
    instanceName: (input.instanceName ?? "").trim() || "AX Code",
    usage: input.usage ?? { mode: "usage", groups: [] },
    dockBadgeCount,
  }
}
