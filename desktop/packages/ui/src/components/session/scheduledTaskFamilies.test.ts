import { describe, expect, it } from "vitest"

import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import type { RuntimeTaskPayload } from "@/lib/scheduledTaskTransform"
import {
  describeFamilySchedule,
  familyMemberIDs,
  groupScheduledTaskFamilies,
  parseFanOutTitle,
  planFamilyFieldUpdate,
  planFamilyReconciliation,
  resolveFamilyMembers,
  sortScheduledTaskFamilies,
} from "./scheduledTaskFamilies"

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

const part = (index: number, total: number, overrides: Partial<ScheduledTask> = {}): ScheduledTask =>
  task({
    id: `st_${index}`,
    title: `Digest (${index}/${total})`,
    schedule: { type: "daily", time: `${String(index + 8).padStart(2, "0")}:00`, timezone: "UTC" },
    ...overrides,
  })

const weekly = (index: number, total: number, day: number, time: string, overrides: Partial<ScheduledTask> = {}) =>
  part(index, total, { schedule: { type: "weekly", day, time, timezone: "UTC" }, ...overrides })

const payload = (index: number, total: number, time: string): RuntimeTaskPayload => ({
  title: total > 1 ? `Digest (${index}/${total})` : "Digest",
  prompt: "Summarize",
  schedule: { type: "daily", time, timezone: "UTC" },
  catchUpPolicy: "run_once",
})

describe("parseFanOutTitle", () => {
  it("parses the (i/N) suffix", () => {
    expect(parseFanOutTitle("Cleanup (2/3)")).toEqual({ base: "Cleanup", index: 2, total: 3 })
  })

  it("rejects titles without a valid suffix", () => {
    expect(parseFanOutTitle("Cleanup")).toBeNull()
    expect(parseFanOutTitle("Cleanup (0/3)")).toBeNull()
    expect(parseFanOutTitle("Cleanup (4/3)")).toBeNull()
    expect(parseFanOutTitle("Cleanup (1/1)")).toBeNull()
    expect(parseFanOutTitle(" (1/2)")).toBeNull()
    expect(parseFanOutTitle("Cleanup(1/2)")).toBeNull()
  })

  it("only strips the outermost suffix", () => {
    expect(parseFanOutTitle("Cleanup (2/3) (1/2)")).toEqual({ base: "Cleanup (2/3)", index: 1, total: 2 })
  })
})

