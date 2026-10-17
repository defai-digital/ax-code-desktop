import { beforeEach, describe, expect, test } from "vitest"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import {
  HOOK_RUN_LIMIT,
  HOOK_SESSION_LIMIT,
  appendHookRun,
  ingestHookCompletedEvent,
  recentHookRuns,
  selectDirectoryHookCounters,
  selectSessionHookRuns,
  useHookActivityStore,
  withSessionRun,
  type HookRun,
} from "./useHookActivityStore"

const completed = (overrides: Partial<HookCompleted> = {}): HookCompleted => ({
  sessionID: "ses_1",
  event: "PreToolUse",
  tool: "bash",
  command: "guard.sh",
  source: "project",
  exit: 0,
  durationMs: 12,
  outcome: "ok",
  ...overrides,
})

const reset = () => useHookActivityStore.setState({ runsBySession: {}, countersByDirectory: {} })

beforeEach(reset)

describe("appendHookRun", () => {
  test("keeps only the newest runs past the ring-buffer bound", () => {
    let runs: HookRun[] = []
    for (let index = 0; index < HOOK_RUN_LIMIT + 5; index++) {
      runs = appendHookRun(runs, { ...completed(), receivedAt: index, id: `hook_${index}` })
    }
    expect(runs).toHaveLength(HOOK_RUN_LIMIT)
    expect(runs[0].id).toBe("hook_5")
    expect(runs[runs.length - 1].id).toBe(`hook_${HOOK_RUN_LIMIT + 4}`)
  })
})

describe("recentHookRuns", () => {
  test("returns the newest runs first, capped at the limit", () => {
    const runs = Array.from({ length: 8 }, (_, index) => ({
      ...completed(),
      receivedAt: index,
      id: `hook_${index}`,
    }))
    expect(recentHookRuns(runs).map((run) => run.id)).toEqual(["hook_7", "hook_6", "hook_5", "hook_4", "hook_3"])
    expect(recentHookRuns(runs, 2).map((run) => run.id)).toEqual(["hook_7", "hook_6"])
    expect(recentHookRuns([])).toEqual([])
  })
})

describe("ingestHookCompleted", () => {
  test("records runs per session with a receipt time and unique ids", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed(), "/repo", 1000)
    ingestHookCompleted(completed({ tool: "edit" }), "/repo", 2000)

    const runs = selectSessionHookRuns(useHookActivityStore.getState(), "ses_1")
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({ receivedAt: 1000, tool: "bash", event: "PreToolUse", outcome: "ok" })
    expect(runs[1]).toMatchObject({ receivedAt: 2000, tool: "edit" })
    expect(runs[0].id).not.toBe(runs[1].id)
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_other")).toEqual([])
  })

  test("bounds the per-session buffer and drops the oldest runs", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    for (let index = 0; index < HOOK_RUN_LIMIT + 10; index++) {
      ingestHookCompleted(completed({ command: `cmd-${index}` }), "/repo", index)
    }
    const runs = selectSessionHookRuns(useHookActivityStore.getState(), "ses_1")
    expect(runs).toHaveLength(HOOK_RUN_LIMIT)
    expect(runs[0].command).toBe("cmd-10")
    expect(runs[runs.length - 1].command).toBe(`cmd-${HOOK_RUN_LIMIT + 9}`)
  })

  test("keeps sessions separate", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ sessionID: "ses_a" }), "/repo")
    ingestHookCompleted(completed({ sessionID: "ses_b" }), "/repo")
    ingestHookCompleted(completed({ sessionID: "ses_a" }), "/repo")

    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_a")).toHaveLength(2)
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_b")).toHaveLength(1)
  })

  test("counts blocked and failed runs per directory, ignoring other outcomes", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ outcome: "blocked" }), "/repo")
    ingestHookCompleted(completed({ outcome: "blocked" }), "/repo")
    ingestHookCompleted(completed({ outcome: "failed" }), "/repo")
    ingestHookCompleted(completed({ outcome: "ok" }), "/repo")
    ingestHookCompleted(completed({ outcome: "ask" }), "/repo")
    ingestHookCompleted(completed({ outcome: "blocked" }), "/other")

    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 2, failed: 1 })
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/other")).toEqual({ blocked: 1, failed: 0 })
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/nowhere")).toEqual({ blocked: 0, failed: 0 })
  })

  test("normalizes directory spellings for counters", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ outcome: "blocked" }), "/repo/")
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 1, failed: 0 })
  })

  test("does not count runs for the global or empty directory", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ outcome: "blocked" }), "global")
    ingestHookCompleted(completed({ outcome: "blocked" }), "")
    expect(useHookActivityStore.getState().countersByDirectory).toEqual({})
    // The runs themselves are still recorded per session.
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_1")).toHaveLength(2)
  })

  test("a run without a sessionID counts toward its directory but has no session entry", () => {
    const { ingestHookCompleted } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ sessionID: undefined, event: "SessionStart", outcome: "blocked" }), "/repo")

    expect(useHookActivityStore.getState().runsBySession).toEqual({})
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 1, failed: 0 })
  })
})

