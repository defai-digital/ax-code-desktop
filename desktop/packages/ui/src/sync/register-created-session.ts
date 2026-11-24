import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { normalizeWorktreePath } from "@/lib/worktrees/path"
import { getSyncChildStores, registerSessionDirectory } from "@/sync/sync-refs"

/**
 * Make a session created in the background known here without selecting it: route its events to its directory and seed
 * that directory's child store so an open directory lists it before its own event pass. Returns the session with its
 * directory set.
 */
export const registerCreatedSession = (session: Session, directory: string): Session => {
  const normalizedDirectory = normalizeWorktreePath(directory)
  const sessionDirectory = (session as Session & { directory?: string | null }).directory
  const sessionWithDirectory =
    typeof sessionDirectory === "string" && sessionDirectory.trim().length > 0
      ? session
      : ({ ...session, directory: normalizedDirectory } as Session)

  registerSessionDirectory(session.id, normalizedDirectory)
  // No useGlobalSessionsStore write (S4.5): the session.created bus event is
  // the writer of record for the global index — it reaches the store for every
  // directory via sync/global-session-events.ts. Only the per-directory child
  // store is seeded here (best-effort) so an already-open directory shows the
  // session without waiting for its own event reducer pass.

  try {
    const store = getSyncChildStores().ensureChild(normalizedDirectory, { bootstrap: false })
    store.setState((state) => {
      const existingIndex = state.session.findIndex((candidate) => candidate.id === session.id)
      if (existingIndex >= 0 && state.session[existingIndex] === sessionWithDirectory) {
        return state
      }

      const nextSessions =
        existingIndex >= 0
          ? state.session.map((candidate, index) => (index === existingIndex ? sessionWithDirectory : candidate))
          : [...state.session, sessionWithDirectory].sort((a, b) => a.id.localeCompare(b.id))

      return {
        session: nextSessions,
        sessionTotal: Math.max(state.sessionTotal, nextSessions.length),
        limit: Math.max(state.limit, nextSessions.length),
      }
    })
  } catch {
    // SyncProvider can be unavailable in tests or detached surfaces; the
    // session.created event still feeds the global index for the sidebar.
  }

  return sessionWithDirectory
}
