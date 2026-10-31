import { describe, expect, it } from "vitest"
import { scheduledTaskSubmitBlocker, type ScheduledTaskDraft } from "./ScheduledTaskEditorDialog"

const NOW = Date.UTC(2026, 9, 31, 12, 0)

const draft = (overrides: {
  schedule?: Partial<ScheduledTaskDraft["schedule"]>
  execution?: Partial<ScheduledTaskDraft["execution"]>
  enabled?: boolean
} = {}): ScheduledTaskDraft => ({
  name: "One shot",
  enabled: overrides.enabled ?? true,
  catchUpPolicy: "run_once",
  schedule: {
    kind: "once",
    times: ["09:00"],
    onceDate: "2026-10-30",
    onceTime: "09:00",
    weekdays: [1],
    timezone: "UTC",
    ...overrides.schedule,
  },
  execution: { prompt: "Summarize", providerID: "p", modelID: "m", agent: "", ...overrides.execution },
})

describe("scheduledTaskSubmitBlocker", () => {
  it("rejects a new one-time task whose moment has passed", () => {
    expect(scheduledTaskSubmitBlocker(draft(), null, NOW)).toBe("onceInPast")
    expect(scheduledTaskSubmitBlocker(draft({ schedule: { onceDate: "2026-11-01" } }), null, NOW)).toBeNull()
  })

  it("lets a finished one-time task's prompt be edited without touching its date", () => {
    // The runtime re-validates a schedule it is sent, so this save only works
    // because the unchanged schedule is left out of the update.
    const baseline = draft({ enabled: false })
    const edited = draft({ enabled: false, execution: { prompt: "Other" } })
    expect(scheduledTaskSubmitBlocker(edited, baseline, NOW)).toBeNull()
  })

  it("rejects re-enabling or re-scheduling a one-time task into the past", () => {
    const baseline = draft({ enabled: false })
    expect(scheduledTaskSubmitBlocker(draft({ enabled: true }), baseline, NOW)).toBe("onceInPast")
    expect(
      scheduledTaskSubmitBlocker(draft({ enabled: false, schedule: { onceTime: "10:00" } }), baseline, NOW),
    ).toBe("onceInPast")
    expect(
      scheduledTaskSubmitBlocker(draft({ enabled: true, schedule: { onceDate: "2026-11-01" } }), baseline, NOW),
    ).toBeNull()
  })

  it("leaves recurring schedules and unparseable moments to the other checks", () => {
    expect(scheduledTaskSubmitBlocker(draft({ schedule: { kind: "daily" } }), null, NOW)).toBeNull()
    expect(scheduledTaskSubmitBlocker(draft({ schedule: { onceTime: "" } }), null, NOW)).toBeNull()
  })

  it("rejects clearing the agent of an existing task and nothing else about agents", () => {
    const withAgent = draft({ execution: { agent: "reviewer" } })
    const future = { onceDate: "2026-11-01" }
    expect(
      scheduledTaskSubmitBlocker(draft({ schedule: future, execution: { agent: " " } }), withAgent, NOW),
    ).toBe("agentCleared")
    expect(
      scheduledTaskSubmitBlocker(draft({ schedule: future, execution: { agent: "build" } }), withAgent, NOW),
    ).toBeNull()
    expect(scheduledTaskSubmitBlocker(draft({ schedule: future }), draft(), NOW)).toBeNull()
    expect(scheduledTaskSubmitBlocker(draft({ schedule: future }), null, NOW)).toBeNull()
  })
})
