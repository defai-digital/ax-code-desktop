import { toast } from "@/components/ui"
import { axCodeClient } from "@/lib/ax-code/client"
import { formatSdkError } from "@/lib/ax-code/sdkError"
import { retryWhenRateLimited } from "@/lib/ax-code/rateLimitRetry"
import {
  useGlobalSessionsStore,
  resolveGlobalSessionDirectory,
  type PendingRemovalEntry,
  type PendingRemovalKind,
} from "@/stores/useGlobalSessionsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import * as sessionActions from "@/sync/session-actions"
import { formatMessage, useI18nStore, type I18nKey, type I18nParams } from "@/lib/i18n/store"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

const UNDO_DURATION_MS = 7000
const STORAGE_KEY_PREFIX = "axcode.pending-session-removals"

// Each window persists to its own slot so concurrently open windows (or
// browser tabs on the web build) never overwrite each other's pending
// removals: with a single shared key, one window's undo/empty persist
// wiped every other window's quit-recovery entries.
const WINDOW_STORAGE_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// `<prefix>.pending.<window>` holds one window's un-committed removals,
// `<prefix>.alive.<window>` is its heartbeat, and the bare `<prefix>` key is the
// legacy shared slot written by older versions.
const PENDING_KEY_PREFIX = `${STORAGE_KEY_PREFIX}.pending.`
const ALIVE_KEY_PREFIX = `${STORAGE_KEY_PREFIX}.alive.`
const OWN_STORAGE_KEY = `${PENDING_KEY_PREFIX}${WINDOW_STORAGE_ID}`
const OWN_ALIVE_KEY = `${ALIVE_KEY_PREFIX}${WINDOW_STORAGE_ID}`

const OWNER_HEARTBEAT_MS = 2_000
// How long a heartbeat may go unheard before its window counts as gone. Long
// enough to survive a busy main thread (the heartbeat runs on a timer), short
// enough that a crashed window's removals are recovered on the next launch.
const OWNER_STALE_MS = 10_000

type PersistedRemoval = {
  id: string
  kind: PendingRemovalKind
  directory: string | null
}

const timerBySession = new Map<string, ReturnType<typeof setTimeout>>()

const tr = (key: I18nKey, params?: I18nParams): string => formatMessage(useI18nStore.getState().dictionary, key, params)

function clearTimers(ids: string[]): void {
  for (const id of ids) {
    const timer = timerBySession.get(id)
    if (timer) clearTimeout(timer)
    timerBySession.delete(id)
  }
}

function writeOwnSlot(entries: PersistedRemoval[]): void {
  if (typeof window === "undefined") return
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(OWN_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(OWN_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage unavailable — quit-recovery degrades to best-effort flush.
  }
}

/**
 * Mirror the store's pending-removal map to this window's localStorage slot
 * so removals the user did not undo are still committed if the app quits
 * during the undo window (see recoverPendingRemovals).
 *
 * `alsoPersist` covers removals that left the store but still need recovering: `commitRemovals`
 * releases the pending flags before its requests, so a removal that failed after that is in neither
 * the store nor the slot unless it is added here.
 */
const toPersistedRemoval = (entry: PendingRemovalEntry): PersistedRemoval => ({
  id: entry.session.id,
  kind: entry.kind,
  directory: resolveGlobalSessionDirectory(entry.session),
})

/**
 * Removals kept for the next launch's recovery whose pending flag is already released (a failure on the
 * unload path). The store no longer holds them, so every later write has to carry them: merging them
 * into that one write meant an unrelated removal or undo in the same window rewrote this window's slot
 * without them, and the next launch resurrected those sessions.
 */
const keptForRecovery = new Map<string, PersistedRemoval>()

function persistPending(alsoPersist: PendingRemovalEntry[] = []): void {
  const byId = new Map<string, PersistedRemoval>(keptForRecovery)
  for (const entry of useGlobalSessionsStore.getState().pendingRemoval.values()) {
    byId.set(entry.session.id, toPersistedRemoval(entry))
  }
  for (const entry of alsoPersist) {
    byId.set(entry.session.id, toPersistedRemoval(entry))
  }
  writeOwnSlot(Array.from(byId.values()))
}

/**
 * Every pending slot, with its owning window id (null for the legacy shared
 * key). Heartbeat keys are deliberately not returned: they are not removals.
 */
function listPendingSlots(): { key: string; ownerId: string | null }[] {
  if (typeof window === "undefined") return []
  try {
    const storage = window.localStorage
    const slots: { key: string; ownerId: string | null }[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key === null) continue
      if (key === STORAGE_KEY_PREFIX) {
        slots.push({ key, ownerId: null })
        continue
      }
      if (key.startsWith(PENDING_KEY_PREFIX)) {
        slots.push({ key, ownerId: key.slice(PENDING_KEY_PREFIX.length) || null })
      }
    }
    return slots
  } catch {
    return []
  }
}

