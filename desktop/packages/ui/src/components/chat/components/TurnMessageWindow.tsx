import React from "react"

import { useI18n } from "@/lib/i18n"
import type { ChatMessageEntry } from "../lib/turns/types"
import {
  TURN_MESSAGE_REVEAL_CHUNK,
  TurnMessageWindowContext,
  FULL_MESSAGE_WINDOW,
  initialMessageWindow,
  shouldHoldRevealAnchor,
  type TurnMessageWindowRange,
} from "../lib/turns/turnMessageWindow"
import { CHAT_SCROLLER_SELECTOR, holdAnchor } from "../lib/scroll/holdAnchor"

// Stands in for a not yet mounted message until it mounts and measures.
const ESTIMATED_MESSAGE_HEIGHT_PX = 64
const subscribeNowhere = () => () => {}

/**
 * Mounts the next batch once a spacer comes within a viewport of the
 * visible area; a spacer already on screen mounts everything it holds, since
 * a reader looking at it would otherwise watch it fill batch by batch.
 * Observed afresh after every batch: a new observation reports the current
 * intersection, so a spacer still near the viewport keeps going.
 */
const useSpacerReveal = (
  spacerRef: React.RefObject<HTMLDivElement | null>,
  hidden: number,
  reveal: (nextHidden: number) => void,
) => {
  React.useEffect(() => {
    const spacer = spacerRef.current
    const scroller = spacer?.closest(CHAT_SCROLLER_SELECTOR)
    if (!spacer || !scroller) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[entries.length - 1]?.isIntersecting) return
        const view = scroller.getBoundingClientRect()
        const rect = spacer.getBoundingClientRect()
        const onScreen = rect.bottom > view.top && rect.top < view.bottom
        reveal(onScreen ? 0 : Math.max(0, hidden - TURN_MESSAGE_REVEAL_CHUNK))
      },
      { root: scroller, rootMargin: "100% 0px" },
    )
    observer.observe(spacer)
    return () => observer.disconnect()
  }, [hidden, reveal, spacerRef])
}

interface TurnMessageWindowProps {
  turnId: string
  messages: ChatMessageEntry[]
  renderMessage: (message: ChatMessageEntry) => React.ReactNode
}

/**
 * A turn's assistant messages, with the steps of a long turn outside its
 * window held behind spacers until they come near the viewport (see
 * turnMessageWindow). Mounting a batch above the reader keeps the message
 * they were looking at still.
 */
