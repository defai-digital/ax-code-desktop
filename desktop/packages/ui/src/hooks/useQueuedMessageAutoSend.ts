import React from "react"
import {
  claimQueuedDispatch,
  releaseQueuedDispatchClaim,
  useMessageQueueStore,
  type QueuedMessage,
} from "@/stores/messageQueueStore"
import { toast } from "@/components/ui"
import { formatMessage, useI18nStore } from "@/lib/i18n/store"
import { ascendingId } from "@/lib/ax-code/client"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSelectionStore } from "@/sync/selection-store"
import { useConfigStore } from "@/stores/useConfigStore"
import { useAgentsStore } from "@/stores/useAgentsStore"
import { parseAgentMentions } from "@/lib/messages/agentMentions"
import {
  extractInlineFileMentions,
  filterMissingInlineAttachments,
  loadConfirmedMentions,
} from "@/components/chat/chatInputMentions"
import { axCodeClient } from "@/lib/ax-code/client"
import { getGlobalSyncSessionStatus } from "@/sync/sync-refs"
import { useAllSessionStatuses } from "@/sync/sync-context"
import { useSyncNotificationStore } from "@/sync/notification-store"

type SessionStatusType = "idle" | "busy" | "retry"

const RECENT_ABORT_WINDOW_MS = 2000

const hasRecentAbort = (sessionId: string): boolean => {
  const abortRecord = useSessionUIStore.getState().sessionAbortFlags.get(sessionId)
  if (!abortRecord) {
    return false
  }
  return Date.now() - abortRecord.timestamp < RECENT_ABORT_WINDOW_MS
}

// QueuedMessageChips renders exactly this state as a red "Held" label: an
// unseen error notification means the queue is being withheld until the user
// looks at what went wrong. Auto-send must honor the same state — otherwise
// the next busy→idle edge fires the "held" message into the errored session
// while the UI claims it is parked. Manual send from the chip stays
// available, and viewing the session clears the flag (markSessionViewed).
export const isQueuedAutoSendHeld = (sessionId: string): boolean =>
  useSyncNotificationStore.getState().sessionHasError(sessionId)

export const buildQueuedAutoSendPayload = (queue: QueuedMessage[]) => {
  const queued = queue[0]
  if (!queued) {
    return null
  }

  const agents = useAgentsStore.getState().getVisibleAgents()
  const { sanitizedText, mention } = parseAgentMentions(queued.content, agents)

  return {
    queuedMessageId: queued.id,
    messageId: queued.messageId,
    primaryText: sanitizedText,
    primaryAttachments: queued.attachments ?? [],
    agentMentionName: mention?.name,
    sendConfig: queued.sendConfig,
  }
}

type QueuedAutoSendPayload = NonNullable<ReturnType<typeof buildQueuedAutoSendPayload>>
type ResolvedQueuedSendConfig = {
  providerID: string
  modelID: string
  agent?: string
  variant?: string
}

export const sendQueuedAutoSendPayload = (
  sessionId: string,
  payload: QueuedAutoSendPayload,
  resolved: ResolvedQueuedSendConfig,
  messageId: string,
) => {
  return useSessionUIStore.getState().sendMessage(
    payload.primaryText,
    resolved.providerID,
    resolved.modelID,
    resolved.agent,
    payload.primaryAttachments,
    payload.agentMentionName,
    undefined,
    resolved.variant,
    "normal",
    // The entry's retry id makes a repeated, ambiguous or duplicate send of this
    // entry idempotent on the server instead of delivering the prompt twice.
    { sessionId, messageId },
  )
}

const resolveSessionSendConfig = (sessionId: string) => {
  const config = useConfigStore.getState()
  const selection = useSelectionStore.getState()

  const selectedAgent = selection.getSessionAgentSelection(sessionId) ?? config.currentAgentName ?? undefined

  const sessionModel = selection.getSessionModelSelection(sessionId)
  const agentModel = selectedAgent ? selection.getAgentModelForSession(sessionId, selectedAgent) : null

  const providerID =
    agentModel?.providerId ??
    sessionModel?.providerId ??
    config.currentProviderId ??
    selection.lastUsedProvider?.providerID
  const modelID =
    agentModel?.modelId ?? sessionModel?.modelId ?? config.currentModelId ?? selection.lastUsedProvider?.modelID

  const variant =
    selectedAgent && providerID && modelID
      ? selection.getAgentModelVariantForSession(sessionId, selectedAgent, providerID, modelID)
      : undefined

  return {
    providerID,
    modelID,
    agent: selectedAgent,
    variant,
  }
}

export const shouldDispatchQueuedAutoSend = (
  previousStatusType: SessionStatusType | undefined,
  currentStatusType: SessionStatusType,
): boolean => {
  return (previousStatusType === "busy" || previousStatusType === "retry") && currentStatusType === "idle"
}

