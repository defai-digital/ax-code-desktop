import { needsHuman, type SupervisionState } from "./sessionState"

interface RankableSession {
  id: string
  time?: { updated?: number; created?: number }
}

interface RankedRow {
  sessionId: string
  state: SupervisionState
}

const updatedAt = (session: RankableSession) => session.time?.updated || session.time?.created || 0

/**
 * Orders sessions for the command palette the way Mission Control ranks them: sessions on the board keep its
 * urgency order (needs-you first), and the rest follow by most recent update.
 */
export function rankPaletteSessions<T extends RankableSession>(sessions: readonly T[], rows: readonly RankedRow[]): T[] {
  const rank = new Map(rows.map((row, index) => [row.sessionId, index]))
  return [...sessions].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return updatedAt(b) - updatedAt(a)
  })
}

/** Whether any ranked session waits on the user, which puts sessions first in an empty palette. */
export function paletteHasNeedsYou(rows: readonly RankedRow[]): boolean {
  return rows.some((row) => needsHuman(row.state))
}
