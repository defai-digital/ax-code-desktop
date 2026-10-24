import { beforeEach, describe, expect, test } from "vitest"

import { cleanupRemovedSessions } from "@/lib/sessionRemovalCleanup"
import { normalizeSessionGoal, type SessionGoalSnapshot } from "@/lib/supervision/goal"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"

import {
  attachSessionGoalReadClaims,
  claimGoalReads,
  clearKnownSessionGoals,
  collectDirectorySessionIndex,
  completeGoalRead,
  continueGoalReads,
  createGoalLoadState,
  drainGoalReads,
  forgetLedgerSession,
  isReconnectRecovery,
  planGoalReads,
  recoverGoalReads,
  selectGoalReadTargets,
  sessionIdsLeavingDirectoryStores,
  SESSION_GOAL_READ_CONCURRENCY,
  type GoalReadRuntime,
  type GoalReadTarget,
} from "./useSessionGoalsLoader"

const rawGoal = (overrides: Record<string, unknown> = {}) => ({
  sessionID: "ses_1",
  objective: "Ship it",
  status: "active",
  tokensUsed: 1,
  timeUsedSeconds: 2,
  time: { created: 10, updated: 30 },
  ...overrides,
})

const target = (sessionId: string, directory: string | null = "/repo"): GoalReadTarget => ({ sessionId, directory })

const snapshot = (overrides: Partial<SessionGoalSnapshot> = {}): SessionGoalSnapshot => {
  const value = normalizeSessionGoal(rawGoal())
  if (!value) throw new Error("fixture must normalize")
  return { ...value, ...overrides }
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  useSessionGoalStore.getState().clear()
  attachSessionGoalReadClaims(null)
})

describe("selectGoalReadTargets", () => {
  const rows = [
    { sessionId: "running", state: "running", directory: "/repo", updatedAt: 10 },
    { sessionId: "idle", state: "idle", directory: "/repo", updatedAt: 20 },
    { sessionId: "shown", state: "idle", directory: "/other", updatedAt: 5 },
    { sessionId: "running", state: "error", directory: "/elsewhere", updatedAt: 99 },
  ]

  test("reads an idle session whose goal is not yet known", async () => {
    const targets = selectGoalReadTargets(
      [{ sessionId: "idle-blocked", state: "idle", directory: "/repo", updatedAt: 40 }],
      null,
    )
    expect(targets).toEqual([{ sessionId: "idle-blocked", directory: "/repo" }])
    const seen: string[] = []
    await drainGoalReads({
      state: createGoalLoadState(),
      targets,
      fetchGoal: async (item) => {
        seen.push(item.sessionId)
        return rawGoal({ sessionID: item.sessionId, status: "blocked" })
      },
      beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    })
    expect(seen).toEqual(["idle-blocked"])
    expect(useSessionGoalStore.getState().goals["idle-blocked"]?.status).toBe("blocked")
    expect(selectGoalReadTargets(rows, null).map((item) => item.sessionId)).toEqual(["running", "idle", "shown"])
    expect(selectGoalReadTargets(rows, "shown").find((item) => item.sessionId === "shown")?.directory).toBe("/other")
  })

  test("orders the current session, then non-idle rows, then the rest by updatedAt descending", () => {
    const ordered = [
      { sessionId: "old-idle", state: "idle", directory: "/repo", updatedAt: 10 },
      { sessionId: "running", state: "running", directory: "/repo", updatedAt: 50 },
      { sessionId: "fresh-idle", state: "idle", directory: "/other", updatedAt: 80 },
      { sessionId: "error", state: "error", directory: "/elsewhere", updatedAt: 1 },
      { sessionId: "shown", state: "idle", directory: "/shown", updatedAt: 1 },
    ]
    expect(selectGoalReadTargets(ordered, "shown").map((item) => item.sessionId)).toEqual([
      "shown",
      "running",
      "error",
      "fresh-idle",
      "old-idle",
    ])
  })

  test("does not re-read a session whose goal is already known", async () => {
    useSessionGoalStore.getState().applyEvent("known", snapshot({ sessionId: "known" }))
    const mixed = [
      { sessionId: "known", state: "idle", directory: "/repo", updatedAt: 90 },
      { sessionId: "unknown", state: "idle", directory: "/repo", updatedAt: 1 },
    ]
    const targets = selectGoalReadTargets(mixed, null, useSessionGoalStore.getState().known)
    expect(targets.map((item) => item.sessionId)).toEqual(["unknown"])
    const calls: string[] = []
    await drainGoalReads({
      state: createGoalLoadState(),
      targets,
      fetchGoal: async (item) => {
        calls.push(item.sessionId)
        return null
      },
      beginRead: () => 0,
      applyRead: () => true,
    })
    expect(calls).toEqual(["unknown"])
    expect(useSessionGoalStore.getState().goals.known?.sessionId).toBe("known")
  })

  test("a recovery reads known rows again, including an idle one, in that order", () => {
    const planned = planGoalReads({
      rows: [
        { sessionId: "idle-blocked", state: "idle", directory: "/repo", updatedAt: 3 },
        { sessionId: "running", state: "running", directory: "/repo", updatedAt: 9 },
      ],
      displayedSessionId: null,
      known: { "idle-blocked": true, running: true },
      state: createGoalLoadState(),
      recovered: true,
    })
    expect(planned.clearKnown).toEqual(["idle-blocked", "running"])
    expect(planned.targets.map((item) => item.sessionId)).toEqual(["running", "idle-blocked"])
    expect(planned.state.recovery).toBe(1)

    const steady = planGoalReads({
      rows: [{ sessionId: "known", state: "idle", directory: "/repo", updatedAt: 1 }],
      displayedSessionId: null,
      known: { known: true },
      state: planned.state,
      recovered: false,
    })
    expect(steady.targets).toEqual([])
    expect(steady.clearKnown).toEqual([])
  })
})

