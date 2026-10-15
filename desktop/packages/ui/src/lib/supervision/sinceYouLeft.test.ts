import { describe, expect, test } from "vitest"

import {
  SINCE_YOU_LEFT_GRACE_MS,
  shouldShowSinceYouLeft,
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

describe("sinceYouLeftRelativeParts", () => {
  const now = 1_000_000_000

  test("picks seconds, minutes, hours and days", () => {
    expect(sinceYouLeftRelativeParts(now - 30_000, now)).toEqual({ value: -30, unit: "second" })
    expect(sinceYouLeftRelativeParts(now - 5 * 60_000, now)).toEqual({ value: -5, unit: "minute" })
    expect(sinceYouLeftRelativeParts(now - 2 * 3_600_000, now)).toEqual({ value: -2, unit: "hour" })
    expect(sinceYouLeftRelativeParts(now - 3 * 86_400_000, now)).toEqual({ value: -3, unit: "day" })
  })
})
