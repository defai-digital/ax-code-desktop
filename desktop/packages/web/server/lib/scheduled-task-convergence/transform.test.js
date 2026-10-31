import { describe, expect, it } from "vitest"

import { isRuntimeCronExpression, isSlashCommandPrompt, slotTitle, transformDesktopScheduledTask } from "./transform.js"

const NOW = Date.parse("2026-08-30T12:00:00Z")

it.each([
  ["2027-03-14", "02:30", "America/New_York"],
  ["2027-03-28", "02:30", "Europe/Berlin"],
  ["2027-10-03", "02:15", "Australia/Lord_Howe"],
  ["2011-12-30", "12:00", "Pacific/Apia"],
])("does not migrate nonexistent wall clock %s %s in %s to a different instant", (date, time, timezone) => {
  const result = transform(baseTask({ schedule: { kind: "once", date, time, timezone } }))
  expect(result.status).toBe("skip")
  expect(result.history).toBe(false)
  expect(result.reason).toContain("invalid")
})

const baseTask = (overrides = {}) => ({
  id: "task-1",
  name: "Nightly digest",
  enabled: true,
  catchUpPolicy: "run_once",
  schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
  execution: {
    prompt: "Summarize repository changes",
    providerID: "openai",
    modelID: "gpt-4.1",
  },
  state: { createdAt: 1, updatedAt: 2 },
  ...overrides,
})

const transform = (task, options = {}) =>
  transformDesktopScheduledTask(task, { now: NOW, expandPrompt: (prompt) => prompt, ...options })

describe("isRuntimeCronExpression", () => {
  it("accepts the runtime subset: wildcard, lists, ranges, steps", () => {
    expect(isRuntimeCronExpression("*/5 * * * *")).toBe(true)
    expect(isRuntimeCronExpression("0 9 * * 1-5")).toBe(true)
    expect(isRuntimeCronExpression("0 9,18 * * 0")).toBe(true)
    expect(isRuntimeCronExpression("0 0 1 1 *")).toBe(true)
    expect(isRuntimeCronExpression("0 9 * * 7")).toBe(true)
  })

  it("rejects names, special symbols, wrong field counts, and oversized input", () => {
    expect(isRuntimeCronExpression("0 9 * * MON")).toBe(false)
    expect(isRuntimeCronExpression("0 9 * jan *")).toBe(false)
    expect(isRuntimeCronExpression("0 0 L * *")).toBe(false)
    expect(isRuntimeCronExpression("0 0 ? * 5#3")).toBe(false)
    expect(isRuntimeCronExpression("0 9 * *")).toBe(false)
    expect(isRuntimeCronExpression("0 9 * * * *")).toBe(false)
    expect(isRuntimeCronExpression(`0 9 * * ${"1".repeat(200)}`)).toBe(false)
    expect(isRuntimeCronExpression("")).toBe(false)
  })
})

describe("isSlashCommandPrompt", () => {
  it("detects slash-command prompts", () => {
    expect(isSlashCommandPrompt("/review src")).toBe(true)
    expect(isSlashCommandPrompt("  /plan")).toBe(true)
    expect(isSlashCommandPrompt("summarize /path")).toBe(false)
  })
})