describe("groupScheduledTaskFamilies", () => {
  it("folds fan-out parts into one family sorted by index", () => {
    const families = groupScheduledTaskFamilies([part(3, 3), part(1, 3), part(2, 3)])
    expect(families).toHaveLength(1)
    expect(families[0].title).toBe("Digest")
    expect(familyMemberIDs(families[0])).toEqual(["st_1", "st_2", "st_3"])
    expect(families[0].primary.id).toBe("st_1")
    expect(families[0].key).toBe("/work/alpha\u0000st_1")
  })

  it("keeps tasks without a suffix as singleton families even with the same base title", () => {
    const families = groupScheduledTaskFamilies([task({ id: "solo", title: "Digest" }), part(1, 2), part(2, 2)])
    expect(families.map((family) => familyMemberIDs(family))).toEqual([["solo"], ["st_1", "st_2"]])
  })

  it("splits parts whose prompt, model, agent, policy, type, or directory differ", () => {
    const families = groupScheduledTaskFamilies([
      part(1, 2),
      part(2, 2, { prompt: "Other" }),
      part(2, 2, { id: "model", model: { providerID: "p", modelID: "m" } }),
      part(2, 2, { id: "agent", agent: "reviewer" }),
      part(2, 2, { id: "policy", catchUpPolicy: "skip" }),
      part(2, 2, { id: "weekly", schedule: { type: "weekly", day: 1, time: "09:00", timezone: "UTC" } }),
      part(2, 2, { id: "dir", directory: "/work/beta" }),
    ])
    expect(families).toHaveLength(7)
    // Every stray part keeps its full title so the user can see what it is.
    expect(families.map((family) => family.title)).toContain("Digest (2/2)")
  })

  it("does not fold an incomplete, duplicated, or mismatched fan-out set", () => {
    const missing = groupScheduledTaskFamilies([part(1, 3), part(3, 3)])
    expect(missing.map((family) => family.title)).toEqual(["Digest (1/3)", "Digest (3/3)"])

    const duplicate = groupScheduledTaskFamilies([part(1, 2), part(2, 2), part(2, 2, { id: "dup" })])
    expect(duplicate).toHaveLength(3)

    const mismatched = groupScheduledTaskFamilies([part(1, 2), part(2, 3), part(2, 2, { id: "ok" })])
    expect(mismatched.map((family) => familyMemberIDs(family))).toEqual([["st_1", "ok"], ["st_2"]])

    const once = groupScheduledTaskFamilies([
      part(1, 2, { schedule: { type: "once", runAt: 1 } }),
      part(2, 2, { schedule: { type: "once", runAt: 2 } }),
    ])
    expect(once).toHaveLength(2)
  })

  it("treats a trailing slash in the directory as the same family", () => {
    const families = groupScheduledTaskFamilies([part(1, 2), part(2, 2, { directory: "/work/alpha/" })])
    expect(families).toHaveLength(1)
    expect(families[0].directory).toBe("/work/alpha")
  })

  it("aggregates status, next run, last run, and the latest member's outcome", () => {
    const [family] = groupScheduledTaskFamilies([
      part(1, 3, { status: "paused", nextRunAt: 1, lastRunAt: 100, lastRunStatus: "success" }),
      part(2, 3, { nextRunAt: 5_000, lastRunAt: 300, lastRunStatus: "error", lastError: "boom" }),
      part(3, 3, { nextRunAt: 2_000, lastRunAt: 200, lastRunStatus: "error", lastError: "older" }),
    ])
    expect(family.status).toBe("mixed")
    expect(family.anyActive).toBe(true)
    expect(family.nextRunAt).toBe(2_000)
    expect(family.lastRunAt).toBe(300)
    expect(family.lastRunStatus).toBe("error")
    expect(family.lastError).toBe("boom")
  })

  it("reports running first, then the most recently run member's status", () => {
    const running = groupScheduledTaskFamilies([
      part(1, 2, { lastRunAt: 50, lastRunStatus: "error", lastError: "x" }),
      part(2, 2, { lastRunStatus: "running" }),
    ])[0]
    expect(running.lastRunStatus).toBe("running")
    expect(running.lastError).toBeUndefined()

    const recovered = groupScheduledTaskFamilies([
      part(1, 2, { lastRunAt: 10, lastRunStatus: "error", lastError: "old failure" }),
      part(2, 2, { lastRunAt: 20, lastRunStatus: "success" }),
    ])[0]
    expect(recovered.lastRunStatus).toBe("success")
    expect(recovered.lastError).toBeUndefined()

    const idle = groupScheduledTaskFamilies([part(1, 2), part(2, 2)])[0]
    expect(idle.lastRunStatus).toBe("idle")
    expect(idle.lastRunAt).toBeUndefined()
  })

  it("uses a uniform status when every member agrees and ignores paused next runs", () => {
    const [family] = groupScheduledTaskFamilies([
      part(1, 2, { status: "paused", nextRunAt: 1 }),
      part(2, 2, { status: "paused", nextRunAt: 2 }),
    ])
    expect(family.status).toBe("paused")
    expect(family.anyActive).toBe(false)
    expect(family.nextRunAt).toBeUndefined()
  })
})

describe("sortScheduledTaskFamilies", () => {
  it("orders families with an active part first, then by title, then by next run", () => {
    const families = groupScheduledTaskFamilies([
      task({ id: "b", title: "Beta", status: "paused" }),
      task({ id: "c", title: "Alpha", nextRunAt: 20 }),
      task({ id: "a", title: "Alpha", nextRunAt: 10 }),
      part(1, 2, { id: "m1", title: "Mixed (1/2)", status: "paused" }),
      part(2, 2, { id: "m2", title: "Mixed (2/2)", nextRunAt: 5 }),
    ])
    expect(sortScheduledTaskFamilies(families).map((family) => family.primary.id)).toEqual(["a", "c", "m1", "b"])
  })
})

describe("describeFamilySchedule", () => {
  it("describes a daily family by its unique times", () => {
    const [family] = groupScheduledTaskFamilies([part(1, 2), part(2, 2)])
    expect(describeFamilySchedule(family)).toEqual({
      type: "daily",
      times: ["09:00", "10:00"],
      weekdays: [],
      timezone: "UTC",
      compact: true,
    })
  })

  it("is compact for a full weekday × time grid and not otherwise", () => {
    const grid = groupScheduledTaskFamilies([
      weekly(1, 4, 1, "09:00"),
      weekly(2, 4, 1, "18:00"),
      weekly(3, 4, 3, "09:00"),
      weekly(4, 4, 3, "18:00"),
    ])[0]
    expect(describeFamilySchedule(grid)).toMatchObject({
      type: "weekly",
      times: ["09:00", "18:00"],
      weekdays: [1, 3],
      compact: true,
    })

    const partial = groupScheduledTaskFamilies([
      weekly(1, 3, 1, "09:00"),
      weekly(2, 3, 1, "18:00"),
      weekly(3, 3, 3, "09:00"),
    ])[0]
    expect(describeFamilySchedule(partial)).toMatchObject({
      weekdays: [1, 3],
      times: ["09:00", "18:00"],
      compact: false,
    })
  })

  it("omits the timezone when the schedule has none and is compact for a single member", () => {
    const [family] = groupScheduledTaskFamilies([task({ id: "x", schedule: { type: "once", runAt: 1 } })])
    expect(describeFamilySchedule(family)).toEqual({ type: "once", times: [], weekdays: [], compact: true })
  })
})

