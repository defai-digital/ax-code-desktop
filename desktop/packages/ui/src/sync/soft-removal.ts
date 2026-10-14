import { toast } from "@/components/ui"
import { axCodeClient } from "@/lib/ax-code/client"
import { formatSdkError } from "@/lib/ax-code/sdkError"
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
// wiped every other window's quit-recovery entries. Recovery reads and
// clears every slot, including the legacy un-suffixed key written by
// older versions.
const WINDOW_STORAGE_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const OWN_STORAGE_KEY = `${STORAGE_KEY_PREFIX}.${WINDOW_STORAGE_ID}`

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
 */
function persistPending(): void {
  const entries = Array.from(useGlobalSessionsStore.getState().pendingRemoval.values())
  writeOwnSlot(
    entries.map((entry) => ({
      id: entry.session.id,
      kind: entry.kind,
      directory: resolveGlobalSessionDirectory(entry.session),
    })),
  )
}

function listPersistedKeys(): string[] {
  if (typeof window === "undefined") return []
  try {
    const storage = window.localStorage
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key === STORAGE_KEY_PREFIX || (key !== null && key.startsWith(`${STORAGE_KEY_PREFIX}.`))) {
        keys.push(key)
      }
    }
    return keys
  } catch {
    return []
  }
}

function readPersisted(): PersistedRemoval[] {
  if (typeof window === "undefined") return []
  const entries: PersistedRemoval[] = []
  for (const key of listPersistedKeys()) {
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

async function commitRemovals(ids: string[]): Promise<void> {
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
  // Only now is it safe to drop the persisted entries: a quit while the
  // requests were in flight is recovered on next launch (idempotent).
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
  void commitRemovals(ids)
}

/**
 * Commit removals left over from a previous app session (quit during the
 * undo window). Safe to repeat: re-archiving is a timestamp update and a
 * session that is already gone counts as done. An entry is only dropped once
 * the runtime confirmed it; anything that failed for another reason (offline,
 * 5xx) is written back so the next launch retries it instead of silently
 * resurrecting the session.
 */
export async function recoverPendingRemovals(): Promise<void> {
  const persisted = readPersisted()
  if (persisted.length === 0) return
  // Take over every slot up front so a crash mid-recovery cannot double-apply
  // an entry; the failures are written back at the end.
  try {
    for (const key of listPersistedKeys()) {
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
        const result =
          kind === "delete"
            ? await sdkClient.session.delete({ sessionID: id, directory: directory ?? undefined })
            : await sdkClient.session.update({
                sessionID: id,
                directory: directory ?? undefined,
                time: { archived: Date.now() },
              })
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
  writeOwnSlot(failed)
}
