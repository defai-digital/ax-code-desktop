import React from "react"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSessions } from "@/sync/sync-context"
import type { MiniChatMode } from "@/components/mini-chat/types"

const SESSION_UNAVAILABLE_TIMEOUT_MS = 5_000

type SessionUnavailableConfig = {
  mode: MiniChatMode
  sessionId: string | null
}

/**
 * True once a mini-chat window has waited long enough for the session it was opened for to show up in
 * the directory's session list.
 *
 * The list gets a fresh identity on every session event, so this effect re-runs whenever any sibling
 * session updates. Recreating the timer there made the wait start over on each event: while siblings
 * streamed, the deadline never arrived and the window kept showing a chat whose session was gone. The
 * deadline is anchored when the wait starts, so the effect only ever shortens the remaining wait.
 */
export const useMiniChatSessionUnavailable = (config: SessionUnavailableConfig): boolean => {
  const sessions = useSessions()
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const draftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open))
  const [timedOut, setTimedOut] = React.useState(false)
  const deadlineRef = React.useRef<number | null>(null)

  // Keep waiting only while nothing valid is selected: once the user picks a
  // different session in the switcher — including a new-session draft, which
  // clears currentSessionId — the unavailable screen must clear for it instead
  // of replacing the draft after the timeout.
  const waiting =
    config.mode === "session" &&
    Boolean(config.sessionId) &&
    currentSessionId === null &&
    !draftOpen &&
    !sessions.some((entry) => entry.id === config.sessionId)

  React.useEffect(() => {
    if (!waiting) {
      deadlineRef.current = null
      setTimedOut(false)
      return
    }

    if (deadlineRef.current === null) {
      deadlineRef.current = Date.now() + SESSION_UNAVAILABLE_TIMEOUT_MS
    }
    const remaining = Math.max(0, deadlineRef.current - Date.now())
    const timeout = window.setTimeout(() => setTimedOut(true), remaining)
    return () => window.clearTimeout(timeout)
  }, [waiting])

  return timedOut
}