describe("goal read rules", () => {
  test("keeps at most 4 reads in flight and then reads the rest", async () => {
    let inflight = 0
    let max = 0
    const gates: Array<(value: unknown) => void> = []
    const fetchGoal = () => {
      inflight += 1
      max = Math.max(max, inflight)
      return new Promise((resolve) => {
        gates.push((value) => {
          inflight -= 1
          resolve(value)
        })
      })
    }
    const targets = Array.from({ length: 6 }, (_, index) => target(`s${index}`))
    const pending = drainGoalReads({
      state: createGoalLoadState(),
      targets,
      fetchGoal,
      beginRead: () => 0,
      applyRead: () => true,
    })
    await flush()
    expect(SESSION_GOAL_READ_CONCURRENCY).toBe(4)
    expect(gates).toHaveLength(4)
    expect(max).toBe(4)

    gates.shift()?.(null)
    await flush()
    expect(gates).toHaveLength(4)
    expect(max).toBe(4)

    while (gates.length > 0) {
      const release = gates.splice(0)
      for (const fn of release) fn(null)
      await flush()
    }
    const state = await pending
    expect(Object.keys(state.settled)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"])
    expect(max).toBe(4)
  })

  test("reads each session once until the read fails, then at most one more time", async () => {
    const calls: string[] = []
    const fetchGoal = (item: GoalReadTarget) => {
      calls.push(item.sessionId)
      return Promise.reject(new Error("down"))
    }
    const targets = [target("ses_1")]
    const first = await drainGoalReads({
      state: createGoalLoadState(),
      targets,
      fetchGoal,
      beginRead: () => 0,
      applyRead: () => true,
    })
    expect(calls).toEqual(["ses_1", "ses_1"])
    expect(first.settled.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().known.ses_1).toBeUndefined()

    const second = await drainGoalReads({
      state: first,
      targets,
      fetchGoal,
      beginRead: () => 0,
      applyRead: () => true,
    })
    expect(calls).toEqual(["ses_1", "ses_1"])
    expect(second.attempts.ses_1).toBe(2)
  })

  test("a successful read is not repeated", async () => {
    const fetchGoal = viFetch(async (target) => {
      expect(target.sessionId).toBe("ses_1")
      return rawGoal()
    })
    const runtime = {
      state: createGoalLoadState(),
      targets: [target("ses_1")],
      fetchGoal,
      beginRead: (sessionId: string) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId: string, goal: SessionGoalSnapshot | null, token: number) =>
        useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    }
    const first = await drainGoalReads(runtime)
    expect(fetchGoal.calls).toBe(1)
    expect(useSessionGoalStore.getState().goals.ses_1?.objective).toBe("Ship it")
    expect(useSessionGoalStore.getState().known.ses_1).toBe(true)

    await drainGoalReads({ ...runtime, state: first })
    expect(fetchGoal.calls).toBe(1)
  })

  test("an event that arrives during the read wins", async () => {
    let release!: (value: unknown) => void
    const pending = drainGoalReads({
      state: createGoalLoadState(),
      targets: [target("ses_1")],
      fetchGoal: () =>
        new Promise((resolve) => {
          release = resolve
        }),
      beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    })
    await flush()
    useSessionGoalStore.getState().applyEvent("ses_1", snapshot({ status: "blocked", updatedAt: 80 }))
    release(rawGoal({ status: "active", time: { created: 10, updated: 30 } }))
    await pending
    expect(useSessionGoalStore.getState().goals.ses_1?.status).toBe("blocked")
    expect(useSessionGoalStore.getState().known.ses_1).toBe(true)
  })

  test("a failed read leaves the session unknown", async () => {
    useSessionGoalStore.getState().applyEvent("ses_other", snapshot({ sessionId: "ses_other" }))
    await drainGoalReads({
      state: createGoalLoadState(),
      targets: [target("ses_1")],
      fetchGoal: () => Promise.reject(new Error("nope")),
      beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    })
    expect(useSessionGoalStore.getState().known.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().goals.ses_1).toBeUndefined()
  })

  test("a null goal from the route marks the session known without storing one", async () => {
    await drainGoalReads({
      state: createGoalLoadState(),
      targets: [target("ses_1")],
      fetchGoal: async () => null,
      beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    })
    expect(useSessionGoalStore.getState().goals.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().known.ses_1).toBe(true)
  })

  test("recovery clears known for the sessions it will re-read and allows another read", async () => {
    useSessionGoalStore.getState().applyEvent("ses_1", snapshot())
    useSessionGoalStore.getState().applyRead("ses_keep", snapshot({ sessionId: "ses_keep" }), 0)
    const seq = useSessionGoalStore.getState().eventSeq.ses_1
    const settled = claimGoalReads(createGoalLoadState(), [target("ses_1")])
    const done = completeGoalRead(settled.state, "ses_1", 0, true)
    const recovered = recoverGoalReads(done.state, ["ses_1"])
    clearKnownSessionGoals(recovered.clearKnown)
    expect(useSessionGoalStore.getState().known.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().goals.ses_1?.status).toBe("active")
    expect(useSessionGoalStore.getState().known.ses_keep).toBe(true)
    expect(useSessionGoalStore.getState().eventSeq.ses_1).toBe(seq)

    let calls = 0
    const state = await drainGoalReads({
      state: recovered.state,
      targets: [target("ses_1")],
      fetchGoal: async () => {
        calls += 1
        return rawGoal({ status: "paused" })
      },
      beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
      applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
    })
    expect(calls).toBe(1)
    expect(state.settled.ses_1).toBe(true)
    expect(useSessionGoalStore.getState().goals.ses_1?.status).toBe("paused")
    expect(useSessionGoalStore.getState().known.ses_1).toBe(true)
  })

  test("a read that started before recovery does not apply and keeps its slot until it settles", () => {
    const claimed = claimGoalReads(createGoalLoadState(), [target("ses_1")])
    const recovered = recoverGoalReads(claimed.state, ["ses_1"])
    expect(recovered.state.inflight).toHaveLength(1)
    const finished = completeGoalRead(recovered.state, "ses_1", claimed.state.recovery, true)
    expect(finished.apply).toBe(false)
    expect(finished.state.settled.ses_1).toBeUndefined()
    expect(finished.state.inflight).toHaveLength(0)
    const again = claimGoalReads(finished.state, [target("ses_1")])
    expect(again.claimed.map((item) => item.sessionId)).toEqual(["ses_1"])
  })

  test("recovery does not let old reads plus new reads exceed 4 in flight", async () => {
    let inflight = 0
    let max = 0
    const gates: Array<(value: unknown) => void> = []
    const fetchGoal = () => {
      inflight += 1
      max = Math.max(max, inflight)
      return new Promise((resolve) => {
        gates.push((value) => {
          inflight -= 1
          resolve(value)
        })
      })
    }
    const applied: string[] = []
    const targets = Array.from({ length: 6 }, (_, index) => target(`s${index}`))
    const runtime = {
      current: {
        state: createGoalLoadState(),
        targets,
        fetchGoal,
        beginRead: () => 0,
        applyRead: (sessionId: string) => {
          applied.push(sessionId)
          return true
        },
      },
    }
    continueGoalReads(runtime)
    await flush()
    expect(gates).toHaveLength(4)
    expect(runtime.current.state.inflight).toHaveLength(4)

    const recovered = recoverGoalReads(
      runtime.current.state,
      targets.map((item) => item.sessionId),
    )
    runtime.current.state = recovered.state
    continueGoalReads(runtime)
    await flush()
    expect(gates).toHaveLength(4)
    expect(max).toBe(4)
    expect(runtime.current.state.inflight).toHaveLength(4)

    gates.shift()?.({ status: "stale" })
    await flush()
    expect(applied).toEqual([])
    expect(max).toBe(4)
    expect(gates).toHaveLength(4)

    while (gates.length > 0) {
      const release = gates.splice(0)
      for (const fn of release) fn(null)
      await flush()
    }
    expect(max).toBe(4)
    expect(runtime.current.state.inflight).toHaveLength(0)
    expect(applied.toSorted()).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"])
    expect(Object.keys(runtime.current.state.settled).toSorted()).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"])
  })

  test("a forgotten claim is not applied, and does not consume a newer claim for that session", () => {
    const claimed = claimGoalReads(createGoalLoadState(), [target("ses_1")])
    const claimId = claimed.state.inflight[0]?.id
    expect(claimId).toEqual(expect.any(Number))
    const forgotten = forgetLedgerSession(claimed.state, "ses_1")
    const again = claimGoalReads(forgotten, [target("ses_1")])
    const finished = completeGoalRead(again.state, "ses_1", claimed.state.recovery, true, claimId)
    expect(finished.apply).toBe(false)
    expect(finished.state.inflight.map((claim) => claim.id)).toEqual(again.state.inflight.map((claim) => claim.id))
    expect(finished.state.settled.ses_1).toBeUndefined()
  })

  test("deleting a session drops the claim so the in-flight read cannot resurrect it", async () => {
    let release!: (value: unknown) => void
    const runtime = {
      current: {
        state: createGoalLoadState(),
        targets: [target("ses_1")],
        fetchGoal: () =>
          new Promise((resolve) => {
            release = resolve
          }),
        beginRead: (sessionId: string) => useSessionGoalStore.getState().beginRead(sessionId),
        applyRead: (sessionId: string, goal: SessionGoalSnapshot | null, token: number) =>
          useSessionGoalStore.getState().applyRead(sessionId, goal, token),
      },
    }
    attachSessionGoalReadClaims(runtime)
    continueGoalReads(runtime)
    await flush()
    expect(runtime.current.state.inflight).toHaveLength(1)
    cleanupRemovedSessions(["ses_1"])
    expect(runtime.current.state.inflight).toHaveLength(0)
    release(rawGoal())
    await flush()
    expect(useSessionGoalStore.getState().goals.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().known.ses_1).toBeUndefined()
    expect(useSessionGoalStore.getState().eventSeq.ses_1).toBeUndefined()
  })

  test("reconnect is the stream coming back, not the first connect", () => {
    expect(isReconnectRecovery("reconnecting", "connected")).toBe(true)
    expect(isReconnectRecovery("connecting", "connected")).toBe(false)
    expect(isReconnectRecovery("connected", "connected")).toBe(false)
    expect(isReconnectRecovery("connected", "reconnecting")).toBe(false)
  })

  test("forgetting a session lets it be read again", () => {
    const claimed = claimGoalReads(createGoalLoadState(), [target("ses_1")])
    const settled = completeGoalRead(claimed.state, "ses_1", 0, true).state
    const forgotten = forgetLedgerSession(settled, "ses_1")
    expect(claimGoalReads(forgotten, [target("ses_1")]).claimed).toHaveLength(1)
    expect(forgetLedgerSession(forgotten, "ses_1")).toBe(forgotten)
  })
})

describe("directory store cleanup", () => {
  test("removes a session only once it has left every directory store", () => {
    const previous = collectDirectorySessionIndex([
      ["/repo", [{ id: "keep" }, { id: "gone" }]],
      ["/other", [{ id: "keep" }, { id: "only-there" }]],
    ])
    const next = collectDirectorySessionIndex([["/repo", [{ id: "keep" }]]])
    expect(sessionIdsLeavingDirectoryStores(previous, next)).toEqual(["gone", "only-there"])
  })

  test("an empty previous index removes nothing", () => {
    const next = collectDirectorySessionIndex([["/repo", [{ id: "ses_1" }]]])
    expect(sessionIdsLeavingDirectoryStores(new Map(), next)).toEqual([])
  })
})

function viFetch(fn: GoalReadRuntime["fetchGoal"]): GoalReadRuntime["fetchGoal"] & { calls: number } {
  let calls = 0
  const wrapped = ((target: GoalReadTarget) => {
    calls += 1
    return fn(target)
  }) as GoalReadRuntime["fetchGoal"] & { calls: number }
  Object.defineProperty(wrapped, "calls", { get: () => calls })
  return wrapped
}
