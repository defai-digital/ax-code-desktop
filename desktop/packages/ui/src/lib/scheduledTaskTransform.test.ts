import { describe, expect, test } from "vitest"

import {
  buildRuntimeScheduledTaskPayloads,
  stripFanOutSuffix,
  zonedTimeToEpochMs,
  type ScheduledTaskDraftInput,
} from "./scheduledTaskTransform"

const baseDraft = (overrides: Partial<ScheduledTaskDraftInput> = {}): ScheduledTaskDraftInput => ({
  name: "Nightly digest",
  prompt: "Summarize repository changes",
  model: { providerID: "openai", modelID: "gpt-5" },
  catchUpPolicy: "run_once",
  schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
  ...overrides,
})

describe("stripFanOutSuffix", () => {
  test("strips a trailing (i/N) suffix and leaves other names alone", () => {
    expect(stripFanOutSuffix("Digest (2/3)")).toBe("Digest")
    expect(stripFanOutSuffix("Digest (1/12)")).toBe("Digest")
    expect(stripFanOutSuffix("Digest")).toBe("Digest")
    expect(stripFanOutSuffix("Digest (beta)")).toBe("Digest (beta)")
  })
})

describe("zonedTimeToEpochMs", () => {
  test("converts a UTC wall clock", () => {
    expect(zonedTimeToEpochMs("2026-09-01", "09:30", "UTC")).toBe(Date.parse("2026-09-01T09:30:00Z"))
  })

  test("converts a non-UTC wall clock", () => {
    // Asia/Tokyo is UTC+9 year-round (no DST).
    expect(zonedTimeToEpochMs("2026-09-01", "09:30", "Asia/Tokyo")).toBe(Date.parse("2026-09-01T00:30:00Z"))
  })

  test("returns null for invalid input", () => {
    expect(zonedTimeToEpochMs("not-a-date", "09:30", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-09-01", "9:30", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-09-01", "09:30", "Not/AZone")).toBeNull()
  })

  test("returns null for a calendar-invalid date instead of rolling it over", () => {
    // Date.UTC turns 2026-02-30 into 2026-03-02 and 2026-13-01 into 2027-01-01.
    expect(zonedTimeToEpochMs("2026-02-30", "09:30", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-13-01", "09:30", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-04-31", "09:30", "UTC")).toBeNull()
    // A leap day is valid only in a leap year.
    expect(zonedTimeToEpochMs("2028-02-29", "09:30", "UTC")).toBe(Date.parse("2028-02-29T09:30:00Z"))
    expect(zonedTimeToEpochMs("2027-02-29", "09:30", "UTC")).toBeNull()
  })

  test("returns null for an out-of-range clock instead of rolling it over", () => {
    expect(zonedTimeToEpochMs("2026-09-01", "24:00", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-09-01", "99:99", "UTC")).toBeNull()
    expect(zonedTimeToEpochMs("2026-09-01", "23:59", "UTC")).toBe(Date.parse("2026-09-01T23:59:00Z"))
  })
})

describe("buildRuntimeScheduledTaskPayloads", () => {
  test("maps a single-time daily draft to one payload", () => {
    const payloads = buildRuntimeScheduledTaskPayloads(baseDraft())
    expect(payloads).toEqual([
      {
        title: "Nightly digest",
        prompt: "Summarize repository changes",
        schedule: { type: "daily", time: "09:00", timezone: "UTC" },
        model: { providerID: "openai", modelID: "gpt-5" },
        catchUpPolicy: "run_once",
      },
    ])
  })

  test("fans out multi-time daily drafts with sorted times and suffixes", () => {
    const payloads = buildRuntimeScheduledTaskPayloads(
      baseDraft({ schedule: { kind: "daily", times: ["18:00", "09:00", "18:00"], timezone: "UTC" } }),
    )
    expect(payloads?.map((payload) => payload.title)).toEqual(["Nightly digest (1/2)", "Nightly digest (2/2)"])
    expect(payloads?.map((payload) => payload.schedule)).toEqual([
      { type: "daily", time: "09:00", timezone: "UTC" },
      { type: "daily", time: "18:00", timezone: "UTC" },
    ])
  })

  test("fans out weekly weekday x time cross products deterministically", () => {
    const payloads = buildRuntimeScheduledTaskPayloads(
      baseDraft({ schedule: { kind: "weekly", weekdays: [5, 1], times: ["10:00", "08:00"], timezone: "UTC" } }),
    )
    expect(payloads?.map((payload) => payload.schedule)).toEqual([
      { type: "weekly", day: 1, time: "08:00", timezone: "UTC" },
      { type: "weekly", day: 1, time: "10:00", timezone: "UTC" },
      { type: "weekly", day: 5, time: "08:00", timezone: "UTC" },
      { type: "weekly", day: 5, time: "10:00", timezone: "UTC" },
    ])
    expect(payloads?.[3]?.title).toBe("Nightly digest (4/4)")
  })

  test("converts a once draft to an epoch runAt", () => {
    const payloads = buildRuntimeScheduledTaskPayloads(
      baseDraft({ schedule: { kind: "once", date: "2026-09-01", time: "09:30", timezone: "UTC" } }),
    )
    expect(payloads?.[0]?.schedule).toEqual({ type: "once", runAt: Date.parse("2026-09-01T09:30:00Z") })
  })

  test("strips a fan-out suffix from the base name before re-suffixing", () => {
    const payloads = buildRuntimeScheduledTaskPayloads(
      baseDraft({ name: "Digest (2/3)", schedule: { kind: "daily", times: ["09:00", "18:00"], timezone: "UTC" } }),
    )
    expect(payloads?.map((payload) => payload.title)).toEqual(["Digest (1/2)", "Digest (2/2)"])
  })

  test("includes agent only when set", () => {
    const withAgent = buildRuntimeScheduledTaskPayloads(baseDraft({ agent: "build" }))
    expect(withAgent?.[0]?.agent).toBe("build")
    const without = buildRuntimeScheduledTaskPayloads(baseDraft({ agent: "  " }))
    expect(without?.[0]).not.toHaveProperty("agent")
  })

  test("caps the runtime title without splitting a character at the cut", () => {
    // The title is persisted as the runtime task's title, so a code-unit cut that
    // lands inside the emoji would store a lone surrogate.
    const name = `${"z".repeat(199)}🚀tail`
    const payloads = buildRuntimeScheduledTaskPayloads(
      baseDraft({ name, schedule: { kind: "daily", times: ["09:00", "10:00"], timezone: "UTC" } }),
    )

    const title = payloads?.[0]?.title ?? ""
    expect(title).toBe("z".repeat(199))
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  test("returns null for invalid drafts", () => {
    expect(buildRuntimeScheduledTaskPayloads(baseDraft({ name: "  " }))).toBeNull()
    expect(buildRuntimeScheduledTaskPayloads(baseDraft({ prompt: " " }))).toBeNull()
    expect(
      buildRuntimeScheduledTaskPayloads(baseDraft({ schedule: { kind: "daily", times: ["bad"], timezone: "UTC" } })),
    ).toBeNull()
    expect(
      buildRuntimeScheduledTaskPayloads(
        baseDraft({ schedule: { kind: "weekly", weekdays: [], times: ["09:00"], timezone: "UTC" } }),
      ),
    ).toBeNull()
    expect(
      buildRuntimeScheduledTaskPayloads(
        baseDraft({ schedule: { kind: "once", date: "bad", time: "09:00", timezone: "UTC" } }),
      ),
    ).toBeNull()
  })
})