describe("planFamilyReconciliation", () => {
  it("keeps parts whose schedule is unchanged and only renumbers what moved", () => {
    // Members at 09:00 and 10:00; the draft adds 12:00.
    const plan = planFamilyReconciliation(
      [part(2, 2), part(1, 2)],
      [payload(1, 3, "09:00"), payload(2, 3, "10:00"), payload(3, 3, "12:00")],
      null,
    )
    expect(plan.updates.map((update) => [update.id, update.payload.title, update.status])).toEqual([
      ["st_1", "Digest (1/3)", undefined],
      ["st_2", "Digest (2/3)", undefined],
    ])
    expect(plan.creates.map((create) => create.title)).toEqual(["Digest (3/3)"])
    expect(plan.createStatus).toBe("active")
    expect(plan.deletes).toEqual([])
  })

  it("pairs by schedule before position so removing a middle time keeps the others", () => {
    const plan = planFamilyReconciliation(
      [part(1, 3), part(2, 3), part(3, 3)],
      [payload(1, 2, "09:00"), payload(2, 2, "11:00")],
      null,
    )
    expect(plan.updates.map((update) => update.id)).toEqual(["st_1", "st_3"])
    expect(plan.updates.map((update) => update.payload.title)).toEqual(["Digest (1/2)", "Digest (2/2)"])
    expect(plan.deletes).toEqual(["st_2"])
  })

  it("skips members whose fields already match when the switch was not touched", () => {
    const members = [part(1, 2), part(2, 2, { status: "paused" })]
    const untouched = planFamilyReconciliation(members, [payload(1, 2, "09:00"), payload(2, 2, "10:00")], null)
    expect(untouched).toEqual({ updates: [], creates: [], createStatus: "active", deletes: [] })

    const paused = planFamilyReconciliation(members, [payload(1, 2, "09:00"), payload(2, 2, "10:00")], "paused")
    expect(paused.updates.map((update) => [update.id, update.status])).toEqual([["st_1", "paused"]])
    expect(paused.createStatus).toBe("paused")
  })

  it("new parts follow the family's enabled state when the switch was not touched", () => {
    const grow = [payload(1, 3, "09:00"), payload(2, 3, "10:00"), payload(3, 3, "12:00")]
    const allPaused = planFamilyReconciliation(
      [part(1, 2, { status: "paused" }), part(2, 2, { status: "paused" })],
      grow,
      null,
    )
    expect(allPaused.updates.map((update) => update.id)).toEqual(["st_1", "st_2"])
    expect(allPaused.createStatus).toBe("paused")

    // Mixed: the row shows the family as enabled, so the new part runs too.
    const mixed = planFamilyReconciliation([part(1, 2, { status: "paused" }), part(2, 2)], grow, null)
    expect(mixed.createStatus).toBe("active")
  })

  it("deletes surplus parts when the draft shrinks to one slot", () => {
    const plan = planFamilyReconciliation([part(1, 3), part(2, 3), part(3, 3)], [payload(1, 1, "09:00")], "active")
    expect(plan.updates.map((update) => [update.id, update.payload.title])).toEqual([["st_1", "Digest"]])
    expect(plan.creates).toEqual([])
    expect(plan.deletes).toEqual(["st_2", "st_3"])
  })

  it("reuses leftover members positionally when no schedule matches", () => {
    const plan = planFamilyReconciliation(
      [part(1, 2), part(2, 2)],
      [payload(1, 2, "13:00"), payload(2, 2, "14:00")],
      "active",
    )
    expect(plan.updates.map((update) => [update.id, update.payload.schedule])).toEqual([
      ["st_1", { type: "daily", time: "13:00", timezone: "UTC" }],
      ["st_2", { type: "daily", time: "14:00", timezone: "UTC" }],
    ])
    expect(plan.creates).toEqual([])
    expect(plan.deletes).toEqual([])
  })
})

describe("planFamilyReconciliation model clearing", () => {
  it("flags parts whose model the draft dropped", () => {
    const plan = planFamilyReconciliation(
      [part(1, 2, { model: { providerID: "p", modelID: "m" } }), part(2, 2)],
      [payload(1, 2, "09:00"), payload(2, 2, "10:00")],
      null,
    )
    expect(plan.updates.map((update) => [update.id, update.clearModel])).toEqual([["st_1", true]])
  })
})

