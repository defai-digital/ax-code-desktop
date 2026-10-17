/**
 * Session actions — SDK-calling operations for session management.
 * Replaces the action methods from the old useSessionStore.
 */

import type {
  AxCodeClient,
  FilePartInput,
  Session,
  Message,
  Part,
  SessionRollbackApplyInput,
  SessionMoveValidation,
} from "@defai-digital/ax-code-sdk/v2/client"
import { Binary } from "./binary"
import { useSessionUIStore } from "./session-ui-store"
import { useInputStore } from "./input-store"
import type { ChildStoreManager } from "./child-store"
import { axCodeClient, ascendingId, isValidMessageId } from "@/lib/ax-code/client"
import { formatSdkError } from "@/lib/ax-code/sdkError"
// NOTE (SPEC-2026-08-30, S4.5): the session lifecycle event stream
// (`session.created/updated/deleted` applied via sync/global-session-events.ts)
// is the sole writer of record for `useGlobalSessionsStore`. The few remaining
// `useGlobalSessionsStore` writes below are explicitly-optimistic transition
// primitives, each annotated at the call site with why it is load-bearing
// (creation gap before the created event; hard delete/archive flows that
// bypass the pendingRemoval undo window). Do not add new ones — rely on the
// session lifecycle event instead.
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { selectIsConnected, useConnectionStore } from "@/lib/event-stream/connection-state"
import { registerSessionDirectory } from "./sync-refs"
import { isSyntheticPart } from "@/lib/messages/synthetic"
import { materializeSessionSnapshots } from "./materialization"
import { serverSessionStatusStamp } from "./session-status-events"
import { stripMessageDiffSnapshots } from "./sanitize"
import { sessionEvents } from "@/lib/sessionEvents"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { toast } from "@/components/ui"
import { useI18nStore, formatMessage } from "@/lib/i18n/store"

const MESSAGE_REFETCH_LIMIT = 200
const MESSAGE_REFETCH_SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])
const UNREVERT_REFETCH_ATTEMPTS = 3
const UNREVERT_REFETCH_RETRY_MS = 150
const ACCEPTED_PROMPT_NO_OUTPUT_MS = 60_000
// How long after an async prompt is accepted we still treat the session as
// "starting up" even if an authoritative status snapshot reports it idle. The
// prompt_async endpoint returns before the turn registers as busy server-side,
// so a status poll / reconnect resync landing in that gap would otherwise see
// "no active status" and prematurely flip the optimistic busy back to idle —
// tripping the no-output watchdog. Kept comfortably above the watchdog window.
const PROMPT_ACCEPTED_BUSY_GRACE_MS = 60_000

// Reference set by SyncProvider — allows actions to access SDK and stores
let _sdk: AxCodeClient | null = null
let _childStores: ChildStoreManager | null = null
let _getDirectory: () => string = () => ""
let _optimisticAdd: ((input: { sessionID: string; message: Message; parts: Part[]; directory?: string }) => void) | null =
  null
let _optimisticRemove: ((input: { sessionID: string; messageID: string; directory?: string }) => void) | null = null

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Timestamp of the last successfully-accepted async prompt per session. Used to
// suppress premature idle downgrades from authoritative status snapshots while
// the turn is still spinning up. See PROMPT_ACCEPTED_BUSY_GRACE_MS.
const acceptedPromptAt = new Map<string, number>()

// Active accepted-prompt watchdog timers per session. Each optimisticSend call
// schedules a 12s watchdog that can force the session to idle if it finds a
// completed assistant reply while the status looks stuck on busy. Without
// cancellation, a stale watchdog from a PREVIOUS prompt fires during the NEXT
// prompt's turn, finds the previous turn's completed assistant reply, sees the
// current busy status (from the new prompt), and incorrectly forces idle —
// clobbering the new turn and tripping its own watchdog.
const acceptedPromptWatchdogTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
// Which prompt's watchdog owns the session's slot. A check that suspends on its refetch resumes after
// a newer prompt may have registered its own timer, and it must not take the slot back from it — the
// handle itself cannot answer that, because a re-arm replaces the handle of the same prompt.
const acceptedPromptWatchdogOwners = new Map<string, object>()

function markPromptAccepted(sessionId: string): void {
  acceptedPromptAt.set(sessionId, Date.now())
}

/**
 * True when a prompt for this session was accepted within the grace window.
 * The reconnect resync and status poll use this to avoid clobbering the
 * optimistic busy status with a stale "idle" before the turn starts streaming.
 */
export function wasPromptRecentlyAccepted(
  sessionId: string,
  withinMs: number = PROMPT_ACCEPTED_BUSY_GRACE_MS,
): boolean {
  const at = acceptedPromptAt.get(sessionId)
  if (at === undefined) return false
  if (Date.now() - at <= withinMs) return true
  // Expired — drop so the map doesn't grow unbounded across long-lived sessions.
  acceptedPromptAt.delete(sessionId)
  return false
}

export function setActionRefs(sdk: AxCodeClient, childStores: ChildStoreManager, getDirectory: () => string) {
  _sdk = sdk
  _childStores = childStores
  _getDirectory = getDirectory
}

export function setOptimisticRefs(
  add: (input: { sessionID: string; message: Message; parts: Part[]; directory?: string }) => void,
  remove: (input: { sessionID: string; messageID: string; directory?: string }) => void,
) {
  _optimisticAdd = add
  _optimisticRemove = remove
}

function sdk() {
  if (!_sdk) throw new Error("SDK not initialized — is SyncProvider mounted?")
  return _sdk
}

function dir() {
  return _getDirectory() || undefined
}

function scopedClientForDirectory(directory?: string | null): AxCodeClient {
  if (directory) return axCodeClient.getScopedSdkClient(directory)
  return sdk()
}

function connectionLostError(): Error {
  const { hasEverConnected, lastDisconnectReason } = useConnectionStore.getState()
  const suffix = lastDisconnectReason ? ` (${lastDisconnectReason})` : hasEverConnected ? "" : " (never connected)"
  return new Error(`Connection lost${suffix}. Please wait for reconnection.`)
}

type WatchdogStore = ReturnType<ChildStoreManager["ensureChild"]>

function findAssistantResponse(store: WatchdogStore, sessionId: string, messageID: string) {
  const messages = store.getState().message[sessionId] ?? []
  return messages.find((message) => message.role === "assistant" && message.parentID === messageID)
}

function isSessionWorking(store: WatchdogStore, sessionId: string): boolean {
  const status = store.getState().session_status?.[sessionId]
  return status?.type === "busy" || status?.type === "retry"
}

/**
 * True when a user message NEWER than `messageID` exists without its own
 * FINISHED assistant reply. This means a later turn is still in progress — the
 * current watchdog is for an already-completed turn and must NOT force idle or
 * fabricate an error, as that would clobber the in-progress turn.
 *
 * "Finished" matters: a reply that is still streaming already has a message
 * record, and treating that as answered let a stale watchdog force idle in the
 * middle of a live turn (which the queued-message auto-send then read as "turn
 * ended").
 *
 * Used by both watchdog branches (initial store match + post-recovery) to
 * prevent cross-turn clobbering. Without this, a stale watchdog from prompt N
 * that fires or completes its async recovery during prompt N+1's turn would
 * see the busy status from N+1 and incorrectly force idle.
 */
