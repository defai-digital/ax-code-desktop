/**
 * Identity of one quick-dispatch attempt. `knownSessionIds` (passed to the reducer) is every
 * session that already existed when the attempt opened its draft. The first unknown current
 * session is the one this attempt created.
 */
import { truncateToCodeUnits } from "@/lib/textTruncate"

export type DispatchToken = {
  createdSessionId: string | null
  /** The user selected a different session while this attempt was still running. */
  superseded: boolean
}

export function createDispatchToken(): DispatchToken {
  return { createdSessionId: null, superseded: false }
}

/**
 * Record the session this attempt created, and whether the user has left it.
 * A null current session before anything is created is still the draft. Leaving the created
 * session, or landing on a session that already existed, means the user took the view.
 */
export function reduceDispatchToken(
  token: DispatchToken,
  currentSessionId: string | null,
  knownSessionIds: ReadonlySet<string>,
): DispatchToken {
  if (!currentSessionId) {
    if (!token.createdSessionId || token.superseded) return token
    return { ...token, superseded: true }
  }
  if (!token.createdSessionId) {
    if (knownSessionIds.has(currentSessionId)) {
      return token.superseded ? token : { ...token, superseded: true }
    }
    return { ...token, createdSessionId: currentSessionId }
  }
  if (currentSessionId === token.createdSessionId) return token
  return token.superseded ? token : { ...token, superseded: true }
}

/**
 * The attempt may still change the view when the user is on the session it created,
 * or still on the draft it opened and has not selected another session.
 */
export function dispatchStillShowingAttempt(
  token: DispatchToken,
  current: { sessionId: string | null; draftOpen: boolean },
): boolean {
  if (token.superseded) return false
  if (token.createdSessionId) return current.sessionId === token.createdSessionId
  return current.draftOpen && current.sessionId == null
}

export type QuickDispatchCompletion = { type: "restore" } | { type: "open"; sessionId: string } | { type: "leave" }

/** What a finished send may do to the view. A user who left the attempt is left where they are. */
export function planQuickDispatchCompletion(input: {
  openAfter: boolean
  createdSessionId: string | null
  showingAttempt: boolean
}): QuickDispatchCompletion {
  if (!input.showingAttempt) return { type: "leave" }
  if (input.openAfter && input.createdSessionId) return { type: "open", sessionId: input.createdSessionId }
  if (input.openAfter) return { type: "leave" }
  return { type: "restore" }
}

export type QuickDispatchFailurePlan = {
  restore: boolean
  report: "no-model" | "created" | "failed"
}

/**
 * A session that was created stays put: restoring the previous view would hide it.
 * Any other failure restores only when the user has not selected a different session.
 */
export function planQuickDispatchFailure(input: {
  noModel: boolean
  createdSessionId: string | null
  superseded: boolean
  currentSessionId: string | null
}): QuickDispatchFailurePlan {
  if (input.createdSessionId) return { restore: false, report: "created" }
  const restore = !input.superseded && input.currentSessionId == null
  if (input.noModel) return { restore, report: "no-model" }
  return { restore, report: "failed" }
}

/** Prefer the session title, then the first line of the prompt, then the id. */
export function quickDispatchSessionLabel(input: {
  title: string | null | undefined
  prompt: string
  sessionId: string
}): string {
  const title = input.title?.trim()
  if (title) return title
  const firstLine = input.prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return input.sessionId
  return truncateToCodeUnits(firstLine, 80)
}