describe("slotTitle", () => {
  it("keeps the bare name for single-slot fan-out and suffixes multi-slot", () => {
    expect(slotTitle("Digest", 0, 1)).toBe("Digest")
    expect(slotTitle("Digest", 0, 3)).toBe("Digest (1/3)")
    expect(slotTitle("Digest", 2, 3)).toBe("Digest (3/3)")
  })

  it("clamps to the runtime title limit", () => {
    expect(slotTitle("x".repeat(300), 0, 1)).toHaveLength(200)
  })

  it("keeps the fan-out suffix of a name that is at the title limit", () => {
    // Clamping the composed title cut the suffix off a name at the limit, so every slot of
    // that task got the same title: the migration's per-title idempotency check then read
    // slots 2..N as already created and dropped them without a warning.
    const name = "x".repeat(300)
    const titles = [0, 1, 2].map((index) => slotTitle(name, index, 3))

    expect(titles).toEqual([`${"x".repeat(194)} (1/3)`, `${"x".repeat(194)} (2/3)`, `${"x".repeat(194)} (3/3)`])
    expect(new Set(titles).size).toBe(3)
    for (const title of titles) {
      expect(title.length).toBeLessThanOrEqual(200)
    }
  })

  it("does not cut inside a surrogate pair at the title cap", () => {
    // The emoji occupies UTF-16 units 199-200, so a raw slice at 200 would keep
    // its high surrogate alone and store a corrupted title in the runtime.
    const name = `${"x".repeat(199)}🚀${"y".repeat(50)}`
    const title = slotTitle(name, 0, 1)
    expect(title).toBe("x".repeat(199))
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it("does not cut inside a surrogate pair when it reserves room for the suffix", () => {
    // A fan-out slot cuts the name at 194 (200 - " (1/2)".length) and the emoji sits on units
    // 194-195, so cutting there kept its high surrogate alone — and the pair check could not see it,
    // because the value handed to the clamp was already short enough to return unchanged.
    const name = `${"x".repeat(193)}🚀${"y".repeat(50)}`
    const title = slotTitle(name, 0, 2)

    expect(title).toBe(`${"x".repeat(193)} (1/2)`)
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(title.length).toBeLessThanOrEqual(200)
  })
})

describe("transformDesktopScheduledTask", () => {
  it("maps a single-time daily task to one daily payload", () => {
    const result = transform(baseTask())
    expect(result.status).toBe("ready")
    expect(result.payloads).toEqual([
      {
        title: "Nightly digest",
        prompt: "Summarize repository changes",
        schedule: { type: "daily", time: "09:00", timezone: "UTC" },
        model: { providerID: "openai", modelID: "gpt-4.1" },
        catchUpPolicy: "run_once",
      },
    ])
    expect(result.pause).toBe(false)
  })

  it("fans out multi-time daily schedules into N payloads with suffixes", () => {
    const result = transform(
      baseTask({ schedule: { kind: "daily", times: ["18:00", "09:00", "12:00"], timezone: "UTC" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads.map((payload) => payload.title)).toEqual([
      "Nightly digest (1/3)",
      "Nightly digest (2/3)",
      "Nightly digest (3/3)",
    ])
    expect(result.payloads.map((payload) => payload.schedule.time)).toEqual(["09:00", "12:00", "18:00"])
  })

  it("strips an existing fan-out suffix before composing titles", () => {
    // A task named "<name> (n/m)" is already a fan-out part. Composing the suffix on top nested a
    // second one ("Digest (2/3) (1/2)"), where the editor helper rebuilds "<name> (i/N)" from the
    // bare name. The two transforms must agree on naming (see the KEEP IN SYNC note in transform.js).
    const result = transform(
      baseTask({ name: "Digest (2/3)", schedule: { kind: "daily", times: ["09:00", "18:00"], timezone: "UTC" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads.map((payload) => payload.title)).toEqual(["Digest (1/2)", "Digest (2/2)"])

    // Same rule for a single-slot task: the editor strips before it decides how many slots there are.
    const single = transform(baseTask({ name: "Digest (2/3)" }))
    expect(single.payloads.map((payload) => payload.title)).toEqual(["Digest"])
  })

  it("keeps a name whose parenthesised index is not a trailing fan-out suffix", () => {
    const result = transform(
      baseTask({
        name: "Digest (2/3) v2",
        schedule: { kind: "daily", times: ["09:00", "18:00"], timezone: "UTC" },
      }),
    )
    expect(result.payloads.map((payload) => payload.title)).toEqual(["Digest (2/3) v2 (1/2)", "Digest (2/3) v2 (2/2)"])
  })

  it("fans out weekly weekday x time cross products deterministically", () => {
    const result = transform(
      baseTask({ schedule: { kind: "weekly", weekdays: [5, 1], times: ["10:00", "08:00"], timezone: "UTC" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads.map((payload) => [payload.schedule.day, payload.schedule.time])).toEqual([
      [1, "08:00"],
      [1, "10:00"],
      [5, "08:00"],
      [5, "10:00"],
    ])
    expect(result.payloads[3].title).toBe("Nightly digest (4/4)")
  })

  it("accepts runtime-subset cron and rejects unsupported expressions", () => {
    const ok = transform(baseTask({ schedule: { kind: "cron", cron: "0 9 * * 1-5", timezone: "UTC" } }))
    expect(ok.status).toBe("ready")
    expect(ok.payloads[0].schedule).toEqual({ type: "cron", expression: "0 9 * * 1-5", timezone: "UTC" })

    const bad = transform(baseTask({ schedule: { kind: "cron", cron: "0 9 * * MON", timezone: "UTC" } }))
    expect(bad.status).toBe("skip")
    expect(bad.reason).toContain("not supported by the runtime scheduler")
  })

  it("converts a future one-time schedule to an epoch runAt", () => {
    const result = transform(
      baseTask({ schedule: { kind: "once", date: "2026-09-01", time: "09:30", timezone: "UTC" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads[0].schedule).toEqual({ type: "once", runAt: Date.parse("2026-09-01T09:30:00Z") })
  })

  it("reschedules an enabled past-due one-time task with a warning", () => {
    const result = transform(
      baseTask({ schedule: { kind: "once", date: "2026-08-01", time: "09:30", timezone: "UTC" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads[0].schedule.type).toBe("once")
    expect(result.payloads[0].schedule.runAt).toBeGreaterThan(NOW)
    expect(result.warnings.some((warning) => warning.includes("rescheduled"))).toBe(true)
  })

  it("skips a past-due one-time task whose catchUpPolicy is skip", () => {
    const result = transform(
      baseTask({
        catchUpPolicy: "skip",
        schedule: { kind: "once", date: "2026-08-01", time: "09:30", timezone: "UTC" },
      }),
    )
    expect(result.status).toBe("skip")
    expect(result.history).toBe(true)
  })

  it("skips consumed one-time tasks (enabled:false after firing)", () => {
    const result = transform(
      baseTask({
        enabled: false,
        schedule: { kind: "once", date: "2026-09-01", time: "09:30", timezone: "UTC" },
        state: { createdAt: 1, updatedAt: 2, lastRunAt: 3 },
      }),
    )
    expect(result.status).toBe("skip")
    expect(result.reason).toBe("one-time task already fired")
  })

  it("migrates a user-paused recurring task with the pause flag", () => {
    const result = transform(baseTask({ enabled: false }))
    expect(result.status).toBe("ready")
    expect(result.pause).toBe(true)
  })

  it("skips slash-command prompts", () => {
    const result = transform(baseTask({ execution: { prompt: "/review src", providerID: "openai", modelID: "gpt" } }))
    expect(result.status).toBe("skip")
    expect(result.reason).toContain("slash-command")
  })

  it("drops variant with a warning", () => {
    const result = transform(
      baseTask({ execution: { prompt: "work", providerID: "openai", modelID: "gpt", variant: "high" } }),
    )
    expect(result.status).toBe("ready")
    expect(result.payloads[0]).not.toHaveProperty("variant")
    expect(result.warnings.some((warning) => warning.includes("variant"))).toBe(true)
  })

  it("pre-expands snippets through the injected expander", () => {
    const result = transform(baseTask(), { expandPrompt: (prompt) => `${prompt} [expanded]` })
    expect(result.payloads[0].prompt).toBe("Summarize repository changes [expanded]")
  })

  it("skips prompts that exceed the runtime limit after expansion", () => {
    const result = transform(baseTask(), { expandPrompt: () => "x".repeat(20_001) })
    expect(result.status).toBe("skip")
    expect(result.reason).toContain("runtime limit")
  })

  it("maps agent and catchUpPolicy, and warns on incomplete model refs", () => {
    const withAgent = transform(
      baseTask({
        catchUpPolicy: "skip",
        execution: { prompt: "work", providerID: "openai", modelID: "gpt", agent: "build" },
      }),
    )
    expect(withAgent.payloads[0].agent).toBe("build")
    expect(withAgent.payloads[0].catchUpPolicy).toBe("skip")

    const noModel = transform(baseTask({ execution: { prompt: "work", providerID: "", modelID: "" } }))
    expect(noModel.status).toBe("ready")
    expect(noModel.payloads[0]).not.toHaveProperty("model")
    expect(noModel.warnings.some((warning) => warning.includes("providerID/modelID"))).toBe(true)
  })
})
