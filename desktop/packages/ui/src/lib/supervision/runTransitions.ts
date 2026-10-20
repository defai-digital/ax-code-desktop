import type { SupervisionState } from "./sessionState"

export type RunTransitionKind = "finished" | "failed"

/** States that still have work in flight. A later review, idle, or error is a real finish or failure. */
export type InProgressSupervisionState = "running" | "permission" | "question"

export type RunStateSnapshot = {
  sessionId: string
  state: SupervisionState
}

export type RunTransition = {
  sessionId: string
  kind: RunTransitionKind
  from: InProgressSupervisionState
  to: SupervisionState
}

export type RunNotificationSettings = {
  notifyOnCompletion: boolean
  notifyOnError: boolean
  nativeNotificationsEnabled: boolean
  notificationMode: "always" | "hidden-only"
}

export type RunNotificationDecision = {
  inApp: boolean
  native: boolean
}

/**
 * How long a finish or failure must keep its terminal state before it is announced.
 * Prompt spin-up can publish a stale session.idle and then return to busy; announcing
 * immediately records a false finish and the real completion announces again.
 */
export const RUN_TRANSITION_SETTLE_MS = 2000

export type ScheduledRunTransition = {
  kind: RunTransitionKind
  from: InProgressSupervisionState
  to: SupervisionState
  dueAt: number
}

export type PendingRunTransition = {
  state: SupervisionState
  /** Kinds already announced since this session was last running. */
  notifiedKinds: RunTransitionKind[]
  scheduled: ScheduledRunTransition | null
}

const isInProgress = (state: SupervisionState): state is InProgressSupervisionState =>
  state === "running" || state === "permission" || state === "question"

const terminalKind = (state: SupervisionState): RunTransitionKind | null => {
  if (state === "review" || state === "idle") return "finished"
  // A blocked goal ends the run without completing it, so it is announced
  // like an error and never as a finish.
  if (state === "error" || state === "goal") return "failed"
  return null
}

/**
 * Fold one supervision snapshot into the pending finish and failure decisions.
 *
 * Review, idle, error, and a blocked goal are announced only after they stay settled for `settleMs`.
 * A blocked goal is a failure: it is never announced as a finish, and a later
 * idle or review in the same episode keeps the pending failure instead of
 * replacing it with a finish.
 * The announcement is dropped when the root returns to an in-progress state before that
 * deadline. Permission and question are in-progress sources, so a root that passes through
 * them between snapshots still announces the later finish or failure.
 *
 * The snapshot state is already rolled up. A busy root stays "running" when a child is in
 * review; review does not outrank running here.
 *
 * A session seen for the first time is recorded and stays quiet, so an empty pending map
 * (launch, or the sync stream reconnecting) does not announce. Each kind is announced once
 * until the session is running again.
 */
export function reduceRunTransitions(
  pending: ReadonlyMap<string, PendingRunTransition>,
  snapshot: readonly RunStateSnapshot[],
  now: number,
  settleMs: number = RUN_TRANSITION_SETTLE_MS,
): { notify: RunTransition[]; pending: Map<string, PendingRunTransition> } {
  const notify: RunTransition[] = []
  const next = new Map<string, PendingRunTransition>()

  for (const row of snapshot) {
    const previous = pending.get(row.sessionId)
    const previousState = previous?.state ?? null
    let notifiedKinds = previous?.notifiedKinds ?? []
    let scheduled = previous?.scheduled ?? null

    if (row.state === "running" && notifiedKinds.length > 0) notifiedKinds = []

    const kind = terminalKind(row.state)

    if (previousState !== null && isInProgress(previousState) && kind !== null) {
      if (notifiedKinds.includes(kind)) {
        scheduled = null
      } else if (scheduled?.kind === kind) {
        if (scheduled.to !== row.state) scheduled = { ...scheduled, to: row.state }
      } else {
        scheduled = { kind, from: previousState, to: row.state, dueAt: now + settleMs }
      }
    } else if (isInProgress(row.state)) {
      scheduled = null
    } else if (kind !== null && scheduled && scheduled.kind !== kind && !notifiedKinds.includes(kind)) {
      if (scheduled.kind === "failed" && kind === "finished") {
        // Never downgrade a failure to a finish: keep its deadline and
        // only follow the settling state.
        scheduled = { ...scheduled, to: row.state }
      } else {
        scheduled = { kind, from: scheduled.from, to: row.state, dueAt: now + settleMs }
      }
    } else if (kind !== null && scheduled?.kind === kind) {
      if (scheduled.to !== row.state) scheduled = { ...scheduled, to: row.state }
    } else if (kind === null) {
      scheduled = null
    }

    if (scheduled && kind !== null && now >= scheduled.dueAt) {
      notify.push({ sessionId: row.sessionId, kind: scheduled.kind, from: scheduled.from, to: row.state })
      notifiedKinds = [...notifiedKinds, scheduled.kind]
      scheduled = null
    }

    next.set(row.sessionId, { state: row.state, notifiedKinds, scheduled })
  }

  return { notify, pending: next }
}

/** Earliest settle deadline still waiting, or null when nothing is scheduled. */
export function earliestScheduledRunTransition(pending: ReadonlyMap<string, PendingRunTransition>): number | null {
  let dueAt: number | null = null
  for (const entry of pending.values()) {
    if (!entry.scheduled) continue
    if (dueAt === null || entry.scheduled.dueAt < dueAt) dueAt = entry.scheduled.dueAt
  }
  return dueAt
}

/**
 * The server already emits native notifications for assistant completion (`notifyOnCompletion`)
 * and assistant errors (`notifyOnError`). It skips them when the window is focused and
 * notification mode is not "always". Native output here only fills that gap, the same way
 * permission notifications do. The in-app center is not part of the server path, and it stays
 * quiet for the session the user currently has open even when this window is in the background.
 */
export function decideRunTransitionNotification(input: {
  kind: RunTransitionKind
  /** This session is the one on screen, whether or not the window is focused. */
  sessionOpen: boolean
  windowFocused: boolean
  settings: RunNotificationSettings
}): RunNotificationDecision {
  const eventEnabled = input.kind === "finished" ? input.settings.notifyOnCompletion : input.settings.notifyOnError
  if (!eventEnabled) return { inApp: false, native: false }

  const viewingThisSession = input.sessionOpen && input.windowFocused
  const serverSendsNative =
    input.settings.nativeNotificationsEnabled && (input.settings.notificationMode === "always" || !input.windowFocused)
  const native =
    input.settings.nativeNotificationsEnabled && !serverSendsNative && input.windowFocused && !viewingThisSession
  return { inApp: !input.sessionOpen, native }
}