describe("clearDirectoryCounters", () => {
  test("resets only the named directory", () => {
    const { ingestHookCompleted, clearDirectoryCounters } = useHookActivityStore.getState()
    ingestHookCompleted(completed({ outcome: "blocked" }), "/repo")
    ingestHookCompleted(completed({ outcome: "failed" }), "/repo")
    ingestHookCompleted(completed({ outcome: "blocked" }), "/other")

    clearDirectoryCounters("/repo")

    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 0, failed: 0 })
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/other")).toEqual({ blocked: 1, failed: 0 })
    // Session runs are history, not counters: clearing leaves them alone.
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_1")).toHaveLength(3)
  })

  test("clearing an unknown or global directory is a no-op", () => {
    const before = useHookActivityStore.getState()
    before.clearDirectoryCounters("/nowhere")
    before.clearDirectoryCounters("global")
    before.clearDirectoryCounters("")
    expect(useHookActivityStore.getState().countersByDirectory).toBe(before.countersByDirectory)
  })
})

describe("ingestHookCompletedEvent", () => {
  test("accepts a hook.completed event with a sessionID", () => {
    expect(ingestHookCompletedEvent({ type: "hook.completed", properties: completed() }, "/repo")).toBe(true)
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_1")).toHaveLength(1)
  })

  test("accepts a hook.completed event without a sessionID", () => {
    const properties = completed({ sessionID: undefined, outcome: "failed" })
    expect(ingestHookCompletedEvent({ type: "hook.completed", properties }, "/repo")).toBe(true)
    expect(useHookActivityStore.getState().runsBySession).toEqual({})
    expect(selectDirectoryHookCounters(useHookActivityStore.getState(), "/repo")).toEqual({ blocked: 0, failed: 1 })
  })

  test("keeps runs for an unknown session under that session id", () => {
    expect(
      ingestHookCompletedEvent(
        { type: "hook.completed", properties: completed({ sessionID: "ses_unknown" }) },
        "/repo",
      ),
    ).toBe(true)
    expect(selectSessionHookRuns(useHookActivityStore.getState(), "ses_unknown")).toHaveLength(1)
  })

  test("ignores unrelated and malformed payloads", () => {
    expect(ingestHookCompletedEvent({ type: "session.idle", properties: completed() }, "/repo")).toBe(false)
    expect(ingestHookCompletedEvent({ type: "hook.completed" }, "/repo")).toBe(false)
    expect(ingestHookCompletedEvent({ type: "hook.completed", properties: { outcome: "blocked" } }, "/repo")).toBe(
      false,
    )
    expect(
      ingestHookCompletedEvent(
        { type: "hook.completed", properties: completed({ outcome: "nope" as never }) },
        "/repo",
      ),
    ).toBe(false)
    expect(useHookActivityStore.getState().runsBySession).toEqual({})
    expect(useHookActivityStore.getState().countersByDirectory).toEqual({})
  })

  test("keeps runs for at most HOOK_SESSION_LIMIT sessions, dropping the least recently active", () => {
    let runs: Record<string, HookRun[]> = {}
    const run = (sessionId: string, index: number): HookRun => ({
      sessionID: sessionId,
      event: "PreToolUse",
      command: "true",
      source: "project",
      exit: 0,
      durationMs: 1,
      outcome: "ok",
      receivedAt: index,
      id: `run_${index}`,
    })
    for (let index = 0; index < HOOK_SESSION_LIMIT; index += 1)
      runs = withSessionRun(runs, `ses_${index}`, run(`ses_${index}`, index))
    // ses_0 becomes the most recent, so ses_1 is the one dropped when a new session arrives.
    runs = withSessionRun(runs, "ses_0", run("ses_0", 1000))
    runs = withSessionRun(runs, "ses_new", run("ses_new", 1001))
    expect(Object.keys(runs)).toHaveLength(HOOK_SESSION_LIMIT)
    expect(runs.ses_1).toBeUndefined()
    expect(runs.ses_0).toHaveLength(2)
    expect(runs.ses_new).toHaveLength(1)
  })
})