export function TurnMessageWindow({ turnId, messages, renderMessage }: TurnMessageWindowProps) {
  const { t } = useI18n()
  const store = React.useContext(TurnMessageWindowContext)
  const [initialRange] = React.useState(() => store?.range(turnId) ?? initialMessageWindow(messages.length))
  const storedRange = React.useSyncExternalStore(store?.subscribe ?? subscribeNowhere, () => store?.range(turnId))
  const range: TurnMessageWindowRange = store ? (storedRange ?? initialRange) : FULL_MESSAGE_WINDOW
  const hiddenHead = Math.min(range.hiddenHead, messages.length)
  const hiddenTail = Math.min(range.hiddenTail, messages.length - hiddenHead)

  const headSpacerRef = React.useRef<HTMLDivElement | null>(null)
  const tailSpacerRef = React.useRef<HTMLDivElement | null>(null)
  const anchorRef = React.useRef<{ element: Element; top: number } | null>(null)
  const pendingFocusRef = React.useRef<string | null>(null)
  const focusScopeRef = React.useRef<ParentNode | null>(null)

  React.useLayoutEffect(() => {
    if (store && store.range(turnId) === undefined) store.setRange(turnId, initialRange)
  }, [initialRange, store, turnId])

  const revealHead = React.useCallback(
    (nextHidden: number, hold = true) => {
      const spacer = headSpacerRef.current
      const scroller = spacer?.closest(CHAT_SCROLLER_SELECTOR)
      const firstMounted = spacer?.nextElementSibling
      anchorRef.current = null
      if (hold && spacer && scroller && firstMounted) {
        const view = scroller.getBoundingClientRect()
        const top = firstMounted.getBoundingClientRect().top
        if (
          shouldHoldRevealAnchor({
            spacerTop: spacer.getBoundingClientRect().top,
            firstMountedTop: top,
            viewTop: view.top,
            viewBottom: view.bottom,
          })
        ) {
          anchorRef.current = { element: firstMounted, top }
        }
      }
      const current = store?.range(turnId) ?? FULL_MESSAGE_WINDOW
      store?.setRange(turnId, { ...current, hiddenHead: nextHidden })
    },
    [store, turnId],
  )

  const revealTail = React.useCallback(
    (nextHidden: number) => {
      const current = store?.range(turnId) ?? FULL_MESSAGE_WINDOW
      store?.setRange(turnId, { ...current, hiddenTail: nextHidden })
    },
    [store, turnId],
  )

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor?.element.isConnected) return
    const scroller = anchor.element.closest(CHAT_SCROLLER_SELECTOR)
    if (!scroller) return
    return holdAnchor(scroller, anchor.element, anchor.top)
  }, [hiddenHead])

  React.useLayoutEffect(() => {
    const messageId = pendingFocusRef.current
    if (!messageId) return
    pendingFocusRef.current = null
    const element = focusScopeRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${messageId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
    )
    if (!element) return
    if (element.tabIndex < 0) element.tabIndex = -1
    element.focus()
  }, [hiddenHead, hiddenTail])

  const queueRevealedFocus = (scope: HTMLElement | null, messageId: string | undefined) => {
    if (!messageId) return
    focusScopeRef.current = scope
    pendingFocusRef.current = messageId
  }

  const showEarlier = () => {
    queueRevealedFocus(headSpacerRef.current?.parentElement ?? null, messages[0]?.info.id)
    revealHead(0, false)
  }

  const showLater = () => {
    queueRevealedFocus(tailSpacerRef.current?.parentElement ?? null, messages[messages.length - hiddenTail]?.info.id)
    revealTail(0)
  }

  const earlierLabel = t(
    hiddenHead === 1 ? "chat.liveActivity.showEarlierStep" : "chat.liveActivity.showEarlierSteps",
    { count: hiddenHead },
  )
  const laterLabel = t(hiddenTail === 1 ? "chat.liveActivity.showLaterStep" : "chat.liveActivity.showLaterSteps", {
    count: hiddenTail,
  })

  useSpacerReveal(headSpacerRef, hiddenHead, revealHead)
  useSpacerReveal(tailSpacerRef, hiddenTail, revealTail)

  const visibleMessages =
    hiddenHead > 0 || hiddenTail > 0 ? messages.slice(hiddenHead, messages.length - hiddenTail) : messages
  return (
    <>
      {hiddenHead > 0 ? (
        <div
          ref={headSpacerRef}
          data-turn-message-spacer="head"
          className="relative"
          style={{ height: hiddenHead * ESTIMATED_MESSAGE_HEIGHT_PX }}
        >
          {/* Out of flow until focused, so the estimated spacer height stays put. */}
          <button
            type="button"
            className="sr-only focus:not-sr-only"
            data-turn-message-reveal="head"
            onClick={showEarlier}
          >
            {earlierLabel}
          </button>
        </div>
      ) : null}
      {visibleMessages.map((message) => renderMessage(message))}
      {hiddenTail > 0 ? (
        <div
          ref={tailSpacerRef}
          data-turn-message-spacer="tail"
          className="relative"
          style={{ height: hiddenTail * ESTIMATED_MESSAGE_HEIGHT_PX }}
        >
          <button
            type="button"
            className="sr-only focus:not-sr-only"
            data-turn-message-reveal="tail"
            onClick={showLater}
          >
            {laterLabel}
          </button>
        </div>
      ) : null}
    </>
  )
}