function hasFinishedAssistantReply(messages: Message[], userMessageID: string): boolean {
  return messages.some((message) => {
    if (message.role !== "assistant" || message.parentID !== userMessageID) return false
    const completedAt = (message as { time?: { completed?: number } }).time?.completed
    const finish = (message as { finish?: string }).finish
    return Boolean(completedAt) || finish === "stop"
  })
}

function hasNewerUnansweredUserMessage(messages: Message[], messageID: string): boolean {
  return messages.some((m) => m.role === "user" && m.id > messageID && !hasFinishedAssistantReply(messages, m.id))
}

// Pull the authoritative message list from the server into the session's store.
// The watchdog uses this to recover responses whose streamed events were dropped
// (WS reconnect, coalescing, or directory mis-routing) before declaring failure.
async function recoverAcceptedPromptFromServer(
  sessionId: string,
  directory: string,
  store: WatchdogStore,
): Promise<void> {
  try {
    const client = getSessionReplyClient(sessionId)
    const result = await client.session.messages({ sessionID: sessionId, directory, limit: MESSAGE_REFETCH_LIMIT })
    const records = (result.data ?? []).filter((record: { info?: { id?: string } }) => !!record?.info?.id)
    if (records.length === 0) return
    store.setState((state) => {
      const materialized = materializeSessionSnapshots(
        state,
        sessionId,
        records.map((record: { info: Message; parts?: Part[] }) => ({
          info: stripMessageDiffSnapshots(record.info),
          parts: record.parts ?? [],
        })),
        { skipPartTypes: MESSAGE_REFETCH_SKIP_PARTS },
      )
      return { message: materialized.message, part: materialized.part }
    })
  } catch (error) {
    // Refetch failed (offline / server error) — fall through to the synthetic
    // error so the user is never left staring at a silently stalled turn.
    console.warn("[session-actions] accepted-prompt watchdog refetch failed", error)
  }
}

function scheduleAcceptedPromptWatchdog(sessionId: string, messageID: string): void {
  const stores = _childStores
  if (!stores) return
  if (!(getSessionDirectory(sessionId) || dir())) return

  // Cancel any stale watchdog from a previous prompt for this session.
  // Without this, the previous prompt's watchdog fires during the next
  // prompt's turn, finds the previous turn's completed assistant reply,
  // sees the current busy status (from the new prompt), and incorrectly
  // forces idle — clobbering the new turn.
  const existingTimer = acceptedPromptWatchdogTimers.get(sessionId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }
  const owner = {}
  acceptedPromptWatchdogOwners.set(sessionId, owner)

  const runWatchdogCheck = async () => {
    // Re-resolve the directory on every fire (including grace-window re-arms)
    // instead of capturing it once at schedule time. If the session was moved
    // (moveSession) while this watchdog was pending, its message/status state
    // now lives in the TARGET directory's store — moveSessionLocalState
    // deletes it from the source store — so a captured stale directory would
    // look up an empty store, silently no-op (userMessage never found), and
    // leave a truly dead turn with no fallback error forever.
    const directory = getSessionDirectory(sessionId) || dir()
    if (!directory) return
    const store = stores.children.get(directory)
    if (!store) return
    const state = store.getState()
    const messages = state.message[sessionId] ?? []
    const userMessage = messages.find((message) => message.id === messageID)
    if (!userMessage) return

    const assistantResponse = messages.find((message) => message.role === "assistant" && message.parentID === messageID)
    if (assistantResponse) {
      const status = state.session_status?.[sessionId]
      const completedAt = (assistantResponse as { time?: { completed?: number } }).time?.completed
      const finish = (assistantResponse as { finish?: string }).finish
      if ((status?.type === "busy" || status?.type === "retry") && (completedAt || finish === "stop")) {
        // Don't force idle if a NEWER user message exists without its own
        // assistant reply — a later turn is still in progress and this
        // watchdog is for an already-completed turn.
        if (!hasNewerUnansweredUserMessage(messages, messageID)) {
          store.setState((current) => ({
            session_status: {
              ...current.session_status,
              [sessionId]: { type: "idle" as const },
            },
          }))
        }
      }
      return
    }

    if (isSessionWorking(store, sessionId)) return

    // No streamed assistant response and the session looks idle. Before
    // fabricating a failure, verify with the server — the turn may have
    // completed while its events were dropped in transit. If a real response
    // comes back, surface it and stop; only fabricate when the server also
    // has nothing.
    await recoverAcceptedPromptFromServer(sessionId, directory, store)
    if (findAssistantResponse(store, sessionId, messageID)) {
      // Re-read state after the async recovery — a new prompt may have
      // started during the network round-trip, setting busy and adding a
      // newer user message. Same cross-turn guard as the initial-match
      // branch: don't clobber an in-progress turn.
      const currentState = store.getState()
      const currentMessages = currentState.message[sessionId] ?? []
      const status = currentState.session_status?.[sessionId]
      if (
        (status?.type === "busy" || status?.type === "retry") &&
        !hasNewerUnansweredUserMessage(currentMessages, messageID)
      ) {
        store.setState((current) => ({
          session_status: {
            ...current.session_status,
            [sessionId]: { type: "idle" as const },
          },
        }))
      }
      return
    }

    // A late event may have flipped the session back to working during the
    // refetch — don't clobber an in-progress turn with a synthetic error.
    if (isSessionWorking(store, sessionId)) return

    // Grace-window re-arm: the prompt-accepted grace window (30s) is longer
    // than this watchdog (12s). If the prompt is STILL recently accepted, the
    // idle status we're seeing is a transient clobber from an SSE
    // session.idle / session.status event during the turn spin-up gap — NOT a
    // genuine turn death. The grace window guards the status-poll path
    // (resolveResyncedSessionStatus) but NOT the event-reducer's direct status
    // writes, so an SSE idle event can still clobber busy→idle here. Re-arm
    // to fire again once the grace window expires, so a truly dead turn is
    // still caught but a grace-window clobber does not fabricate a false error.
    if (wasPromptRecentlyAccepted(sessionId)) {
      // Only when this check still owns the session's slot. Its own timer removed the entry before
      // these checks ran, so an entry here belongs to a *newer* prompt: overwriting it left that
      // prompt's timer uncancellable — the following clearTimeout killed this handle instead — and it
      // then fired during a later turn, which is the cross-turn clobber the cancellation above
      // exists to prevent. A newer prompt's watchdog covers the session from here.
      if (acceptedPromptWatchdogOwners.get(sessionId) !== owner) {
        return
      }
      const acceptedAt = acceptedPromptAt.get(sessionId) ?? Date.now()
      const rearmDelay = Math.max(1, acceptedAt + PROMPT_ACCEPTED_BUSY_GRACE_MS - Date.now())
      const rearmTimer = globalThis.setTimeout(runWatchdogCheck, rearmDelay)
      acceptedPromptWatchdogTimers.set(sessionId, rearmTimer)
      return
    }

    const assistantMessageID = ascendingId("msg")
    const partID = ascendingId("prt")
    const now = Date.now()
    const assistantMessage = {
      id: assistantMessageID,
      role: "assistant" as const,
      sessionID: sessionId,
      parentID: messageID,
      modelID: "",
      providerID: "",
      system: "",
      agent: "",
      model: "",
      metadata: {
        synthetic: true,
        error: true,
        source: "desktop-accepted-prompt-watchdog",
      },
      time: { created: now, completed: now },
    } as unknown as Message
    const textPart = {
      id: partID,
      type: "text",
      messageID: assistantMessageID,
      text: "The request was accepted, but no assistant response or error was produced. Please retry this message or start a new session.",
    } as unknown as Part

    store.setState((current) => ({
      message: {
        ...current.message,
        [sessionId]: [...(current.message[sessionId] ?? []), assistantMessage],
      },
      part: current.part.withEntries([[assistantMessageID, [textPart]]]),
      session_status: {
        ...current.session_status,
        [sessionId]: { type: "idle" as const },
      },
    }))
  }

  const timer = globalThis.setTimeout(async () => {
    // Only while this prompt still owns the session: a newer prompt's timer could have replaced the
    // entry while this timer was waiting, and deleting that one would make its watchdog
    // uncancellable. (The owner token, not the timer handle: with a synchronous timer mock the
    // callback runs before the handle is assigned.)
    if (acceptedPromptWatchdogOwners.get(sessionId) === owner) {
      acceptedPromptWatchdogTimers.delete(sessionId)
    }
    await runWatchdogCheck()
  }, ACCEPTED_PROMPT_NO_OUTPUT_MS)

  acceptedPromptWatchdogTimers.set(sessionId, timer)
}