type QueuedAutoSendStatusUpdate = {
  /** Baseline to store for the next tick — held sessions keep their prior (armed) status. */
  nextStatusMap: Map<string, SessionStatusType>
  /** Sessions whose busy/retry -> idle edge fired this tick and are clear to dispatch now. */
  sessionIdsToDispatch: string[]
}

/**
 * Advances the per-session status baseline used to detect a busy/retry -> idle
 * edge, without stranding sessions whose auto-send is currently deferred
 * (in-flight dispatch, recent abort, or an unseen error hold).
 *
 * A session held this tick must keep its pre-transition baseline (e.g. "busy")
 * rather than being advanced to "idle" — otherwise, once the hold lifts with
 * no further status transition to re-trigger the effect, the edge is gone and
 * the queued message never auto-sends.
 */
export const computeQueuedAutoSendStatusUpdate = (
  queuedMessages: Record<string, QueuedMessage[]>,
  statusRecord: Record<string, { type: string } | undefined>,
  previousStatusMap: Map<string, SessionStatusType>,
  isAutoSendDeferred: (sessionId: string) => boolean,
): QueuedAutoSendStatusUpdate => {
  const queueEntries = Object.entries(queuedMessages)

  const heldSessionIds = new Set<string>()
  const sessionIdsToDispatch: string[] = []
  for (const [sessionId, queue] of queueEntries) {
    if (queue.length === 0) continue
    const currentStatusType = (statusRecord[sessionId]?.type ?? "idle") as SessionStatusType
    const previousStatusType = previousStatusMap.get(sessionId)
    if (!shouldDispatchQueuedAutoSend(previousStatusType, currentStatusType)) continue

    if (isAutoSendDeferred(sessionId)) {
      heldSessionIds.add(sessionId)
    } else {
      sessionIdsToDispatch.push(sessionId)
    }
  }

  const nextStatusMap = new Map(previousStatusMap)
  for (const [sessionId, status] of Object.entries(statusRecord)) {
    if (status && !heldSessionIds.has(sessionId)) {
      nextStatusMap.set(sessionId, status.type as SessionStatusType)
    }
  }
  for (const [sessionId] of queueEntries) {
    if (heldSessionIds.has(sessionId)) continue
    const currentStatusType = (statusRecord[sessionId]?.type ?? "idle") as SessionStatusType
    nextStatusMap.set(sessionId, currentStatusType)
  }

  // Prune sessions that are no longer tracked (deleted/archived/gone) so the
  // status map does not grow unbounded over a long-running app session. A
  // session that later reappears starts with no previous status, which
  // correctly prevents a spurious idle-transition auto-send.
  const activeSessionIds = new Set([...Object.keys(statusRecord), ...Object.keys(queuedMessages)])
  for (const sessionId of nextStatusMap.keys()) {
    if (!activeSessionIds.has(sessionId)) {
      nextStatusMap.delete(sessionId)
    }
  }

  return { nextStatusMap, sessionIdsToDispatch }
}

