import React from "react"

import type { ChatMessageEntry } from "../lib/turns/types"
import type { MessageListHandle } from "../MessageList"
import { projectDisplayMessages } from "../lib/turns/projectDisplayMessages"
import { TURN_WINDOW_DEFAULTS } from "../lib/turns/constants"
import {
  buildTurnWindowModel,
  clampTurnStart,
  getInitialTurnStart,
  updateTurnWindowModelIncremental,
  windowMessagesByTurn,
  type TurnWindowModel,
} from "../lib/turns/windowTurns"
import { recallTurnModel, rememberTurnModel } from "./turnModelCache"
import type { TurnHistorySignals } from "../lib/turns/historySignals"
import { getMemoryLimits } from "@/stores/types/sessionTypes"
import type { GoToBottomOptions } from "@/hooks/useChatAutoFollow"

type TimelineViewportAnchor = { messageId: string; offsetTop: number }

type TimelineHistoryMeta = {
  limit: number
  complete: boolean
  loading: boolean
}

type PendingScrollRequest = {
  sessionId: string
  kind: "turn" | "message"
  id: string
  behavior: ScrollBehavior
  turnId: string | null
  resolve: (value: boolean) => void
}

interface UseChatTimelineControllerOptions {
  sessionId: string | null
  messages: ChatMessageEntry[]
  historyMeta: TimelineHistoryMeta | null
  scrollRef: React.RefObject<HTMLDivElement | null>
  messageListRef: React.RefObject<MessageListHandle | null>
  loadMoreMessages: (sessionId: string, direction: "up" | "down") => Promise<void>
  goToBottom: (mode?: "instant" | "smooth", options?: GoToBottomOptions) => void
  releaseAutoFollow: () => void
  notePrependedMessages?: (prependedCount: number) => void
  isPinned: boolean
  showScrollButton: boolean
}

