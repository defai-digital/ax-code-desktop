import { setCappedCacheEntry } from "../capped-cache.js"
import { formatNotificationModeLabel, formatNotificationModelLabel } from "./label-format.js"

export const createNotificationTriggerRuntime = (deps) => {
  const {
    readSettingsFromDisk,
    prepareNotificationLastMessage,
    buildTemplateVariables,
    extractLastMessageText,
    fetchLastAssistantMessageText,
    resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage,
    emitDesktopNotification,
    broadcastUiNotification,
    buildAxCodeUrl,
    getAxCodeAuthHeaders,
  } = deps

  let getIsWindowFocused = typeof deps.getIsWindowFocused === "function" ? deps.getIsWindowFocused : null

  const setGetIsWindowFocused = (cb) => {
    getIsWindowFocused = typeof cb === "function" ? cb : null
  }

  const READY_NOTIFICATION_COOLDOWN_MS = 5000
  const QUESTION_NOTIFICATION_DEBOUNCE_MS = 500
  const PERMISSION_NOTIFICATION_DEBOUNCE_MS = 500
  const questionNotificationDebounceTimers = new Map()
  const permissionNotificationDebounceTimers = new Map()
  // Questions already answered or dismissed, keyed `sessionID:requestID`. The flush below deletes its debounce
  // entry before it starts awaiting the settings read and the template variables (which can run a git command), so
  // a reply that lands mid-flush finds nothing left to cancel and the ask was still announced — seconds after the
  // user answered it. The key carries the request because a *new* question in the same session is a different
  // question: a session-wide mark cleared by the next ask let the first, already answered flush through.
  const answeredQuestions = new Set()
  // Bounded like the permission dedupe window: a question answered long ago needs no mark.
  const ANSWERED_QUESTIONS_MAX = 500
  // An ask the runtime sent without an id has no key of its own, so the session is the only handle its answer can
  // carry: this is the mark such an ask's flush checks. The next *unkeyed* ask in that session clears it, because
  // that is a different question — a keyed ask never consults it.
  const answeredQuestionSessions = new Set()
  // Both an ask and its reply carry this id, and it is what the mark is keyed by. A reply that arrives without one
  // cannot be attributed to a keyed ask (the permission path documents the same possibility); its answer is
  // recorded against the ask the session has pending, or against the session when that ask has no id either.
  const questionRequestKey = (sessionId, requestId) =>
    typeof sessionId === "string" && sessionId && typeof requestId === "string" && requestId
      ? `${sessionId}:${requestId}`
      : null
  const rememberAnsweredQuestionKey = (key) => {
    if (!key) return
    if (answeredQuestions.size >= ANSWERED_QUESTIONS_MAX) {
      const oldest = answeredQuestions.values().next().value
      if (typeof oldest === "string") {
        answeredQuestions.delete(oldest)
      }
    }
    answeredQuestions.add(key)
  }
  const rememberAnsweredQuestionSession = (sessionId) => {
    if (!sessionId) return
    if (answeredQuestionSessions.size >= ANSWERED_QUESTIONS_MAX) {
      const oldest = answeredQuestionSessions.values().next().value
      if (typeof oldest === "string") {
        answeredQuestionSessions.delete(oldest)
      }
    }
    answeredQuestionSessions.add(sessionId)
  }
// Distinguishes the asks a runtime sends without an id, which share no other key.
let unkeyedPermissionAskSequence = 0
  const notifiedPermissionRequests = new Set()
  // Requests the user has already answered. The flush below deletes its debounce entry before it
  // starts awaiting, so a reply that lands mid-flush finds nothing to cancel and the ask would still
  // be announced — seconds after the user answered it.
  const repliedPermissionRequests = new Set()
  // Unique request keys accumulate for the life of the process; keep the dedupe
  // window bounded. A request older than the cap is long answered.
  const NOTIFIED_PERMISSION_REQUESTS_MAX = 500
  const rememberNotifiedPermissionRequest = (requestKey) => {
    if (!requestKey) return
    if (notifiedPermissionRequests.size >= NOTIFIED_PERMISSION_REQUESTS_MAX) {
      const oldest = notifiedPermissionRequests.values().next().value
      if (typeof oldest === "string") {
        notifiedPermissionRequests.delete(oldest)
      }
    }
    notifiedPermissionRequests.add(requestKey)
  }
  const rememberRepliedPermissionRequest = (requestKey) => {
    if (!requestKey) return
    if (repliedPermissionRequests.size >= NOTIFIED_PERMISSION_REQUESTS_MAX) {
      const oldest = repliedPermissionRequests.values().next().value
      if (typeof oldest === "string") {
        repliedPermissionRequests.delete(oldest)
      }
    }
    repliedPermissionRequests.add(requestKey)
  }
  const lastReadyNotificationAt = new Map()

  const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "")

  const sessionParentIdCache = new Map()
  const SESSION_PARENT_CACHE_TTL_MS = 60 * 1000

  // Sessions where the client has enabled Permission Auto-Accept. Mirrored
  // from the client-side permissionStore via POST /api/notifications/auto-accept
  // so the server can suppress permission notifications BEFORE dispatch (the
  // 500ms debounce race otherwise leaks notifications for auto-accepted
  // permissions when the replied round-trip is slower than the debounce).
  const autoAcceptingSessions = new Set()
  const setAutoAcceptSession = (sessionId, enabled) => {
    if (typeof sessionId !== "string" || sessionId.length === 0) return
    if (enabled) {
      autoAcceptingSessions.add(sessionId)
    } else {
      autoAcceptingSessions.delete(sessionId)
    }
  }

  const getCachedSessionParentId = (sessionId) => {
    const entry = sessionParentIdCache.get(sessionId)
    if (!entry) return undefined
    if (Date.now() - entry.at > SESSION_PARENT_CACHE_TTL_MS) {
      sessionParentIdCache.delete(sessionId)
      return undefined
    }
    return entry.parentID
  }

  const setCachedSessionParentId = (sessionId, parentID) => {
    // A root session's negative answer is worth caching too: without it every
    // notification trigger re-fetches the full session list (and a parent-chain walk
    // pays one such fetch per hop).
    setCappedCacheEntry(sessionParentIdCache, sessionId, { parentID: parentID ?? null, at: Date.now() })
  }

  const getParentIdFromPayload = (payload) => {
    if (!payload || typeof payload !== "object") return null
    if (payload.type !== "session.created" && payload.type !== "session.updated") return null
    const parentID = payload.properties?.info?.parentID ?? null
    return typeof parentID === "string" && parentID.length > 0 ? parentID : null
  }

  const maybeCacheSessionParentFromPayload = (payload) => {
    const sessionId = extractSessionIdFromPayload(payload)
    if (typeof sessionId !== "string" || sessionId.length === 0) return
    const parentID = getParentIdFromPayload(payload)
    if (parentID) {
      setCachedSessionParentId(sessionId, parentID)
    }
  }

  const fetchSessionParentId = async (sessionId) => {
    if (!sessionId) return undefined

    const cached = getCachedSessionParentId(sessionId)
    if (cached !== undefined) return cached

    try {
      const response = await fetch(buildAxCodeUrl("/session", ""), {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...getAxCodeAuthHeaders(),
        },
        signal: AbortSignal.timeout(2000),
      })
      if (!response.ok) {
        response.body?.cancel()
        return undefined
      }
      const data = await response.json().catch(() => null)
      const sessions = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : null
      if (!sessions) {
        return undefined
      }

      const match = sessions.find((session) => session && typeof session === "object" && session.id === sessionId)
      const parentID = match?.parentID ?? null
      setCachedSessionParentId(sessionId, parentID)
      return parentID
    } catch {
      return undefined
    }
  }

  // Mirrors client-side autoRespondsPermission: a session auto-accepts if it
  // OR any ancestor is flagged. Walks the parent chain via fetchSessionParentId.
  const isSessionAutoAccepting = async (sessionId) => {
    if (!sessionId || autoAcceptingSessions.size === 0) return false
    let current = sessionId
    const seen = new Set()
    while (!seen.has(current)) {
      if (autoAcceptingSessions.has(current)) return true
      seen.add(current)
      const parent = await fetchSessionParentId(current)
      if (!parent) return false
      current = parent
    }
    return false
  }

  const extractSessionIdFromPayload = (payload) => {
    if (!payload || typeof payload !== "object") return null
    const props = payload.properties
    const info = props?.info
    const sessionId =
      info?.sessionID ?? info?.sessionId ?? props?.sessionID ?? props?.sessionId ?? props?.session ?? null
    return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null
  }

  // One ask's notification work, run once per pending entry at the debounce flush.
  const flushPermissionAsk = async (sessionId, requestKey, payload, tagKey = requestKey) => {
    if (await isSessionAutoAccepting(sessionId)) {
      rememberNotifiedPermissionRequest(requestKey)
      return
    }

    const settings = await readSettingsFromDisk()

    // The permission toggle, not the question one: the server is the only notifier while the window is unfocused
    // (the client watcher covers an unfocused session on a focused window), so gating this on `notifyOnQuestion`
    // both suppressed a permission ask for a user who had only turned questions off and announced one for a user
    // who had turned permissions off.
    if (settings.notifyOnPermission === false) {
      return
    }

    if (settings.notificationMode !== "always" && getIsWindowFocused?.()) {
      return
    }

    const sessionTitle = payload.properties?.sessionTitle
    const permission = payload.properties?.permission
    const permissionText = typeof permission === "string" && permission.length > 0 ? permission : ""
    const fallbackMessage = asTrimmedString(sessionTitle) || permissionText || "Agent is waiting for your approval"

    let title = "Permission required"
    let body = fallbackMessage

    try {
      const variables = await buildTemplateVariables(payload, sessionId)
      variables.last_message = fallbackMessage

      const templates = settings.notificationTemplates || {}
      const questionTemplate = templates.question || { title: "Permission required", message: "{last_message}" }

      const resolvedTitle = resolveNotificationTemplate(questionTemplate.title, variables)
      const resolvedBody = resolveNotificationTemplate(questionTemplate.message, variables)
      if (resolvedTitle) title = resolvedTitle
      if (shouldApplyResolvedTemplateMessage(questionTemplate.message, resolvedBody, variables)) body = resolvedBody
    } catch (error) {
      console.warn("[Notification] Permission template resolution failed, using defaults:", error?.message || error)
    }

    // Checked here as well as in the reply handler: the reply may have arrived while this flush was
    // awaiting the template variables or the settings read.
    if (requestKey && repliedPermissionRequests.has(requestKey)) {
      return
    }

    // The tag is what the notification sink replaces on: an ask the runtime sent without an id is still its
    // own notification, so it carries the key that distinguishes it rather than the session's.
    const tag = tagKey ? `permission-${tagKey}` : `permission-${sessionId}`

    if (settings.nativeNotificationsEnabled) {
      emitDesktopNotification({
        kind: "permission",
        title,
        body,
        tag,
        sessionId,
        requireHidden: settings.notificationMode !== "always",
      })

      broadcastUiNotification({
        kind: "permission",
        title,
        body,
        tag,
        sessionId,
        requireHidden: settings.notificationMode !== "always",
      })
    }

    rememberNotifiedPermissionRequest(requestKey)
  }

  const maybeDispatchNotificationForTrigger = async (payload) => {
    if (!payload || typeof payload !== "object") {
      return
    }

    maybeCacheSessionParentFromPayload(payload)

    const sessionId = extractSessionIdFromPayload(payload)
    if (payload.type === "message.updated") {
      const info = payload.properties?.info
      if (info?.role === "assistant" && info?.finish === "stop" && sessionId) {
        const settings = await readSettingsFromDisk()

        if (settings.notifyOnSubtasks === false) {
          const parentIDFromPayload = getParentIdFromPayload(payload)
          const parentID = parentIDFromPayload ? parentIDFromPayload : await fetchSessionParentId(sessionId)

          if (parentID) {
            return
          }
        }

        if (settings.notifyOnCompletion === false) {
          return
        }

        if (settings.notificationMode !== "always" && getIsWindowFocused?.()) {
          return
        }

        const now = Date.now()
        const lastAt = lastReadyNotificationAt.get(sessionId) ?? 0
        if (now - lastAt < READY_NOTIFICATION_COOLDOWN_MS) {
          return
        }
        setCappedCacheEntry(lastReadyNotificationAt, sessionId, now)

        let title = `${formatNotificationModeLabel(info?.mode)} agent is ready`
        let body = `${formatNotificationModelLabel(info?.modelID)} completed the task`

        try {
          const templates = settings.notificationTemplates || {}
          const isSubtask = await fetchSessionParentId(sessionId)
          const completionTemplate =
            isSubtask && settings.notifyOnSubtasks !== false
              ? templates.subtask ||
                templates.completion || { title: "{agent_name} is ready", message: "{model_name} completed the task" }
              : templates.completion || { title: "{agent_name} is ready", message: "{model_name} completed the task" }

          const variables = await buildTemplateVariables(payload, sessionId)

          const messageId = info?.id
          let lastMessage = extractLastMessageText(payload)
          if (!lastMessage) {
            lastMessage = await fetchLastAssistantMessageText(sessionId, messageId)
          }

          variables.last_message = await prepareNotificationLastMessage({
            message: lastMessage,
            settings,
          })

          const resolvedTitle = resolveNotificationTemplate(completionTemplate.title, variables)
          const resolvedBody = resolveNotificationTemplate(completionTemplate.message, variables)
          if (resolvedTitle) title = resolvedTitle
          if (shouldApplyResolvedTemplateMessage(completionTemplate.message, resolvedBody, variables))
            body = resolvedBody
        } catch (error) {
          console.warn("[Notification] Template resolution failed, using defaults:", error?.message || error)
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            title,
            body,
            tag: `ready-${sessionId}`,
            kind: "ready",
            sessionId,
            requireHidden: settings.notificationMode !== "always",
          }
          emitDesktopNotification(notificationPayload)
          broadcastUiNotification(notificationPayload)
        }
      }

      if (info?.role === "assistant" && info?.finish === "error" && sessionId) {
        const settings = await readSettingsFromDisk()
        if (settings.notifyOnError === false) return

        if (settings.notificationMode !== "always" && getIsWindowFocused?.()) {
          return
        }

        let title = "Tool error"
        let body = "An error occurred"

        try {
          const variables = await buildTemplateVariables(payload, sessionId)
          const errorMessageId = info?.id
          let lastMessage = extractLastMessageText(payload)
          if (!lastMessage) {
            lastMessage = await fetchLastAssistantMessageText(sessionId, errorMessageId)
          }

          variables.last_message = await prepareNotificationLastMessage({
            message: lastMessage,
            settings,
          })

          const errorTemplate = (settings.notificationTemplates || {}).error || {
            title: "Tool error",
            message: "{last_message}",
          }
          const resolvedTitle = resolveNotificationTemplate(errorTemplate.title, variables)
          const resolvedBody = resolveNotificationTemplate(errorTemplate.message, variables)
          if (resolvedTitle) title = resolvedTitle
          if (shouldApplyResolvedTemplateMessage(errorTemplate.message, resolvedBody, variables)) body = resolvedBody
        } catch (error) {
          console.warn("[Notification] Error template resolution failed, using defaults:", error?.message || error)
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            title,
            body,
            tag: `error-${sessionId}`,
            kind: "error",
            sessionId,
            requireHidden: settings.notificationMode !== "always",
          }
          emitDesktopNotification(notificationPayload)
          broadcastUiNotification(notificationPayload)
        }
      }

      return
    }

    if ((payload.type === "question.replied" || payload.type === "question.rejected") && sessionId) {
      const requestId = payload.properties?.requestID ?? payload.properties?.requestId ?? payload.properties?.id
      const requestKey = questionRequestKey(sessionId, requestId)
      const pendingNotification = questionNotificationDebounceTimers.get(sessionId)
      // The ask the session has in hand: pending in its debounce window, or already being announced — its entry
      // outlives the flush for exactly this. There is at most one, and a reply without an id can only be answering
      // that one.
      const askKey = pendingNotification ? pendingNotification.requestKey : null
      // The key this answer belongs to: the reply's own when it carries one, the ask's otherwise. A reply with no
      // id leaves a keyed ask's mark unset, and a reply with an id leaves an unkeyed ask's unset, so the ask's key
      // decides both cases.
      const answeredKey = requestKey ?? askKey
      if (answeredKey) {
        rememberAnsweredQuestionKey(answeredKey)
      }
      if (askKey == null) {
        // Nothing keys the ask being answered, so the session is the only mark its flush consults. The next
        // unkeyed ask clears it, since that is a different question.
        rememberAnsweredQuestionSession(sessionId)
      }
      // A flush that has not started yet is called off here; one already awaiting is stopped by the mark above.
      if (pendingNotification) {
        clearTimeout(pendingNotification.timer)
        questionNotificationDebounceTimers.delete(sessionId)
      }
      return
    }

    if (payload.type === "question.asked" && sessionId) {
      const askKey = questionRequestKey(sessionId, payload.properties?.id)
      // An ask with no id of its own is a new question the session-level mark does not cover.
      if (!askKey) {
        answeredQuestionSessions.delete(sessionId)
      }
      const existingTimer = questionNotificationDebounceTimers.get(sessionId)
      if (existingTimer) {
        clearTimeout(existingTimer.timer)
      }

      const timer = setTimeout(() => {
        // The body is asynchronous and nothing observes a rejection from a timer: an
        // unreadable or corrupt settings file escaped it as an unhandled rejection, which
        // Node's default turns into a process exit for the whole server.
        void (async () => {
        const settings = await readSettingsFromDisk()
        if (settings.notifyOnQuestion === false) {
          return
        }

        if (settings.notificationMode !== "always" && getIsWindowFocused?.()) {
          return
        }

        const firstQuestion = payload.properties?.questions?.[0]
        const header = asTrimmedString(firstQuestion?.header)
        const questionText = asTrimmedString(firstQuestion?.question)

        let title = /plan\s*mode/i.test(header)
          ? "Switch to plan mode"
          : /build\s*agent/i.test(header)
            ? "Switch to build mode"
            : header || "Input needed"
        let body = questionText || "Agent is waiting for your response"

        try {
          const variables = await buildTemplateVariables(payload, sessionId)
          variables.last_message = questionText || header || ""

          const templates = settings.notificationTemplates || {}
          const questionTemplate = templates.question || { title: "Input needed", message: "{last_message}" }

          const resolvedTitle = resolveNotificationTemplate(questionTemplate.title, variables)
          const resolvedBody = resolveNotificationTemplate(questionTemplate.message, variables)
          if (resolvedTitle) title = resolvedTitle
          if (shouldApplyResolvedTemplateMessage(questionTemplate.message, resolvedBody, variables)) body = resolvedBody
        } catch (error) {
          console.warn("[Notification] Question template resolution failed, using defaults:", error?.message || error)
        }

        // Checked here as well as in the reply handler: the answer may have arrived while this flush was awaiting
        // the settings read or the template variables. An ask with an id is checked against its own key, so a later
        // question in the same session does not let an answered flush through; an ask without one has nothing but
        // the session, and the reply handler marks that.
        const requestKey = questionRequestKey(sessionId, payload.properties?.id)
        if (requestKey ? answeredQuestions.has(requestKey) : answeredQuestionSessions.has(sessionId)) {
          return
        }

        if (settings.nativeNotificationsEnabled) {
          emitDesktopNotification({
            kind: "question",
            title,
            body,
            tag: `question-${sessionId}`,
            sessionId,
            requireHidden: settings.notificationMode !== "always",
          })

          broadcastUiNotification({
            kind: "question",
            title,
            body,
            tag: `question-${sessionId}`,
            sessionId,
            requireHidden: settings.notificationMode !== "always",
          })
        }
        })()
          .catch((error) => {
            console.warn("[Notification] Question notification failed:", error?.message || error)
          })
          .finally(() => {
            // The entry outlives the flush so a reply can still be attributed to the ask it belongs to. Only this
            // ask's own entry is cleared: a new ask for the session replaced it, and that one has its own flush.
            if (questionNotificationDebounceTimers.get(sessionId)?.timer === timer) {
              questionNotificationDebounceTimers.delete(sessionId)
            }
          })
      }, QUESTION_NOTIFICATION_DEBOUNCE_MS)

      questionNotificationDebounceTimers.set(sessionId, { timer, requestKey: askKey })
      return
    }

    if (payload.type === "permission.replied" && sessionId) {
      const requestId = payload.properties?.requestID ?? payload.properties?.requestId ?? payload.properties?.id
      const requestKey = typeof requestId === "string" ? `${sessionId}:${requestId}` : null
      rememberRepliedPermissionRequest(requestKey)
      const pendingNotification = permissionNotificationDebounceTimers.get(sessionId)
      if (!pendingNotification) {
        return
      }

      // Some runtimes may omit requestID on permission.replied.
      // When request ID is missing, clear session debounce to avoid
      // showing stale permission notifications for auto-approved prompts.
      if (!requestKey) {
        clearTimeout(pendingNotification.timer)
        permissionNotificationDebounceTimers.delete(sessionId)
        return
      }

      // Drop only the replied ask: the debounce entry holds every ask from the
      // current window, and the unreplied ones still need their notification.
      pendingNotification.pending.delete(requestKey)
      if (pendingNotification.pending.size === 0) {
        clearTimeout(pendingNotification.timer)
        permissionNotificationDebounceTimers.delete(sessionId)
      }
      return
    }

    if (payload.type === "permission.asked" && sessionId) {
      const requestId = payload.properties?.id ?? payload.properties?.requestID ?? payload.properties?.requestId
      const requestKey = typeof requestId === "string" ? `${sessionId}:${requestId}` : null
      if (requestKey && notifiedPermissionRequests.has(requestKey)) {
        return
      }

      // Register the debounce entry BEFORE any await: the auto-accept check used
      // to run first, and a permission.replied (which can carry no requestID)
      // landing in that window found no pending entry and left nothing behind —
      // the flush then still notified for an already-answered ask. The flush
      // below performs the same auto-accept check, so no prompt is lost either
      // way.
      const existing = permissionNotificationDebounceTimers.get(sessionId)
      if (existing) {
        clearTimeout(existing.timer)
      }
      // Coalesce the debounce window's timing, not its asks: replacing the pending
      // entry used to drop the earlier ask's notification, so only the last one in a
      // burst ever reached the user.
      const pending = existing?.pending ?? new Map()
      // An ask without an id cannot be matched to its reply, but it must not collapse onto the same key as
      // another one either: the map is here so a burst reaches the user in full, and a constant fallback
      // key held one entry for the whole session.
      pending.set(requestKey ?? `unkeyed:${sessionId}:${(unkeyedPermissionAskSequence += 1)}`, payload)

      const timer = setTimeout(() => {
        // Same reason as the question ask above: `flushPermissionAsk` awaits the settings
        // read, and a rejection from inside a timer has nowhere to go.
        void (async () => {
          permissionNotificationDebounceTimers.delete(sessionId)

          if (await isSessionAutoAccepting(sessionId)) {
            for (const key of pending.keys()) {
              rememberNotifiedPermissionRequest(key.startsWith("unkeyed:") ? null : key)
            }
            return
          }

          for (const [pendingKey, pendingPayload] of pending) {
            const unkeyed = pendingKey.startsWith("unkeyed:")
            await flushPermissionAsk(sessionId, unkeyed ? null : pendingKey, pendingPayload, pendingKey)
          }
        })().catch((error) => {
          console.warn("[Notification] Permission notification failed:", error?.message || error)
        })
      }, PERMISSION_NOTIFICATION_DEBOUNCE_MS)

      permissionNotificationDebounceTimers.set(sessionId, { timer, pending })
    }
  }

  return {
    maybeDispatchNotificationForTrigger,
    setAutoAcceptSession,
    setGetIsWindowFocused,
  }
}
