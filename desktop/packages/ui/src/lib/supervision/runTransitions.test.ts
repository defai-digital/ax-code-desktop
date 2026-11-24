import { describe, expect, test } from "vitest"

import {
  decideRunTransitionNotification,
  earliestScheduledRunTransition,
  reduceRunTransitions,
  RUN_TRANSITION_SETTLE_MS,
  type PendingRunTransition,
  type RunNotificationSettings,
  type RunStateSnapshot,
} from "./runTransitions"
import type { SupervisionState } from "./sessionState"

const settings = (overrides: Partial<RunNotificationSettings> = {}): RunNotificationSettings => ({
  notifyOnCompletion: true,
  notifyOnError: true,
  notifyOnQuestion: true,
  nativeNotificationsEnabled: true,
  notificationMode: "hidden-only",
  ...overrides,
})

const row = (sessionId: string, state: SupervisionState): RunStateSnapshot => ({ sessionId, state })

const settle = (
  pending: ReadonlyMap<string, PendingRunTransition>,
  snapshot: readonly RunStateSnapshot[],
  now: number,
) => reduceRunTransitions(pending, snapshot, now, RUN_TRANSITION_SETTLE_MS)

describe("reduceRunTransitions", () => {
  test("the first snapshot is only a baseline", () => {
    const first = settle(new Map(), [row("a", "running")], 0)
    expect(first.notify).toEqual([])
    const second = settle(first.pending, [row("a", "idle")], RUN_TRANSITION_SETTLE_MS)
    expect(second.notify).toEqual([])
    const due = settle(second.pending, [row("a", "idle")], RUN_TRANSITION_SETTLE_MS + RUN_TRANSITION_SETTLE_MS)
    expect(due.notify.map((transition) => transition.kind)).toEqual(["finished"])
  })

  test("a stale idle during spin-up is cancelled when the root returns to running", () => {
    const baseline = settle(new Map(), [row("a", "running")], 0)
    const stale = settle(baseline.pending, [row("a", "idle")], 100)
    expect(stale.notify).toEqual([])
    expect(stale.pending.get("a")?.scheduled).toMatchObject({ kind: "finished", dueAt: 100 + RUN_TRANSITION_SETTLE_MS })

    const resumed = settle(stale.pending, [row("a", "running")], 400)
    expect(resumed.notify).toEqual([])
    expect(resumed.pending.get("a")?.scheduled).toBeNull()

    const finished = settle(resumed.pending, [row("a", "idle")], 5_000)
    expect(finished.notify).toEqual([])
    const announced = settle(finished.pending, [row("a", "idle")], 5_000 + RUN_TRANSITION_SETTLE_MS)
    expect(announced.notify).toEqual([{ sessionId: "a", kind: "finished", from: "running", to: "idle" }])

    const again = settle(announced.pending, [row("a", "review")], 9_000)
    expect(again.notify).toEqual([])
  })

  test("permission and question are in-progress sources for a later finish or failure", () => {
    const running = settle(new Map(), [row("ask", "running"), row("allow", "running")], 0)
    const waiting = settle(running.pending, [row("ask", "question"), row("allow", "permission")], 500)
    expect(waiting.notify).toEqual([])

    const scheduled = settle(waiting.pending, [row("ask", "review"), row("allow", "error")], 1_000)
    expect(scheduled.notify).toEqual([])
    expect(scheduled.pending.get("ask")?.scheduled).toMatchObject({ kind: "finished", from: "question" })
    expect(scheduled.pending.get("allow")?.scheduled).toMatchObject({ kind: "failed", from: "permission" })

    const announced = settle(
      scheduled.pending,
      [row("ask", "review"), row("allow", "error")],
      1_000 + RUN_TRANSITION_SETTLE_MS,
    )
    expect(announced.notify).toEqual([
      { sessionId: "ask", kind: "finished", from: "question", to: "review" },
      { sessionId: "allow", kind: "failed", from: "permission", to: "error" },
    ])
  })

  test("keeps the original settle deadline when review becomes idle", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const review = settle(running.pending, [row("a", "review")], 1_000)
    const idle = settle(review.pending, [row("a", "idle")], 2_000)
    expect(idle.pending.get("a")?.scheduled?.dueAt).toBe(1_000 + RUN_TRANSITION_SETTLE_MS)
    expect(idle.notify).toEqual([])
  })

  test("restarts the settle window when a scheduled finish becomes a failure", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const idle = settle(running.pending, [row("a", "idle")], 1_000)
    const failed = settle(idle.pending, [row("a", "error")], 2_000)
    expect(failed.notify).toEqual([])
    expect(failed.pending.get("a")?.scheduled).toMatchObject({
      kind: "failed",
      dueAt: 2_000 + RUN_TRANSITION_SETTLE_MS,
    })
  })

  test("dedupes a kind until the session is running again", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const review = settle(running.pending, [row("a", "review")], 0)
    const announced = settle(review.pending, [row("a", "review")], RUN_TRANSITION_SETTLE_MS)
    expect(announced.notify.map((transition) => transition.kind)).toEqual(["finished"])

    const idle = settle(announced.pending, [row("a", "idle")], RUN_TRANSITION_SETTLE_MS + 50)
    expect(idle.notify).toEqual([])

    const asked = settle(idle.pending, [row("a", "permission")], RUN_TRANSITION_SETTLE_MS + 100)
    const askedAgain = settle(asked.pending, [row("a", "idle")], RUN_TRANSITION_SETTLE_MS + 200)
    const askedDue = settle(
      askedAgain.pending,
      [row("a", "idle")],
      RUN_TRANSITION_SETTLE_MS + 200 + RUN_TRANSITION_SETTLE_MS,
    )
    expect(askedDue.notify).toEqual([])

    const resumed = settle(askedDue.pending, [row("a", "running")], 10_000)
    const failed = settle(resumed.pending, [row("a", "error")], 10_500)
    const failedDue = settle(failed.pending, [row("a", "error")], 10_500 + RUN_TRANSITION_SETTLE_MS)
    expect(failedDue.notify).toEqual([{ sessionId: "a", kind: "failed", from: "running", to: "error" }])
  })

  test("running to goal schedules a blocked goal, never a finish or a failure", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 100)
    expect(goal.notify).toEqual([])
    expect(goal.pending.get("a")?.scheduled).toMatchObject({ kind: "goal", from: "running", to: "goal" })
    const due = settle(goal.pending, [row("a", "goal")], 100 + RUN_TRANSITION_SETTLE_MS)
    expect(due.notify).toEqual([{ sessionId: "a", kind: "goal", from: "running", to: "goal" }])
  })

  test("an error after an announced goal is still announced as a failure", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 100)
    const goalDue = settle(goal.pending, [row("a", "goal")], 100 + RUN_TRANSITION_SETTLE_MS)
    expect(goalDue.notify.map((transition) => transition.kind)).toEqual(["goal"])
    const failed = settle(goalDue.pending, [row("a", "error")], 5_000)
    const failedDue = settle(failed.pending, [row("a", "error")], 5_000 + RUN_TRANSITION_SETTLE_MS)
    expect(failedDue.notify).toEqual([{ sessionId: "a", kind: "failed", from: "running", to: "error" }])
  })

  test("an announced goal is not followed by a finish after a question ends idle", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 100)
    const goalDue = settle(goal.pending, [row("a", "goal")], 100 + RUN_TRANSITION_SETTLE_MS)
    const asked = settle(goalDue.pending, [row("a", "question")], 5_000)
    const idle = settle(asked.pending, [row("a", "idle")], 6_000)
    const idleDue = settle(idle.pending, [row("a", "idle")], 6_000 + RUN_TRANSITION_SETTLE_MS)
    expect(idleDue.notify).toEqual([])
    // An error after the question is still more serious than the goal, and is announced.
    const askedAgain = settle(idleDue.pending, [row("a", "question")], 9_000)
    const failed = settle(askedAgain.pending, [row("a", "error")], 9_500)
    const failedDue = settle(failed.pending, [row("a", "error")], 9_500 + RUN_TRANSITION_SETTLE_MS)
    expect(failedDue.notify.map((transition) => transition.kind)).toEqual(["failed"])
  })

  test("a goal that turns into an error before it settles is announced as the failure", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 100)
    const failed = settle(goal.pending, [row("a", "error")], 500)
    expect(failed.pending.get("a")?.scheduled?.kind).toBe("failed")
    const due = settle(failed.pending, [row("a", "error")], 500 + RUN_TRANSITION_SETTLE_MS)
    expect(due.notify.map((transition) => transition.kind)).toEqual(["failed"])
  })

  test("goal to idle keeps the blocked goal and its deadline instead of labelling it finished", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 1_000)
    const idle = settle(goal.pending, [row("a", "idle")], 2_000)
    expect(idle.notify).toEqual([])
    expect(idle.pending.get("a")?.scheduled).toMatchObject({
      kind: "goal",
      to: "idle",
      dueAt: 1_000 + RUN_TRANSITION_SETTLE_MS,
    })
    const due = settle(idle.pending, [row("a", "idle")], 1_000 + RUN_TRANSITION_SETTLE_MS)
    // Never "Run failed": the goal blocked, nothing errored.
    expect(due.notify).toEqual([{ sessionId: "a", kind: "goal", from: "running", to: "idle" }])
    // The same episode does not announce a finish afterwards.
    const later = settle(due.pending, [row("a", "review")], 9_000)
    expect(later.notify).toEqual([])
    const laterDue = settle(later.pending, [row("a", "review")], 9_000 + RUN_TRANSITION_SETTLE_MS)
    expect(laterDue.notify).toEqual([])
  })

  test("goal to running cancels the pending announcement and re-arms the next run", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const goal = settle(running.pending, [row("a", "goal")], 100)
    expect(goal.pending.get("a")?.scheduled?.kind).toBe("goal")
    const resumed = settle(goal.pending, [row("a", "running")], 400)
    expect(resumed.notify).toEqual([])
    expect(resumed.pending.get("a")?.scheduled).toBeNull()
    const atOldDue = settle(resumed.pending, [row("a", "running")], 100 + RUN_TRANSITION_SETTLE_MS)
    expect(atOldDue.notify).toEqual([])
    const finished = settle(atOldDue.pending, [row("a", "idle")], 5_000)
    const announced = settle(finished.pending, [row("a", "idle")], 5_000 + RUN_TRANSITION_SETTLE_MS)
    expect(announced.notify).toEqual([{ sessionId: "a", kind: "finished", from: "running", to: "idle" }])
  })

  test("entering goal converts a pending finish into a blocked goal instead of cancelling it", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const idle = settle(running.pending, [row("a", "idle")], 1_000)
    expect(idle.pending.get("a")?.scheduled?.kind).toBe("finished")
    const goal = settle(idle.pending, [row("a", "goal")], 1_500)
    expect(goal.notify).toEqual([])
    expect(goal.pending.get("a")?.scheduled).toMatchObject({ kind: "goal", to: "goal" })
    const due = settle(goal.pending, [row("a", "goal")], 1_500 + RUN_TRANSITION_SETTLE_MS)
    expect(due.notify.map((transition) => transition.kind)).toEqual(["goal"])
  })

  test("a root that stays running is not treated as finished", () => {
    const started = settle(new Map(), [row("root", "running")], 0)
    const still = settle(started.pending, [row("root", "running")], 5_000)
    expect(still.notify).toEqual([])
    expect(still.pending.get("root")?.scheduled).toBeNull()
  })

  test("drops a session that left the snapshot before its deadline", () => {
    const running = settle(new Map(), [row("a", "running")], 0)
    const idle = settle(running.pending, [row("a", "idle")], 0)
    const gone = settle(idle.pending, [], RUN_TRANSITION_SETTLE_MS)
    expect(gone.notify).toEqual([])
    expect(gone.pending.has("a")).toBe(false)
    expect(earliestScheduledRunTransition(gone.pending)).toBeNull()
  })

  test("reports the earliest deadline and leaves a later one pending", () => {
    const running = settle(new Map(), [row("early", "running"), row("late", "running")], 0)
    const scheduled = settle(running.pending, [row("early", "idle"), row("late", "question")], 0)
    const half = settle(scheduled.pending, [row("early", "idle"), row("late", "idle")], 1_000)
    expect(earliestScheduledRunTransition(half.pending)).toBe(RUN_TRANSITION_SETTLE_MS)
    const fired = settle(half.pending, [row("early", "idle"), row("late", "idle")], RUN_TRANSITION_SETTLE_MS)
    expect(fired.notify.map((transition) => transition.sessionId)).toEqual(["early"])
    expect(fired.pending.get("late")?.scheduled?.dueAt).toBe(1_000 + RUN_TRANSITION_SETTLE_MS)
  })
})

