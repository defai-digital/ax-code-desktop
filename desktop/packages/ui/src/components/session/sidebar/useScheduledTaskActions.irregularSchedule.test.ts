import { describe, expect, it } from "vitest"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import {
  groupScheduledTaskFamilies,
  planFamilyFieldUpdate,
  type FamilySharedFields,
} from "../scheduledTaskFamilies"
import { isIrregularFamily } from "./useScheduledTaskActions"

const task = (overrides: Partial<ScheduledTask> & { id: string }): ScheduledTask => ({
  directory: "/work/alpha",
  title: "Digest",
  prompt: "Summarize",
  schedule: { type: "daily", time: "09:00", timezone: "UTC" },
  status: "active",
  catchUpPolicy: "run_once",
  lastRunStatus: "idle",
  time: { created: 1 },
  ...overrides,
})

const fields: FamilySharedFields = {
  title: "Digest",
  prompt: "Summarize",
  catchUpPolicy: "run_once",
}

describe("isIrregularFamily", () => {
  it("treats a single cron task as irregular", () => {
    // A one-member family reports `compact`, but the editor draft can only
    // express daily/weekly. Reconciliation paired the cron member with the
    // daily 09:00 payload and rewrote it even when the schedule was untouched.
    const [family] = groupScheduledTaskFamilies([
      task({ id: "cron", schedule: { type: "cron", expression: "*/5 * * * *", timezone: "UTC" } }),
    ])

    expect(isIrregularFamily([family])).toBe(true)
  })

  it("keeps a single daily or weekly task reconcilable", () => {
    const [daily] = groupScheduledTaskFamilies([task({ id: "daily" })])
    const [weekly] = groupScheduledTaskFamilies([
      task({ id: "weekly", schedule: { type: "weekly", day: 1, time: "09:00", timezone: "UTC" } }),
    ])

    expect(isIrregularFamily([daily])).toBe(false)
    expect(isIrregularFamily([weekly])).toBe(false)
  })

  it("treats multiple families as irregular", () => {
    const families = groupScheduledTaskFamilies([
      task({ id: "one", title: "Digest", schedule: { type: "cron", expression: "*/5 * * * *" } }),
      task({
        id: "two",
        title: "Digest",
        prompt: "Different prompt",
        schedule: { type: "cron", expression: "*/10 * * * *" },
      }),
    ])

    expect(families).toHaveLength(2)
    expect(isIrregularFamily(families)).toBe(true)
  })
})

describe("planFamilyFieldUpdate", () => {
  it("preserves each member's cron schedule on an unrelated save", () => {
    const cron = task({
      id: "cron",
      schedule: { type: "cron", expression: "*/5 * * * *", timezone: "UTC" },
    })
    const plan = planFamilyFieldUpdate([cron], { ...fields, prompt: "Summarize differently" }, null)

    expect(plan.creates).toEqual([])
    expect(plan.deletes).toEqual([])
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]?.payload.schedule).toEqual(cron.schedule)
  })
})
