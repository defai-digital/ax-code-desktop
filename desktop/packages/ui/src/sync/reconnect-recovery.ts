import type { SessionStatus, Message } from "@defai-digital/ax-code-sdk/v2/client"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { getSessionMaterializationStatus } from "./materialization"
import { haveEquivalentSyncSnapshots } from "./snapshot-equality"
import { PartMap } from "./part-map"

type ReconnectMaterializationState = {
  session: Session[]
  session_status?: Record<string, SessionStatus>
  message?: Record<string, Message[]>
  part?: PartMap
}

type ViewedSessionMaterializationTarget = {
  directory: string
  sessionId: string
}

type ReconnectCandidateOptions = {
  directory?: string
  viewedSession?: ViewedSessionMaterializationTarget | null
}

/**
 * Decide a candidate session's status when reconciling against an authoritative
 * status snapshot (reconnect resync / periodic status poll).
 *
 * The snapshot lists only sessions the server currently considers active, so an
 * absent session normally means "idle". But the async prompt_async endpoint
 * returns before the turn registers as busy: a snapshot taken in that gap would
 * report the just-sent session as absent and flip the optimistic busy back to
 * idle, leaving the turn looking dead (and tripping the no-output watchdog).
 *
 * When the server reports an explicit status, trust it. Otherwise default to
 * idle — except for a freshly accepted prompt with no completed assistant reply
 * yet, where we preserve the existing non-idle status until a real
 * session.idle/error event (or the next snapshot past the grace window) arrives.
 */
export function resolveResyncedSessionStatus(input: {
  serverStatus: SessionStatus | undefined
  existingStatus: SessionStatus | undefined
  promptRecentlyAccepted: boolean
  hasCompletedAssistantReply: boolean
}): SessionStatus {
  const { serverStatus, existingStatus, promptRecentlyAccepted, hasCompletedAssistantReply } = input
  if (serverStatus) return serverStatus
  if (promptRecentlyAccepted && !hasCompletedAssistantReply && existingStatus && existingStatus.type !== "idle") {
    return existingStatus
  }
  return { type: "idle" }
}

/** Whether a session's latest message is a fully-completed assistant reply. */
export function hasCompletedAssistantReply(messages: Message[] | undefined): boolean {
  const lastMessage = messages?.[messages.length - 1]
  return (
    !!lastMessage &&
    lastMessage.role === "assistant" &&
    typeof (lastMessage as { time?: { completed?: number } }).time?.completed === "number"
  )
}

export function getReconnectCandidateSessionIds(
  state: ReconnectMaterializationState,
  options?: ReconnectCandidateOptions,
) {
  const ids = new Set<string>()

  for (const [sessionId, status] of Object.entries(state.session_status ?? {})) {
    if (status && status.type !== "idle") ids.add(sessionId)
  }

  for (const [sessionId, messages] of Object.entries(state.message ?? {})) {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== "number"
    ) {
      ids.add(sessionId)
    } else if (
      !getSessionMaterializationStatus({ message: state.message ?? {}, part: state.part ?? PartMap.EMPTY }, sessionId).renderable
    ) {
      ids.add(sessionId)
    }
  }

  const parentIds = new Set<string>()
  for (const session of state.session) {
    const parentId = (session as Session & { parentID?: string | null }).parentID
    if (parentId) {
      parentIds.add(parentId)
    }
  }
  for (const pid of parentIds) {
    ids.add(pid)
  }

  const viewedSession = options?.viewedSession
  if (viewedSession?.sessionId && viewedSession.directory === options?.directory) {
    const sessionId = viewedSession.sessionId
    const sessionExists =
      state.session.some((session) => session.id === sessionId) ||
      Object.hasOwn(state.session_status ?? {}, sessionId) ||
      Object.hasOwn(state.message ?? {}, sessionId)

    if (sessionExists) {
      ids.add(sessionId)
    }
  }

  return Array.from(ids)
}

/**
 * The entries of a status resync answer that may still be applied.
 *
 * The answer describes the server as it was when the request went out, so an entry whose local status
 * changed since then has newer evidence: a run started outside `optimisticSend` — shell mode, a
 * scheduled task, another client — sends `session.status{busy}` while the answer, computed before it,
 * carries `idle`, and applying that showed an idle session (no working indicator, no Stop) until the
 * next poll. Entries whose status moved in the meantime are dropped; the next poll's "before" is the
 * newer state, so it is still free to correct them.
 *
 * Exposed for unit testing, like the resolver above.
 */
export function pickApplicableResyncedStatuses(input: {
  relevantStatuses: Record<string, SessionStatus>
  beforeStatuses: Record<string, SessionStatus | undefined>
  currentStatuses: Record<string, SessionStatus | undefined>
}): Record<string, SessionStatus> {
  const applicable: Record<string, SessionStatus> = {}
  for (const [sessionId, status] of Object.entries(input.relevantStatuses)) {
    if (!haveEquivalentSyncSnapshots(input.currentStatuses[sessionId], input.beforeStatuses[sessionId])) {
      continue
    }
    applicable[sessionId] = status
  }
  return applicable
}