// Wait briefly for the pipeline to re-establish connection before failing a
// send. Transient reconnects (heartbeat race, WS→SSE fallback, brief network
// blip) otherwise surface as a hard "Connection lost" toast even though the
// pipeline recovers within a second. While waiting, run bounded health probes
// inside the same grace window so stale disconnected state can recover quickly.
const CONNECTION_GRACE_MS = 2000
export async function waitForConnectionOrThrow(): Promise<void> {
  const deadline = Date.now() + CONNECTION_GRACE_MS
  while (Date.now() < deadline) {
    if (selectIsConnected(useConnectionStore.getState())) return
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    if (await useConfigStore.getState().probeConnection({ timeoutMs: Math.min(500, remainingMs) })) return
    const sleepMs = Math.min(100, deadline - Date.now())
    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs))
    }
  }
  throw connectionLostError()
}

function getSessionDirectory(sessionId: string): string | undefined {
  return useSessionUIStore.getState().getDirectoryForSession(sessionId) || dir()
}

function getDirectoryStore(directory?: string) {
  if (!_childStores) throw new Error("Child stores not initialized")
  const resolvedDirectory = directory || _getDirectory()
  if (!resolvedDirectory) throw new Error("No current directory")
  return _childStores.ensureChild(resolvedDirectory)
}

// All Binary.search/findIndex call sites in this file assume `sessions` stays
// sorted by id (see ./binary.ts). Insert via Binary.search so a moved session
// lands at its sorted position instead of breaking that invariant — an
// unsorted array makes every later Binary lookup on this directory's session
// list (delete/archive/revert/fork/etc.) silently miss existing entries.
function upsertSessionList(sessions: Session[], session: Session): Session[] {
  const next = [...sessions]
  const result = Binary.search(next, session.id, (s) => s.id)
  if (result.found) {
    next[result.index] = session
    return next
  }
  next.splice(result.index, 0, session)
  return next
}

function removeRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function moveSessionLocalState(sessionId: string, sourceDirectory: string | undefined, session: Session): void {
  const targetDirectory = (session as { directory?: string | null }).directory ?? sourceDirectory
  if (!targetDirectory) return

  const sourceStore = getDirectoryStore(sourceDirectory)
  const targetStore = getDirectoryStore(targetDirectory)

  if (sourceDirectory === targetDirectory) {
    sourceStore.setState((state) => ({
      session: upsertSessionList(state.session, session),
    }))
    return
  }

  const sourceState = sourceStore.getState()
  const movedMessages = sourceState.message[sessionId]
  const movedStatus = sourceState.session_status[sessionId]
  const movedDiff = sourceState.session_diff[sessionId]
  const movedTodo = sourceState.todo[sessionId]
  const movedPermission = sourceState.permission[sessionId]
  const movedQuestion = sourceState.question[sessionId]
  const movedParts = (movedMessages ?? [])
    .map((message) => [message.id, sourceState.part.get(message.id)] as const)
    .filter((entry): entry is readonly [string, Part[]] => Array.isArray(entry[1]))

  targetStore.setState((state) => ({
    session: upsertSessionList(state.session, session),
    ...(movedMessages ? { message: { ...state.message, [sessionId]: movedMessages } } : {}),
    ...(movedParts.length > 0 ? { part: state.part.withEntries(movedParts) } : {}),
    ...(movedStatus ? { session_status: { ...state.session_status, [sessionId]: movedStatus } } : {}),
    ...(movedDiff ? { session_diff: { ...state.session_diff, [sessionId]: movedDiff } } : {}),
    ...(movedTodo ? { todo: { ...state.todo, [sessionId]: movedTodo } } : {}),
    ...(movedPermission ? { permission: { ...state.permission, [sessionId]: movedPermission } } : {}),
    ...(movedQuestion ? { question: { ...state.question, [sessionId]: movedQuestion } } : {}),
  }))

  sourceStore.setState((state) => {
    const nextPart = state.part.without((movedMessages ?? []).map((message) => message.id))

    return {
      session: state.session.filter((item) => item.id !== sessionId),
      message: removeRecordKey(state.message, sessionId),
      part: nextPart,
      session_status: removeRecordKey(state.session_status, sessionId),
      session_diff: removeRecordKey(state.session_diff, sessionId),
      todo: removeRecordKey(state.todo, sessionId),
      permission: removeRecordKey(state.permission, sessionId),
      question: removeRecordKey(state.question, sessionId),
    }
  })
}

function getSessionReplyClient(sessionId?: string): AxCodeClient {
  const directory = sessionId ? getSessionDirectory(sessionId) : null
  return scopedClientForDirectory(directory)
}

function restoreFilePartsToInput(fileParts: Array<Record<string, unknown>>): void {
  useInputStore.getState().clearAttachedFiles()
  for (const filePart of fileParts) {
    const url = typeof filePart.url === "string" ? filePart.url : ""
    const mime = typeof filePart.mime === "string" ? filePart.mime : "application/octet-stream"
    const filename = typeof filePart.filename === "string" ? filePart.filename : "attachment"
    const source = filePart.source as { type?: unknown; clientName?: unknown; uri?: unknown } | undefined
    if (source?.type === "resource" && typeof source.clientName === "string" && typeof source.uri === "string") {
      useInputStore.getState().addMcpResourceAttachment({
        client: source.clientName,
        name: filename,
        uri: source.uri,
        mimeType: mime,
      })
      continue
    }
    if (url) {
      useInputStore.getState().addRestoredAttachment({ url, mimeType: mime, filename })
    }
  }
}