export function useQueuedMessageAutoSend(enabledOrOptions?: boolean | { enabled?: boolean }) {
  const enabled = typeof enabledOrOptions === "boolean" ? enabledOrOptions : (enabledOrOptions?.enabled ?? true)
  const queuedMessages = useMessageQueueStore((state) => state.queuedMessages)
  // Statuses from every live directory: a queued message can belong to a session in a
  // project that is not the active one, and the per-directory record reads such a
  // session as idle - which would dispatch while it is still busy.
  const sessionStatusRecord = useAllSessionStatuses()
  // The error hold is read imperatively through `isQueuedAutoSendHeld`, so subscribe to the same
  // index here. Viewing a session clears only the notification store: without this subscription the
  // effect never runs again to spend the busy -> idle edge kept armed while the hold was up.
  const unseenErrorBySession = useSyncNotificationStore((state) => state.index.session.unseenHasError)

  const inFlightSessionsRef = React.useRef<Set<string>>(new Set())
  const previousStatusRef = React.useRef<Map<string, SessionStatusType>>(new Map())
  const abortWakeupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // Re-run signal for the recent-abort wake-up timer: the timer cannot spend the
  // armed edge itself (that path would not advance the status baseline), so it
  // asks this effect to run the normal dispatch pass.
  const [abortWakeupTick, bumpAbortWakeupTick] = React.useReducer((tick: number) => tick + 1, 0)

  React.useEffect(() => {
    if (!enabled) {
      return
    }
    // Referenced so the wake-up tick is a legitimate dependency (it re-runs this
    // pass without any store change).
    void abortWakeupTick

    // A transient hold means the busy/retry -> idle edge must stay armed rather
    // than be consumed: if we advance the status baseline while an auto-send is
    // deferred (in-flight dispatch, recent abort, or an unseen error), the head
    // is stranded once the hold lifts with no further transition to re-trigger.
    const isAutoSendDeferred = (sessionId: string): boolean =>
      inFlightSessionsRef.current.has(sessionId) ||
      hasRecentAbort(sessionId) ||
      isQueuedAutoSendHeld(sessionId) ||
      // A session whose status is not tracked (its project is not the active one,
      // or the store has not seen it yet) may still be working: hold the edge
      // instead of spending it, so the queue fires on a confirmed busy -> idle.
      getGlobalSyncSessionStatus(sessionId) === undefined

    const dispatchSessionQueue = async (sessionId: string, queueSnapshot: QueuedMessage[]) => {
      if (queueSnapshot.length === 0) {
        return
      }
      if (isAutoSendDeferred(sessionId)) {
        return "deferred" as const
      }

      // Skip when the session's status is unknown rather than assuming idle: an
      // untracked session may still be working, and the queue waits for the next edge.
      const currentStatus = getGlobalSyncSessionStatus(sessionId)?.type
      if (currentStatus !== "idle") {
        return
      }

      const payload = buildQueuedAutoSendPayload(queueSnapshot)
      if (!payload) {
        return
      }

      // The queue stores the typed text. The manual send path extracts @path mentions when it
      // builds the payload, but the auto-sender forwarded only the chip attachments, so a
      // queued mention arrived as plain text while the same prompt sent by hand carried the
      // file. Extract them here exactly as the composer does; a failure here must never stop
      // the queued prompt from being delivered.
      try {
        const root = (
          useSessionUIStore.getState().getDirectoryForSession(sessionId) ||
          axCodeClient.getDirectory() ||
          ""
        )
          .replace(/\\/g, "/")
          .replace(/\/+$/, "")
        if (root && payload.primaryText.includes("@")) {
          const confirmed = loadConfirmedMentions(sessionId)
          const mentioned = extractInlineFileMentions(payload.primaryText, {
            root,
            isKnownAgent: (name) =>
              useAgentsStore
                .getState()
                .getVisibleAgents()
                .some((agent) => agent.name.toLowerCase() === name),
            isConfirmedFilePath: (text) =>
              text.includes("/") || text.includes("\\") || text.includes(".") || confirmed.has(text),
          })
          // Commit both fields only after every await succeeded: assigning the sanitized
          // text first left a failure with the @mentions stripped and no attachments.
          let nextAttachments = payload.primaryAttachments
          if (mentioned.attachments.length > 0) {
            nextAttachments = await filterMissingInlineAttachments(
              [...payload.primaryAttachments, ...mentioned.attachments],
              (directory) => axCodeClient.listLocalDirectory(directory),
            )
          }
          payload.primaryText = mentioned.sanitizedText
          payload.primaryAttachments = nextAttachments
        }
      } catch (error) {
        console.warn("[queue] queued mention extraction failed:", error)
      }

      // The extraction above awaits a directory listing, so the caller's checks predate it.
      // Re-check before claiming: the session may have gone busy, an abort or unseen-error
      // hold may have landed, or the user may have deleted the chip meanwhile.
      if (isAutoSendDeferred(sessionId)) {
        return "deferred" as const
      }
      if ((getGlobalSyncSessionStatus(sessionId)?.type ?? "idle") !== "idle") {
        return
      }
      if (
        !useMessageQueueStore
          .getState()
          .getQueueForSession(sessionId)
          .some((message) => message.id === payload.queuedMessageId)
      ) {
        return
      }

      if (!payload.primaryText && payload.primaryAttachments.length === 0) {
        return
      }

      // Use send config captured at queue time; fall back to current config
      const captured = payload.sendConfig
      const resolved = captured?.providerID && captured?.modelID ? captured : resolveSessionSendConfig(sessionId)
      if (!resolved.providerID || !resolved.modelID) {
        return
      }

      // Claim before minting or persisting a retry id: losing windows must not
      // overwrite the winning window's queue snapshot with their own id.
      if (!(await claimQueuedDispatch(payload.queuedMessageId))) return

      // Waiting for the cross-window lock yields. Recheck the live session and
      // queue before consuming the entry or changing its retry identity.
      const currentEntry = useMessageQueueStore
        .getState()
        .getQueueForSession(sessionId)
        .find((message) => message.id === payload.queuedMessageId)
      if (
        !currentEntry ||
        isAutoSendDeferred(sessionId) ||
        (getGlobalSyncSessionStatus(sessionId)?.type ?? "idle") !== "idle"
      ) {
        releaseQueuedDispatchClaim(payload.queuedMessageId)
        return currentEntry ? ("deferred" as const) : undefined
      }
      const dispatchMessageId = currentEntry.messageId ?? payload.messageId ?? ascendingId("msg")
      if (!currentEntry.messageId) {
        useMessageQueueStore.getState().assignMessageId(sessionId, payload.queuedMessageId, dispatchMessageId)
      }

      inFlightSessionsRef.current.add(sessionId)

      // Take the entry out before the send: the chip stays interactive while the
      // prompt is in flight, and sending it by hand would deliver it twice.
      const dispatchedEntry = useMessageQueueStore
        .getState()
        .getQueueForSession(sessionId)
        .find((message) => message.id === payload.queuedMessageId)
      useMessageQueueStore.getState().removeFromQueue(sessionId, payload.queuedMessageId)

      try {
        await sendQueuedAutoSendPayload(
          sessionId,
          payload,
          {
            providerID: resolved.providerID,
            modelID: resolved.modelID,
            agent: resolved.agent,
            variant: resolved.variant,
          },
          dispatchMessageId,
        )
      } catch (error) {
        console.warn("[queue] queued auto-send failed:", error)
        // The entry is restored below and waits for a manual retry from the
        // chip; without a visible notice the user has no way to know the
        // send failed. A stable toast id dedupes a flapping failure.
        toast.error(formatMessage(useI18nStore.getState().dictionary, "chat.queuedMessage.sendFailed"), {
          id: "queued-auto-send-failed",
        })
        // Let this or another window try again.
        releaseQueuedDispatchClaim(payload.queuedMessageId)
        if (dispatchedEntry) {
          // Restore the message so a failed send does not lose it.
          useMessageQueueStore.setState((state) => {
            const queue = state.queuedMessages[sessionId] ?? []
            if (queue.some((message) => message.id === dispatchedEntry.id)) return state
            return {
              queuedMessages: { ...state.queuedMessages, [sessionId]: [dispatchedEntry, ...queue] },
            }
          })
        }
      } finally {
        inFlightSessionsRef.current.delete(sessionId)
      }
    }

    const statusRecord = sessionStatusRecord ?? {}
    const { nextStatusMap, sessionIdsToDispatch } = computeQueuedAutoSendStatusUpdate(
      queuedMessages,
      statusRecord,
      previousStatusRef.current,
      isAutoSendDeferred,
    )

    for (const sessionId of sessionIdsToDispatch) {
      const queue = queuedMessages[sessionId]
      if (queue) {
        const priorStatus = previousStatusRef.current.get(sessionId)
        void dispatchSessionQueue(sessionId, queue).then((result) => {
          if (result !== "deferred" || (priorStatus !== "busy" && priorStatus !== "retry")) return
          if (useMessageQueueStore.getState().getQueueForSession(sessionId).length === 0) return
          // A hold can arrive after the transition was selected but before a
          // claim commits. Restore the edge and schedule its hold/wake-up check.
          if (previousStatusRef.current.get(sessionId) === "idle") {
            previousStatusRef.current.set(sessionId, priorStatus)
            bumpAbortWakeupTick()
          }
        })
      }
    }

    previousStatusRef.current = nextStatusMap

    // A recent-abort hold expires on a clock, not on a store transition:
    // without a wake-up, the armed edge would wait for an unrelated status
    // change to be spent and the queued message would sit stranded. The timer
    // only re-runs this effect, which then spends the edge through the normal
    // dispatch path (so the baseline advances and a failed send waits for the
    // next edge instead of being retried in a loop) and reschedules itself for
    // any session whose window lapses later.
    if (abortWakeupTimerRef.current) {
      clearTimeout(abortWakeupTimerRef.current)
      abortWakeupTimerRef.current = null
    }
    let wakeupInMs: number | null = null
    for (const [sessionId, queue] of Object.entries(queuedMessages)) {
      if (queue.length === 0 || sessionIdsToDispatch.includes(sessionId)) continue
      const baseline = previousStatusRef.current.get(sessionId)
      if (baseline !== "busy" && baseline !== "retry") continue
      const abortRecord = useSessionUIStore.getState().sessionAbortFlags.get(sessionId)
      if (!abortRecord) continue
      const remaining = abortRecord.timestamp + RECENT_ABORT_WINDOW_MS - Date.now()
      if (remaining <= 0) continue
      wakeupInMs = wakeupInMs === null ? remaining : Math.min(wakeupInMs, remaining)
    }
    if (wakeupInMs !== null) {
      abortWakeupTimerRef.current = setTimeout(() => {
        abortWakeupTimerRef.current = null
        bumpAbortWakeupTick()
      }, wakeupInMs + 25)
    }

    return () => {
      if (abortWakeupTimerRef.current) {
        clearTimeout(abortWakeupTimerRef.current)
        abortWakeupTimerRef.current = null
      }
    }
  }, [enabled, queuedMessages, sessionStatusRecord, unseenErrorBySession, abortWakeupTick])
}