describe("planFamilyFieldUpdate", () => {
  it("rewrites shared fields on every part and leaves schedules and titles alone", () => {
    const members = [weekly(1, 2, 1, "09:00"), weekly(2, 2, 3, "13:00")]
    const plan = planFamilyFieldUpdate(
      members,
      { title: "Digest", prompt: "New prompt", agent: "reviewer", catchUpPolicy: "skip" },
      null,
    )
    expect(
      plan.updates.map((update) => [update.id, update.payload.title, update.payload.schedule, update.status]),
    ).toEqual([
      ["st_1", "Digest (1/2)", { type: "weekly", day: 1, time: "09:00", timezone: "UTC" }, undefined],
      ["st_2", "Digest (2/2)", { type: "weekly", day: 3, time: "13:00", timezone: "UTC" }, undefined],
    ])
    expect(plan.updates.every((update) => update.payload.prompt === "New prompt")).toBe(true)
    expect(plan.creates).toEqual([])
    expect(plan.deletes).toEqual([])
  })

  it("renames every part while keeping its (i/N) suffix", () => {
    const members = [weekly(1, 2, 1, "09:00"), weekly(2, 2, 3, "13:00"), task({ id: "solo", title: "Digest" })]
    const plan = planFamilyFieldUpdate(
      members,
      { title: "Summary", prompt: "Summarize", catchUpPolicy: "run_once" },
      null,
    )
    expect(plan.updates.map((update) => update.payload.title)).toEqual(["Summary (1/2)", "Summary (2/2)", "Summary"])
  })

  it("only writes the status when nothing else changed and the switch moved", () => {
    const members = [weekly(1, 2, 1, "09:00"), weekly(2, 2, 3, "13:00", { status: "paused" })]
    const same = { title: "Digest", prompt: "Summarize", catchUpPolicy: "run_once" as const }
    expect(planFamilyFieldUpdate(members, same, null).updates).toEqual([])
    const resumed = planFamilyFieldUpdate(members, same, "active")
    expect(resumed.updates.map((update) => [update.id, update.status])).toEqual([["st_2", "active"]])
  })
})

describe("resolveFamilyMembers", () => {
  const schedules = [payload(1, 3, "09:00"), payload(2, 3, "10:00"), payload(3, 3, "12:00")].map((p) => p.schedule)
  const shared = { prompt: "Summarize", catchUpPolicy: "run_once" as const }

  it("returns the opened members in order and adopts a stray part at a new slot", () => {
    const stray = task({
      id: "stray",
      title: "Digest (3/3)",
      schedule: { type: "daily", time: "12:00", timezone: "UTC" },
    })
    const { members, missing } = resolveFamilyMembers([stray, part(2, 2), part(1, 2)], ["st_1", "st_2"], {
      baseTitles: ["Digest"],
      schedules,
      shared,
    })
    expect(members.map((member) => member.id)).toEqual(["st_1", "st_2", "stray"])
    expect(missing).toEqual([])
  })

  it("ignores same-name tasks at other slots and tasks with other names", () => {
    const other = task({ id: "other", title: "Digest", schedule: { type: "daily", time: "23:00", timezone: "UTC" } })
    const unrelated = task({
      id: "unrelated",
      title: "Report (3/3)",
      schedule: { type: "daily", time: "12:00", timezone: "UTC" },
    })
    const { members } = resolveFamilyMembers([part(1, 2), other, unrelated], ["st_1"], {
      baseTitles: ["Digest"],
      schedules,
      shared,
    })
    expect(members.map((member) => member.id)).toEqual(["st_1"])
  })

  it("does not adopt a same-name, same-slot part whose shared fields belong to another family", () => {
    // Regression: a sibling family the grouping keeps separate because its
    // prompt differs shared the base title and a schedule slot with the draft,
    // so a re-save adopted it and deleted or overwrote the unrelated family.
    const sibling = task({
      id: "sibling",
      title: "Digest (2/2)",
      prompt: "Other",
      schedule: { type: "daily", time: "10:00", timezone: "UTC" },
    })
    const { members } = resolveFamilyMembers([part(1, 2), sibling], ["st_1"], {
      baseTitles: ["Digest"],
      schedules,
      shared,
    })
    expect(members.map((member) => member.id)).toEqual(["st_1"])
  })

  it("reports opened members that no longer exist", () => {
    const { members, missing } = resolveFamilyMembers([part(1, 2)], ["st_1", "st_2"], {
      baseTitles: ["Digest"],
      schedules,
      shared,
    })
    expect(members.map((member) => member.id)).toEqual(["st_1"])
    expect(missing).toEqual(["st_2"])
  })
})
