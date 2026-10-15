import { describe, expect, test } from "vitest"

import { formatRelativeAge, type RelativeAgeTranslator } from "./relativeAge"

const t: RelativeAgeTranslator = (key, params) => {
  if (key === "notificationCenter.time.justNow") return "just now"
  if (key === "notificationCenter.time.minutesAgo") return `${params?.count}m ago`
  if (key === "notificationCenter.time.hoursAgo") return `${params?.count}h ago`
  return `${params?.count}d ago`
}

describe("formatRelativeAge", () => {
  test("formats each bucket", () => {
    expect(formatRelativeAge(0, t)).toBe("just now")
    expect(formatRelativeAge(30_000, t)).toBe("just now")
    expect(formatRelativeAge(5 * 60_000, t)).toBe("5m ago")
    expect(formatRelativeAge(59 * 60_000, t)).toBe("59m ago")
    expect(formatRelativeAge(2 * 3600_000, t)).toBe("2h ago")
    expect(formatRelativeAge(23 * 3600_000, t)).toBe("23h ago")
    expect(formatRelativeAge(24 * 3600_000, t)).toBe("1d ago")
    expect(formatRelativeAge(3 * 24 * 3600_000, t)).toBe("3d ago")
  })

  test("clamps negative ages to just now", () => {
    expect(formatRelativeAge(-60_000, t)).toBe("just now")
  })
})