function resolveDirectoryForBlockingRequest(
  type: "permission" | "question",
  sessionId: string,
  requestId: string,
): string | null {
  const stores = _childStores
  if (!stores || !requestId) {
    return null
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    const requestMap = type === "permission" ? state.permission : state.question
    for (const requests of Object.values(requestMap) as Array<Array<{ id: string }> | undefined>) {
      if (requests?.some((request) => request.id === requestId)) {
        return directory
      }
    }
  }

  const sessionDirectory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
  if (sessionDirectory) {
    return sessionDirectory
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    if (
      state.session.some((session) => session.id === sessionId) ||
      Object.prototype.hasOwnProperty.call(state.message, sessionId) ||
      Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId) ||
      Object.prototype.hasOwnProperty.call(state.permission ?? {}, sessionId) ||
      Object.prototype.hasOwnProperty.call(state.question ?? {}, sessionId)
    ) {
      return directory
    }
  }

  return null
}

function getRequestReplyClient(type: "permission" | "question", sessionId: string, requestId: string): AxCodeClient {
  const requestDirectory = resolveDirectoryForBlockingRequest(type, sessionId, requestId)
  if (requestDirectory) {
    return axCodeClient.getScopedSdkClient(requestDirectory)
  }
  return getSessionReplyClient(sessionId)
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export async function createSession(
  title?: string,
  directoryOverride?: string | null,
  parentID?: string | null,
): Promise<Session | null> {
  try {
    const directory = directoryOverride ?? dir()
    const client = scopedClientForDirectory(directory)
    const result = await client.session.create({
      directory,
      title,
      parentID: parentID ?? undefined,
    })
    if (result.error) throw new Error(`Failed to create session: ${formatSdkError(result.error)}`)
    const session = result.data
    if (!session) throw new Error("Failed to create session: response did not include session data")

    const sessionDirectory = (session as { directory?: string }).directory ?? directory ?? null
    // Pre-populate routing index so SSE events arriving before session.created
    // can be routed to the correct child store
    if (sessionDirectory) {
      registerSessionDirectory(session.id, sessionDirectory)
    }
    useSessionUIStore.getState().setCurrentSession(session.id, sessionDirectory)
    // Optimistic add (load-bearing): the new session is navigated to
    // immediately, so it must appear in the sidebar before the
    // `session.created` event round-trips — the HTTP response can arrive
    // first, and an event dropped during a reconnect would otherwise leave
    // the just-created session invisible until the next full load. The event
    // remains the reconcile authority (signature/preserveNewer dedupe).
    useGlobalSessionsStore.getState().upsertSession(session)
    return session
  } catch (error) {
    console.error("[session-actions] createSession failed", error)
    throw error
  }
}

/** Optimistically remove a session from the child store list. Returns the removed session for rollback. */
function optimisticRemoveSession(sessionId: string, directory?: string): Session | null {
  const store = getDirectoryStore(directory)
  const current = store.getState()
  const sessions = [...current.session]
  const result = Binary.search(sessions, sessionId, (s) => s.id)
  if (result.found) {
    const removed = sessions[result.index]
    sessions.splice(result.index, 1)
    store.setState({ session: sessions })
    return removed
  }
  return null
}

/**
 * Roll back an optimistic removal by re-inserting the removed session into
 * the store's CURRENT list. Restoring the whole pre-call snapshot array
 * would clobber any session.created/session.updated events that landed while
 * the request was in flight (the same lost-update race the sync path avoids
 * with functional setState). No-op when an SSE event already re-added it.
 */
function rollbackOptimisticRemoval(store: ReturnType<typeof getDirectoryStore>, removed: Session) {
  store.setState((state) => {
    const sessions = [...state.session]
    const result = Binary.search(sessions, removed.id, (s) => s.id)
    if (result.found) return state
    sessions.splice(result.index, 0, removed)
    return { session: sessions }
  })
}

type SessionActionFailureKind = "delete" | "archive" | "unarchive" | "rename" | "abort"

// Surface action failures from this layer so no caller can silently drop them.
// A stable toast id dedups repeats — the same failing action retried in a loop
// updates one toast instead of stacking.
function notifySessionActionFailure(kind: SessionActionFailureKind): void {
  const { dictionary } = useI18nStore.getState()
  toast.error(formatMessage(dictionary, `sessions.sidebar.session.${kind}.error`), {
    id: `session-action-${kind}-failed`,
  })
}

/**
 * The generated SDK resolves with `{ error }` instead of throwing on non-2xx
 * responses (see lib/ax-code/sdkError.ts), so every awaited mutating call has
 * to check the result. Without this a rejected request is applied as a success:
 * the optimistic removal stays, the persisted per-session state is dropped, and
 * the session reappears on the next load with no error shown.
 */
function assertSessionCallSucceeded(result: { error?: unknown } | null | undefined, action: string): void {
  if (!result || typeof result !== "object" || !result.error) {
    return
  }
  throw new Error(`${action} failed: ${formatSdkError(result.error)}`)
}

export async function deleteSession(sessionId: string, options?: { notify?: boolean }): Promise<boolean> {
  const sessionDirectory = getSessionDirectory(sessionId)
  // Remove from UI immediately, rollback on error
  let removed = optimisticRemoveSession(sessionId, sessionDirectory)
  let removedFromDir: string | null = removed ? (sessionDirectory ?? null) : null

  // If the session wasn't in the resolved directory (e.g. archived session
  // whose original child store was disposed), search all child stores.
  if (!removed && _childStores) {
    for (const [dir, store] of _childStores.children.entries()) {
      const current = store.getState()
      const sessions = [...current.session]
      const result = Binary.search(sessions, sessionId, (s) => s.id)
      if (result.found) {
        removed = sessions[result.index]
        sessions.splice(result.index, 1)
        store.setState({ session: sessions })
        removedFromDir = dir
        break
      }
    }
  }

  const ui = useSessionUIStore.getState()
  const clearedCurrentSelection = ui.currentSessionId === sessionId
  if (clearedCurrentSelection) {
    ui.setCurrentSession(null)
  }
  try {
    const result = await scopedClientForDirectory(sessionDirectory).session.delete({
      sessionID: sessionId,
      directory: sessionDirectory,
    })
    assertSessionCallSucceeded(result, "deleteSession")
    // Optimistic removal (load-bearing): hard-delete callers (confirm dialog,
    // bulk delete) have no pendingRemoval undo window, so this post-success
    // write is the only guaranteed instant sidebar update — a dropped
    // session.deleted event would otherwise leave a ghost session that errors
    // when opened. The event itself lands as a no-op reconcile.
    useGlobalSessionsStore.getState().removeSessions([sessionId])
    return true
  } catch (error) {
    console.error("[session-actions] deleteSession failed", error)
    if (options?.notify !== false) notifySessionActionFailure("delete")
    if (removed && removedFromDir) {
      try {
        rollbackOptimisticRemoval(getDirectoryStore(removedFromDir), removed)
      } catch {
        // child store may have been disposed since — ignore rollback
      }
    }
    // The optimistic removal also cleared the selection; with the session back
    // in the list the chat must not stay on the empty state. Only restore when
    // the user has not picked another session in the meantime.
    if (clearedCurrentSelection && useSessionUIStore.getState().currentSessionId === null) {
      useSessionUIStore.getState().setCurrentSession(sessionId, sessionDirectory)
    }
    return false
  }
}

export async function archiveSession(sessionId: string, options?: { notify?: boolean }): Promise<boolean> {
  const sessionDirectory = getSessionDirectory(sessionId)
  const removed = optimisticRemoveSession(sessionId, sessionDirectory)
  const ui = useSessionUIStore.getState()
  const clearedCurrentSelection = ui.currentSessionId === sessionId
  if (clearedCurrentSelection) {
    ui.setCurrentSession(null)
  }
  try {
    const archivedAt = Date.now()
    const result = await scopedClientForDirectory(sessionDirectory).session.update({
      sessionID: sessionId,
      directory: sessionDirectory,
      time: { archived: archivedAt },
    })
    assertSessionCallSucceeded(result, "archiveSession")
    // Optimistic bucket move (load-bearing): hard-archive callers (confirm
    // dialog, bulk archive) have no pendingRemoval undo window, so this
    // post-success write is the instant sidebar update; the
    // session.updated(time.archived) event reconciles as a no-op.
    useGlobalSessionsStore.getState().archiveSessions([sessionId], archivedAt)
    return true
  } catch (error) {
    console.error("[session-actions] archiveSession failed", error)
    if (options?.notify !== false) notifySessionActionFailure("archive")
    if (removed && sessionDirectory) {
      try {
        rollbackOptimisticRemoval(getDirectoryStore(sessionDirectory), removed)
      } catch {
        // child store may have been disposed since — ignore rollback
      }
    }
    // The optimistic removal also cleared the selection; with the session back
    // in the list the chat must not stay on the empty state. Only restore when
    // the user has not picked another session in the meantime.
    if (clearedCurrentSelection && useSessionUIStore.getState().currentSessionId === null) {
      useSessionUIStore.getState().setCurrentSession(sessionId, sessionDirectory)
    }
    return false
  }
}

export async function unarchiveSession(sessionId: string, options?: { notify?: boolean }): Promise<boolean> {
  const sessionDirectory = getSessionDirectory(sessionId)
  try {
    // No manual global-store write: the session.updated(time.archived=null)
    // event restores the session to the active list (S4.5 single writer).
    const result = await scopedClientForDirectory(sessionDirectory).session.update({
      sessionID: sessionId,
      directory: sessionDirectory,
      time: { archived: null },
    })
    assertSessionCallSucceeded(result, "unarchiveSession")
    return true
  } catch (error) {
    console.error("[session-actions] unarchiveSession failed", error)
    if (options?.notify !== false) notifySessionActionFailure("unarchive")
    return false
  }
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const sessionDirectory = getSessionDirectory(sessionId)
  try {
    // No manual global-store write: the session.updated event applies the new
    // title to the global index (S4.5 single writer).
    const result = await scopedClientForDirectory(sessionDirectory).session.update({
      sessionID: sessionId,
      directory: sessionDirectory,
      title,
    })
    assertSessionCallSucceeded(result, "updateSessionTitle")
  } catch (error) {
    console.error("[session-actions] updateSessionTitle failed", error)
    notifySessionActionFailure("rename")
    throw error
  }
}

export async function validateSessionMoveTarget(
  sessionId: string,
  targetDirectory: string,
): Promise<SessionMoveValidation> {
  const directory = getSessionDirectory(sessionId)
  const result = await scopedClientForDirectory(directory).session.moveValidate(
    {
      sessionID: sessionId,
      directory,
      targetDirectory,
    },
    { throwOnError: true },
  )
  if (!result.data) throw new Error("Failed to validate session move target")
  return result.data
}

export async function moveSession(sessionId: string, targetDirectory: string): Promise<Session> {
  const directory = getSessionDirectory(sessionId)
  const result = await scopedClientForDirectory(directory).session.move(
    {
      sessionID: sessionId,
      directory,
      targetDirectory,
    },
    { throwOnError: true },
  )
  const session = result.data
  if (!session) throw new Error("Failed to move session")

  moveSessionLocalState(sessionId, directory, session)
  // No manual global-store write: the session.updated event re-buckets the
  // session under its new directory (S4.5 single writer).

  const nextDirectory = (session as { directory?: string | null }).directory
  if (nextDirectory) {
    registerSessionDirectory(session.id, nextDirectory)
    sessionEvents.requestGitRefresh({ directory: nextDirectory })
  }
  if (directory && directory !== nextDirectory) {
    sessionEvents.requestGitRefresh({ directory })
  }
  if (useSessionUIStore.getState().currentSessionId === sessionId) {
    useSessionUIStore.getState().setCurrentSession(sessionId, nextDirectory ?? directory ?? null)
  }

  return session
}

export async function shareSession(sessionId: string): Promise<Session | null> {
  console.warn("[session-actions] shareSession is unavailable in the current AX Code SDK", { sessionId })
  return null
}

export async function unshareSession(sessionId: string): Promise<Session | null> {
  console.warn("[session-actions] unshareSession is unavailable in the current AX Code SDK", { sessionId })
  return null
}

// ---------------------------------------------------------------------------
// Optimistic message send — insert user message before API call, rollback on error
// ---------------------------------------------------------------------------

/**
 * Wraps an async send operation with optimistic user-message insertion.
 * Uses useSync()'s optimistic infrastructure — message + parts are inserted
 * into the store AND registered in the shadow Map. mergeOptimisticPage
 * handles deduplication when the server echoes back the real message.
 */
export async function optimisticSend(input: {
  sessionId: string
  content: string
  providerID: string
  modelID: string
  agent?: string
  files?: Array<Pick<FilePartInput, "type" | "mime" | "url" | "filename" | "source">>
  /**
   * The session's own directory when the caller already resolved it. Sends can
   * target a session outside the active project (queued auto-send, multi-run
   * fusion); without it the optimistic bubble and busy status would land in the
   * current directory's store, where the session's timeline never reads them.
   */
  directory?: string | null
  /**
   * Reuse a caller's message id instead of minting one. The server treats it as the
   * real user message id, so a sender that may retry the same logical message (the
   * queued-message dispatcher) can pass a stable id and let the server deduplicate
   * the retry instead of delivering the prompt twice.
   */
  messageId?: string
  /** The actual API call — receives the optimistic messageID so the server can use the same ID */
  send: (messageID: string) => Promise<void>
}): Promise<void> {
  if (!_optimisticAdd || !_optimisticRemove) {
    throw new Error("Optimistic refs not set — is useSync() mounted?")
  }

  const sessionDirectory =
    normalizeProjectPath(input.directory) ?? normalizeProjectPath(getSessionDirectory(input.sessionId)) ?? undefined
  const store = getDirectoryStore(sessionDirectory)
  const messageID = isValidMessageId(input.messageId ?? "") ? input.messageId! : ascendingId("msg")
  const textPartId = ascendingId("prt")

  const optimisticParts: Part[] = [{ id: textPartId, type: "text", text: input.content } as Part]
  if (input.files) {
    for (const f of input.files) {
      optimisticParts.push({
        id: ascendingId("prt"),
        type: "file",
        mime: f.mime,
        url: f.url,
        filename: f.filename,
        ...(f.source ? { source: f.source } : {}),
      } as Part)
    }
  }

  const optimisticMessage = {
    id: messageID,
    role: "user" as const,
    sessionID: input.sessionId,
    parentID: "",
    modelID: input.modelID,
    providerID: input.providerID,
    system: "",
    agent: input.agent ?? "",
    model: `${input.providerID}/${input.modelID}`,
    metadata: {} as Record<string, unknown>,
    time: { created: Date.now(), completed: 0 },
  } as unknown as Message

  // Insert into store + register in shadow Map (for mergeOptimisticPage cleanup)
  _optimisticAdd({
    sessionID: input.sessionId,
    message: optimisticMessage,
    parts: optimisticParts,
    directory: sessionDirectory,
  })

  // Set busy status and mark the prompt accepted atomically (both synchronous)
  // so any status poll that fires during the connection wait or POST round-trip
  // sees promptRecentlyAccepted=true and preserves busy via resolveResyncedSessionStatus.
  const current = store.getState()
  const previousStatus = current.session_status[input.sessionId]
  const optimisticBusy = { type: "busy" as const }
  store.setState({
    session_status: {
      ...current.session_status,
      [input.sessionId]: optimisticBusy,
    },
  })
  markPromptAccepted(input.sessionId)
  // The reducer stamps every server status event, including one it dedupes because the value matches.
  const statusEventsBeforeSend = serverSessionStatusStamp(input.sessionId)

  try {
    await waitForConnectionOrThrow()
    await input.send(messageID)
    scheduleAcceptedPromptWatchdog(input.sessionId, messageID)
  } catch (error) {
    // Roll back only when the runtime shows no sign of having accepted the turn:
    // the POST can reach it and start the turn (its events arrive over the
    // stream) while the HTTP response is lost — removing the optimistic user
    // message then deletes one the runtime did accept, while the assistant
    // reply parented on it keeps streaming. The status restore below guards
    // the same race for the status slice.
    const storedMessage = store
      .getState()
      .message[input.sessionId]?.find((message) => message.id === messageID)
    const serverTookOverMessage = storedMessage !== undefined && storedMessage !== optimisticMessage
    if (serverSessionStatusStamp(input.sessionId) === statusEventsBeforeSend && !serverTookOverMessage) {
      _optimisticRemove({
        sessionID: input.sessionId,
        messageID,
        directory: sessionDirectory,
      })
    }
    const s = store.getState()
    // Restore the status snapshot taken before the optimistic busy write instead of forcing idle —
    // the server-side turn may still be running — and only when the store still holds *this* call's
    // write: identity, not `type === "busy"`. A POST that reached the runtime and started the turn
    // before its response failed leaves the server's own busy in the store, and rolling that back
    // showed a live turn as idle until the turn ended.
    const currentStatus = s.session_status[input.sessionId]
    // Two ways the server can have taken over this status while the POST was in flight: it wrote a
    // different value (the store no longer holds this object) or it published an equal `busy` that the
    // reducer deduped away (the store still holds it — the usual case). Rolling either back shows a live
    // turn as idle.
    if (currentStatus === optimisticBusy && serverSessionStatusStamp(input.sessionId) === statusEventsBeforeSend) {
      const restored = { ...s.session_status }
      if (previousStatus === undefined) {
        delete restored[input.sessionId]
      } else {
        restored[input.sessionId] = previousStatus
      }
      store.setState({ session_status: restored })
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

export async function abortCurrentOperation(sessionId: string): Promise<void> {
  // Every other session call resolves the session's own directory; the current
  // one belongs to another project whenever the user switched projects while a
  // run continues, and the runtime answers an abort for a foreign project with
  // a 409 that leaves the run going.
  const directory = getSessionDirectory(sessionId)
  // Arm the stop marker before the request: the abort's busy -> idle edge can
  // reach the client over SSE before the response does, and it must not fire
  // the queued-message auto-send. Cleared again below when the runtime refused
  // the abort, so a run that keeps going is not reported as stopped.
  if (sessionId) {
    useSessionUIStore.getState().markSessionAborted(sessionId)
  }
  try {
    const result = await sdk().session.abort({ sessionID: sessionId, directory })
    assertSessionCallSucceeded(result, "abortCurrentOperation")
  } catch (error) {
    console.error("[session-actions] abort failed", error)
    if (sessionId) {
      useSessionUIStore.getState().clearSessionAbort(sessionId)
    }
    notifySessionActionFailure("abort")
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function respondToPermission(
  sessionId: string,
  requestId: string,
  response: "once" | "always" | "reject",
): Promise<void> {
  await waitForConnectionOrThrow()
  const directory =
    resolveDirectoryForBlockingRequest("permission", sessionId, requestId) || getSessionDirectory(sessionId) || dir()
  const result = await getRequestReplyClient("permission", sessionId, requestId).permission.reply({
    requestID: requestId,
    reply: response,
    ...(directory ? { directory } : {}),
  })
  if (!result.data) {
    throw new Error("Permission reply failed")
  }
}

export async function saveWebMcpApproval(sessionId: string, requestId: string): Promise<void> {
  await waitForConnectionOrThrow()
  const directory =
    resolveDirectoryForBlockingRequest("permission", sessionId, requestId) || getSessionDirectory(sessionId) || dir()
  const result = await getRequestReplyClient("permission", sessionId, requestId).permission.saveWebMcpApproval({
    requestID: requestId,
    ...(directory ? { directory } : {}),
  })
  if (result.error) {
    throw new Error("WebMCP allowlist save failed")
  }
}

export async function dismissPermission(sessionId: string, requestId: string): Promise<void> {
  await waitForConnectionOrThrow()
  const directory =
    resolveDirectoryForBlockingRequest("permission", sessionId, requestId) || getSessionDirectory(sessionId) || dir()
  const result = await getRequestReplyClient("permission", sessionId, requestId).permission.reply({
    requestID: requestId,
    reply: "reject",
    ...(directory ? { directory } : {}),
  })
  if (!result.data) {
    throw new Error("Permission dismissal failed")
  }
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function respondToQuestion(
  sessionId: string,
  requestId: string,
  answers: string[] | string[][],
): Promise<void> {
  await waitForConnectionOrThrow()
  const directory =
    resolveDirectoryForBlockingRequest("question", sessionId, requestId) || getSessionDirectory(sessionId) || dir()
  const result = await getRequestReplyClient("question", sessionId, requestId).question.reply({
    requestID: requestId,
    answers: answers as Array<Array<string>>,
    ...(directory ? { directory } : {}),
  })
  if (!result.data) {
    throw new Error("Question reply failed")
  }
}

export async function rejectQuestion(sessionId: string, requestId: string): Promise<void> {
  await waitForConnectionOrThrow()
  const directory =
    resolveDirectoryForBlockingRequest("question", sessionId, requestId) || getSessionDirectory(sessionId) || dir()
  const result = await getRequestReplyClient("question", sessionId, requestId).question.reject({
    requestID: requestId,
    ...(directory ? { directory } : {}),
  })
  if (!result.data) {
    throw new Error("Question rejection failed")
  }
}

// ---------------------------------------------------------------------------
// Message history
// ---------------------------------------------------------------------------

/**
 * Revert to a specific user message.
 *
 * 1. Abort if session is busy
 * 2. Extract text from the target message for prompt restoration
 * 3. Optimistically set revert marker so messages hide immediately
 * 4. Call SDK session.revert() and merge returned session
 * 5. Set pendingInputText so the reverted message text appears in the input
 */
export async function revertToMessage(sessionId: string, messageId: string): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const client = scopedClientForDirectory(directory)
  const store = getDirectoryStore(directory)
  const initial = store.getState()

  // Abort if busy before mutating session state
  const status = initial.session_status[sessionId]
  if (status && status.type !== "idle") {
    try {
      await client.session.abort({ sessionID: sessionId, directory })
    } catch {
      // ignore abort errors
    }
  }

  // Re-read after the abort round-trip: the event reducer may have applied
  // session-list updates (e.g. a subagent session.created) while it was in flight,
  // and the revert marker is written back onto that array below.
  const state = store.getState()

  // Extract message text for prompt restoration (only non-synthetic text parts —
  // the server adds file content as synthetic text parts that should not be restored)
  const messages = state.message[sessionId] ?? []
  const targetMsg = messages.find((m) => m.id === messageId)
  let messageText = ""
  let submittedFileParts: Array<Record<string, unknown>> = []
  if (targetMsg && targetMsg.role === "user") {
    const parts = state.part.get(messageId) ?? []
    const textParts = parts.filter((p) => p.type === "text" && !isSyntheticPart(p))
    messageText = textParts
      .map((p: Record<string, unknown>) => (p as { text?: string }).text || (p as { content?: string }).content || "")
      .join("\n")
      .trim()
    // Snapshot file parts for later restoration to the input.
    // Exclude synthetic file parts (server-generated file content that should
    // not be restored to the composer).
    submittedFileParts = parts.filter((p) => p.type === "file" && !isSyntheticPart(p)) as Array<Record<string, unknown>>
  }

  // Optimistically set only the revert marker. Keep messages and parts in the
  // local store; visible-message selectors derive the displayed timeline from
  // session.revert. This matches the server model and preserves reverted
  // messages for the restore dock without maintaining a separate shadow copy.
  const sessionIndex = Binary.search(state.session, sessionId, (s) => s.id)
  const prevRevert = sessionIndex.found
    ? (state.session[sessionIndex.index] as Session & { revert?: unknown }).revert
    : undefined
  const sessions = [...state.session]

  const patch: Record<string, unknown> = {}

  if (sessionIndex.found) {
    sessions[sessionIndex.index] = { ...sessions[sessionIndex.index], revert: { messageID: messageId } } as Session
    patch.session = sessions
  }

  store.setState(patch)

  // Save input store state before mutations — if the API fails we need to
  // roll back both text and attachments to their previous values.
  const prevInputAttachments = [...useInputStore.getState().attachedFiles]
  const prevInputText = useInputStore.getState().pendingInputText
  const prevInputMode = useInputStore.getState().pendingInputMode

  // Restore reverted message text and file attachments to input
  if (messageText) {
    useInputStore.setState({
      pendingInputText: messageText,
      pendingInputMode: "replace" as const,
    })
  }

  // Restore file/image attachments from the target message.
  // Clear existing attachments first — previous revert's attachments
  // must not carry over, even when the current message has no files.
  restoreFilePartsToInput(submittedFileParts)

  // Call SDK and merge authoritative result into store
  try {
    const result = await client.session.revert({ sessionID: sessionId, directory, messageID: messageId })
    // The SDK answers a rejected revert with `{ error }` instead of throwing;
    // without this the optimistic revert marker + composer text stayed applied
    // and the rollback below never ran.
    assertSessionCallSucceeded(result, "revertToMessage")
    if (result.data) {
      const current = store.getState()
      const updated = [...current.session]
      const idx = Binary.findIndex(updated, sessionId, (s) => s.id)
      if (idx >= 0) {
        updated[idx] = result.data
        store.setState({ session: updated })
      }
    }
    if (directory) {
      sessionEvents.requestGitRefresh({ directory })
    }
  } catch (err) {
    // Rollback: restore removed messages + revert marker
    const current = store.getState()
    const rollback = [...current.session]
    const idx = Binary.findIndex(rollback, sessionId, (s) => s.id)
    if (idx >= 0) {
      rollback[idx] = { ...rollback[idx], revert: prevRevert } as Session
    }
    store.setState({
      session: rollback,
    })
    // Rollback input store: restore previous text and attachments
    useInputStore.setState({
      pendingInputText: prevInputText,
      pendingInputMode: prevInputMode,
      attachedFiles: prevInputAttachments,
    })
    throw err
  }
}

/** Store or clear the local quality signal attached to a completed assistant message. */
export async function setMessageFeedback(
  sessionId: string,
  messageId: string,
  feedback: "up" | "down" | undefined,
): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const client = scopedClientForDirectory(directory)
  const store = getDirectoryStore(directory)
  const result = await client.session.feedback({
    sessionID: sessionId,
    messageID: messageId,
    directory,
    value: feedback ?? null,
  })

  if (!result.data) {
    throw new Error("Failed to save message feedback")
  }

  const state = store.getState()
  const messages = [...(state.message[sessionId] ?? [])]
  const index = Binary.findIndex(messages, messageId, (message) => message.id)
  if (index < 0) return

  messages[index] = result.data
  store.setState({
    message: {
      ...state.message,
      [sessionId]: messages,
    },
  })
}

export async function refetchSessionMessages(sessionId: string): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const store = getDirectoryStore(directory)
  const result = await scopedClientForDirectory(directory).session.messages({
    sessionID: sessionId,
    directory,
    limit: MESSAGE_REFETCH_LIMIT,
  })
  const records = (result.data ?? []).filter((record: { info?: { id?: string } }) => !!record?.info?.id)
  assertSessionCallSucceeded(result, "refetchSessionMessages")
  if (records.length === 0) return

  store.setState((state) => {
    const materialized = materializeSessionSnapshots(
      state,
      sessionId,
      records.map((record: { info: Message; parts?: Part[] }) => ({
        info: stripMessageDiffSnapshots(record.info),
        parts: record.parts ?? [],
      })),
      { skipPartTypes: MESSAGE_REFETCH_SKIP_PARTS },
    )
    return { message: materialized.message, part: materialized.part }
  })
}

async function replaceSessionMessagesFromServer(sessionId: string, directory: string | undefined): Promise<void> {
  const store = getDirectoryStore(directory)
  const result = await scopedClientForDirectory(directory).session.messages({
    sessionID: sessionId,
    directory,
    limit: MESSAGE_REFETCH_LIMIT,
  })
  // The generated SDK resolves with `{ error }` instead of throwing, and an empty record list is
  // legitimate here (a rollback can leave a session with no messages), so the error is the only
  // way to tell a failed read from an empty one: applying it would wipe the session on screen.
  // The next snapshot corrects the view, so leave the messages as they are.
  if (result?.error) {
    console.warn(
      `Failed to read session ${sessionId} after a rollback: ${formatSdkError(result.error)} — keeping the messages on screen.`,
    )
    return
  }
  const records = (result.data ?? []).filter((record: { info?: { id?: string } }) => !!record?.info?.id)

  store.setState((state) => {
    const nextPart = state.part.without((state.message[sessionId] ?? []).map((message) => message.id))
    const nextMessage = { ...state.message, [sessionId]: [] }
    const materialized = materializeSessionSnapshots(
      { message: nextMessage, part: nextPart },
      sessionId,
      records.map((record: { info: Message; parts?: Part[] }) => ({
        info: stripMessageDiffSnapshots(record.info),
        parts: record.parts ?? [],
      })),
      { skipPartTypes: MESSAGE_REFETCH_SKIP_PARTS },
    )
    return { message: materialized.message, part: materialized.part }
  })
}

/**
 * Unrevert — restore all previously reverted messages.
 * Restore all previously reverted messages. Aborts if busy, merges result.
 */
export async function unrevertSession(sessionId: string): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const client = scopedClientForDirectory(directory)
  const store = getDirectoryStore(directory)
  const state = store.getState()
  const previousMessageCount = state.message[sessionId]?.length ?? 0

  // Abort if busy
  const status = state.session_status[sessionId]
  if (status && status.type !== "idle") {
    try {
      await client.session.abort({ sessionID: sessionId, directory })
    } catch {
      // ignore
    }
  }

  const result = await client.session.unrevert({ sessionID: sessionId, directory })
  assertSessionCallSucceeded(result, "unrevertSession")
  if (result.data) {
    const current = store.getState()
    const sessions = [...current.session]
    const idx = Binary.findIndex(sessions, sessionId, (s) => s.id)
    if (idx >= 0) {
      sessions[idx] = result.data
      store.setState({ session: sessions })
    }
  }
  let lastRefetchError: unknown = null
  for (let attempt = 0; attempt < UNREVERT_REFETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(UNREVERT_REFETCH_RETRY_MS)
    try {
      await refetchSessionMessages(sessionId)
      lastRefetchError = null
    } catch (error) {
      // The refetch reports a failed read now, and this loop exists for a read that has not caught up yet: a
      // transient failure must not end the retries, so it is remembered and the next attempt runs. Everything
      // failed — the restore is applied but the messages never arrived — and the caller has to hear it.
      lastRefetchError = error
      continue
    }
    const nextMessageCount = store.getState().message[sessionId]?.length ?? 0
    if (nextMessageCount > previousMessageCount) return
  }
  if (lastRefetchError) {
    throw lastRefetchError instanceof Error ? lastRefetchError : new Error(String(lastRefetchError))
  }
}

export async function applyRollbackPoint(sessionId: string, input: SessionRollbackApplyInput): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const client = scopedClientForDirectory(directory)
  const store = getDirectoryStore(directory)
  const state = store.getState()

  const status = state.session_status[sessionId]
  if (status && status.type !== "idle") {
    try {
      await client.session.abort({ sessionID: sessionId, directory })
    } catch {
      // ignore abort errors; rollback route will still reject if the session remains busy
    }
  }

  const result = await client.session.rollback({
    sessionID: sessionId,
    directory,
    sessionRollbackApplyInput: input,
  })
  assertSessionCallSucceeded(result, "applyRollbackPoint")
  if (result.data) {
    const current = store.getState()
    const sessions = [...current.session]
    const idx = Binary.findIndex(sessions, sessionId, (s) => s.id)
    if (idx >= 0) {
      sessions[idx] = result.data
      store.setState({ session: sessions })
    }
    // No manual global-store write: the session.updated event refreshes the
    // global index entry (S4.5 single writer).
  }

  await replaceSessionMessagesFromServer(sessionId, directory)
  if (directory) {
    sessionEvents.requestGitRefresh({ directory })
  }
}

/**
 * Fork from a user message.
 *
 * 1. Extract text from the message for input restoration
 * 2. Call SDK session.fork()
 * 3. Insert the new session into the child store (so sidebar updates immediately)
 * 4. Switch to new session and set pending input text
 */
export async function forkFromMessage(sessionId: string, messageId: string): Promise<void> {
  const directory = getSessionDirectory(sessionId)
  const client = scopedClientForDirectory(directory)
  const store = getDirectoryStore(directory)
  const state = store.getState()

  // Extract message text and file attachments for input restoration.
  // Only non-synthetic text parts — the server adds file content as synthetic
  // text parts that should not be restored. File parts (images, pasted
  // screenshots) are user-originated and must be restored.
  const parts = state.part.get(messageId) ?? []
  let messageText = ""
  const textParts = parts.filter((p) => p.type === "text" && !isSyntheticPart(p))
  messageText = textParts
    .map(
      (p: Part) =>
        ((p as Record<string, unknown>).text as string) || ((p as Record<string, unknown>).content as string) || "",
    )
    .join("\n")
    .trim()
  const fileParts = parts.filter((p) => p.type === "file" && !isSyntheticPart(p)) as Array<Record<string, unknown>>

  const result = await client.session.fork(
    { sessionID: sessionId, directory, messageID: messageId },
    { throwOnError: true },
  )
  const forkedSession = result.data
  if (!forkedSession) throw new Error("Failed to fork session")

  // Insert new session into child store so sidebar updates immediately
  const current = store.getState()
  const sessions = [...current.session]
  const searchResult = Binary.search(sessions, forkedSession.id, (s) => s.id)
  if (!searchResult.found) {
    sessions.splice(searchResult.index, 0, forkedSession)
    store.setState({ session: sessions })
  }

  // Switch to new session
  const forkedDirectory = (forkedSession as { directory?: string | null }).directory ?? directory ?? null
  useSessionUIStore.getState().setCurrentSession(forkedSession.id, forkedDirectory)

  // Restore forked message text and file attachments to input
  if (messageText) {
    useInputStore.setState({
      pendingInputText: messageText,
      pendingInputMode: "replace" as const,
    })
  }
  // Clear existing attachments and restore file parts from the forked message.
  restoreFilePartsToInput(fileParts)
}
