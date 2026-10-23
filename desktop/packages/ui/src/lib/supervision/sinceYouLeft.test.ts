import { describe, expect, test } from "vitest"

import {
  SINCE_YOU_LEFT_GRACE_MS,
  shouldShowSinceYouLeft,
  sinceYouLeftActivityAt,
  sinceYouLeftHookBlocks,
  sinceYouLeftRelativeParts,
  sinceYouLeftStateLabel,
} from "./sinceYouLeft"

describe("shouldShowSinceYouLeft", () => {
  const base = { snapshot: 100_000, updatedAt: 200_000, state: "review" as const }

  test("shows when activity happened well after leaving and the session is not running", () => {
    expect(shouldShowSinceYouLeft(base)).toBe(true)
    expect(shouldShowSinceYouLeft({ ...base, state: "idle" })).toBe(true)
    expect(shouldShowSinceYouLeft({ ...base, state: "error" })).toBe(true)
    expect(shouldShowSinceYouLeft({ ...base, state: "permission" })).toBe(true)
    expect(shouldShowSinceYouLeft({ ...base, state: "question" })).toBe(true)
  })

  test("hides without a snapshot", () => {
    expect(shouldShowSinceYouLeft({ ...base, snapshot: null })).toBe(false)
  })

  test("hides while running", () => {
    expect(shouldShowSinceYouLeft({ ...base, state: "running" })).toBe(false)
  })

  test("hides inside the grace period and at its exact boundary", () => {
    expect(shouldShowSinceYouLeft({ ...base, updatedAt: base.snapshot + SINCE_YOU_LEFT_GRACE_MS })).toBe(false)
    expect(shouldShowSinceYouLeft({ ...base, updatedAt: base.snapshot + SINCE_YOU_LEFT_GRACE_MS - 1 })).toBe(false)
    expect(shouldShowSinceYouLeft({ ...base, updatedAt: base.snapshot + SINCE_YOU_LEFT_GRACE_MS + 1 })).toBe(true)
  })

  test("hides when nothing changed after leaving", () => {
    expect(shouldShowSinceYouLeft({ ...base, updatedAt: base.snapshot - 1000 })).toBe(false)
  })
})

describe("sinceYouLeftActivityAt", () => {
  test("folds a later goal revision into the activity time", () => {
    const goal = { createdAt: 500, updatedAt: 20000 }
    expect(sinceYouLeftActivityAt(1000, goal)).toBe(20000)
    // Session updated 1000, last visit 10000, goal updated 20000: a
    // goal-only change after leaving counts as activity.
    expect(shouldShowSinceYouLeft({ snapshot: 10000, updatedAt: sinceYouLeftActivityAt(1000, goal), state: "goal" })).toBe(
      true,
    )
    expect(shouldShowSinceYouLeft({ snapshot: 10000, updatedAt: 1000, state: "goal" })).toBe(false)
  })

  test("falls back to creation time and keeps a later session time", () => {
    expect(sinceYouLeftActivityAt(1000, { createdAt: 3000 })).toBe(3000)
    expect(sinceYouLeftActivityAt(9000, { createdAt: 3000, updatedAt: 4000 })).toBe(9000)
    expect(sinceYouLeftActivityAt(1000, null)).toBe(1000)
    expect(sinceYouLeftActivityAt(1000, undefined)).toBe(1000)
  })
})

describe("sinceYouLeftStateLabel", () => {
  test("maps every non-running state and returns null for running", () => {
    expect(sinceYouLeftStateLabel("review")).toBe("review")
    expect(sinceYouLeftStateLabel("error")).toBe("error")
    expect(sinceYouLeftStateLabel("permission")).toBe("permission")
    expect(sinceYouLeftStateLabel("question")).toBe("question")
    expect(sinceYouLeftStateLabel("idle")).toBe("idle")
    expect(sinceYouLeftStateLabel("running")).toBeNull()
  })
})

describe("sinceYouLeftHookBlocks", () => {
  test("shows the count only when hooks blocked something", () => {
    expect(sinceYouLeftHookBlocks(0)).toBeNull()
    expect(sinceYouLeftHookBlocks(1)).toBe(1)
    expect(sinceYouLeftHookBlocks(12)).toBe(12)
  })
})

describe("sinceYouLeftRelativeParts", () => {
  const now = 1_000_000_000

  test("picks seconds, minutes, hours and days", () => {
    expect(sinceYouLeftRelativeParts(now - 30_000, now)).toEqual({ value: -30, unit: "second" })
    expect(sinceYouLeftRelativeParts(now - 5 * 60_000, now)).toEqual({ value: -5, unit: "minute" })
    expect(sinceYouLeftRelativeParts(now - 2 * 3_600_000, now)).toEqual({ value: -2, unit: "hour" })
    expect(sinceYouLeftRelativeParts(now - 3 * 86_400_000, now)).toEqual({ value: -3, unit: "day" })
  })

  test("clamps newer timestamps to now instead of reporting future activity", () => {
    expect(sinceYouLeftRelativeParts(now + 20_000, now)).toEqual({ value: 0, unit: "second" })
  })

  test("rounds into the next unit instead of producing a full-unit overflow", () => {
    expect(sinceYouLeftRelativeParts(now - 59_600, now)).toEqual({ value: -1, unit: "minute" })
    expect(sinceYouLeftRelativeParts(now - 59.6 * 60_000, now)).toEqual({ value: -1, unit: "hour" })
    expect(sinceYouLeftRelativeParts(now - 23.6 * 3_600_000, now)).toEqual({ value: -1, unit: "day" })
  })
})
