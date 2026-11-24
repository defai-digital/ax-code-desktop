import type { SupervisionState } from "./sessionState"

/**
 * A blocked goal is its own kind: it is a decision waiting on a person, announced as "Goal needs you" and never as
 * "Run failed" (G UX-02), and an error that follows it is still announced as a failure.
 */
export type RunTransitionKind = "finished" | "failed" | "goal"

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
  /** A blocked goal asks the person to decide, so it follows the question setting rather than the error one. */
  notifyOnQuestion: boolean
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
  /** The in-progress state the announced episode started from, for a later, more serious announcement in it. */
  announcedFrom?: InProgressSupervisionState
  scheduled: ScheduledRunTransition | null
}

const isInProgress = (state: SupervisionState): state is InProgressSupervisionState =>
  state === "running" || state === "permission" || state === "question"

const terminalKind = (state: SupervisionState): RunTransitionKind | null => {
  if (state === "review" || state === "idle") return "finished"
  if (state === "goal") return "goal"
  if (state === "error") return "failed"
  return null
}

// A pending announcement is never downgraded within one episode: a failure outranks a blocked goal, and a blocked
// goal ends the run without completing it, so neither becomes a finish when the state settles to idle or review.
const KIND_RANK: Record<RunTransitionKind, number> = { finished: 0, goal: 1, failed: 2 }

/**
 * Fold one supervision snapshot into the pending finish and failure decisions.
 *
 * Review, idle, error, and a blocked goal are announced only after they stay settled for `settleMs`.
 * A pending failure or blocked goal is never downgraded: a later idle or review in the same episode keeps it
 * instead of replacing it with a finish, and a failure keeps its kind when a goal follows it.
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
    let announcedFrom = previous?.announcedFrom
    let scheduled = previous?.scheduled ?? null

    if (row.state === "running" && notifiedKinds.length > 0) {
      notifiedKinds = []
      announcedFrom = undefined
    }

    const kind = terminalKind(row.state)

    if (previousState !== null && isInProgress(previousState) && kind !== null) {
      // Permission and question keep the episode: after an announced goal, a pass through a question that ends idle
      // is not a new finish. Only a more serious kind is announced again before the session runs.
      if (notifiedKinds.some((notified) => KIND_RANK[notified] >= KIND_RANK[kind])) {
        scheduled = null
      } else if (scheduled?.kind === kind) {
        if (scheduled.to !== row.state) scheduled = { ...scheduled, to: row.state }
      } else {
        scheduled = { kind, from: previousState, to: row.state, dueAt: now + settleMs }
      }
    } else if (isInProgress(row.state)) {
      scheduled = null
    } else if (kind !== null && scheduled && scheduled.kind !== kind && !notifiedKinds.includes(kind)) {
      if (KIND_RANK[kind] < KIND_RANK[scheduled.kind]) {
        // Never downgrade: keep the pending kind and its deadline, and only follow the settling state.
        scheduled = { ...scheduled, to: row.state }
      } else {
        scheduled = { kind, from: scheduled.from, to: row.state, dueAt: now + settleMs }
      }
    } else if (kind !== null && scheduled?.kind === kind) {
      if (scheduled.to !== row.state) scheduled = { ...scheduled, to: row.state }
    } else if (kind === null) {
      scheduled = null
    } else if (
      !scheduled &&
      announcedFrom &&
      previousState !== row.state &&
      notifiedKinds.every((notified) => KIND_RANK[kind] > KIND_RANK[notified])
    ) {
      // Escalation within an announced episode: an error after an announced goal, or a goal after an announced
      // finish, is announced too; a finish after either is not.
      scheduled = { kind, from: announcedFrom, to: row.state, dueAt: now + settleMs }
    }

    if (scheduled && kind !== null && now >= scheduled.dueAt) {
      notify.push({ sessionId: row.sessionId, kind: scheduled.kind, from: scheduled.from, to: row.state })
      notifiedKinds = [...notifiedKinds, scheduled.kind]
      announcedFrom = scheduled.from
      scheduled = null
    }

    next.set(row.sessionId, {
      state: row.state,
      notifiedKinds,
      scheduled,
      ...(announcedFrom ? { announcedFrom } : {}),
    })
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
  const eventEnabled = {
    finished: input.settings.notifyOnCompletion,
    failed: input.settings.notifyOnError,
    goal: input.settings.notifyOnQuestion,
  }[input.kind]
  if (!eventEnabled) return { inApp: false, native: false }

  const viewingThisSession = input.sessionOpen && input.windowFocused
  if (input.kind === "goal") {
    // The server has no blocked-goal notification, so this is the only native source. The in-app announcement covers
    // a focused window; native fills in when the window is in the background, or always when the person asked for it.
    const native =
      input.settings.nativeNotificationsEnabled &&
      !viewingThisSession &&
      (input.settings.notificationMode === "always" || !input.windowFocused)
    return { inApp: !input.sessionOpen, native }
  }
  const serverSendsNative =
    input.settings.nativeNotificationsEnabled && (input.settings.notificationMode === "always" || !input.windowFocused)
  const native =
    input.settings.nativeNotificationsEnabled && !serverSendsNative && input.windowFocused && !viewingThisSession
  return { inApp: !input.sessionOpen, native }
}