function isOwnerAlive(ownerId: string, now: number): boolean {
  if (!ownerId) return false
  try {
    const beat = Number(window.localStorage.getItem(`${ALIVE_KEY_PREFIX}${ownerId}`))
    return Number.isFinite(beat) && now - beat < OWNER_STALE_MS
  } catch {
    return false
  }
}

function readPersisted(keys: string[]): PersistedRemoval[] {
  if (typeof window === "undefined") return []
  const entries: PersistedRemoval[] = []
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) continue
      for (const item of parsed) {
        if (typeof item !== "object" || item === null) continue
        const candidate = item as Partial<PersistedRemoval>
        if (typeof candidate.id === "string" && (candidate.kind === "archive" || candidate.kind === "delete")) {
          entries.push(candidate as PersistedRemoval)
        }
      }
    } catch {
      // A single unreadable slot must not block recovery of the others.
    }
  }
  return entries
}

/**
 * A session that is already gone is a completed removal, not a failure: the
 * runtime answers 404 for a delete/archive of a missing session, and retrying
 * it forever would keep a dead entry in storage.
 */
function isAlreadyGoneError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const status = (error as { status?: unknown }).status
  if (status === 404) return true
  const responseStatus = (error as { response?: { status?: unknown } }).response?.status
  if (responseStatus === 404) return true
  const message = error instanceof Error ? error.message : (error as { message?: unknown }).message
  return typeof message === "string" && /not found/i.test(message)
}

/**
 * Announce this window so another window's recovery pass can tell that its
 * pending slot belongs to a live window (and must be left alone) rather than to
 * one that quit mid-undo-window. `pagehide` removes the heartbeat: quitting or
 * reloading makes this window's slot recoverable on the next launch, which is
 * the whole point of persisting it.
 */
function startOwnerHeartbeat(): void {
  if (typeof window === "undefined") return
  const beat = () => {
    try {
      window.localStorage.setItem(OWN_ALIVE_KEY, String(Date.now()))
    } catch {
      // Storage unavailable — recovery then treats this window as gone, which
      // is the pre-heartbeat behaviour.
    }
  }
  beat()
  window.setInterval(beat, OWNER_HEARTBEAT_MS)
  window.addEventListener("pagehide", () => {
    try {
      window.localStorage.removeItem(OWN_ALIVE_KEY)
    } catch {
      // ignore
    }
  })
}

startOwnerHeartbeat()

function successMessage(kind: PendingRemovalKind, count: number): string {
  if (count === 1) {
    return tr(
      kind === "delete" ? "sessions.sidebar.session.delete.success" : "sessions.sidebar.session.archive.success",
    )
  }
  return tr(
    kind === "delete" ? "sessions.sidebar.bulkActions.deletedPlural" : "sessions.sidebar.bulkActions.archivedPlural",
    { count },
  )
}