describe("decideRunTransitionNotification", () => {
  test("skips the session on screen while the window is focused", () => {
    expect(
      decideRunTransitionNotification({
        kind: "finished",
        sessionOpen: true,
        windowFocused: true,
        settings: settings(),
      }),
    ).toEqual({ inApp: false, native: false })
  })

  test("does not add an in-app entry for the open session when the window is in the background", () => {
    expect(
      decideRunTransitionNotification({
        kind: "finished",
        sessionOpen: true,
        windowFocused: false,
        settings: settings(),
      }),
    ).toEqual({ inApp: false, native: false })
    expect(
      decideRunTransitionNotification({
        kind: "failed",
        sessionOpen: true,
        windowFocused: true,
        settings: settings({ notificationMode: "always" }),
      }),
    ).toEqual({ inApp: false, native: false })
  })

  test("adds only the in-app entry when the server already sends the native notification", () => {
    expect(
      decideRunTransitionNotification({
        kind: "finished",
        sessionOpen: false,
        windowFocused: false,
        settings: settings(),
      }),
    ).toEqual({ inApp: true, native: false })
    expect(
      decideRunTransitionNotification({
        kind: "failed",
        sessionOpen: false,
        windowFocused: true,
        settings: settings({ notificationMode: "always" }),
      }),
    ).toEqual({ inApp: true, native: false })
  })

  test("fills the focused-window gap the server leaves for another session", () => {
    expect(
      decideRunTransitionNotification({
        kind: "failed",
        sessionOpen: false,
        windowFocused: true,
        settings: settings(),
      }),
    ).toEqual({ inApp: true, native: true })
  })

  test("follows the completion and error toggles", () => {
    expect(
      decideRunTransitionNotification({
        kind: "finished",
        sessionOpen: false,
        windowFocused: false,
        settings: settings({ notifyOnCompletion: false }),
      }),
    ).toEqual({ inApp: false, native: false })
    expect(
      decideRunTransitionNotification({
        kind: "failed",
        sessionOpen: false,
        windowFocused: true,
        settings: settings({ notifyOnError: false }),
      }),
    ).toEqual({ inApp: false, native: false })
    expect(
      decideRunTransitionNotification({
        kind: "finished",
        sessionOpen: false,
        windowFocused: true,
        settings: settings({ nativeNotificationsEnabled: false }),
      }),
    ).toEqual({ inApp: true, native: false })
  })
})

describe("announcing a blocked goal", () => {
  const goal = (overrides: Partial<Parameters<typeof decideRunTransitionNotification>[0]> = {}) =>
    decideRunTransitionNotification({
      kind: "goal",
      sessionOpen: false,
      windowFocused: true,
      settings: settings(),
      ...overrides,
    })

  test("follows the question setting, not the error setting", () => {
    expect(goal({ settings: settings({ notifyOnError: false }) }).inApp).toBe(true)
    expect(goal({ settings: settings({ notifyOnQuestion: false }) })).toEqual({ inApp: false, native: false })
  })

  test("is sent natively by the app alone, when the window is in the background", () => {
    // The server has no blocked-goal notification, so a background window would otherwise get none.
    expect(goal({ windowFocused: false }).native).toBe(true)
    // A focused window already shows the in-app announcement: no second, native one.
    expect(goal({ windowFocused: true }).native).toBe(false)
    expect(goal({ windowFocused: true, settings: settings({ notificationMode: "always" }) }).native).toBe(true)
    expect(goal({ windowFocused: true, sessionOpen: true }).native).toBe(false)
  })
})
