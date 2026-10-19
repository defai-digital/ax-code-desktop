import { describe, expect, it } from "vitest"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import { buildRuntimeScheduledTaskPayloads } from "@/lib/scheduledTaskTransform"
import { buildTimezoneOptions, formatWallClockInTimeZone, toDraft } from "./ScheduledTaskEditorDialog"

const defaults = { providerID: "provider", modelID: "model", agent: "" }

const onceTask = (runAt: number, timezone?: string): ScheduledTask =>
  ({
    id: "once",
    directory: "/work/alpha",
    title: "One shot",
    prompt: "Summarize",
    schedule: { type: "once", runAt, ...(timezone ? { timezone } : {}) },
    status: "active",
    catchUpPolicy: "run_once",
    lastRunStatus: "idle",
    time: { created: 1 },
  }) as unknown as ScheduledTask

const onceDraftInput = (task: ScheduledTask) => {
  const draft = toDraft(task, defaults)
  if (draft.schedule.kind !== "once") {
    throw new Error("expected a once draft")
  }
  return {
    draft,
    input: {
      name: draft.name,
      prompt: draft.execution.prompt,
      catchUpPolicy: draft.catchUpPolicy,
      schedule: {
        kind: "once" as const,
        date: draft.schedule.onceDate,
        time: draft.schedule.onceTime,
        timezone: draft.schedule.timezone,
      },
    },
  }
}

describe("formatWallClockInTimeZone", () => {
  it("formats the instant in the requested zone instead of the machine zone", () => {
    const instant = new Date(Date.UTC(2026, 0, 2, 4, 0))

    expect(formatWallClockInTimeZone(instant, "Asia/Tokyo")).toEqual({ date: "2026-01-02", time: "13:00" })
    expect(formatWallClockInTimeZone(instant, "UTC")).toEqual({ date: "2026-01-02", time: "04:00" })
  })

  it("returns null for an invalid instant instead of throwing", () => {
    expect(formatWallClockInTimeZone(new Date(Number.NaN), "UTC")).toBeNull()
  })
})

describe("toDraft once schedule", () => {
  it("reads the run time back in the schedule's timezone", () => {
    // Re-saving an untouched task formats runAt and then reinterprets that wall
    // clock in the same timezone. Local getters only round-tripped when the task
    // zone was the machine zone; otherwise every unrelated edit shifted runAt.
    const runAt = Date.UTC(2026, 0, 2, 4, 0)

    const tokyo = toDraft(onceTask(runAt, "Asia/Tokyo"), defaults)
    expect(tokyo.schedule.onceDate).toBe("2026-01-02")
    expect(tokyo.schedule.onceTime).toBe("13:00")

    const utc = toDraft(onceTask(runAt, "UTC"), defaults)
    expect(utc.schedule.onceDate).toBe("2026-01-02")
    expect(utc.schedule.onceTime).toBe("04:00")
  })

  it("round-trips runAt through the editor draft and payload builder", () => {
    const runAt = Date.UTC(2026, 0, 2, 4, 0)

    for (const timezone of ["UTC", "Asia/Tokyo", "America/New_York"]) {
      const { input } = onceDraftInput(onceTask(runAt, timezone))
      expect(buildRuntimeScheduledTaskPayloads(input)?.[0]?.schedule).toEqual({ type: "once", runAt })
    }
  })
})

describe("buildTimezoneOptions", () => {
  it("always offers UTC and the selected timezone", () => {
    const options = buildTimezoneOptions("Europe/Berlin")

    expect(options).toContain("UTC")
    expect(options).toContain("Europe/Berlin")
  })

  it("does not duplicate UTC when it is selected", () => {
    const options = buildTimezoneOptions("UTC")

    expect(options.filter((timezone) => timezone === "UTC")).toHaveLength(1)
  })
})