function failureMessage(kind: PendingRemovalKind, count: number): string {
  if (count === 1) {
    return tr(kind === "delete" ? "sessions.sidebar.session.delete.error" : "sessions.sidebar.session.archive.error")
  }
  return tr(
    kind === "delete"
      ? "sessions.sidebar.bulkActions.failedDeletePlural"
      : "sessions.sidebar.bulkActions.failedArchivePlural",
    { count },
  )
}

async function commitRemovals(ids: string[], { keepFailuresInSlot = false } = {}): Promise<void> {
  const store = useGlobalSessionsStore.getState()
  const entries = ids
    .map((id) => store.pendingRemoval.get(id))
    .filter((entry): entry is PendingRemovalEntry => Boolean(entry))
  if (entries.length === 0) return

  // Release the pending flags before the API calls so the resulting
  // session.updated/deleted events (suppressed inside the undo window) apply
  // cleanly once they arrive.
  store.commitPendingRemoval(entries.map((entry) => entry.session.id))
  clearTimers(ids)

  const failed: PendingRemovalEntry[] = []
  await Promise.all(
    entries.map(async (entry) => {
      const ok =
        entry.kind === "delete"
          ? await sessionActions.deleteSession(entry.session.id)
          : await sessionActions.archiveSession(entry.session.id)
      // No manual archived-bucket write on archive success (S4.5): the
      // pending flag was released above, so the session.updated(time.archived)
      // event adds the session to the archived bucket as the writer of record.
      if (!ok) failed.push(entry)
    }),
  )
  // Only the entries this commit confirmed may leave the slot. The unload flush keeps its failures
  // there because its requests are fire-and-forget and nobody can see the outcome (the slot's whole
  // purpose); the undo-window timer runs while the user is looking, reports the failure and puts the
  // session back, so retrying it behind their back on the next launch is not what they asked for.
  if (keepFailuresInSlot) {
    for (const entry of failed) {
      keptForRecovery.set(entry.session.id, toPersistedRemoval(entry))
    }
  }
  for (const entry of entries) {
    if (!failed.includes(entry)) {
      keptForRecovery.delete(entry.session.id)
    }
  }
  persistPending()

  if (failed.length > 0) {
    for (const entry of failed) {
      // Rollback restore (load-bearing): a FAILED removal emits no event, so
      // nothing else re-adds the session — without this optimistic re-upsert
      // of the pre-removal snapshot the session would stay hidden until the
      // next full loadSessions(). restoreSession drops the snapshot when a
      // newer session.updated already landed for it.
      useGlobalSessionsStore.getState().restoreSession(entry.session)
    }
    for (const kind of ["archive", "delete"] as const) {
      const count = failed.filter((entry) => entry.kind === kind).length
      if (count > 0) {
        toast.error(failureMessage(kind, count))
      }
    }
  }
}

function undoRemovals(ids: string[]): void {
  clearTimers(ids)
  useGlobalSessionsStore.getState().undoPendingRemoval(ids)
  // The user no longer wants these gone, so a queued recovery for them has to go too.
  for (const id of ids) {
    keptForRecovery.delete(id)
  }
  persistPending()
}

function softRemoveSessions(sessions: Session[], kind: PendingRemovalKind): void {
  const store = useGlobalSessionsStore.getState()
  const fresh = sessions.filter((session) => session?.id && !store.pendingRemoval.has(session.id))
  if (fresh.length === 0) return

  store.markPendingRemoval(fresh.map((session) => ({ session, kind })))
  persistPending()

  const ids = fresh.map((session) => session.id)
  const ui = useSessionUIStore.getState()
  if (ui.currentSessionId && ids.includes(ui.currentSessionId)) {
    ui.setCurrentSession(null)
  }

  const timer = setTimeout(() => {
    void commitRemovals(ids)
  }, UNDO_DURATION_MS)
  for (const id of ids) timerBySession.set(id, timer)

  toast.success(successMessage(kind, ids.length), {
    duration: UNDO_DURATION_MS,
    action: {
      label: tr("sessions.sidebar.softRemoval.undo"),
      onClick: () => undoRemovals(ids),
    },
  })
}

