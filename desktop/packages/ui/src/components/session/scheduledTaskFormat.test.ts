import { describe, expect, it } from "vitest"

import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import {
  formatFamilySchedule,
  formatRelativeTime,
  formatRunMoment,
  formatSchedule,
  formatWeekday,
  type ScheduledTaskTranslate,
} from "./scheduledTaskFormat"
import { groupScheduledTaskFamilies } from "./scheduledTaskFamilies"

// Echo the key's last segment with its params, so assertions read the shape.
const t: ScheduledTaskTranslate = (key, params) => {
  const name = key.split(".").slice(-1)[0]
  if (!params) return name
  return `${name}(${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(",")})`
}

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

describe("formatSchedule", () => {
  it("formats daily, weekly, cron and timezone variants", () => {
    expect(formatSchedule({ schedule: { type: "daily", time: "09:00" } }, t)).toBe("daily(time=09:00)")
    expect(formatSchedule({ schedule: { type: "daily", time: "09:00", timezone: "UTC" } }, t)).toBe(
      "dailyWithTimezone(time=09:00,timezone=UTC)",
    )
    expect(formatSchedule({ schedule: { type: "weekly", day: 1, time: "10:00" } }, t)).toBe(
      "weekly(days=mon,time=10:00)",
    )
    expect(formatSchedule({ schedule: { type: "cron", expression: "0 * * * *" } }, t)).toBe("cron(cron=0 * * * *)")
  })

  it("formats a one-off run in local time", () => {
    const runAt = new Date(2026, 9, 15, 7, 5).getTime()
    expect(formatSchedule({ schedule: { type: "once", runAt } }, t)).toBe("once(date=2026-10-15,time=07:05)")
  })

  it("falls back for an unknown weekday", () => {
    expect(formatWeekday(9, t)).toBe("unknown")
  })
})

describe("formatFamilySchedule", () => {
  it("shows a grid family's shared times on one line", () => {
    const [family] = groupScheduledTaskFamilies([
      task({ id: "1", title: "Digest (1/2)", schedule: { type: "daily", time: "09:00", timezone: "UTC" } }),
      task({ id: "2", title: "Digest (2/2)", schedule: { type: "daily", time: "18:00", timezone: "UTC" } }),
    ])
    expect(formatFamilySchedule(family, t)).toBe("dailyWithTimezone(time=09:00, 18:00,timezone=UTC)")
  })

  it("lists each part when the parts are not a weekday x time grid", () => {
    const [family] = groupScheduledTaskFamilies([
      task({ id: "1", title: "Digest (1/3)", schedule: { type: "weekly", day: 1, time: "09:00", timezone: "UTC" } }),
      task({ id: "2", title: "Digest (2/3)", schedule: { type: "weekly", day: 1, time: "18:00", timezone: "UTC" } }),
      task({ id: "3", title: "Digest (3/3)", schedule: { type: "weekly", day: 2, time: "09:00", timezone: "UTC" } }),
    ])
    expect(formatFamilySchedule(family, t).split(" · ")).toHaveLength(3)
  })
})

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000
  it("covers empty, sub-minute, minutes and durations both ways", () => {
    expect(formatRelativeTime(undefined, t, now)).toBe("")
    expect(formatRelativeTime(now + 10_000, t, now)).toBe("inLessThanOneMinute")
    expect(formatRelativeTime(now - 10_000, t, now)).toBe("justNow")
    expect(formatRelativeTime(now + 5 * 60_000, t, now)).toBe("inMinutes(count=5)")
    expect(formatRelativeTime(now - 5 * 60_000, t, now)).toBe("minutesAgo(count=5)")
    expect(formatRelativeTime(now + 2 * 3_600_000, t, now)).toMatch(/^inDuration\(duration=/)
  })
})

describe("formatRunMoment", () => {
  it("omits the date for today and includes it otherwise", () => {
    const now = new Date(2026, 9, 15, 8, 0).getTime()
    const today = formatRunMoment(new Date(2026, 9, 15, 21, 0).getTime(), now)
    const later = formatRunMoment(new Date(2026, 9, 17, 21, 0).getTime(), now)
    expect(later.length).toBeGreaterThan(today.length)
    expect(later.endsWith(today)).toBe(true)
    expect(formatRunMoment(undefined, now)).toBe("")
  })
})