interface UseChatTimelineControllerResult {
  turnIds: string[]
  turnStart: number
  renderedMessages: ChatMessageEntry[]
  historySignals: TurnHistorySignals
  isLoadingOlder: boolean
  pendingRevealWork: boolean
  activeTurnId: string | null
  showScrollToBottom: boolean
  turnWindowModel: TurnWindowModel
  loadEarlier: (options?: { userInitiated?: boolean }) => Promise<void>
  revealBufferedTurns: () => Promise<boolean>
  resumeToBottom: () => void
  resumeToBottomInstant: (options?: Pick<GoToBottomOptions, "reason">) => Promise<void>
  scrollToTurn: (turnId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>
  scrollToMessage: (messageId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>
  handleHistoryScroll: () => void
  captureViewportAnchor: () => TimelineViewportAnchor | null
  restoreViewportAnchor: (anchor: TimelineViewportAnchor) => boolean
  handleActiveTurnChange: (turnId: string | null) => void
}

const HISTORY_SCROLL_THRESHOLD = 200
const HISTORY_RENDER_WAIT_TIMEOUT_MS = 250
const HISTORY_INTERACTION_GUARD_MS = 2000

export const useChatTimelineController = ({
  sessionId,
  messages,
  historyMeta,
  scrollRef,
  messageListRef,
  loadMoreMessages,
  goToBottom,
  releaseAutoFollow,
  notePrependedMessages,
  isPinned,
  showScrollButton,
}: UseChatTimelineControllerOptions): UseChatTimelineControllerResult => {
  const previousTurnWindowModelRef = React.useRef<TurnWindowModel | null>(null)
  const previousMessagesRef = React.useRef<ChatMessageEntry[] | null>(null)
  // MessageList renders the display projection (clientRole overrides and hidden bridge
  // rows), so navigation and its turn model must be built from that same list. Otherwise
  // a visible projected turn, such as a compaction command shown as a user turn, would be
  // absent from turnIds and ArrowUp/ArrowDown, hashes or the scroll spy would miss it.
  const displayMessages = React.useMemo(() => projectDisplayMessages(messages), [messages])
  const turnWindowModel = React.useMemo(() => {
    const key = sessionId ?? ""
    const cached = key ? recallTurnModel(key, displayMessages) : undefined
    if (cached) {
      previousTurnWindowModelRef.current = cached
      previousMessagesRef.current = displayMessages
      return cached
    }

    const incrementalModel = updateTurnWindowModelIncremental(
      previousTurnWindowModelRef.current,
      previousMessagesRef.current,
      displayMessages,
    )
    const nextModel = incrementalModel ?? buildTurnWindowModel(displayMessages)
    previousTurnWindowModelRef.current = nextModel
    previousMessagesRef.current = displayMessages

    if (key && displayMessages.length > 0) {
      rememberTurnModel(key, displayMessages, nextModel)
    }

    return nextModel
  }, [displayMessages, sessionId])

  const [turnStart, setTurnStart] = React.useState(() => getInitialTurnStart(turnWindowModel.turnCount))
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false)
  const [pendingRevealWork, setPendingRevealWork] = React.useState(false)
  const [activeTurnId, setActiveTurnId] = React.useState<string | null>(null)

  const turnModelRef = React.useRef(turnWindowModel)
  const turnStartRef = React.useRef(turnStart)
  const isPinnedRef = React.useRef(isPinned)
  const isLoadingOlderRef = React.useRef(isLoadingOlder)
  const pendingRevealWorkRef = React.useRef(pendingRevealWork)
  const sessionIdRef = React.useRef<string | null>(sessionId)
  const messagesRef = React.useRef(messages)
  const historyMetaRef = React.useRef<TimelineHistoryMeta | null>(historyMeta)
  const previousTurnCountRef = React.useRef(turnWindowModel.turnCount)
  const initializedSessionRef = React.useRef<string | null>(null)
  const pendingRenderResolversRef = React.useRef<Array<() => void>>([])
  const pendingScrollRequestRef = React.useRef<PendingScrollRequest | null>(null)
  const historyInteractionRef = React.useRef(false)
  const historyInteractionTimerRef = React.useRef<number | null>(null)

  const historySignals = React.useMemo(() => {
    const defaultLimit = getMemoryLimits().HISTORICAL_MESSAGES
    const hasBufferedTurns = turnStart > 0
    const hasMoreAboveTurns = historyMeta ? !historyMeta.complete : messages.length >= defaultLimit
    const historyLoading = Boolean(historyMeta?.loading)
    return {
      hasBufferedTurns,
      hasMoreAboveTurns,
      historyLoading,
      canLoadEarlier: hasBufferedTurns || hasMoreAboveTurns,
    }
  }, [historyMeta, messages.length, turnStart])

  const historySignalsRef = React.useRef(historySignals)

  turnModelRef.current = turnWindowModel
  turnStartRef.current = turnStart
  isPinnedRef.current = isPinned
  isLoadingOlderRef.current = isLoadingOlder
  pendingRevealWorkRef.current = pendingRevealWork
  historySignalsRef.current = historySignals
  sessionIdRef.current = sessionId
  messagesRef.current = messages
  historyMetaRef.current = historyMeta

  const beginHistoryInteraction = React.useCallback(() => {
    historyInteractionRef.current = true
    if (historyInteractionTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(historyInteractionTimerRef.current)
      historyInteractionTimerRef.current = null
    }
  }, [])

  const settleHistoryInteraction = React.useCallback(() => {
    if (typeof window === "undefined") {
      historyInteractionRef.current = false
      return
    }

    if (historyInteractionTimerRef.current !== null) {
      window.clearTimeout(historyInteractionTimerRef.current)
    }
    historyInteractionTimerRef.current = window.setTimeout(() => {
      historyInteractionTimerRef.current = null
      historyInteractionRef.current = false
    }, HISTORY_INTERACTION_GUARD_MS)
  }, [])

  React.useLayoutEffect(() => {
    if (initializedSessionRef.current === sessionId) {
      return
    }
    if (historyInteractionTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(historyInteractionTimerRef.current)
      historyInteractionTimerRef.current = null
    }
    historyInteractionRef.current = false
    initializedSessionRef.current = sessionId
    setTurnStart(getInitialTurnStart(turnWindowModel.turnCount))
    setIsLoadingOlder(false)
    setPendingRevealWork(false)
    setActiveTurnId(null)
    previousTurnCountRef.current = turnWindowModel.turnCount
  }, [sessionId, turnWindowModel.turnCount])

  React.useLayoutEffect(() => {
    setTurnStart((current) => clampTurnStart(current, turnWindowModel.turnCount))
  }, [turnWindowModel.turnCount])

  React.useLayoutEffect(() => {
    const previousTurnCount = previousTurnCountRef.current
    const nextTurnCount = turnWindowModel.turnCount
    if (previousTurnCount === nextTurnCount) {
      return
    }

    setTurnStart((current) => {
      const previousInitial = getInitialTurnStart(previousTurnCount)
      const nextInitial = getInitialTurnStart(nextTurnCount)
      if (
        !historyInteractionRef.current &&
        !isLoadingOlderRef.current &&
        !pendingRevealWorkRef.current &&
        isPinnedRef.current &&
        current === previousInitial
      ) {
        return nextInitial
      }
      return clampTurnStart(current, nextTurnCount)
    })

    previousTurnCountRef.current = nextTurnCount
  }, [turnWindowModel.turnCount])

  const resolvePendingRenderWaiters = React.useCallback(() => {
    const resolvers = pendingRenderResolversRef.current
    if (resolvers.length === 0) {
      return
    }
    pendingRenderResolversRef.current = []
    resolvers.forEach((resolve) => resolve())
  }, [])

  const waitForNextRenderCommit = React.useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      pendingRenderResolversRef.current.push(resolve)
    })
  }, [])

  const waitForNextRenderCommitOrTimeout = React.useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined") {
        resolve()
        return
      }

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }
      pendingRenderResolversRef.current.push(finish)
      const timer = window.setTimeout(finish, HISTORY_RENDER_WAIT_TIMEOUT_MS)
    })
  }, [])

  const resolvePendingScrollRequest = React.useCallback((value: boolean) => {
    const pending = pendingScrollRequestRef.current
    if (!pending) {
      return
    }
    pendingScrollRequestRef.current = null
    pending.resolve(value)
  }, [])

  const attemptPendingScrollRequest = React.useCallback(() => {
    const pending = pendingScrollRequestRef.current
    if (!pending) {
      return
    }

    if (pending.sessionId !== sessionIdRef.current) {
      resolvePendingScrollRequest(false)
      return
    }

    const finish = (didScroll: boolean) => {
      if (pendingScrollRequestRef.current !== pending) return
      if (didScroll) {
        if (pending.turnId) setActiveTurnId(pending.turnId)
        resolvePendingScrollRequest(true)
        return
      }

      const targetIndex =
        pending.kind === "turn"
          ? turnModelRef.current.turnIndexById.get(pending.id)
          : turnModelRef.current.messageToTurnIndex.get(pending.id)

      if (typeof targetIndex === "number" && targetIndex >= turnStartRef.current) {
        resolvePendingScrollRequest(false)
      }
    }

    const outcome =
      pending.kind === "turn"
        ? (messageListRef.current?.scrollToTurnId(pending.id, { behavior: pending.behavior }) ?? false)
        : (messageListRef.current?.scrollToMessageId(pending.id, { behavior: pending.behavior }) ?? false)

    if (typeof outcome === "boolean") {
      finish(outcome)
      return
    }
    void outcome.then(finish)
  }, [messageListRef, resolvePendingScrollRequest])

  React.useEffect(() => {
    return () => {
      if (historyInteractionTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(historyInteractionTimerRef.current)
        historyInteractionTimerRef.current = null
      }
      resolvePendingRenderWaiters()
      resolvePendingScrollRequest(false)
    }
  }, [resolvePendingRenderWaiters, resolvePendingScrollRequest])

  const renderedMessages = React.useMemo(() => {
    return windowMessagesByTurn(displayMessages, turnWindowModel, turnStart)
  }, [displayMessages, turnStart, turnWindowModel])

  React.useLayoutEffect(() => {
    resolvePendingRenderWaiters()
    attemptPendingScrollRequest()
  }, [attemptPendingScrollRequest, renderedMessages, resolvePendingRenderWaiters, turnStart])

  // --- Synchronous scroll compensation for load-more / reveal ---
  // fetchOlderHistory and revealBufferedTurns store a snapshot here
  // before triggering the state change. useLayoutEffect consumes it
  // after React commits new DOM — before the browser paints.
  // "fetch" snapshots are captured before the network request finishes, so
  // unrelated streaming commits land first; they are consumed only by the
  // commit that actually prepends older messages, and discarded otherwise.
  const prePrependScrollRef = React.useRef<{
    height: number
    top: number
    anchor: TimelineViewportAnchor | null
    kind: "reveal" | "fetch"
    sessionId: string | null
    oldestMessageId: string | null
  } | null>(null)

  const captureViewportAnchor = React.useCallback((): TimelineViewportAnchor | null => {
    return messageListRef.current?.captureViewportAnchor() ?? null
  }, [messageListRef])

  const restoreViewportAnchor = React.useCallback(
    (anchor: TimelineViewportAnchor): boolean => {
      return messageListRef.current?.restoreViewportAnchor(anchor) ?? false
    },
    [messageListRef],
  )

  React.useLayoutEffect(() => {
    const snap = prePrependScrollRef.current
    const container = scrollRef.current
    if (!snap || !container) return

    if (snap.kind === "fetch") {
      // The snapshot predates the history fetch; skip commits that are not the
      // prepend (streaming updates, session switches) and keep waiting.
      if (sessionIdRef.current !== snap.sessionId) return
      const currentOldestMessageId = messagesRef.current[0]?.info?.id ?? null
      if (currentOldestMessageId === snap.oldestMessageId) return
    }
    prePrependScrollRef.current = null

    // When a viewport anchor is available, delegate to MessageList
    // restoreViewportAnchor which falls back to virtualizer-aware
    // scrollHistoryIndexIntoView when the element is not in the DOM.
    if (snap.anchor && restoreViewportAnchor(snap.anchor)) {
      return
    }

    // Fallback: height-delta compensation
    const delta = container.scrollHeight - snap.height
    if (delta > 0) {
      container.scrollTop = snap.top + delta
    }
  }, [renderedMessages, scrollRef, restoreViewportAnchor])

  const revealBufferedTurns = React.useCallback(async (): Promise<boolean> => {
    if (turnStartRef.current <= 0 || pendingRevealWorkRef.current) {
      return false
    }

    const targetSessionId = sessionIdRef.current
    beginHistoryInteraction()
    const container = scrollRef.current
    if (container) {
      prePrependScrollRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop,
        anchor: captureViewportAnchor(),
        kind: "reveal",
        sessionId: targetSessionId,
        oldestMessageId: null,
      }
    }

    setPendingRevealWork(true)
    setTurnStart((current) => {
      const next = current - TURN_WINDOW_DEFAULTS.batchTurns
      return next > 0 ? next : 0
    })

    try {
      await waitForNextRenderCommit()
      if (sessionIdRef.current !== targetSessionId) {
        return false
      }
      return true
    } finally {
      setPendingRevealWork(false)
      settleHistoryInteraction()
    }
  }, [beginHistoryInteraction, captureViewportAnchor, scrollRef, settleHistoryInteraction, waitForNextRenderCommit])

  const fetchOlderHistory = React.useCallback(
    async (input: { preserveViewport: boolean }): Promise<boolean> => {
      if (!sessionIdRef.current || isLoadingOlderRef.current) {
        return false
      }
      if (!historySignalsRef.current.hasMoreAboveTurns) {
        return false
      }

      const container = scrollRef.current
      const beforeMessages = messagesRef.current
      const beforeMessageCount = beforeMessages.length
      const beforeOldestMessageId = beforeMessages[0]?.info?.id ?? null
      const beforeLimit = historyMetaRef.current?.limit ?? getMemoryLimits().HISTORICAL_MESSAGES

      // Store scroll snapshot BEFORE the fetch so useLayoutEffect can
      // compensate synchronously when React commits the new messages.
      let capturedSnap: (typeof prePrependScrollRef)["current"] = null
      if (input.preserveViewport && container) {
        capturedSnap = {
          height: container.scrollHeight,
          top: container.scrollTop,
          anchor: captureViewportAnchor(),
          kind: "fetch",
          sessionId: sessionIdRef.current,
          oldestMessageId: beforeOldestMessageId,
        }
        prePrependScrollRef.current = capturedSnap
      }

      beginHistoryInteraction()
      setIsLoadingOlder(true)

      let fetchTargetSessionId: string | null = null
      try {
        const targetSessionId = sessionIdRef.current
        fetchTargetSessionId = targetSessionId
        if (!targetSessionId) {
          return false
        }

        let loadedMessageCount = beforeMessageCount
        let loadedOldestMessageId = beforeOldestMessageId
        let loadedLimit = beforeLimit
        const beforeTurnCount = turnModelRef.current.turnCount

        while (true) {
          await loadMoreMessages(targetSessionId, "up")
          if (sessionIdRef.current !== targetSessionId) {
            return false
          }

          await waitForNextRenderCommitOrTimeout()
          if (sessionIdRef.current !== targetSessionId) {
            return false
          }

          const afterMessages = messagesRef.current
          const afterMessageCount = afterMessages.length
          const afterOldestMessageId = afterMessages[0]?.info?.id ?? null
          const afterLimit = historyMetaRef.current?.limit ?? loadedLimit
          const messageGrowth =
            afterMessageCount > loadedMessageCount ||
            (typeof loadedOldestMessageId === "string" &&
              typeof afterOldestMessageId === "string" &&
              loadedOldestMessageId !== afterOldestMessageId) ||
            afterLimit > loadedLimit
          const turnGrowth = turnModelRef.current.turnCount - beforeTurnCount

          if (turnGrowth > 0) {
            return true
          }
          if (!messageGrowth) {
            return false
          }
          if (!historySignalsRef.current.hasMoreAboveTurns) {
            return true
          }

          loadedMessageCount = afterMessageCount
          loadedOldestMessageId = afterOldestMessageId
          loadedLimit = afterLimit
        }
      } finally {
        // If the fetch produced no prepend (no growth, session switch, error),
        // the snapshot was never consumed — drop it so a later unrelated
        // prepend does not restore a stale viewport.
        if (capturedSnap && prePrependScrollRef.current === capturedSnap) {
          prePrependScrollRef.current = null
        }
        // Keep the auto-follow unseen baseline in step with what was prepended:
        // older history arriving at the top is not new unread activity. The array
        // can also grow at the tail while the fetch is in flight, so count only the
        // messages that landed before the previously-oldest one.
        if (sessionIdRef.current === fetchTargetSessionId) {
          const afterMessages = messagesRef.current
          const previousOldestIndex =
            typeof beforeOldestMessageId === "string"
              ? afterMessages.findIndex((message) => message.info?.id === beforeOldestMessageId)
              : -1
          const prependedCount =
            previousOldestIndex >= 0
              ? previousOldestIndex
              : beforeMessageCount === 0
                ? afterMessages.length - beforeMessageCount
                : 0
          if (prependedCount > 0) {
            notePrependedMessages?.(prependedCount)
          }
        }
        setIsLoadingOlder(false)
        settleHistoryInteraction()
      }
    },
    [
      beginHistoryInteraction,
      captureViewportAnchor,
      loadMoreMessages,
      notePrependedMessages,
      scrollRef,
      settleHistoryInteraction,
      waitForNextRenderCommitOrTimeout,
    ],
  )

  const loadEarlier = React.useCallback(
    async (options?: { userInitiated?: boolean }) => {
      beginHistoryInteraction()
      if (options?.userInitiated) {
        releaseAutoFollow()
      }

      try {
        if (await revealBufferedTurns()) {
          return
        }

        void (await fetchOlderHistory({ preserveViewport: true }))
      } finally {
        settleHistoryInteraction()
      }
    },
    [beginHistoryInteraction, fetchOlderHistory, releaseAutoFollow, revealBufferedTurns, settleHistoryInteraction],
  )

  const handleHistoryScroll = React.useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    if (isPinnedRef.current) return
    if (container.scrollTop >= HISTORY_SCROLL_THRESHOLD) return
    if (!historySignalsRef.current.canLoadEarlier) return
    if (isLoadingOlderRef.current || pendingRevealWorkRef.current) return

    void loadEarlier({ userInitiated: true })
  }, [loadEarlier, scrollRef])

  React.useEffect(() => {
    if (!sessionId || isLoadingOlder || pendingRevealWork) {
      return
    }
    if (!isPinned || !historySignals.canLoadEarlier) {
      return
    }
    if (typeof window === "undefined") {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!container) return
      if (!isPinnedRef.current) return
      if (!historySignalsRef.current.canLoadEarlier) return
      if (isLoadingOlderRef.current || pendingRevealWorkRef.current) return
      if (container.scrollHeight > container.clientHeight + 1) return

      void loadEarlier()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    historySignals.canLoadEarlier,
    isLoadingOlder,
    isPinned,
    loadEarlier,
    pendingRevealWork,
    renderedMessages.length,
    scrollRef,
    sessionId,
  ])

  const scrollToTurn = React.useCallback(
    async (turnId: string, options?: { behavior?: ScrollBehavior }): Promise<boolean> => {
      if (!turnId || !sessionIdRef.current) {
        return false
      }

      setPendingRevealWork(true)

      try {
        if (sessionIdRef.current !== sessionId) {
          return false
        }

        const turnIndex = turnModelRef.current.turnIndexById.get(turnId)
        if (typeof turnIndex !== "number") {
          return false
        }

        // Released only once the target is known to exist: doing it before these checks turned
        // the follow off for a navigation that then did nothing - a hash that arrived before
        // its turn was loaded - leaving the reader un-followed for no reason.
        releaseAutoFollow()

        if (turnIndex < turnStartRef.current) {
          setTurnStart(turnIndex)
        }

        const result = await new Promise<boolean>((resolve) => {
          resolvePendingScrollRequest(false)
          pendingScrollRequestRef.current = {
            sessionId: sessionIdRef.current ?? sessionId ?? "",
            kind: "turn",
            id: turnId,
            behavior: options?.behavior ?? "auto",
            turnId,
            resolve,
          }
          attemptPendingScrollRequest()
        })

        if (result) {
          return true
        }

        return false
      } finally {
        setPendingRevealWork(false)
      }
    },
    [attemptPendingScrollRequest, releaseAutoFollow, resolvePendingScrollRequest, sessionId],
  )

  const scrollToMessage = React.useCallback(
    async (messageId: string, options?: { behavior?: ScrollBehavior }): Promise<boolean> => {
      if (!messageId || !sessionIdRef.current) {
        return false
      }

      setPendingRevealWork(true)

      try {
        if (sessionIdRef.current !== sessionId) {
          return false
        }

        const turnId = turnModelRef.current.messageToTurnId.get(messageId)
        const turnIndex = turnModelRef.current.messageToTurnIndex.get(messageId)

        if (typeof turnIndex !== "number") {
          return false
        }

        // Released only once the target is known to exist, for the same reason as scrollToTurn.
        releaseAutoFollow()

        if (turnIndex < turnStartRef.current) {
          setTurnStart(turnIndex)
        }

        const result = await new Promise<boolean>((resolve) => {
          resolvePendingScrollRequest(false)
          pendingScrollRequestRef.current = {
            sessionId: sessionIdRef.current ?? sessionId ?? "",
            kind: "message",
            id: messageId,
            behavior: options?.behavior ?? "auto",
            turnId: turnId ?? null,
            resolve,
          }
          attemptPendingScrollRequest()
        })

        if (result) {
          return true
        }

        return false
      } finally {
        setPendingRevealWork(false)
      }
    },
    [attemptPendingScrollRequest, releaseAutoFollow, resolvePendingScrollRequest, sessionId],
  )

  const resumeToBottom = React.useCallback(async () => {
    const turnId = turnModelRef.current.turnIds.at(-1) ?? null
    const nextStart = getInitialTurnStart(turnModelRef.current.turnCount)
    setPendingRevealWork(false)
    setIsLoadingOlder(false)

    const shouldWaitForRender = nextStart !== turnStartRef.current
    if (shouldWaitForRender) {
      setTurnStart(nextStart)
      await waitForNextRenderCommit()
    }

    goToBottom("smooth", { reason: "reader", turnId })
  }, [goToBottom, waitForNextRenderCommit])

  const resumeToBottomInstant = React.useCallback(async (options?: Pick<GoToBottomOptions, "reason">) => {
    const turnId = turnModelRef.current.turnIds.at(-1) ?? null
    const nextStart = getInitialTurnStart(turnModelRef.current.turnCount)
    setPendingRevealWork(false)
    setIsLoadingOlder(false)

    const shouldWaitForRender = nextStart !== turnStartRef.current
    if (shouldWaitForRender) {
      setTurnStart(nextStart)
      await waitForNextRenderCommit()
    }

    goToBottom("instant", { ...options, turnId })
  }, [goToBottom, waitForNextRenderCommit])

  const handleActiveTurnChange = React.useCallback((turnId: string | null) => {
    setActiveTurnId(turnId)
  }, [])

  return {
    turnIds: turnWindowModel.turnIds,
    turnStart,
    renderedMessages,
    historySignals,
    isLoadingOlder,
    pendingRevealWork,
    activeTurnId,
    showScrollToBottom: showScrollButton && !pendingRevealWork,
    turnWindowModel,
    loadEarlier,
    revealBufferedTurns,
    resumeToBottom,
    resumeToBottomInstant,
    scrollToTurn,
    scrollToMessage,
    handleHistoryScroll,
    captureViewportAnchor,
    restoreViewportAnchor,
    handleActiveTurnChange,
  }
}