export function softArchiveSession(session: Session): void {
  softRemoveSessions([session], "archive")
}

export function softDeleteSession(session: Session): void {
  softRemoveSessions([session], "delete")
}

export function softBulkArchive(sessions: Session[]): void {
  softRemoveSessions(sessions, "archive")
}

/** Test seam: forget the removals kept for the next launch's recovery. */
export function resetSoftRemovalForTests(): void {
  keptForRecovery.clear()
}

export function softBulkDelete(sessions: Session[]): void {
  softRemoveSessions(sessions, "delete")
}

/**
 * Commit all pending removals immediately. Called on beforeunload; the
 * requests are fire-and-forget, so the persisted entries are intentionally
 * kept — recoverPendingRemovals finishes the job on next launch if these
 * never reached the server.
 */
export function flushPendingRemovals(): void {
  const ids = Array.from(useGlobalSessionsStore.getState().pendingRemoval.keys())
  if (ids.length === 0) return
  void commitRemovals(ids, { keepFailuresInSlot: true })
}

/**
 * Commit removals left over from a previous app session (a window that quit or
 * reloaded during the undo window). Safe to repeat: re-archiving is a timestamp
 * update and a session that is already gone counts as done. An entry is only
 * dropped once the runtime confirmed it; anything that failed for another
 * reason (offline, 5xx) is written back so the next launch retries it instead
 * of silently resurrecting the session.
 *
 * Only slots whose window is gone are taken over: another live window's slot is
 * still inside its own undo window, and committing it here would delete the
 * session server-side while that window's Undo still promises to bring it back.
 */
export async function recoverPendingRemovals(): Promise<void> {
  const now = Date.now()
  const ownedSlots = listPendingSlots().filter(({ ownerId }) => ownerId === null || !isOwnerAlive(ownerId, now))
  if (ownedSlots.length === 0) return
  const persisted = readPersisted(ownedSlots.map(({ key }) => key))
  if (persisted.length === 0) {
    // Nothing readable in the orphaned slots: drop them so they stop being
    // rescanned, but leave live windows' slots untouched.
    try {
      for (const { key } of ownedSlots) window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
    return
  }
  // Take over the orphaned slots up front so a crash mid-recovery cannot
  // double-apply an entry; the failures are written back at the end.
  try {
    for (const { key } of ownedSlots) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }

  const sdkClient = axCodeClient.getSdkClient()
  const failed: PersistedRemoval[] = []
  await Promise.all(
    persisted.map(async (entry) => {
      const { id, kind, directory } = entry
      try {
        // Recovery sends every pending removal at once and can exceed the runtime's rate limit.
        const result = await retryWhenRateLimited(
          (): Promise<{ error?: unknown; response?: Response }> =>
            kind === "delete"
              ? sdkClient.session.delete({ sessionID: id, directory: directory ?? undefined })
              : sdkClient.session.update({
                  sessionID: id,
                  directory: directory ?? undefined,
                  time: { archived: Date.now() },
                }),
        )
        // The generated SDK resolves with `{ error }` instead of throwing.
        if (result?.error && !isAlreadyGoneError(result.error)) {
          throw new Error(formatSdkError(result.error))
        }
      } catch (error) {
        console.warn("[soft-removal] failed to recover pending removal", { id, kind }, error)
        failed.push(entry)
      }
    }),
  )
  // Kept entries plus the leftovers, written the way every other write in this window is: the recovery
  // used to write its own failures over the whole slot (or remove the key when it had none), which
  // dropped a removal the user made while its requests were in flight — the next launch no longer
  // committed that session.
  for (const entry of failed) {
    keptForRecovery.set(entry.id, entry)
  }
  persistPending()
}
