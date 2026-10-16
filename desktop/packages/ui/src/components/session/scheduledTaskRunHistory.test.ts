import { describe, expect, it } from "vitest"
import type { ScheduledTaskRun } from "@/lib/scheduledTasksApi"
import {
  formatRunDuration,
  mergeScheduledTaskRuns,
  runDurationMs,
  runOutcome,
  runStartedAt,
  summarizeScheduledTaskRuns,
} from "./scheduledTaskRunHistory"

const run = (overrides: Partial<ScheduledTaskRun> & Pick<ScheduledTaskRun, "id">): ScheduledTaskRun => ({
  taskID: "task-1",
  triggerType: "scheduled",
  status: "completed",
  coalescedCount: 0,
  time: { created: 1_000 },
  ...overrides,
})

describe("runOutcome", () => {
  it("groups the runtime statuses", () => {
    expect(runOutcome({ status: "running" })).toBe("running")
    expect(runOutcome({ status: "completed" })).toBe("success")
    expect(runOutcome({ status: "failed" })).toBe("failed")
    expect(runOutcome({ status: "timeout" })).toBe("timeout")
    expect(runOutcome({ status: "skipped_overlap" })).toBe("skipped")
    expect(runOutcome({ status: "missed_skip" })).toBe("skipped")
  })
})

describe("runStartedAt and runDurationMs", () => {
  it("prefers the start, then the due slot, then the record time", () => {
    expect(runStartedAt(run({ id: "a", timeStarted: 30, occurrenceAt: 20 }))).toBe(30)
    expect(runStartedAt(run({ id: "a", occurrenceAt: 20 }))).toBe(20)
    expect(runStartedAt(run({ id: "a" }))).toBe(1_000)
  })

  it("needs both ends and a non-negative span", () => {
    expect(runDurationMs(run({ id: "a", timeStarted: 1_000, timeCompleted: 4_500 }))).toBe(3_500)
    expect(runDurationMs(run({ id: "a", timeStarted: 1_000 }))).toBeUndefined()
    expect(runDurationMs(run({ id: "a", timeStarted: 5_000, timeCompleted: 1_000 }))).toBeUndefined()
  })
})

describe("mergeScheduledTaskRuns", () => {
  it("orders family runs newest first, drops duplicate ids and caps the list", () => {
    const merged = mergeScheduledTaskRuns(
      [
        run({ id: "a", taskID: "t1", timeStarted: 100 }),
        run({ id: "b", taskID: "t2", timeStarted: 300 }),
        run({ id: "a", taskID: "t1", timeStarted: 100 }),
        run({ id: "c", taskID: "t1", timeStarted: 200 }),
      ],
      2,
    )
    expect(merged.map((entry) => entry.id)).toEqual(["b", "c"])
  })
})

describe("summarizeScheduledTaskRuns", () => {
  it("counts outcomes and the newest failure streak, ignoring skipped and running runs", () => {
    const summary = summarizeScheduledTaskRuns([
      run({ id: "1", status: "running" }),
      run({ id: "2", status: "failed" }),
      run({ id: "3", status: "missed_skip" }),
      run({ id: "4", status: "timeout" }),
      run({ id: "5", status: "completed" }),
      run({ id: "6", status: "failed" }),
    ])
    expect(summary).toEqual({ finished: 4, succeeded: 1, failed: 3, skipped: 1, running: 1, failureStreak: 2 })
  })

  it("has no streak when the newest finished run succeeded", () => {
    expect(
      summarizeScheduledTaskRuns([run({ id: "1", status: "completed" }), run({ id: "2", status: "failed" })])
        .failureStreak,
    ).toBe(0)
  })
})

describe("formatRunDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatRunDuration(400)).toBe("0s")
    expect(formatRunDuration(45_000)).toBe("45s")
    expect(formatRunDuration(200_000)).toBe("3m 20s")
    expect(formatRunDuration(120_000)).toBe("2m")
    expect(formatRunDuration(3_900_000)).toBe("1h 5m")
    expect(formatRunDuration(7_200_000)).toBe("2h")
  })
})
