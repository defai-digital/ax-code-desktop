export type PendingToastKind = "permission" | "question"

type PendingToastTrackerOptions = {
  /** Called with the toast id `pendingToastId(kind, key)` for each key that is dropped. */
  onDismiss?: (kind: PendingToastKind, key: string) => void
}

/** The `toast.info` id for a pending key, so a dismissal reaches the toast the key stands for. */
export const pendingToastId = (kind: PendingToastKind, key: string): string => `${kind}-${key}`

/**
 * The "an agent needs you" toasts that are on screen, keyed `sessionID:requestID`.
 *
 * A key is added when the toast is shown and dropped when the request is answered. It also has to be dropped when
 * the *session* goes away: a session deleted (or archived) while a request was outstanding never produces the
 * reply event, so its key stayed in the module-level set for the life of the renderer — unbounded over a session
 * of the app, and enough to suppress a toast if that key ever came back.
 */
export const createPendingToastTracker = ({ onDismiss }: PendingToastTrackerOptions = {}) => {
  const keys: Record<PendingToastKind, Set<string>> = { permission: new Set(), question: new Set() }

  const drop = (kind: PendingToastKind, key: string) => {
    if (keys[kind].delete(key)) {
      onDismiss?.(kind, key)
    }
  }

  return {
    has: (kind: PendingToastKind, key: string) => keys[kind].has(key),
    remember: (kind: PendingToastKind, key: string) => {
      keys[kind].add(key)
    },
    /** Drops one key, dismissing its toast. */
    clear: (kind: PendingToastKind, key: string) => drop(kind, key),
    /** Drops every key belonging to a session, dismissing the toasts that stand for them. */
    clearSession: (sessionId: string | undefined | null) => {
      if (!sessionId) return
      const prefix = `${sessionId}:`
      for (const kind of Object.keys(keys) as PendingToastKind[]) {
        for (const key of [...keys[kind]]) {
          if (key.startsWith(prefix)) {
            drop(kind, key)
          }
        }
      }
    },
    size: (kind: PendingToastKind) => keys[kind].size,
  }
}
